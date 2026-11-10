import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { notifyNotification, notifyNotificationCount } from './websocket';
import { sendPushToUser, PushPayload } from './push';

export type NotificationType =
  | 'like'
  | 'comment'
  | 'comment_reply'
  | 'follow'
  | 'follow_request'
  | 'message'
  | 'reaction'
  | 'mention'
  | 'marketplace'
  | 'security_alert'
  | 'profile_view'
  | 'community';

export interface CreateNotificationInput {
  recipientId: string;
  senderId?: string | null;
  type: NotificationType;
  postId?: string | null;
  communityId?: string | null;
  data?: Record<string, any>;
}

export async function createNotification(input: CreateNotificationInput) {
  const { recipientId, senderId, type, postId, communityId, data } = input;

  // Rule 1: Never notify oneself
  if (senderId && senderId === recipientId) {
    return null;
  }

  try {
    // Fetch recipient settings
    let settings = await prisma.userSettings.findUnique({
      where: { userId: recipientId },
    });

    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId: recipientId },
      });
    }

    // Rule 2: Respect user notification preferences (essential security alerts cannot be disabled)
    if (type !== 'security_alert') {
      if (!settings.inAppNotifications) {
        return null;
      }

      if (type === 'message' && !settings.notifyMessages) {
        return null;
      }

      if ((type === 'reaction' || type === 'mention' || type === 'comment_reply') && !settings.notifyRepliesMentions) {
        return null;
      }

      if ((type === 'like' || type === 'comment') && !settings.notifyLikesComments) {
        return null;
      }

      if ((type === 'follow' || type === 'follow_request') && !settings.notifyFollowers) {
        return null;
      }

      if (type === 'marketplace' && !settings.notifyMarketplace) {
        return null;
      }

      if (type === 'profile_view' && (!settings.notifyProfileViews || !settings.profileViewsEnabled)) {
        return null;
      }
    }

    // Rule 3: Deduplication & Idempotency
    // Avoid duplicate unread notifications for repeated actions
    if (senderId && (type === 'like' || type === 'follow' || type === 'reaction')) {
      const existingUnread = await prisma.notification.findFirst({
        where: {
          recipientId,
          senderId,
          type,
          postId: postId || null,
          read: false,
        },
      });

      if (existingUnread) {
        // Already an unread notification for this exact interaction
        return existingUnread;
      }
    }

    // Persist notification to database
    const notification = await prisma.notification.create({
      data: {
        recipientId,
        senderId: senderId || null,
        type,
        postId: postId || null,
        communityId: communityId || null,
        data: data ? JSON.stringify(data) : null,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        post: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
          },
        },
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    // Compute fresh unread count
    const unreadCount = await prisma.notification.count({
      where: { recipientId, read: false },
    });

    // Real-time delivery via WebSocket
    notifyNotification(recipientId, notification, unreadCount);

    // Mobile Push Notification dispatch
    if (settings.pushNotifications) {
      const pushPayload = buildPushPayload(notification, data);
      sendPushToUser(recipientId, pushPayload).catch((err) => {
        logger.debug('Push delivery error:', err);
      });
    }

    return notification;
  } catch (error) {
    logger.error('createNotification error:', error);
    return null;
  }
}

function buildPushPayload(notification: any, extraData?: Record<string, any>): PushPayload {
  const actorName = notification.sender?.displayName || 'Someone';
  let title = 'MUSELY';
  let body = 'You have a new notification';
  let url = '/notifications';

  switch (notification.type) {
    case 'like':
      title = 'New Like';
      body = `${actorName} liked your post${notification.post?.title ? ` "${notification.post.title}"` : ''}`;
      url = notification.post ? `/post/${notification.post.id}` : '/notifications';
      break;

    case 'comment':
      title = 'New Comment';
      body = `${actorName} commented on your post`;
      url = notification.post ? `/post/${notification.post.id}` : '/notifications';
      break;

    case 'comment_reply':
      title = 'New Reply';
      body = `${actorName} replied to your comment`;
      url = notification.post ? `/post/${notification.post.id}` : '/notifications';
      break;

    case 'follow':
      title = 'New Follower';
      body = `${actorName} started following you`;
      url = notification.sender ? `/profile/${notification.sender.username}` : '/notifications';
      break;

    case 'follow_request':
      title = 'Follow Request';
      body = `${actorName} requested to follow your private account`;
      url = '/settings';
      break;

    case 'message':
      title = `Message from ${actorName}`;
      body = extraData?.preview ? extraData.preview : 'Sent you a private message';
      url = extraData?.conversationId ? `/messages` : '/messages';
      break;

    case 'reaction':
      title = 'Message Reaction';
      body = `${actorName} reacted ${extraData?.emoji || '❤️'} to your message`;
      url = '/messages';
      break;

    case 'mention':
      title = 'New Mention';
      body = `${actorName} mentioned you`;
      url = notification.post ? `/post/${notification.post.id}` : '/notifications';
      break;

    case 'marketplace':
      title = 'Marketplace Enquiry';
      body = extraData?.message || `${actorName} enquired about your listing`;
      url = '/messages';
      break;

    case 'security_alert':
      title = 'Security Alert';
      body = extraData?.message || 'Important account security update';
      url = '/settings';
      break;

    case 'profile_view':
      title = 'Profile View';
      body = `${actorName} viewed your profile`;
      url = notification.sender ? `/profile/${notification.sender.username}` : '/notifications';
      break;

    default:
      title = 'MUSELY Update';
      body = extraData?.message || 'New update available on your account';
      url = '/notifications';
  }

  return {
    title,
    body,
    url,
    tag: `musely-${notification.type}-${notification.id}`,
    data: {
      notificationId: notification.id,
      url,
      type: notification.type,
    },
  };
}
