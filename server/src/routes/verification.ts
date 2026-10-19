/**
 * MUSELY Verification Routes
 *
 * Allows users to submit verification requests.
 * Admins can approve or reject them.
 *
 * The verified badge (✓) is granted only when an admin manually approves.
 * Users cannot self-grant verification.
 */

import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// POST /api/verify/request — Submit a verification request
router.post('/request', authenticate, async (req, res) => {
  try {
    const { reason, links } = req.body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 20) {
      return res.status(400).json({
        error: 'Please provide a detailed reason (at least 20 characters).',
      });
    }

    // Check for existing pending/approved request
    const existing = await (prisma as any).verificationRequest.findUnique({
      where: { userId: req.user!.id },
    });

    if (existing) {
      if (existing.status === 'APPROVED') {
        return res.status(400).json({ error: 'Your account is already verified.' });
      }
      if (existing.status === 'PENDING') {
        return res.status(400).json({
          error: 'You already have a pending verification request. Please wait for admin review.',
        });
      }
      // Rejected — allow re-submission by deleting old record
      await (prisma as any).verificationRequest.delete({ where: { userId: req.user!.id } });
    }

    const linksJson = Array.isArray(links) ? JSON.stringify(links) : null;

    const request = await (prisma as any).verificationRequest.create({
      data: {
        userId: req.user!.id,
        reason: reason.trim(),
        links: linksJson,
      },
    });

    logger.info(`Verification request submitted by: ${req.user!.id}`);
    return res.status(201).json({
      message: 'Verification request submitted. Admin review typically takes 3-7 business days.',
      requestId: request.id,
    });
  } catch (error) {
    logger.error('Verification request error:', error);
    return res.status(500).json({ error: 'Failed to submit verification request' });
  }
});

// GET /api/verify/status — Check own verification status
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { isVerified: true, verifiedAt: true },
    });

    const request = await (prisma as any).verificationRequest.findUnique({
      where: { userId: req.user!.id },
      select: { status: true, adminNote: true, createdAt: true },
    });

    return res.json({
      isVerified: user?.isVerified || false,
      verifiedAt: user?.verifiedAt || null,
      request: request || null,
    });
  } catch (error) {
    logger.error('Verification status error:', error);
    return res.status(500).json({ error: 'Failed to fetch verification status' });
  }
});

// --- ADMIN ONLY ROUTES ---

function requireAdmin(req: any, res: any, next: any) {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

// GET /api/verify/admin/requests — List pending verification requests (admin)
router.get('/admin/requests', authenticate, requireAdmin, async (req, res) => {
  try {
    const status = (req.query.status as string) || 'PENDING';

    const requests = await (prisma as any).verificationRequest.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
    });

    // Attach user info
    const userIds = requests.map((r: any) => r.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true, isVerified: true, createdAt: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    return res.json({
      requests: requests.map((r: any) => ({
        ...r,
        links: r.links ? JSON.parse(r.links) : [],
        user: userMap[r.userId] || null,
      })),
    });
  } catch (error) {
    logger.error('Admin list verification error:', error);
    return res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// PATCH /api/verify/admin/:userId — Approve or reject (admin)
router.patch('/admin/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { action, adminNote } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: "Action must be 'approve' or 'reject'" });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const approved = action === 'approve';

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          isVerified: approved,
          verifiedAt: approved ? new Date() : null,
          verificationNote: adminNote || null,
        },
      }),
      (prisma as any).verificationRequest.upsert({
        where: { userId },
        create: {
          userId,
          reason: 'Admin-initiated',
          status: approved ? 'APPROVED' : 'REJECTED',
          adminNote: adminNote || null,
          reviewedAt: new Date(),
        },
        update: {
          status: approved ? 'APPROVED' : 'REJECTED',
          adminNote: adminNote || null,
          reviewedAt: new Date(),
        },
      }),
    ]);

    logger.info(`Verification ${action}d for user ${userId} by admin ${req.user!.id}`);
    return res.json({
      message: `User ${approved ? 'verified' : 'unverified'} successfully`,
      userId,
      isVerified: approved,
    });
  } catch (error) {
    logger.error('Admin verify error:', error);
    return res.status(500).json({ error: 'Failed to update verification' });
  }
});

// DELETE /api/verify/admin/:userId — Revoke verification (admin)
router.delete('/admin/:userId', authenticate, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: false, verifiedAt: null, verificationNote: reason || 'Revoked by admin' },
    });

    logger.info(`Verification revoked for user ${userId} by admin ${req.user!.id}`);
    return res.json({ message: 'Verification revoked successfully' });
  } catch (error) {
    logger.error('Revoke verification error:', error);
    return res.status(500).json({ error: 'Failed to revoke verification' });
  }
});

export default router;
