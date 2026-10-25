import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import {
  createGroupSchema,
  updateGroupSchema,
  sendMessageSchema,
  forwardMessageSchema,
  editMessageSchema,
  messageReactionSchema,
} from '../validators/schemas';
import { logger } from '../utils/logger';
import {
  isUserConnected,
  notifyMessageDelivered,
  notifyMessagesRead,
  notifyNewMessage,
  notifyTyping,
} from '../services/websocket';

const router = Router();

// In-memory ephemeral typing state: convId -> { userId -> expiryTimestamp }
const typingMap = new Map<string, Map<string, { username: string; displayName: string; expiresAt: number }>>();

// Helper to count unread messages
const getUnreadCountHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userConvs = await prisma.conversationParticipant.findMany({
      where: { userId, status: 'ACCEPTED' },
      select: { conversationId: true, lastReadAt: true, isMarkedUnread: true, isMuted: true },
    });

    let totalUnread = 0;
    for (const cp of userConvs) {
      if (cp.isMarkedUnread) {
        totalUnread += 1;
        continue;
      }
      const count = await prisma.message.count({
        where: {
          conversationId: cp.conversationId,
          senderId: { not: userId },
          createdAt: { gt: cp.lastReadAt },
          isDeleted: false,
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

// GET /api/messages/conversations - List conversations (1-on-1 and Groups)
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
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatarUrl: true,
                    lastSeenAt: true,
                  },
                },
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                content: true,
                createdAt: true,
                senderId: true,
                read: true,
                status: true,
                isDeleted: true,
                isForwarded: true,
                attachments: {
                  take: 1,
                  select: { id: true, fileName: true, fileType: true },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { isPinned: 'desc' },
        { conversation: { updatedAt: 'desc' } },
      ],
    });

    // Auto-mark incoming messages as DELIVERED upon loading conversations (HTTP & WS delivery sync)
    const convIds = memberships.map(m => m.conversationId);
    if (convIds.length > 0) {
      await prisma.message.updateMany({
        where: {
          conversationId: { in: convIds },
          senderId: { not: userId },
          status: 'SENT',
        },
        data: { status: 'DELIVERED' },
      }).catch(() => {});
    }

    // Check online privacy for other participants
    const conversations = await Promise.all(
      memberships.map(async m => {
        const conv = m.conversation;
        const otherParticipants = conv.participants.filter(p => p.userId !== userId);
        const lastMsg = conv.messages[0] || null;

        // Calculate unread count
        let unreadCount = 0;
        if (m.isMarkedUnread) {
          unreadCount = 1;
        } else {
          unreadCount = await prisma.message.count({
            where: {
              conversationId: conv.id,
              senderId: { not: userId },
              createdAt: { gt: m.lastReadAt },
              isDeleted: false,
            },
          });
        }

        // Active typing in this conversation
        const activeTyping: string[] = [];
        const now = Date.now();
        const convTyping = typingMap.get(conv.id);
        if (convTyping) {
          for (const [tUserId, tInfo] of convTyping.entries()) {
            if (tUserId !== userId && tInfo.expiresAt > now) {
              activeTyping.push(tInfo.displayName || tInfo.username);
            }
          }
        }

        let displayName = conv.title || '';
        let avatarUrl = conv.avatarUrl || null;
        let otherUser = null;

        if (!conv.isGroup && otherParticipants.length > 0) {
          otherUser = otherParticipants[0].user;
          displayName = otherUser.displayName;
          avatarUrl = otherUser.avatarUrl;
        }

        return {
          id: conv.id,
          isGroup: conv.isGroup,
          title: conv.title,
          displayName,
          avatarUrl,
          creatorId: conv.creatorId,
          disallowForwarding: conv.disallowForwarding,
          isProtected: conv.isProtected,
          updatedAt: conv.updatedAt,
          myRole: m.role,
          isPinned: m.isPinned,
          isMuted: m.isMuted,
          isArchived: m.isArchived,
          isMarkedUnread: m.isMarkedUnread,
          participantStatus: m.status,
          lastReadAt: m.lastReadAt,
          otherUser,
          participantCount: conv.participants.length,
          participants: conv.participants.map(p => ({
            id: p.user.id,
            username: p.user.username,
            displayName: p.user.displayName,
            avatarUrl: p.user.avatarUrl,
            role: p.role,
            status: p.status,
          })),
          lastMessage: lastMsg
            ? {
                id: lastMsg.id,
                content: lastMsg.isDeleted ? '[Message deleted]' : lastMsg.content,
                createdAt: lastMsg.createdAt,
                senderId: lastMsg.senderId,
                isRead: lastMsg.read,
                status: lastMsg.status,
                hasAttachment: (lastMsg.attachments && lastMsg.attachments.length > 0),
              }
            : null,
          unreadCount,
          activeTyping,
        };
      })
    );

    return res.json({ conversations });
  } catch (error) {
    logger.error('List conversations error:', error);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// Start or find existing direct 1-to-1 conversation
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
      return res.status(403).json({ error: 'Cannot message this user due to privacy or block settings' });
    }

    // Check target user's messaging privacy setting
    const targetSettings = await prisma.userSettings.findUnique({
      where: { userId: targetUser.id },
    });

    let targetParticipantStatus = 'ACCEPTED';
    if (targetSettings) {
      if (targetSettings.whoCanMessage === 'NOBODY') {
        return res.status(403).json({ error: 'This user has disabled incoming direct messages in their privacy settings.' });
      }

      if (targetSettings.whoCanMessage === 'FOLLOWERS') {
        const isFollower = await prisma.follow.findUnique({
          where: {
            followerId_followingId: { followerId: currentUserId, followingId: targetUser.id },
          },
        });
        if (!isFollower) {
          // Put message in "Message Requests" queue
          targetParticipantStatus = 'PENDING_REQUEST';
        }
      }
    }

    // Check for existing 1-on-1 conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [
          { participants: { some: { userId: currentUserId } } },
          { participants: { some: { userId: targetUser.id } } },
        ],
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    let isNew = false;
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          isGroup: false,
          creatorId: currentUserId,
          participants: {
            create: [
              { userId: currentUserId, role: 'ADMIN', status: 'ACCEPTED' },
              { userId: targetUser.id, role: 'MEMBER', status: targetParticipantStatus },
            ],
          },
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            },
          },
        },
      });
      isNew = true;
    }

    const convPayload = {
      id: conversation.id,
      isGroup: false,
      updatedAt: conversation.updatedAt,
      otherUser: {
        id: targetUser.id,
        username: targetUser.username,
        displayName: targetUser.displayName,
        avatarUrl: targetUser.avatarUrl,
      },
      isMessageRequest: targetParticipantStatus === 'PENDING_REQUEST',
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

// POST /api/messages/groups - Create a group conversation
router.post('/groups', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }

    const { title, participantIds, avatarUrl, disallowForwarding } = parsed.data;

    // Filter valid participant IDs, exclude creator
    const targetIds = Array.from(new Set(participantIds.filter(id => id !== userId)));
    if (targetIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one other user for the group.' });
    }

    // Verify blocking and whoCanAddToGroups privacy rules for each member
    const validMembers: { userId: string; status: string }[] = [];

    for (const memberId of targetIds) {
      const blockExists = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: userId, blockedId: memberId },
            { blockerId: memberId, blockedId: userId },
          ],
        },
      });
      if (blockExists) continue;

      const memberSettings = await prisma.userSettings.findUnique({
        where: { userId: memberId },
      });

      if (memberSettings?.whoCanAddToGroups === 'NOBODY') {
        continue; // User prohibits group additions
      }

      let status = 'ACCEPTED';
      if (memberSettings?.whoCanAddToGroups === 'FOLLOWERS') {
        const isFollower = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: userId, followingId: memberId } },
        });
        if (!isFollower) {
          status = 'PENDING_REQUEST'; // Invitation requires user approval
        }
      }

      validMembers.push({ userId: memberId, status });
    }

    if (validMembers.length === 0) {
      return res.status(403).json({ error: 'Selected users cannot be added due to their privacy or block settings.' });
    }

    const conversation = await prisma.conversation.create({
      data: {
        isGroup: true,
        title: title.trim(),
        avatarUrl: avatarUrl || null,
        creatorId: userId,
        disallowForwarding: disallowForwarding ?? false,
        participants: {
          create: [
            { userId, role: 'ADMIN', status: 'ACCEPTED' },
            ...validMembers.map(m => ({ userId: m.userId, role: 'MEMBER', status: m.status })),
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    // Create system notification message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: userId,
        content: `Created group "${title.trim()}"`,
        status: 'DELIVERED',
      },
    });

    return res.status(201).json({
      conversationId: conversation.id,
      conversation: {
        id: conversation.id,
        isGroup: true,
        title: conversation.title,
        avatarUrl: conversation.avatarUrl,
        participants: conversation.participants,
      },
    });
  } catch (error) {
    logger.error('Create group error:', error);
    return res.status(500).json({ error: 'Failed to create group' });
  }
});

