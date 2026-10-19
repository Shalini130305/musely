import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/search?q=...&category=...&sort=...
router.get('/', async (req, res) => {
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

    const where: any = {
      published: true,
      ...(category && typeof category === 'string' ? { category } : {}),
    };

    if (searchQuery) {
      where.OR = [
        { title: { contains: searchQuery } },
        { description: { contains: searchQuery } },
        { category: { contains: searchQuery } },
        { author: { displayName: { contains: searchQuery } } },
        { author: { username: { contains: searchQuery } } },
        { tags: { some: { tag: { name: { contains: searchQuery } } } } },
      ];
    }

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
        orderBy,
        skip,
        take: limitNum,
      }),
      prisma.post.count({ where }),
    ]);

    // Search users by name/username if no category filter
    let users: any[] = [];
    if (searchQuery && !category) {
      users = await prisma.user.findMany({
        where: {
          OR: [
            { username: { contains: searchQuery } },
            { displayName: { contains: searchQuery } },
          ],
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          bio: true,
          _count: { select: { posts: true, followers: true } },
        },
        take: 5,
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
