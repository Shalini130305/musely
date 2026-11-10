import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { notifyNotificationCount } from '../services/websocket';
import { getVapidPublicKey, sendPushToUser } from '../services/push';
import { logger } from '../utils/logger';

const router = Router();

// Helper to format notification for client (providing both read/isRead and sender/actor)
function formatNotification(n: any) {
  let parsedData: any = null;
  if (n.data) {
    try {
      parsedData = typeof n.data === 'string' ? JSON.parse(n.data) : n.data;
    } catch {
      parsedData = { raw: n.data };
    }
  }

  return {
    id: n.id,
    type: n.type,
    read: n.read,
    isRead: n.read,
    createdAt: n.createdAt,
    data: parsedData,
    sender: n.sender,
    actor: n.sender || {
      id: 'system',
      username: 'musely',
      displayName: 'MUSELY',
      avatarUrl: null,
    },
    post: n.post,
    community: n.community,
  };
}

// GET /api/notifications - Fetch user notifications with pagination and filters
router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 30, 1), 100);
    const cursor = req.query.cursor as string | undefined;
    const filter = (req.query.filter as string) || 'all';

    const where: any = { recipientId: userId };

    if (filter === 'unread') {
      where.read = false;
    } else if (filter === 'likes') {
      where.type = 'like';
    } else if (filter === 'comments') {
      where.type = { in: ['comment', 'comment_reply'] };
    } else if (filter === 'messages') {
      where.type = { in: ['message', 'reaction'] };
    } else if (filter === 'follows') {
      where.type = { in: ['follow', 'follow_request'] };
    } else if (filter === 'security') {
      where.type = 'security_alert';
    }

    const notifications = await prisma.notification.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
        post: {
          select: { id: true, title: true, imageUrl: true },
        },
        community: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    let nextCursor: string | null = null;
    let hasMore = false;
    if (notifications.length > limit) {
      hasMore = true;
      const nextItem = notifications.pop();
      nextCursor = nextItem ? nextItem.id : null;
    }

    const unreadCount = await prisma.notification.count({
      where: { recipientId: userId, read: false },
    });

    return res.json({
      notifications: notifications.map(formatNotification),
      unreadCount,
      hasMore,
      nextCursor,
    });
  } catch (error) {
    logger.error('Fetch notifications error:', error);
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// GET /api/notifications/unread-count & /unread/count
const getUnreadCountHandler = async (req: any, res: any) => {
  try {
    const unreadCount = await prisma.notification.count({
      where: { recipientId: req.user!.id, read: false },
    });
    return res.json({ unreadCount });
  } catch (error) {
    logger.error('Fetch unread count error:', error);
    return res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

router.get('/unread-count', authenticate, getUnreadCountHandler);
router.get('/unread/count', authenticate, getUnreadCountHandler);

// PUT & POST /api/notifications/read-all - Mark all as read
const markAllReadHandler = async (req: any, res: any) => {
  try {
    const userId = req.user!.id;
    await prisma.notification.updateMany({
      where: { recipientId: userId, read: false },
      data: { read: true },
    });

    notifyNotificationCount(userId, 0);

    return res.json({ message: 'All notifications marked as read', unreadCount: 0 });
  } catch (error) {
    logger.error('Mark all read error:', error);
    return res.status(500).json({ error: 'Failed to mark notifications read' });
  }
};

router.put('/read-all', authenticate, markAllReadHandler);
router.post('/read-all', authenticate, markAllReadHandler);

// PUT & POST /api/notifications/:id/read - Mark single notification as read
const markSingleReadHandler = async (req: any, res: any) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await prisma.notification.updateMany({
      where: { id, recipientId: userId },
      data: { read: true },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const unreadCount = await prisma.notification.count({
      where: { recipientId: userId, read: false },
    });

    notifyNotificationCount(userId, unreadCount);

    return res.json({ message: 'Notification marked as read', unreadCount });
  } catch (error) {
    logger.error('Mark single read error:', error);
    return res.status(500).json({ error: 'Failed to update notification' });
  }
};

router.put('/:id/read', authenticate, markSingleReadHandler);
router.post('/:id/read', authenticate, markSingleReadHandler);

// DELETE /api/notifications/:id - Delete single notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await prisma.notification.deleteMany({
      where: { id, recipientId: userId },
    });

    if (result.count === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const unreadCount = await prisma.notification.count({
      where: { recipientId: userId, read: false },
    });

    notifyNotificationCount(userId, unreadCount);

    return res.json({ message: 'Notification deleted', unreadCount });
  } catch (error) {
    logger.error('Delete notification error:', error);
    return res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// GET /api/notifications/settings - Get user's notification preferences
router.get('/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId },
      });
    }

    return res.json({
      settings: {
        inAppNotifications: settings.inAppNotifications,
        pushNotifications: settings.pushNotifications,
        emailNotifications: settings.emailNotifications,
        notifyMessages: settings.notifyMessages,
        notifyRepliesMentions: settings.notifyRepliesMentions,
        notifyLikesComments: settings.notifyLikesComments,
        notifyFollowers: settings.notifyFollowers,
        notifyMarketplace: settings.notifyMarketplace,
        notifySecurityAlerts: true, // Always locked to true for safety
      },
    });
  } catch (error) {
    logger.error('Get notification settings error:', error);
    return res.status(500).json({ error: 'Failed to load notification settings' });
  }
});

