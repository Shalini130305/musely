import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { updateProfileSchema } from '../validators/schemas';
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
  createdAt: true,
  _count: {
    select: { posts: true, followers: true, following: true },
  },
};


// GET /api/users/:username
router.get('/:username', optionalAuthenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: USER_SELECT,
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let isFollowing = false;
    if (req.user && req.user.id !== user.id) {
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

    return res.json({ user: { ...user, isFollowing } });
  } catch (error) {
    logger.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/users/:username/posts
router.get('/:username/posts', optionalAuthenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const skip = (page - 1) * limit;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where: { authorId: user.id, published: true },
        select: {
          id: true,
          title: true,
          imageUrl: true,
          imageWidth: true,
          imageHeight: true,
          category: true,
          createdAt: true,
          author: {
            select: { id: true, username: true, displayName: true, avatarUrl: true },
          },
          _count: { select: { likes: true, savedBy: true } },
          tags: { select: { tag: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.post.count({ where: { authorId: user.id, published: true } }),
    ]);

    return res.json({
      posts: posts.map(p => ({ ...p, tags: p.tags.map(t => t.tag) })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + limit < total },
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

    // Only owner can see saved posts
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
              createdAt: true,
              author: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
              _count: { select: { likes: true, savedBy: true } },
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
      posts: saved.map(s => ({ ...s.post, tags: s.post.tags.map(t => t.tag), savedAt: s.createdAt })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit), hasMore: skip + limit < total },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch saved posts' });
  }
});

// PUT /api/users/profile - Update own profile
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

// POST /api/users/:username/follow - Toggle follow
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

    const existing = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user!.id,
          followingId: targetUser.id,
        },
      },
    });

    if (existing) {
      await prisma.follow.delete({
        where: {
          followerId_followingId: {
            followerId: req.user!.id,
            followingId: targetUser.id,
          },
        },
      });
      const count = await prisma.follow.count({ where: { followingId: targetUser.id } });
      return res.json({ following: false, count });
    } else {
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

      const count = await prisma.follow.count({ where: { followingId: targetUser.id } });
      return res.json({ following: true, count });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to toggle follow' });
  }
});

// DELETE /api/users/account - Delete account
router.delete('/account/delete', authenticate, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.user!.id } });
    res.clearCookie('token');
    return res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error:', error);
    return res.status(500).json({ error: 'Failed to delete account' });
  }
});

export default router;