// PUT /api/messages/groups/:id - Update group details
router.put('/groups/:id', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    const parsed = updateGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant || participant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can update group settings.' });
    }

    const updated = await prisma.conversation.update({
      where: { id: conversationId },
      data: parsed.data,
    });

    return res.json({ group: updated });
  } catch (error) {
    logger.error('Update group error:', error);
    return res.status(500).json({ error: 'Failed to update group' });
  }
});

// POST /api/messages/groups/:id/members - Add members to group
router.post('/groups/:id/members', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'User IDs array required' });
    }

    const currentParticipant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!currentParticipant || currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only group admins can add members.' });
    }

    for (const newUserId of userIds) {
      // Check privacy
      const settings = await prisma.userSettings.findUnique({ where: { userId: newUserId } });
      if (settings?.whoCanAddToGroups === 'NOBODY') continue;

      let status = 'ACCEPTED';
      if (settings?.whoCanAddToGroups === 'FOLLOWERS') {
        const isFollower = await prisma.follow.findUnique({
          where: { followerId_followingId: { followerId: userId, followingId: newUserId } },
        });
        if (!isFollower) status = 'PENDING_REQUEST';
      }

      await prisma.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId, userId: newUserId } },
        create: { conversationId, userId: newUserId, role: 'MEMBER', status },
        update: { status },
      });
    }

    return res.json({ message: 'Members added successfully' });
  } catch (error) {
    logger.error('Add members error:', error);
    return res.status(500).json({ error: 'Failed to add members' });
  }
});

