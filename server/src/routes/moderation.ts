import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { createReportSchema } from '../validators/schemas';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/moderation/block/:userId - Block a user
router.post('/block/:userId', authenticate, async (req, res) => {
  try {
    const blockerId = req.user!.id;
    const blockedId = req.params.userId;

    if (blockerId === blockedId) {
      return res.status(400).json({ error: 'Cannot block yourself' });
    }

    const target = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    await prisma.block.upsert({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
      create: { blockerId, blockedId },
      update: {},
    });

    // Also remove any follow relationship
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followingId: blockedId },
          { followerId: blockedId, followingId: blockerId },
        ],
      },
    });

    return res.json({ blocked: true, message: `Blocked @${target.username}` });
  } catch (error) {
    logger.error('Block user error:', error);
    return res.status(500).json({ error: 'Failed to block user' });
  }
});

// DELETE /api/moderation/block/:userId - Unblock a user
router.delete('/block/:userId', authenticate, async (req, res) => {
  try {
    const blockerId = req.user!.id;
    const blockedId = req.params.userId;

    await prisma.block.deleteMany({
      where: { blockerId, blockedId },
    });

    return res.json({ blocked: false, message: 'User unblocked' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// GET /api/moderation/blocked - List blocked users
router.get('/blocked', authenticate, async (req, res) => {
  try {
    const blocks = await prisma.block.findMany({
      where: { blockerId: req.user!.id },
      include: {
        blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    return res.json({
      blockedUsers: blocks.map(b => b.blocked),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
});

// POST /api/moderation/report - Submit safety / content report
router.post('/report', authenticate, async (req, res) => {
  try {
    let { targetType, targetId, reason, targetUserId, targetPostId, targetCommunityId, details } = req.body;

    if (!targetType) {
      if (targetUserId) {
        targetType = 'USER';
        targetId = targetUserId;
      } else if (targetPostId) {
        targetType = 'POST';
        targetId = targetPostId;
      } else if (targetCommunityId) {
        targetType = 'COMMUNITY';
        targetId = targetCommunityId;
      }
    }

    const effectiveReason = (reason || details || 'Inappropriate content').toString().trim();

    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'targetType and targetId (or targetUserId/targetPostId/targetCommunityId) are required' });
    }

    const report = await prisma.report.create({
      data: {
        reporterId: req.user!.id,
        targetType: targetType.toString().toUpperCase(),
        targetId: targetId.toString(),
        reason: effectiveReason,
      },
    });

    logger.info(`Report filed by ${req.user!.id} for ${targetType} ${targetId}`);

    return res.status(201).json({
      message: 'Report received. Our moderation team will review this content.',
      reportId: report.id,
      report: { id: report.id },
    });
  } catch (error) {
    logger.error('Report error:', error);
    return res.status(500).json({ error: 'Failed to submit report' });
  }
});

export default router;
