import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();

// POST /api/analytics/track - Record an event (e.g., share, post view, profile view)
router.post('/track', optionalAuthenticate, async (req, res) => {
  try {
    const { eventType, targetUserId, postId, metadata } = req.body;

    if (!eventType || typeof eventType !== 'string') {
      return res.status(400).json({ error: 'eventType is required' });
    }

    const validTypes = ['PROFILE_VIEW', 'POST_VIEW', 'SHARE', 'DOWNLOAD'];
    if (!validTypes.includes(eventType)) {
      return res.status(400).json({ error: 'Invalid eventType' });
    }

    // Do not count owner viewing their own profile/post as views
    if (req.user && targetUserId === req.user.id && eventType === 'PROFILE_VIEW') {
      return res.json({ tracked: false, reason: 'Self-view not recorded' });
    }

    // If target post provided, verify targetUserId matches post author
    let finalTargetUserId = targetUserId;
    if (postId && !finalTargetUserId) {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });
      if (post) finalTargetUserId = post.authorId;
    }

    if (req.user && finalTargetUserId === req.user.id && eventType === 'POST_VIEW') {
      return res.json({ tracked: false, reason: 'Self-view not recorded' });
    }

    // Check if user disabled analytics tracking
    if (req.user) {
      const settings = await prisma.userSettings.findUnique({
        where: { userId: req.user.id },
        select: { analyticsTracking: true },
      });
      if (settings && settings.analyticsTracking === false) {
        return res.json({ tracked: false, reason: 'User opted out of analytics tracking' });
      }
    }

    await prisma.analyticsEvent.create({
      data: {
        eventType,
        userId: req.user?.id || null,
        targetUserId: finalTargetUserId || null,
        postId: postId || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });

    return res.json({ tracked: true });
  } catch (error) {
    logger.error('Track analytics error:', error);
    return res.status(500).json({ error: 'Failed to record event' });
  }
});

// POST /api/analytics/session/ping - Record or update active session
router.post('/session/ping', optionalAuthenticate, async (req, res) => {
  try {
    const { sessionToken, pagePath } = req.body;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const ip = req.ip || req.socket.remoteAddress || '';
    const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);

    const token = sessionToken || crypto.randomUUID();

    const existing = await prisma.userSession.findUnique({
      where: { sessionToken: token },
    });

    if (existing) {
      const now = new Date();
      const elapsedSeconds = Math.round((now.getTime() - new Date(existing.lastActiveAt).getTime()) / 1000);
      // Cap idle ping intervals at 60s
      const durationIncrement = elapsedSeconds > 0 && elapsedSeconds < 120 ? elapsedSeconds : 15;

      const updated = await prisma.userSession.update({
        where: { id: existing.id },
        data: {
          lastActiveAt: now,
          durationSeconds: existing.durationSeconds + durationIncrement,
          pagesViewed: pagePath ? existing.pagesViewed + 1 : existing.pagesViewed,
          userId: req.user?.id || existing.userId,
        },
      });

      return res.json({ sessionToken: updated.sessionToken, duration: updated.durationSeconds });
    }

    // Create new session
    const newSession = await prisma.userSession.create({
      data: {
        sessionToken: token,
        userId: req.user?.id || null,
        userAgent,
        ipHash,
        pagesViewed: 1,
      },
    });

    return res.json({ sessionToken: newSession.sessionToken, duration: 0, isNew: true });
  } catch (error) {
    logger.error('Session ping error:', error);
    return res.status(500).json({ error: 'Failed to update session' });
  }
});

