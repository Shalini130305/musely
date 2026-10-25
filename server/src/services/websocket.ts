/**
 * MUSELY Real-time WebSocket Service
 * - Authenticated persistent connections (JWT via ?token=)
 * - Multi-tab / multi-device tracking via userSockets map
 * - Ping/pong heartbeat (30s) with dead-socket cleanup
 * - Presence broadcast (PRESENCE_CHANGE)
 * - Message delivery notifications (MESSAGE_DELIVERED)
 * - Message read notifications (MESSAGES_READ)
 * - New message push (NEW_MESSAGE)
 * - Typing indicator push (TYPING)
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import { URL } from 'url';
import { verifyToken } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

// Map userId -> Set of authenticated sockets
const userSockets = new Map<string, Set<WebSocket>>();

function sendJSON(ws: WebSocket, payload: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendToUser(userId: string, payload: object) {
  const sockets = userSockets.get(userId);
  if (!sockets) return;
  for (const ws of sockets) {
    sendJSON(ws, payload);
  }
}

export function isUserConnected(userId: string): boolean {
  const sockets = userSockets.get(userId);
  return !!(sockets && sockets.size > 0);
}

export async function broadcastPresence(
  userId: string,
  isOnline: boolean,
  lastSeenAt?: Date | null,
) {
  try {
    const memberships = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const convIds = memberships.map((m) => m.conversationId);
    if (convIds.length === 0) return;

    const others = await prisma.conversationParticipant.findMany({
      where: { conversationId: { in: convIds }, userId: { not: userId } },
      select: { userId: true },
      distinct: ['userId'],
    });

    const payload = {
      type: 'PRESENCE_CHANGE',
      userId,
      isOnline,
      lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
    };

    for (const { userId: partnerId } of others) {
      sendToUser(partnerId, payload);
    }
  } catch (err) {
    logger.error('broadcastPresence error:', err);
  }
}

export function notifyMessageDelivered(
  messageId: string,
  conversationId: string,
  senderId: string,
) {
  sendToUser(senderId, {
    type: 'MESSAGE_DELIVERED',
    messageId,
    conversationId,
    deliveredAt: new Date().toISOString(),
  });
}

export function notifyMessagesRead(
  conversationId: string,
  readerId: string,
  readAt: Date,
  participantIds: string[],
) {
  const payload = {
    type: 'MESSAGES_READ',
    conversationId,
    readerId,
    readAt: readAt.toISOString(),
  };
  for (const pid of participantIds) {
    if (pid !== readerId) {
      sendToUser(pid, payload);
    }
  }
}

export function notifyNewMessage(recipientIds: string[], message: object) {
  const payload = { type: 'NEW_MESSAGE', message };
  for (const rid of recipientIds) {
    sendToUser(rid, payload);
  }
}

export function notifyTyping(
  conversationId: string,
  userId: string,
  displayName: string,
  isTyping: boolean,
  participantIds: string[],
) {
  const payload = {
    type: 'TYPING',
    conversationId,
    userId,
    displayName,
    isTyping,
  };
  for (const pid of participantIds) {
    if (pid !== userId) {
      sendToUser(pid, payload);
    }
  }
}

export function initWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/ws' });

  const HEARTBEAT_INTERVAL = 30_000;
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      const ext = ws as any;
      if (ext._isAlive === false) {
        return ws.terminate();
      }
      ext._isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL);

  wss.on('close', () => clearInterval(heartbeatTimer));

  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const ext = ws as any;
    ext._isAlive = true;

    let userId: string | null = null;
    try {
      const rawUrl = req.url || '';
      const urlObj = new URL(rawUrl, 'http://localhost');
      const token = urlObj.searchParams.get('token');
      if (!token) throw new Error('Missing token');
      const payload = verifyToken(token);
      userId = payload.userId;
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!userRecord) {
      ws.close(4001, 'User not found');
      return;
    }

    const isFirst = !userSockets.has(userId) || userSockets.get(userId)!.size === 0;
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(ws);

    if (isFirst) {
      try {
        await prisma.user.update({
          where: { id: userId },
          data: { lastSeenAt: new Date() },
        });
        broadcastPresence(userId, true, new Date());
      } catch (err) {
        logger.error('WS presence on-connect error:', err);
      }
    }

    sendJSON(ws, { type: 'CONNECTED', userId });

    ws.on('pong', () => {
      (ws as any)._isAlive = true;
    });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'PING') {
          sendJSON(ws, { type: 'PONG', ts: Date.now() });
        }
        if (msg.type === 'HEARTBEAT' && userId) {
          prisma.user
            .update({ where: { id: userId }, data: { lastSeenAt: new Date() } })
            .catch((e) => logger.error('WS heartbeat update error:', e));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', async () => {
      if (!userId) return;
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) {
          userSockets.delete(userId);
          try {
            const now = new Date();
            await prisma.user.update({
              where: { id: userId },
              data: { lastSeenAt: now },
            });
            broadcastPresence(userId, false, now);
          } catch (err) {
            logger.error('WS presence on-disconnect error:', err);
          }
        }
      }
    });

    ws.on('error', (err) => {
      logger.error(`WebSocket error for user ${userId}:`, err);
    });
  });

  logger.info('WebSocket server initialized at /api/ws');
  return wss;
}
