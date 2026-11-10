import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { updateProfileSchema, updateSettingsSchema } from '../validators/schemas';
import { logger } from '../utils/logger';
import { createNotification } from '../services/notification';
import { notifyProfileUpdated } from '../services/websocket';

const router = Router();

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  coverUrl: true,
  bio: true,
  website: true,
  location: true,
  interests: true,
  theme: true,
  isVerified: true,
  isAdmin: true,
  isPrivate: true,
  isDeactivated: true,
  deactivatedAt: true,
  createdAt: true,
  _count: {
    select: { posts: true, followers: true, following: true },
  },
};

// GET /api/users/settings - Fetch user settings & privacy toggles
router.get('/settings/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { isPrivate: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let settings = await prisma.userSettings.findUnique({
      where: { userId: req.user!.id },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId: req.user!.id },
      });
    }

    return res.json({
      settings: {
        ...settings,
        isPrivate: user.isPrivate,
      },
    });
  } catch (error) {
    logger.error('Get settings error:', error);
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/users/settings - Update user settings & privacy toggles
router.put('/settings', authenticate, async (req, res) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { isPrivate, ...settingsData } = parsed.data;

    // Update account privacy on User table if provided
    if (isPrivate !== undefined) {
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { isPrivate },
      });
    }

    // Upsert UserSettings
    const settings = await prisma.userSettings.upsert({
      where: { userId: req.user!.id },
      create: {
        userId: req.user!.id,
        ...settingsData,
      },
      update: {
        ...settingsData,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { isPrivate: true },
    });

    return res.json({
      settings: {
        ...settings,
        isPrivate: user?.isPrivate ?? false,
      },
      message: 'Settings updated successfully',
    });
  } catch (error) {
    logger.error('Update settings error:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET /api/users/requests/pending - List pending follow requests for the authenticated user
router.get('/requests/pending', authenticate, async (req, res) => {
  try {
    const requests = await prisma.followRequest.findMany({
      where: {
        targetId: req.user!.id,
        status: 'PENDING',
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ requests });
  } catch (error) {
    logger.error('Get pending requests error:', error);
    return res.status(500).json({ error: 'Failed to fetch pending requests' });
  }
});

// POST /api/users/requests/:id/approve - Approve a follow request
router.post('/requests/:id/approve', authenticate, async (req, res) => {
  try {
    const request = await prisma.followRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request || request.targetId !== req.user!.id) {
      return res.status(404).json({ error: 'Follow request not found' });
    }

    // Create the follow record and remove the request
    await prisma.$transaction([
      prisma.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: request.requesterId,
            followingId: req.user!.id,
          },
        },
        create: {
          followerId: request.requesterId,
          followingId: req.user!.id,
        },
        update: {},
      }),
      prisma.followRequest.delete({
        where: { id: request.id },
      }),
      prisma.analyticsEvent.create({
        data: {
          eventType: 'FOLLOW',
          userId: request.requesterId,
          targetUserId: req.user!.id,
        },
      }),
    ]);

    // Dispatch real-time and push notification to requester
    createNotification({
      recipientId: request.requesterId,
      senderId: req.user!.id,
      type: 'follow',
      data: { message: `${req.user!.displayName} accepted your follow request.` },
    }).catch(err => logger.debug('Follow request accept notification error:', err));

    const followerCount = await prisma.follow.count({ where: { followingId: req.user!.id } });
    return res.json({ success: true, message: 'Follow request approved', followerCount });
  } catch (error) {
    logger.error('Approve follow request error:', error);
    return res.status(500).json({ error: 'Failed to approve follow request' });
  }
});

// POST /api/users/requests/:id/reject - Reject a follow request
router.post('/requests/:id/reject', authenticate, async (req, res) => {
  try {
    const request = await prisma.followRequest.findUnique({
      where: { id: req.params.id },
    });

    if (!request || request.targetId !== req.user!.id) {
      return res.status(404).json({ error: 'Follow request not found' });
    }

    await prisma.followRequest.delete({
      where: { id: request.id },
    });

    return res.json({ success: true, message: 'Follow request rejected' });
  } catch (error) {
    logger.error('Reject follow request error:', error);
    return res.status(500).json({ error: 'Failed to reject follow request' });
  }
});