// DELETE /api/messages/groups/:id/members/:targetUserId - Remove member or leave group
router.delete('/groups/:id/members/:targetUserId', authenticate, async (req, res) => {
  try {
    const currentUserId = req.user!.id;
    const conversationId = req.params.id;
    const targetUserId = req.params.targetUserId;

    const currentParticipant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
    });

    if (!currentParticipant) {
      return res.status(403).json({ error: 'You are not in this group.' });
    }

    // A user can remove themselves (leave group) OR an admin can remove another user
    if (targetUserId !== currentUserId && currentParticipant.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admins can remove other members.' });
    }

    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
    });

    return res.json({ message: targetUserId === currentUserId ? 'Left group successfully' : 'Member removed' });
  } catch (error) {
    logger.error('Remove member error:', error);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});

// POST /api/messages/conversations/:id/accept - Accept message request or group invitation
router.post('/conversations/:id/accept', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { status: 'ACCEPTED' },
    });

    return res.json({ success: true, message: 'Conversation request accepted' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to accept conversation' });
  }
});

// POST /api/messages/conversations/:id/decline - Decline message request
router.post('/conversations/:id/decline', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });

    return res.json({ success: true, message: 'Conversation request declined' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to decline conversation' });
  }
});

// GET /api/messages/conversations/:id - Get conversation messages with reactions & attachments
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

    // Get user's read receipt setting
    const userSettings = await prisma.userSettings.findUnique({ where: { userId } });
    const sendReadReceipts = userSettings ? userSettings.showReadReceipts : true;

    // Update lastReadAt
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date(), isMarkedUnread: false },
    });

    // Mark messages as read if read receipts are enabled
    if (sendReadReceipts) {
      await prisma.message.updateMany({
        where: { conversationId, senderId: { not: userId }, read: false },
        data: { read: true, status: 'READ' },
      });
    }

    const [conversation, rawMessages] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatarUrl: true,
                  bio: true,
                  lastSeenAt: true,
                },
              },
            },
          },
        },
      }),
      prisma.message.findMany({
        where: {
          conversationId,
          NOT: {
            deletedForUserIds: { has: userId },
          },
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          replyTo: {
            select: {
              id: true,
              content: true,
              senderId: true,
              sender: { select: { displayName: true, username: true } },
            },
          },
          reactions: {
            include: {
              user: { select: { id: true, username: true, displayName: true } },
            },
          },
          attachments: true,
        },
        orderBy: { createdAt: 'asc' },
        take: 100,
      }),
    ]);

    const otherUser = !conversation?.isGroup
      ? conversation?.participants.find(p => p.userId !== userId)?.user
      : null;

    const messages = rawMessages.map(m => ({
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      content: m.isDeleted ? '[This message was deleted]' : m.content,
      createdAt: m.createdAt,
      isRead: m.read,
      status: m.status,
      isEdited: m.isEdited,
      editedAt: m.editedAt,
      isDeleted: m.isDeleted,
      isForwarded: m.isForwarded,
      sender: m.sender,
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            content: m.replyTo.content,
            senderDisplayName: m.replyTo.sender.displayName,
            senderUsername: m.replyTo.sender.username,
          }
        : null,
      reactions: m.reactions.map(r => ({
        id: r.id,
        emoji: r.emoji,
        userId: r.userId,
        username: r.user.username,
        displayName: r.user.displayName,
      })),
      attachments: m.attachments.map(a => ({
        id: a.id,
        fileName: a.fileName,
        fileUrl: a.fileUrl,
        fileType: a.fileType,
        fileSize: a.fileSize,
        batchId: a.batchId,
        batchName: a.batchName,
      })),
    }));

    return res.json({
      conversationId,
      conversation: {
        id: conversation?.id,
        isGroup: conversation?.isGroup,
        title: conversation?.title,
        avatarUrl: conversation?.avatarUrl,
        creatorId: conversation?.creatorId,
        disallowForwarding: conversation?.disallowForwarding,
        isProtected: conversation?.isProtected,
        participants: conversation?.participants,
      },
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
      data: { lastReadAt: new Date(), isMarkedUnread: false },
    });

    const userSettings = await prisma.userSettings.findUnique({ where: { userId } });
    const readAt = new Date();
    if (userSettings?.showReadReceipts !== false) {
      await prisma.message.updateMany({
        where: { conversationId, senderId: { not: userId }, read: false },
        data: { read: true, status: 'READ' },
      });

      // Notify all other participants via WebSocket
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      const participantIds = participants.map(p => p.userId);
      notifyMessagesRead(conversationId, userId, readAt, participantIds);
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error('Mark read error:', error);
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
});


