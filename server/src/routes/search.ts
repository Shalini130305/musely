import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { optionalAuthenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/search?q=...&category=...&sort=...
router.get('/', optionalAuthenticate, async (req, res) => {
  try {
    const { q, category, sort = 'recent', page = '1', limit = '20' } = req.query;
    const searchQuery = typeof q === 'string' ? q.trim() : '';
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, parseInt(limit as string) || 20);
    const skip = (pageNum - 1) * limitNum;

    if (!searchQuery && !category) {
      return res.json({
        posts: [],
        users: [],
        pagination: { page: pageNum, limit: limitNum, total: 0, pages: 0 },
      });
    }

    let blockedUserIds: string[] = [];
    let followingIds: string[] = [];

    if (req.user) {
      const [blocks, follows] = await Promise.all([
        prisma.block.findMany({
          where: {
            OR: [
              { blockerId: req.user.id },
              { blockedId: req.user.id },
            ],
          },
        }),
        prisma.follow.findMany({
          where: { followerId: req.user.id },
          select: { followingId: true },
        }),
      ]);

      blockedUserIds = blocks.map(b => (b.blockerId === req.user!.id ? b.blockedId : b.blockerId));
      followingIds = follows.map(f => f.followingId);
    }

    const andConditions: any[] = [{ published: true }];

    if (category && typeof category === 'string' && category !== 'All') {
      andConditions.push({ category });
    }

    if (blockedUserIds.length > 0) {
      andConditions.push({ authorId: { notIn: blockedUserIds } });
    }

    // Privacy constraints: do not leak private posts or private accounts into public search
    if (!req.user) {
      andConditions.push({
        audience: 'PUBLIC',
        author: { isPrivate: false },
      });
    } else {
      andConditions.push({
        OR: [
          { authorId: req.user.id },
          {
            authorId: { in: followingIds },
            audience: { in: ['PUBLIC', 'FOLLOWERS'] },
          },
          {
            author: { isPrivate: false },
            audience: 'PUBLIC',
          },
        ],
      });
    }

    if (searchQuery) {
      andConditions.push({
        OR: [
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { description: { contains: searchQuery, mode: 'insensitive' } },
          { category: { contains: searchQuery, mode: 'insensitive' } },
          { author: { displayName: { contains: searchQuery, mode: 'insensitive' } } },
          { author: { username: { contains: searchQuery, mode: 'insensitive' } } },
          { tags: { some: { tag: { name: { contains: searchQuery, mode: 'insensitive' } } } } },
        ],
      });
    }

    const where = { AND: andConditions };

    const orderBy =
      sort === 'popular'
        ? [{ likes: { _count: 'desc' as const } }, { createdAt: 'desc' as const }]
        : [{ createdAt: 'desc' as const }];

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
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
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.post.count({ where }),
    ]);

    // Search users by name/username if no category filter, respecting discoverability settings
    let users: any[] = [];
    if (searchQuery && !category) {
      const userWhere: any = {
        AND: [
          {
            OR: [
              { username: { contains: searchQuery, mode: 'insensitive' } },
              { displayName: { contains: searchQuery, mode: 'insensitive' } },
            ],
          },
          {
            // Do not show users who disabled search discoverability or profile visibility
            OR: [
              { settings: null },
              {
                settings: {
                  searchDiscoverable: true,
                  profileVisible: true,
                },
              },
            ],
          },
        ],
      };

      if (blockedUserIds.length > 0) {
        userWhere.AND.push({ id: { notIn: blockedUserIds } });
      }

      users = await prisma.user.findMany({
        where: userWhere,
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          isPrivate: true,
          _count: { select: { posts: true, followers: true } },
        },
        take: 8,
      });
    }

    return res.json({
      posts: posts.map(p => ({ ...p, tags: p.tags.map(t => t.tag) })),
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasMore: skip + limitNum < total,
      },
    });
  } catch (error) {
    logger.error('Search error:', error);
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
