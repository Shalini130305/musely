import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { updateProfileSchema, updateSettingsSchema } from '../validators/schemas';
import { logger } from '../utils/logger';

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
      prisma.notification.create({
        data: {
          recipientId: request.requesterId,
          senderId: req.user!.id,
          type: 'follow',
          data: JSON.stringify({ message: `${req.user!.displayName} accepted your follow request.` }),
        },
      }),
      prisma.analyticsEvent.create({
        data: {
          eventType: 'FOLLOW',
          userId: request.requesterId,
          targetUserId: req.user!.id,
        },
      }),
    ]);

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

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: USER_SELECT,
    });

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
        await prisma.notification.create({
          data: {
            recipientId: targetUser.id,
            senderId: req.user!.id,
            type: 'follow',
            data: JSON.stringify({ message: `${req.user!.displayName} requested to follow you` }),
          },
        });

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
    await prisma.notification.create({
      data: {
        recipientId: targetUser.id,
        senderId: req.user!.id,
        type: 'follow',
      },
    });

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