// Mark conversation as delivered
router.post('/conversations/:id/delivered', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;

    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        status: 'SENT',
      },
      data: { status: 'DELIVERED' },
    });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark as delivered' });
  }
});

// Send message (supports text, reply-to, and multiple attachments)
const sendMessageHandler = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id || req.body.conversationId;

    if (!conversationId) {
      return res.status(400).json({ error: 'Conversation ID required' });
    }

    const { content, replyToId, attachments } = req.body;
    const hasContent = typeof content === 'string' && content.trim().length > 0;
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    if (!hasContent && !hasAttachments) {
      return res.status(400).json({ error: 'Message must include text content or at least one attachment.' });
    }

    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, lastSeenAt: true },
                },
              },
            },
          },
        },
      },
    });

    if (!participant) {
      return res.status(403).json({ error: 'Not authorized to post in this conversation' });
    }

    // Check block settings for 1-on-1 conversations
    if (!participant.conversation.isGroup) {
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
    }

    // Create the message
    const rawMessage = await prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: (content || '').trim(),
        replyToId: replyToId || null,
        status: 'SENT',
        attachments: hasAttachments
          ? {
              create: attachments.map((att: any) => ({
                fileId: att.fileId || null,
                fileName: att.fileName,
                fileUrl: att.fileUrl,
                fileType: att.fileType,
                fileSize: att.fileSize,
                batchId: att.batchId || null,
                batchName: att.batchName || null,
              })),
            }
          : undefined,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { displayName: true, username: true } },
          },
        },
        attachments: true,
      },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Build message payload for real-time push
    const message = {
      id: rawMessage.id,
      conversationId: rawMessage.conversationId,
      senderId: rawMessage.senderId,
      content: rawMessage.content,
      createdAt: rawMessage.createdAt,
      isRead: rawMessage.read,
      status: rawMessage.status,
      isForwarded: rawMessage.isForwarded,
      sender: rawMessage.sender,
      replyTo: rawMessage.replyTo
        ? {
            id: rawMessage.replyTo.id,
            content: rawMessage.replyTo.content,
            senderDisplayName: rawMessage.replyTo.sender.displayName,
            senderUsername: rawMessage.replyTo.sender.username,
          }
        : null,
      attachments: rawMessage.attachments,
      reactions: [],
    };

    // Notify recipients and auto-upgrade SENT → DELIVERED for online recipients
    const otherParticipants = participant.conversation.participants.filter(p => p.userId !== userId);
    let effectiveStatus = rawMessage.status;

    for (const other of otherParticipants) {
      // Push new message to recipient regardless
      notifyNewMessage([other.userId], message);

      // If recipient is connected via WebSocket OR active within 45s via HTTP, mark delivered immediately
      let recipientOnline = false;
      try {
        recipientOnline = isUserConnected(other.userId);
      } catch {}

      if (!recipientOnline && other.user?.lastSeenAt) {
        const lastSeenMs = Date.now() - new Date(other.user.lastSeenAt).getTime();
        if (lastSeenMs < 45 * 1000) {
          recipientOnline = true;
        }
      }

      if (recipientOnline && effectiveStatus === 'SENT') {
        try {
          await prisma.message.update({
            where: { id: rawMessage.id },
            data: { status: 'DELIVERED' },
          });
          effectiveStatus = 'DELIVERED';
          try {
            notifyMessageDelivered(rawMessage.id, conversationId, userId);
          } catch {}
        } catch {
          // non-critical — leave as SENT
        }
      }

      // Send push notification for non-muted participants
      if (!other.isMuted) {
        prisma.notification.create({
          data: {
            recipientId: other.userId,
            senderId: userId,
            type: 'message',
            data: JSON.stringify({ conversationId, isGroup: participant.conversation.isGroup }),
          },
        }).catch(err => logger.debug('Message notification error:', err));
      }
    }

    // Notify sender of delivery status
    if (effectiveStatus === 'DELIVERED') {
      notifyMessageDelivered(rawMessage.id, conversationId, userId);
    }

    return res.status(201).json({ message: { ...message, status: effectiveStatus } });
  } catch (error) {
    logger.error('Send message error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

router.post('/conversations/:id', authenticate, sendMessageHandler);
router.post('/send', authenticate, sendMessageHandler);

// POST /api/messages/forward - Forward a message to another conversation
router.post('/forward', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const parsed = forwardMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }

    const { messageId, targetConversationId } = parsed.data;

    // Fetch original message and source conversation
    const originalMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
        sender: {
          include: { settings: true },
        },
        attachments: true,
      },
    });

    if (!originalMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check requester is member of source conversation
    const isSourceMember = originalMessage.conversation.participants.some(p => p.userId === userId);
    if (!isSourceMember) {
      return res.status(403).json({ error: 'Not authorized to access the source message' });
    }

    // Privacy rule check: is forwarding disallowed on this conversation or by original sender?
    if (originalMessage.conversation.disallowForwarding) {
      return res.status(403).json({ error: 'Forwarding is restricted for this conversation.' });
    }

    if (originalMessage.sender.settings?.allowForwarding === false) {
      return res.status(403).json({ error: 'The sender has restricted message forwarding in their privacy settings.' });
    }

    // Check requester is member of target conversation
    const targetParticipant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: targetConversationId, userId } },
    });

    if (!targetParticipant) {
      return res.status(403).json({ error: 'You are not a member of the target conversation.' });
    }

    // Create the forwarded message
    const forwardedMessage = await prisma.message.create({
      data: {
        conversationId: targetConversationId,
        senderId: userId,
        content: originalMessage.content,
        isForwarded: true,
        forwardedFromId: originalMessage.id,
        status: 'SENT',
        attachments: originalMessage.attachments.length > 0
          ? {
              create: originalMessage.attachments.map(att => ({
                fileId: att.fileId,
                fileName: att.fileName,
                fileUrl: att.fileUrl,
                fileType: att.fileType,
                fileSize: att.fileSize,
                batchId: att.batchId,
                batchName: att.batchName,
              })),
            }
          : undefined,
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        attachments: true,
      },
    });

    await prisma.conversation.update({
      where: { id: targetConversationId },
      data: { updatedAt: new Date() },
    });

    return res.status(201).json({
      message: forwardedMessage,
      success: true,
    });
  } catch (error) {
    logger.error('Forward message error:', error);
    return res.status(500).json({ error: 'Failed to forward message' });
  }
});