// DELETE /api/users/requests/cancel/:username - Cancel outgoing follow request
router.delete('/requests/cancel/:username', authenticate, async (req, res) => {
  try {
    const targetUser = await prisma.user.findUnique({
      where: { username: req.params.username },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.followRequest.deleteMany({
      where: {
        requesterId: req.user!.id,
        targetId: targetUser.id,
      },
    });

    return res.json({ success: true, message: 'Follow request cancelled' });
  } catch (error) {
    logger.error('Cancel follow request error:', error);
    return res.status(500).json({ error: 'Failed to cancel follow request' });
  }
});

// Helper for followers list
async function getFollowersList(targetUserId: string, viewerId?: string, search?: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const whereCondition: any = {
    followingId: targetUserId,
    follower: { isDeactivated: false },
  };

  if (search) {
    whereCondition.follower = {
      isDeactivated: false,
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: whereCondition,
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
            isPrivate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.follow.count({ where: whereCondition }),
  ]);

  let viewerFollowingIds = new Set<string>();
  if (viewerId) {
    const viewerFollows = await prisma.follow.findMany({
      where: {
        followerId: viewerId,
        followingId: { in: follows.map(f => f.follower.id) },
      },
      select: { followingId: true },
    });
    viewerFollowingIds = new Set(viewerFollows.map(f => f.followingId));
  }

  const users = follows.map(f => ({
    id: f.follower.id,
    username: f.follower.username,
    displayName: f.follower.displayName,
    avatarUrl: f.follower.avatarUrl,
    bio: f.follower.bio,
    isVerified: f.follower.isVerified,
    isFollowing: viewerFollowingIds.has(f.follower.id),
    isSelf: viewerId === f.follower.id,
  }));

  return { users, total, page, pages: Math.ceil(total / limit), hasMore: skip + limit < total };
}

// Helper for following list
async function getFollowingList(targetUserId: string, viewerId?: string, search?: string, page = 1, limit = 50) {
  const skip = (page - 1) * limit;
  const whereCondition: any = {
    followerId: targetUserId,
    following: { isDeactivated: false },
  };

  if (search) {
    whereCondition.following = {
      isDeactivated: false,
      OR: [
        { username: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ],
    };
  }

  const [follows, total] = await Promise.all([
    prisma.follow.findMany({
      where: whereCondition,
      include: {
        following: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            bio: true,
            isVerified: true,
            isPrivate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.follow.count({ where: whereCondition }),
  ]);

  let viewerFollowingIds = new Set<string>();
  if (viewerId) {
    const viewerFollows = await prisma.follow.findMany({
      where: {
        followerId: viewerId,
        followingId: { in: follows.map(f => f.following.id) },
      },
      select: { followingId: true },
    });
    viewerFollowingIds = new Set(viewerFollows.map(f => f.followingId));
  }

  const users = follows.map(f => ({
    id: f.following.id,
    username: f.following.username,
    displayName: f.following.displayName,
    avatarUrl: f.following.avatarUrl,
    bio: f.following.bio,
    isVerified: f.following.isVerified,
    isFollowing: viewerFollowingIds.has(f.following.id),
    isSelf: viewerId === f.following.id,
  }));

  return { users, total, page, pages: Math.ceil(total / limit), hasMore: skip + limit < total };
}

// GET /api/users/me/followers - Get authenticated user's followers
router.get('/me/followers', authenticate, async (req, res) => {
  try {
    const search = (req.query.search as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const result = await getFollowersList(req.user!.id, req.user!.id, search, page, limit);
    return res.json(result);
  } catch (error) {
    logger.error('Get my followers error:', error);
    return res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// GET /api/users/me/following - Get authenticated user's following
router.get('/me/following', authenticate, async (req, res) => {
  try {
    const search = (req.query.search as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const result = await getFollowingList(req.user!.id, req.user!.id, search, page, limit);
    return res.json(result);
  } catch (error) {
    logger.error('Get my following error:', error);
    return res.status(500).json({ error: 'Failed to fetch following' });
  }
});

// GET /api/users/me/unfollow-history - List users who unfollowed current user
router.get('/me/unfollow-history', authenticate, async (req, res) => {
  try {
    const events = await prisma.analyticsEvent.findMany({
      where: {
        eventType: 'UNFOLLOW',
        targetUserId: req.user!.id,
        userId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const userIds = Array.from(new Set(events.map(e => e.userId).filter(Boolean) as string[]));
    if (userIds.length === 0) {
      return res.json({ unfollows: [] });
    }

    const [users, currentFollows] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          isVerified: true,
        },
      }),
      prisma.follow.findMany({
        where: {
          followerId: { in: userIds },
          followingId: req.user!.id,
        },
        select: { followerId: true },
      }),
    ]);

    const stillFollowingSet = new Set(currentFollows.map(f => f.followerId));
    const userMap = new Map(users.map(u => [u.id, u]));

    const unfollows = [];
    const seenUserIds = new Set<string>();

    for (const evt of events) {
      if (!evt.userId || seenUserIds.has(evt.userId)) continue;
      if (stillFollowingSet.has(evt.userId)) continue; // Re-followed
      const u = userMap.get(evt.userId);
      if (u) {
        seenUserIds.add(evt.userId);
        unfollows.push({
          id: evt.id,
          unfollowedAt: evt.createdAt,
          user: u,
        });
      }
    }

    return res.json({ unfollows });
  } catch (error) {
    logger.error('Get unfollow history error:', error);
    return res.status(500).json({ error: 'Failed to retrieve unfollow history' });
  }
});

// GET /api/users/me/deactivated-connections - List connections that are deactivated
router.get('/me/deactivated-connections', authenticate, async (req, res) => {
  try {
    const [followingDeactivated, followersDeactivated] = await Promise.all([
      prisma.follow.findMany({
        where: {
          followerId: req.user!.id,
          following: { isDeactivated: true },
        },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              deactivatedAt: true,
            },
          },
        },
      }),
      prisma.follow.findMany({
        where: {
          followingId: req.user!.id,
          follower: { isDeactivated: true },
        },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              deactivatedAt: true,
            },
          },
        },
      }),
    ]);

    const map = new Map<string, any>();
    for (const f of followingDeactivated) {
      map.set(f.following.id, {
        ...f.following,
        relationship: 'following',
      });
    }
    for (const f of followersDeactivated) {
      if (map.has(f.follower.id)) {
        map.get(f.follower.id).relationship = 'mutual';
      } else {
        map.set(f.follower.id, {
          ...f.follower,
          relationship: 'follower',
        });
      }
    }

    return res.json({ deactivatedUsers: Array.from(map.values()) });
  } catch (error) {
    logger.error('Get deactivated connections error:', error);
    return res.status(500).json({ error: 'Failed to fetch deactivated connections' });
  }
});

// GET /api/users/me/download-data - Export account data
router.get('/me/download-data', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const [user, settings, posts, collections, savedCount, followersCount, followingCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          displayName: true,
          avatarUrl: true,
          coverUrl: true,
          bio: true,
          website: true,
          location: true,
          interests: true,
          theme: true,
          isVerified: true,
          isPrivate: true,
          createdAt: true,
        },
      }),
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.post.findMany({
        where: { authorId: userId },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          postType: true,
          caption: true,
          location: true,
          createdAt: true,
          _count: { select: { likes: true, comments: true } },
        },
      }),
      prisma.collection.findMany({
        where: { userId },
        select: { id: true, name: true, description: true, isPublic: true, createdAt: true },
      }),
      prisma.savedPost.count({ where: { userId } }),
      prisma.follow.count({ where: { followingId: userId } }),
      prisma.follow.count({ where: { followerId: userId } }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      platform: 'MUSELY',
      profile: user,
      settings,
      stats: {
        totalPosts: posts.length,
        totalCollections: collections.length,
        totalSavedPosts: savedCount,
        followersCount,
        followingCount,
      },
      posts,
      collections,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="musely-archive-${user?.username || 'user'}-${Date.now()}.json"`
    );
    return res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    logger.error('Download data error:', error);
    return res.status(500).json({ error: 'Failed to generate data export' });
  }
});

// POST /api/users/me/deactivate - Deactivate account
router.post('/me/deactivate', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password confirmation is required to deactivate account' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isDeactivated: true,
        deactivatedAt: new Date(),
      },
    });

    res.clearCookie('token');
    return res.json({ success: true, message: 'Account deactivated successfully. You can reactivate anytime by logging back in.' });
  } catch (error) {
    logger.error('Deactivate account error:', error);
    return res.status(500).json({ error: 'Failed to deactivate account' });
  }
});

// POST /api/users/me/reactivate - Reactivate account
router.post('/me/reactivate', authenticate, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        isDeactivated: false,
        deactivatedAt: null,
      },
    });
    return res.json({ success: true, message: 'Account successfully reactivated' });
  } catch (error) {
    logger.error('Reactivate account error:', error);
    return res.status(500).json({ error: 'Failed to reactivate account' });
  }
});

// DELETE /api/users/me/account and /api/users/account/delete - Permanent deletion
const handleAccountDeletion = async (req: any, res: any) => {
  try {
    const { password, confirmation } = req.body;
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Please type DELETE to confirm permanent account deletion' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Password is required to permanently delete account' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, passwordHash: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    await prisma.user.delete({ where: { id: req.user!.id } });
    res.clearCookie('token');
    return res.json({ success: true, message: 'Account permanently deleted' });
  } catch (error) {
    logger.error('Delete account error:', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
};

router.delete('/me/account', authenticate, handleAccountDeletion);
router.delete('/account/delete', authenticate, handleAccountDeletion);

// GET /api/users/:username/followers - Followers list for any user
router.get('/:username/followers', optionalAuthenticate, async (req, res) => {
  try {
    const targetUser = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, isPrivate: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check privacy
    if (targetUser.isPrivate && req.user?.id !== targetUser.id) {
      let isFollowing = false;
      if (req.user) {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: req.user.id,
              followingId: targetUser.id,
            },
          },
        });
        isFollowing = !!follow;
      }
      if (!isFollowing) {
        return res.status(403).json({
          isPrivate: true,
          message: 'This account is private. Follow this user to see their connections.',
          users: [],
          total: 0,
        });
      }
    }

    const search = (req.query.search as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const result = await getFollowersList(targetUser.id, req.user?.id, search, page, limit);
    return res.json(result);
  } catch (error) {
    logger.error('Get followers error:', error);
    return res.status(500).json({ error: 'Failed to fetch followers' });
  }
});

// GET /api/users/:username/following - Following list for any user
router.get('/:username/following', optionalAuthenticate, async (req, res) => {
  try {
    const targetUser = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true, isPrivate: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check privacy
    if (targetUser.isPrivate && req.user?.id !== targetUser.id) {
      let isFollowing = false;
      if (req.user) {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: req.user.id,
              followingId: targetUser.id,
            },
          },
        });
        isFollowing = !!follow;
      }
      if (!isFollowing) {
        return res.status(403).json({
          isPrivate: true,
          message: 'This account is private. Follow this user to see their connections.',
          users: [],
          total: 0,
        });
      }
    }

    const search = (req.query.search as string) || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const result = await getFollowingList(targetUser.id, req.user?.id, search, page, limit);
    return res.json(result);
  } catch (error) {
    logger.error('Get following error:', error);
    return res.status(500).json({ error: 'Failed to fetch following' });
  }
});

// GET /api/users/:username - User profile with privacy status
router.get('/:username', optionalAuthenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        ...USER_SELECT,
        settings: {
          select: {
            profileVisible: true,
            activityStatus: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check deactivated status
    if (user.isDeactivated && (!req.user || (req.user.id !== user.id && !req.user.isAdmin))) {
      return res.status(404).json({ error: 'This account is currently deactivated.' });
    }

    // Profile visibility setting check
    if (user.settings && user.settings.profileVisible === false) {
      if (!req.user || (req.user.id !== user.id && !req.user.isAdmin)) {
        return res.status(404).json({ error: 'This profile is currently hidden by its owner.' });
      }
    }

    let isFollowing = false;
    let isFollowPending = false;

    if (req.user && req.user.id !== user.id) {
      const [follow, pendingReq] = await Promise.all([
        prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: req.user.id,
              followingId: user.id,
            },
          },
        }),
        prisma.followRequest.findUnique({
          where: {
            requesterId_targetId: {
              requesterId: req.user.id,
              targetId: user.id,
            },
          },
        }),
      ]);
      isFollowing = !!follow;
      isFollowPending = !!pendingReq && pendingReq.status === 'PENDING';

      // Log profile view in analytics
      prisma.analyticsEvent.create({
        data: {
          eventType: 'PROFILE_VIEW',
          userId: req.user.id,
          targetUserId: user.id,
        },
      }).catch(err => logger.debug('Profile view track error:', err));

      // Record ProfileView for notification tracking (deduplicate within 1 hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      prisma.profileView.findFirst({
        where: {
          viewerId: req.user.id,
          viewedId: user.id,
          createdAt: { gte: oneHourAgo },
        },
      }).then(async (recentView) => {
        if (!recentView) {
          await prisma.profileView.create({
            data: {
              viewerId: req.user!.id,
              viewedId: user.id,
            },
          });

          const targetSettings = await prisma.userSettings.findUnique({
            where: { userId: user.id },
            select: { notifyProfileViews: true, profileViewsEnabled: true },
          });

          if (targetSettings?.profileViewsEnabled !== false && targetSettings?.notifyProfileViews !== false) {
            createNotification({
              recipientId: user.id,
              senderId: req.user!.id,
              type: 'profile_view',
              data: { message: `${req.user!.displayName} viewed your profile` },
            }).catch(err => logger.debug('Profile view notification error:', err));
          }
        }
      }).catch(err => logger.debug('Profile view track error:', err));
    } else if (!req.user) {
      // Guest view
      prisma.analyticsEvent.create({
        data: {
          eventType: 'PROFILE_VIEW',
          userId: null,
          targetUserId: user.id,
        },
      }).catch(err => logger.debug('Profile view track error:', err));
    }

    return res.json({
      user: {
        ...user,
        isFollowing,
        isFollowPending,
      },
    });
  } catch (error) {
    logger.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/users/:username/posts - Profile posts with strict account & post privacy
router.get('/:username/posts', optionalAuthenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isOwner = req.user?.id === user.id;
    let isFollowing = false;

    if (req.user && !isOwner) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: req.user.id,
            followingId: user.id,
          },
        },
      });
      isFollowing = !!follow;
    }

    // Account Privacy Rule:
    // If account is private, only owner and approved followers can view posts
    if (user.isPrivate && !isOwner && !isFollowing) {
      return res.json({
        isPrivate: true,
        message: 'This Account is Private. Follow this user to see their posts and creative work.',
        posts: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0, hasMore: false },
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const skip = (page - 1) * limit;

    // Audience filtering on author's posts
    const postWhere: any = {
      authorId: user.id,
      published: true,
    };

    if (!isOwner) {
      if (isFollowing) {
        postWhere.audience = { in: ['PUBLIC', 'FOLLOWERS'] };
      } else {
        postWhere.audience = 'PUBLIC';
      }
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: postWhere,
        select: {
          id: true,
          title: true,
          imageUrl: true,
          videoUrl: true,
          imageWidth: true,
          imageHeight: true,
          category: true,
          postType: true,
          audience: true,
          fileUrl: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          docType: true,
          caption: true,
          createdAt: true,
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true },
          },
          _count: { select: { likes: true, savedBy: true, comments: true } },
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.post.count({ where: postWhere }),
    ]);

    return res.json({
      isPrivate: false,
      posts: posts.map(p => ({ ...p, tags: p.tags.map(t => t.tag) })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    logger.error('Get user posts error:', error);
    return res.status(500).json({ error: 'Failed to fetch user posts' });
  }
});

// GET /api/users/:username/saved
router.get('/:username/saved', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.id !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const skip = (page - 1) * limit;

    const [saved, total] = await Promise.all([
      prisma.savedPost.findMany({
        where: { userId: user.id },
        select: {
          post: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              imageWidth: true,
              imageHeight: true,
              category: true,
              postType: true,
              audience: true,
              fileUrl: true,
              fileName: true,
              fileType: true,
              fileSize: true,
              docType: true,
              caption: true,
              createdAt: true,
              author: {
                select: { id: true, username: true, displayName: true, avatarUrl: true, isPrivate: true },
              },
              _count: { select: { likes: true, savedBy: true, comments: true } },
              tags: { select: { tag: { select: { id: true, name: true } } } },
            },
          },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.savedPost.count({ where: { userId: user.id } }),
    ]);

    return res.json({
      posts: saved.map(s => ({
        ...s.post,
        tags: s.post.tags.map(t => t.tag),
        savedAt: s.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    logger.error('Get saved posts error:', error);
    return res.status(500).json({ error: 'Failed to fetch saved posts' });
  }
});

// PUT /api/users/profile/update - Update profile info
router.put('/profile/update', authenticate, async (req, res) => {
  try {
    const result = updateProfileSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    const updateData: any = {
      displayName: result.data.displayName,
      bio: result.data.bio ?? null,
      website: result.data.website || null,
      location: result.data.location ?? null,
      interests: result.data.interests ?? null,
    };
    if (result.data.avatarUrl !== undefined) updateData.avatarUrl = result.data.avatarUrl || null;
    if (result.data.coverUrl !== undefined) updateData.coverUrl = result.data.coverUrl || null;
    if (result.data.theme) updateData.theme = result.data.theme;

    // Check and update username if provided and changed
    if (result.data.username && result.data.username.toLowerCase() !== req.user!.username.toLowerCase()) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: { equals: result.data.username, mode: 'insensitive' },
          id: { not: req.user!.id },
        },
      });
      if (existingUser) {
        return res.status(409).json({ error: 'Username is already taken by another creator' });
      }
      updateData.username = result.data.username;
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: USER_SELECT,
    });

    // Synchronize profile changes across active tabs in real-time
    notifyProfileUpdated(req.user!.id, user);

    return res.json({ user });
  } catch (error) {
    logger.error('Update profile error:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/users/:username/follow - Follow / Unfollow / Request Follow for private accounts
router.post('/:username/follow', authenticate, async (req, res) => {
  try {
    const targetUser = await prisma.user.findUnique({
      where: { username: req.params.username },
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === req.user!.id) {
      return res.status(400).json({ error: 'Cannot follow yourself' });
    }

    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user!.id,
          followingId: targetUser.id,
        },
      },
    });

    // If currently following: UNFOLLOW
    if (existingFollow) {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: req.user!.id,
            followingId: targetUser.id,
          },
        },
      });

      // Track UNFOLLOW in analytics
      prisma.analyticsEvent.create({
        data: {
          eventType: 'UNFOLLOW',
          userId: req.user!.id,
          targetUserId: targetUser.id,
        },
      }).catch(err => logger.debug('Analytics error:', err));

      const count = await prisma.follow.count({ where: { followingId: targetUser.id } });
      return res.json({ following: false, requestPending: false, count });
    }

    // If target account IS PRIVATE:
    if (targetUser.isPrivate) {
      const existingRequest = await prisma.followRequest.findUnique({
        where: {
          requesterId_targetId: {
            requesterId: req.user!.id,
            targetId: targetUser.id,
          },
        },
      });

      if (existingRequest) {
        // Toggle cancel request
        await prisma.followRequest.delete({
          where: { id: existingRequest.id },
        });
        const count = await prisma.follow.count({ where: { followingId: targetUser.id } });
        return res.json({ following: false, requestPending: false, count, message: 'Follow request cancelled' });
      } else {
        // Create follow request
        await prisma.followRequest.create({
          data: {
            requesterId: req.user!.id,
            targetId: targetUser.id,
            status: 'PENDING',
          },
        });

        // Notify target user
        createNotification({
          recipientId: targetUser.id,
          senderId: req.user!.id,
          type: 'follow_request',
          data: { message: `${req.user!.displayName} requested to follow you` },
        }).catch(err => logger.debug('Follow request notification error:', err));

        const count = await prisma.follow.count({ where: { followingId: targetUser.id } });
        return res.json({
          following: false,
          requestPending: true,
          count,
          message: 'Follow request sent to private account',
        });
      }
    }

    // Public account: instant follow
    await prisma.follow.create({
      data: { followerId: req.user!.id, followingId: targetUser.id },
    });

    // Notification
    createNotification({
      recipientId: targetUser.id,
      senderId: req.user!.id,
      type: 'follow',
    }).catch(err => logger.debug('Follow notification error:', err));

    // Track FOLLOW in analytics
    prisma.analyticsEvent.create({
      data: {
        eventType: 'FOLLOW',
        userId: req.user!.id,
        targetUserId: targetUser.id,
      },
    }).catch(err => logger.debug('Analytics error:', err));

    const count = await prisma.follow.count({ where: { followingId: targetUser.id } });
    return res.json({ following: true, requestPending: false, count });
  } catch (error) {
    logger.error('Toggle follow error:', error);
    return res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

// POST /api/users/presence/heartbeat - Update online presence
router.post('/presence/heartbeat', authenticate, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { lastSeenAt: new Date() },
    });
    return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update presence' });
  }
});

// POST /api/users/presence/offline - Mark user offline (called via sendBeacon on tab close)
router.post('/presence/offline', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    // Set lastSeenAt to 3 minutes ago so timestamp-based online evaluations immediately reflect OFFLINE
    const offlineTimestamp = new Date(Date.now() - 3 * 60 * 1000);
    await prisma.user.update({
      where: { id: userId },
      data: { lastSeenAt: offlineTimestamp },
    });
    // Broadcast offline — the WS service will skip if the user reconnected
    try {
      const { isUserConnected, broadcastPresence } = await import('../services/websocket');
      if (!isUserConnected(userId)) {
        broadcastPresence(userId, false, offlineTimestamp);
      }
    } catch {}
    return res.json({ status: 'ok' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark offline' });
  }
});

// GET /api/users/presence/:userId - Get user online status & last seen with privacy controls
router.get('/presence/:userId', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user!.id;
    const targetUserId = req.params.userId;

    if (targetUserId === currentUserId) {
      return res.json({ isOnline: true, lastSeenAt: new Date() });
    }

    // Check block
    const blockExists = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUserId },
          { blockerId: targetUserId, blockedId: currentUserId },
        ],
      },
    });

    if (blockExists) {
      return res.json({ isOnline: false, lastSeenAt: null });
    }

    const [targetUser, targetSettings] = await Promise.all([
      prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, lastSeenAt: true },
      }),
      prisma.userSettings.findUnique({
        where: { userId: targetUserId },
      }),
    ]);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const showOnline = targetSettings ? targetSettings.showOnlineStatus : true;
    const showLastSeen = targetSettings ? targetSettings.showLastSeen : true;

    // Check WebSocket connection first
    let isConnected = false;
    try {
      const { isUserConnected } = await import('../services/websocket');
      isConnected = isUserConnected(targetUserId);
    } catch {}

    // Check HTTP heartbeat activity (threshold: 45s since client heartbeats every 20s)
    const now = Date.now();
    const lastSeenTime = targetUser.lastSeenAt ? new Date(targetUser.lastSeenAt).getTime() : 0;
    const isRecentlyActive = now - lastSeenTime < 45 * 1000;
    const online = isConnected || isRecentlyActive;

    return res.json({
      isOnline: showOnline ? online : false,
      lastSeenAt: showLastSeen ? targetUser.lastSeenAt : null,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load presence' });
  }
});

export default router;
