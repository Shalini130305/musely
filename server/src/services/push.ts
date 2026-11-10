import webpush from 'web-push';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

let isVapidConfigured = false;

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function initWebPush(): boolean {
  if (isVapidConfigured) return true;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@musely.in';

  if (!publicKey || !privateKey) {
    logger.warn('Web Push VAPID keys not fully configured in environment.');
    return false;
  }

  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    isVapidConfigured = true;
    logger.info('Web Push VAPID initialized successfully');
    return true;
  } catch (err) {
    logger.error('Failed to initialize Web Push VAPID:', err);
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, any>;
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!initWebPush()) {
    return;
  }

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) {
      return;
    }

    const payloadString = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      url: payload.url || '/notifications',
      tag: payload.tag || 'musely-notification',
      data: {
        url: payload.url || '/notifications',
        ...(payload.data || {}),
      },
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payloadString);
      } catch (err: any) {
        // Handle 404 (Not Found) and 410 (Gone) -> expired/unregistered subscriptions
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          logger.info(`Pruning expired push subscription for user ${userId}`);
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          logger.warn(`Failed to deliver push notification: status ${err?.statusCode || err?.message}`);
        }
      }
    });

    await Promise.allSettled(sendPromises);
  } catch (error) {
    logger.error('sendPushToUser error:', error);
  }
}