// PUT /api/messages/:messageId - Edit a message
router.put('/:messageId', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const messageId = req.params.messageId;

    const parsed = editMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors });
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    if (message.senderId !== userId) {
      return res.status(403).json({ error: 'You can only edit your own messages.' });
    }

    if (message.isDeleted) {
      return res.status(400).json({ error: 'Cannot edit a deleted message.' });
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: {
        content: parsed.data.content.trim(),
        isEdited: true,
        editedAt: new Date(),
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    return res.json({ message: updated });
  } catch (error) {
    logger.error('Edit message error:', error);
    return res.status(500).json({ error: 'Failed to edit message' });
  }
});

// DELETE /api/messages/:messageId - Delete a message (forMe or forEveryone)
router.delete('/:messageId', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const messageId = req.params.messageId;
    const mode = (req.body?.mode || req.query?.mode || 'forEveryone') as string;

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: { participants: true },
        },
      },
    });

    if (!message) return res.status(404).json({ error: 'Message not found' });

    const isParticipant = message.conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) {
      return res.status(403).json({ error: 'You are not a member of this conversation.' });
    }

    if (mode === 'forMe') {
      // Delete for user only
      if (!message.deletedForUserIds.includes(userId)) {
        await prisma.message.update({
          where: { id: messageId },
          data: {
            deletedForUserIds: {
              push: userId,
            },
          },
        });
      }
      return res.json({ success: true, messageId, mode: 'forMe' });
    }

    // Delete for everyone
    const isSender = message.senderId === userId;
    const isAdmin = message.conversation.participants.some(
      p => p.userId === userId && p.role === 'ADMIN'
    );

    if (!isSender && !isAdmin) {
      return res.status(403).json({ error: 'Only the sender or a group admin can delete a message for everyone.' });
    }

    // Soft delete message for everyone
    await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: '[This message was deleted]',
      },
    });

    return res.json({ success: true, messageId, mode: 'forEveryone' });
  } catch (error) {
    logger.error('Delete message error:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
});