// PUT /api/notifications/settings - Update notification preferences
router.put('/settings', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      inAppNotifications,
      pushNotifications,
      emailNotifications,
      notifyMessages,
      notifyRepliesMentions,
      notifyLikesComments,
      notifyFollowers,
      notifyMarketplace,
    } = req.body;

    const updated = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        ...(typeof inAppNotifications === 'boolean' && { inAppNotifications }),
        ...(typeof pushNotifications === 'boolean' && { pushNotifications }),
        ...(typeof emailNotifications === 'boolean' && { emailNotifications }),
        ...(typeof notifyMessages === 'boolean' && { notifyMessages }),
        ...(typeof notifyRepliesMentions === 'boolean' && { notifyRepliesMentions }),
        ...(typeof notifyLikesComments === 'boolean' && { notifyLikesComments }),
        ...(typeof notifyFollowers === 'boolean' && { notifyFollowers }),
        ...(typeof notifyMarketplace === 'boolean' && { notifyMarketplace }),
        notifySecurityAlerts: true, // Non-negotiable security alert setting
      },
      create: {
        userId,
        inAppNotifications: inAppNotifications ?? true,
        pushNotifications: pushNotifications ?? false,
        emailNotifications: emailNotifications ?? true,
        notifyMessages: notifyMessages ?? true,
        notifyRepliesMentions: notifyRepliesMentions ?? true,
        notifyLikesComments: notifyLikesComments ?? true,
        notifyFollowers: notifyFollowers ?? true,
        notifyMarketplace: notifyMarketplace ?? true,
        notifySecurityAlerts: true,
      },
    });

    return res.json({
      message: 'Notification settings updated successfully',
      settings: updated,
    });
  } catch (error) {
    logger.error('Update notification settings error:', error);
    return res.status(500).json({ error: 'Failed to update notification settings' });
  }
});

// -------------------------------------------------------------
// WEB PUSH SUBSCRIPTION ENDPOINTS
// -------------------------------------------------------------

// GET /api/notifications/push/vapid-public-key
router.get('/push/vapid-public-key', (_req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return res.status(503).json({ error: 'Push notifications are not configured on server' });
  }
  return res.json({ publicKey });
});

// POST /api/notifications/push/subscribe
router.post('/push/subscribe', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid push subscription payload' });
    }

    // Upsert subscription
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || req.headers['user-agent'] || null,
        updatedAt: new Date(),
      },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: userAgent || req.headers['user-agent'] || null,
      },
    });

    // Automatically enable push notifications in user settings
    await prisma.userSettings.upsert({
      where: { userId },
      update: { pushNotifications: true },
      create: { userId, pushNotifications: true },
    });

    logger.info(`Web Push subscription registered for user ${userId}`);
    return res.status(201).json({ success: true, message: 'Push subscription registered successfully' });
  } catch (error) {
    logger.error('Push subscribe error:', error);
    return res.status(500).json({ error: 'Failed to register push subscription' });
  }
});

// POST /api/notifications/push/unsubscribe
router.post('/push/unsubscribe', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint is required to unsubscribe' });
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });

    // Check remaining subscriptions
    const remaining = await prisma.pushSubscription.count({ where: { userId } });
    if (remaining === 0) {
      await prisma.userSettings.updateMany({
        where: { userId },
        data: { pushNotifications: false },
      });
    }

    return res.json({ success: true, message: 'Push subscription removed successfully' });
  } catch (error) {
    logger.error('Push unsubscribe error:', error);
    return res.status(500).json({ error: 'Failed to remove push subscription' });
  }
});

// POST /api/notifications/push/test - Send test push notification
router.post('/push/test', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const count = await prisma.pushSubscription.count({ where: { userId } });

    if (count === 0) {
      return res.status(400).json({ error: 'No active push subscriptions found for your account' });
    }

    await sendPushToUser(userId, {
      title: 'MUSELY Push Test',
      body: 'Mobile and Web Push notifications are active and functioning!',
      url: '/notifications',
    });

    return res.json({ success: true, message: 'Test push notification dispatched' });
  } catch (error) {
    logger.error('Test push error:', error);
    return res.status(500).json({ error: 'Failed to send test push notification' });
  }
});

export default router;