// GET /api/analytics/dashboard - Creator analytics dashboard
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const period = (req.query.period as string) || '30d'; // 7d, 30d, 90d, all

    let startDate: Date;
    const now = new Date();
    if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '90d') {
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else if (period === 'all') {
      startDate = new Date(0); // Beginning of time
    } else {
      // Default: 30d
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 1. Total & Period Profile Views
    const [totalProfileViews, periodProfileViews] = await Promise.all([
      prisma.analyticsEvent.count({
        where: {
          targetUserId: userId,
          eventType: 'PROFILE_VIEW',
        },
      }),
      prisma.analyticsEvent.count({
        where: {
          targetUserId: userId,
          eventType: 'PROFILE_VIEW',
          createdAt: { gte: startDate },
        },
      }),
    ]);

    // 2. Post metrics (total, published)
    const [totalPosts, publishedPosts] = await Promise.all([
      prisma.post.count({ where: { authorId: userId } }),
      prisma.post.count({ where: { authorId: userId, published: true } }),
    ]);

    // 3. User's posts for calculating interactions
    const userPosts = await prisma.post.findMany({
      where: { authorId: userId, published: true },
      select: {
        id: true,
        title: true,
        imageUrl: true,
        docType: true,
        fileName: true,
        audience: true,
        createdAt: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            savedBy: true,
          },
        },
      },
    });

    const userPostIds = userPosts.map(p => p.id);

    // 4. Period Interactions
    const [
      periodLikes,
      periodComments,
      periodSaves,
      periodShares,
      periodPostViews,
    ] = await Promise.all([
      prisma.like.count({
        where: {
          postId: { in: userPostIds },
          createdAt: { gte: startDate },
        },
      }),
      prisma.comment.count({
        where: {
          postId: { in: userPostIds },
          createdAt: { gte: startDate },
        },
      }),
      prisma.savedPost.count({
        where: {
          postId: { in: userPostIds },
          createdAt: { gte: startDate },
        },
      }),
      prisma.analyticsEvent.count({
        where: {
          postId: { in: userPostIds },
          eventType: 'SHARE',
          createdAt: { gte: startDate },
        },
      }),
      prisma.analyticsEvent.count({
        where: {
          postId: { in: userPostIds },
          eventType: 'POST_VIEW',
          createdAt: { gte: startDate },
        },
      }),
    ]);

    // Total post views
    const totalPostViews = await prisma.analyticsEvent.count({
      where: {
        postId: { in: userPostIds },
        eventType: 'POST_VIEW',
      },
    });

    // All-time interactions
    const totalLikes = userPosts.reduce((acc, p) => acc + p._count.likes, 0);
    const totalComments = userPosts.reduce((acc, p) => acc + p._count.comments, 0);
    const totalSaves = userPosts.reduce((acc, p) => acc + p._count.savedBy, 0);
    const totalShares = await prisma.analyticsEvent.count({
      where: { postId: { in: userPostIds }, eventType: 'SHARE' },
    });

    // 5. Follower changes
    const [currentFollowers, followersGainedInPeriod, followersLostInPeriod] = await Promise.all([
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.analyticsEvent.count({
        where: {
          targetUserId: userId,
          eventType: 'FOLLOW',
          createdAt: { gte: startDate },
        },
      }),
      prisma.analyticsEvent.count({
        where: {
          targetUserId: userId,
          eventType: 'UNFOLLOW',
          createdAt: { gte: startDate },
        },
      }),
    ]);

    // 6. Top-performing posts
    // Enrich posts with individual view counts from analytics
    const postViews = await prisma.analyticsEvent.groupBy({
      by: ['postId'],
      where: {
        postId: { in: userPostIds },
        eventType: 'POST_VIEW',
      },
      _count: { id: true },
    });
    const postViewMap = new Map<string, number>();
    postViews.forEach(v => {
      if (v.postId) postViewMap.set(v.postId, v._count.id);
    });

    const enrichedPosts = userPosts.map(p => {
      const views = postViewMap.get(p.id) || 0;
      const interactions = p._count.likes + p._count.comments + p._count.savedBy;
      const postEngagement = views > 0 ? Number(((interactions / views) * 100).toFixed(1)) : 0;
      return {
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl,
        docType: p.docType,
        fileName: p.fileName,
        audience: p.audience,
        createdAt: p.createdAt,
        likes: p._count.likes,
        comments: p._count.comments,
        saves: p._count.savedBy,
        views,
        interactions,
        engagementRate: postEngagement,
      };
    });

    // Sort by interactions + views descending
    const topPosts = enrichedPosts
      .sort((a, b) => b.interactions * 2 + b.views - (a.interactions * 2 + a.views))
      .slice(0, 5);

    // 7. Engagement rate calculation (clearly documented)
    // Formula: Total interactions (Likes + Comments + Saves + Shares) / Total Views * 100
    // If views are 0, use total post views or 1
    const periodInteractions = periodLikes + periodComments + periodSaves + periodShares;
    const denominatorViews = Math.max(periodPostViews + periodProfileViews, 1);
    const engagementRate = periodInteractions > 0
      ? Number(((periodInteractions / denominatorViews) * 100).toFixed(1))
      : 0;

    // 8. Trends by day (for the last N days)
    const numDays = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const trendMap = new Map<string, { date: string; views: number; interactions: number; followersGained: number }>();

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      trendMap.set(key, { date: key, views: 0, interactions: 0, followersGained: 0 });
    }

    // Fetch daily events
    const recentEvents = await prisma.analyticsEvent.findMany({
      where: {
        OR: [
          { targetUserId: userId },
          { postId: { in: userPostIds } },
        ],
        createdAt: { gte: startDate },
      },
      select: {
        eventType: true,
        createdAt: true,
      },
    });

    recentEvents.forEach(e => {
      const day = e.createdAt.toISOString().split('T')[0];
      const entry = trendMap.get(day);
      if (entry) {
        if (e.eventType === 'PROFILE_VIEW' || e.eventType === 'POST_VIEW') {
          entry.views += 1;
        } else if (e.eventType === 'LIKE' || e.eventType === 'COMMENT' || e.eventType === 'SAVE' || e.eventType === 'SHARE') {
          entry.interactions += 1;
        } else if (e.eventType === 'FOLLOW') {
          entry.followersGained += 1;
        }
      }
    });

    const trends = Array.from(trendMap.values());

    // 9. Session / Active Time Analytics for current user
    const userSessions = await prisma.userSession.findMany({
      where: {
        userId,
        startedAt: { gte: startDate },
      },
      select: {
        durationSeconds: true,
        pagesViewed: true,
        startedAt: true,
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });

    const totalActiveTimeSeconds = userSessions.reduce((acc, s) => acc + s.durationSeconds, 0);
    const avgSessionMinutes = userSessions.length > 0
      ? Number((totalActiveTimeSeconds / userSessions.length / 60).toFixed(1))
      : 0;

    return res.json({
      period,
      summary: {
        profileViews: {
          total: totalProfileViews,
          period: periodProfileViews,
        },
        posts: {
          total: totalPosts,
          published: publishedPosts,
        },
        interactions: {
          period: {
            likes: periodLikes,
            comments: periodComments,
            saves: periodSaves,
            shares: periodShares,
            total: periodInteractions,
          },
          allTime: {
            likes: totalLikes,
            comments: totalComments,
            saves: totalSaves,
            shares: totalShares,
            total: totalLikes + totalComments + totalSaves + totalShares,
          },
        },
        views: {
          period: periodPostViews,
          total: totalPostViews,
        },
        followers: {
          total: currentFollowers,
          gained: followersGainedInPeriod,
          lost: followersLostInPeriod,
          net: followersGainedInPeriod - followersLostInPeriod,
        },
        engagementRate: {
          rate: engagementRate,
          formula: '((Period Likes + Comments + Saves + Shares) / (Period Post & Profile Views)) * 100',
        },
        sessions: {
          totalSessions: userSessions.length,
          totalActiveMinutes: Math.round(totalActiveTimeSeconds / 60),
          avgSessionMinutes,
        },
      },
      topPosts,
      trends,
    });
  } catch (error) {
    logger.error('Analytics dashboard error:', error);
    return res.status(500).json({ error: 'Failed to generate analytics dashboard' });
  }
});

export default router;