// POST /api/messages/:messageId/reactions - Add or toggle emoji reaction
router.post('/:messageId/reactions', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const messageId = req.params.messageId;

    const parsed = messageReactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid emoji required' });
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { conversation: { include: { participants: true } } },
    });

    if (!message) return res.status(404).json({ error: 'Message not found' });

    const isParticipant = message.conversation.participants.some(p => p.userId === userId);
    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    // Check if reaction already exists
    const existing = await prisma.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId,
          userId,
          emoji: parsed.data.emoji,
        },
      },
    });

    if (existing) {
      // Toggle off
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      return res.json({ action: 'removed', emoji: parsed.data.emoji });
    } else {
      // Add reaction
      const reaction = await prisma.messageReaction.create({
        data: {
          messageId,
          userId,
          emoji: parsed.data.emoji,
        },
        include: {
          user: { select: { id: true, username: true, displayName: true } },
        },
      });
      return res.status(201).json({ action: 'added', reaction });
    }
  } catch (error) {
    logger.error('Reaction error:', error);
    return res.status(500).json({ error: 'Failed to update reaction' });
  }
});

// PATCH /api/messages/conversations/:id/preferences - Pin, mute, archive, mark unread
router.patch('/conversations/:id/preferences', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;
    const { isPinned, isMuted, isArchived, isMarkedUnread } = req.body;

    const updated = await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: {
        ...(isPinned !== undefined && { isPinned: Boolean(isPinned) }),
        ...(isMuted !== undefined && { isMuted: Boolean(isMuted) }),
        ...(isArchived !== undefined && { isArchived: Boolean(isArchived) }),
        ...(isMarkedUnread !== undefined && { isMarkedUnread: Boolean(isMarkedUnread) }),
      },
    });

    return res.json({ preferences: updated });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update conversation preferences' });
  }
});

