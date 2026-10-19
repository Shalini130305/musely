import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { createMessageSchema } from '../validators/schemas';
import { logger } from '../utils/logger';

const router = Router();

// Helper to count unread messages
const getUnreadCountHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userConvs = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    let totalUnread = 0;
    for (const cp of userConvs) {
      const count = await prisma.message.count({
        where: {
          conversationId: cp.conversationId,
          senderId: { not: userId },
          createdAt: { gt: cp.lastReadAt },
        },
      });
      totalUnread += count;
    }

    return res.json({ unreadCount: totalUnread });
  } catch (error) {
    logger.error('Get unread count error:', error);
    return res.status(500).json({ error: 'Failed to count unread messages' });
  }
};

router.get('/unread-count', authenticate, getUnreadCountHandler);
router.get('/unread/count', authenticate, getUnreadCountHandler);

// GET /api/messages/conversations - List user conversations
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const memberships = await prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, username: true, displayName: true, avatarUrl: true },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: { id: true, content: true, createdAt: true, senderId: true, read: true },
            },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const conversations = memberships.map(m => {
      const otherParticipant = m.conversation.participants.find(p => p.userId !== userId)?.user;
      const lastMsg = m.conversation.messages[0] || null;
      return {
        id: m.conversation.id,
        updatedAt: m.conversation.updatedAt,
        lastReadAt: m.lastReadAt,
        otherUser: otherParticipant,
        lastMessage: lastMsg ? {
          id: lastMsg.id,
          content: lastMsg.content,
          createdAt: lastMsg.createdAt,
          senderId: lastMsg.senderId,
          isRead: lastMsg.read,
        } : null,
        unreadCount: 0,
      };
    });

    return res.json({ conversations });
  } catch (error) {
    logger.error('List conversations error:', error);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Start or find existing conversation (supports /start and /conversations)
const startConversationHandler = async (req: Request, res: Response) => {
  try {
    const currentUserId = req.user!.id;
    const { targetUsername, targetUserId, recipientId } = req.body;
    const effectiveUserId = targetUserId || recipientId;

    let targetUser = null;
    if (effectiveUserId) {
      targetUser = await prisma.user.findUnique({ where: { id: effectiveUserId } });
    } else if (targetUsername) {
      targetUser = await prisma.user.findUnique({ where: { username: targetUsername } });
    }

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === currentUserId) {
      return res.status(400).json({ error: 'Cannot start conversation with yourself' });
    }

    // Check if either user has blocked the other
    const blockExists = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: currentUserId, blockedId: targetUser.id },
          { blockerId: targetUser.id, blockedId: currentUserId },
        ],
      },
    });

    if (blockExists) {
      return res.status(403).json({ error: 'Cannot message this user due to privacy/blocking settings' });
    }

    // Check for existing conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetUser.id } } },
        ],
      },
    });

    let isNew = false;
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          participants: {
            create: [
              { userId: currentUserId },
              { userId: targetUser.id },
            ],
          },
        },
      });
      isNew = true;
    }

    const convPayload = {
      id: conversation.id,
      updatedAt: conversation.updatedAt,
      otherUser: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
        avatarUrl: targetUser.avatarUrl,
      },
    };

    return res.status(isNew ? 201 : 200).json({
      conversationId: conversation.id,
      conversation: convPayload,
      isNew,
    });
  } catch (error) {
    logger.error('Start conversation error:', error);
    return res.status(500).json({ error: 'Failed to start conversation' });
  }
};

router.post('/start', authenticate, startConversationHandler);
router.post('/conversations', authenticate, startConversationHandler);

// GET /api/messages/conversations/:id - Get conversation messages
router.get('/conversations/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not authorized to view this conversation' });
    }

    // Update lastReadAt
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, read: false },
      data: { read: true },
    });

    const [conversation, rawMessages] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } },
            },
          },
        },
      }),
      prisma.message.findMany({
        where: { conversationId },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
    ]);

    const otherUser = conversation?.participants.find(p => p.userId !== userId)?.user;
    const messages = rawMessages.map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: m.content,
      createdAt: m.createdAt,
      isRead: m.read,
      sender: m.sender,
    }));

    return res.json({
      conversationId,
      otherUser,
      messages,
    });
  } catch (error) {
    logger.error('Get messages error:', error);
    return res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Mark conversation as read
router.post('/conversations/:id/read', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    await prisma.conversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });

    await prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, read: false },
      data: { read: true },
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error('Mark read error:', error);
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// Send message (supports POST /conversations/:id and POST /send)
const sendMessageHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id || req.body.conversationId;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID required' });
    }

    const content = req.body.content;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Message content required' });
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not authorized to post in this conversation' });
    }

    const otherParticipant = participant.conversation.participants.find(p => p.userId !== userId);
    if (otherParticipant) {
      const blocked = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: otherParticipant.userId },
            { blockerId: otherParticipant.userId, blockedId: userId },
          ],
        },
      });
      if (blocked) {
        return res.status(403).json({ error: 'Cannot send message due to block settings' });
      }
    }

    const rawMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: content.trim(),
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    if (otherParticipant) {
      await prisma.notification.create({
        data: {
          recipientId: otherParticipant.userId,
          senderId: userId,
          type: 'message',
        },
      });
    }

    const message = {
      id: rawMessage.id,
      conversationId: rawMessage.conversationId,
      senderId: rawMessage.senderId,
      content: rawMessage.content,
      createdAt: rawMessage.createdAt,
      isRead: rawMessage.read,
      sender: rawMessage.sender,
    };

    return res.status(201).json({ message });
  } catch (error) {
    logger.error('Send message error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

router.post('/conversations/:id', authenticate, sendMessageHandler);
router.post('/send', authenticate, sendMessageHandler);

export default router;