// POST /api/messages/conversations/:id/typing - Broadcast typing state
router.post('/conversations/:id/typing', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const conversationId = req.params.id;
    const isTyping = req.body.isTyping !== false; // default true

    if (!typingMap.has(conversationId)) {
      typingMap.set(conversationId, new Map());
    }

    const convTyping = typingMap.get(conversationId)!;
    if (isTyping) {
      convTyping.set(userId, {
        username: req.user!.username,
        displayName: req.user!.displayName,
        expiresAt: Date.now() + 4000, // 4-second typing activity expiry
      });
    } else {
      convTyping.delete(userId);
    }

    // Push typing event via WebSocket to all other participants
    try {
      const participants = await prisma.conversationParticipant.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      const participantIds = participants.map(p => p.userId);
      notifyTyping(
        conversationId,
        userId,
        req.user!.displayName || req.user!.username,
        isTyping,
        participantIds,
      );
    } catch {
      // non-critical — typing push best-effort
    }

    return res.json({ status: 'ok' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to set typing status' });
  }
});


// GET /api/messages/conversations/:id/typing - Get active typing users
router.get('/conversations/:id/typing', authenticate, (req, res) => {
  const userId = req.user!.id;
  const conversationId = req.params.id;
  const convTyping = typingMap.get(conversationId);
  const now = Date.now();

  const activeTypers: string[] = [];
  if (convTyping) {
    for (const [tUserId, info] of convTyping.entries()) {
      if (tUserId !== userId && info.expiresAt > now) {
        activeTypers.push(info.displayName || info.username);
      }
    }
  }

  return res.json({ typingUsers: activeTypers });
});

// GET /api/messages/search - Search conversations & messages
router.get('/search', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    if (!query) {
      return res.json({ conversations: [], messages: [] });
    }

    const [matchingConversations, matchingMessages] = await Promise.all([
      // Matching conversations by title or participants
      prisma.conversation.findMany({
        where: {
          participants: { some: { userId } },
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            {
              participants: {
                some: {
                  user: {
                    OR: [
                      { username: { contains: query, mode: 'insensitive' } },
                      { displayName: { contains: query, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          ],
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            },
          },
        },
        take: 10,
      }),
      // Matching messages in conversations the user belongs to
      prisma.message.findMany({
        where: {
          conversation: {
            participants: { some: { userId } },
          },
          content: { contains: query, mode: 'insensitive' },
          isDeleted: false,
        },
        include: {
          sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
          conversation: { select: { id: true, title: true, isGroup: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return res.json({
      conversations: matchingConversations,
      messages: matchingMessages,
    });
  } catch (error) {
    logger.error('Message search error:', error);
    return res.status(500).json({ error: 'Failed to search messages' });
  }
});

export default router;
