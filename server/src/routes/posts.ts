import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { createPostSchema, updatePostSchema, paginationSchema, createCommentSchema } from '../validators/schemas';
import { logger } from '../utils/logger';

const router = Router();

const POST_SELECT = {
  id: true,
  title: true,
  description: true,
  postType: true,
  imageUrl: true,
  videoUrl: true,
  imageWidth: true,
  imageHeight: true,
  category: true,
  destUrl: true,
  communityId: true,
  published: true,
  createdAt: true,
  updatedAt: true,
  community: {
    select: { id: true, name: true, slug: true },
  },
  author: {
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
    },
  },
  tags: {
    select: {
      tag: { select: { id: true, name: true } },
    },
  },
  _count: {
    select: { likes: true, savedBy: true, comments: true },
  },
};

// GET /api/posts - Get feed posts with filters
router.get('/', optionalAuthenticate, async (req, res) => {
  try {
    const parsed = paginationSchema.safeParse(req.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = Math.min(parsed.success ? parsed.data.limit : 20, 50);
    const skip = (page - 1) * limit;
    const { category, type } = req.query;

    let blockedUserIds: string[] = [];
    if (req.user) {
      const blocks = await prisma.block.findMany({
        where: {
          OR: [
            { blockerId: req.user.id },
            { blockedId: req.user.id },
          ],
        },
      });
      blockedUserIds = blocks.map(b => b.blockerId === req.user!.id ? b.blockedId : b.blockerId);
    }

    const where: any = {
      published: true,
      ...(category && typeof category === 'string' && category !== 'All' ? { category } : {}),
      ...(type && typeof type === 'string' && type !== 'All' ? { postType: type.toUpperCase() } : {}),
      ...(blockedUserIds.length > 0 ? { authorId: { notIn: blockedUserIds } } : {}),
    };

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: POST_SELECT,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    // Attach user like/save status
    let likedIds: Set<string> = new Set();
    let savedIds: Set<string> = new Set();

    if (req.user) {
      const [likes, saves] = await Promise.all([
        prisma.like.findMany({
          where: { userId: req.user.id, postId: { in: posts.map(p => p.id) } },
          select: { postId: true },
        }),
        prisma.savedPost.findMany({
          where: { userId: req.user.id, postId: { in: posts.map(p => p.id) } },
          select: { postId: true },
        }),
      ]);
      likedIds = new Set(likes.map(l => l.postId));
      savedIds = new Set(saves.map(s => s.postId));
    }

    const enriched = posts.map(post => ({
      ...post,
      tags: post.tags.map(t => t.tag),
      isLiked: likedIds.has(post.id),
      isSaved: savedIds.has(post.id),
    }));

    return res.json({
      posts: enriched,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    });
  } catch (error) {
    logger.error('Get posts error:', error);
    return res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// GET /api/posts/:id - Single post
router.get('/:id', optionalAuthenticate, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: {
        ...POST_SELECT,
        cloudinaryId: true,
      },
    });

    if (!post || !post.published) {
      return res.status(404).json({ error: 'Post not found' });
    }

    let isLiked = false;
    let isSaved = false;

    if (req.user) {
      const [like, save] = await Promise.all([
        prisma.like.findUnique({
          where: { userId_postId: { userId: req.user.id, postId: post.id } },
        }),
        prisma.savedPost.findUnique({
          where: { userId_postId: { userId: req.user.id, postId: post.id } },
        }),
      ]);
      isLiked = !!like;
      isSaved = !!save;
    }

    // Related posts by category
    const related = await prisma.post.findMany({
      where: {
        category: post.category,
        published: true,
        id: { not: post.id },
      },
      select: POST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    return res.json({
      post: {
        ...post,
        tags: post.tags.map(t => t.tag),
        isLiked,
        isSaved,
      },
      related: related.map(r => ({
        ...r,
        tags: r.tags.map(t => t.tag),
      })),
    });
  } catch (error) {
    logger.error('Get post error:', error);
    return res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// POST /api/posts - Create multi-format post (Photo, Video, Thought, Art, Community)
router.post('/', authenticate, async (req, res) => {
  try {
    const result = createPostSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    const { tags, postType, videoUrl, communityId, ...postData } = result.data;

    const post = await prisma.post.create({
      data: {
        ...postData,
        postType: postType || 'PHOTO',
        imageUrl: postData.imageUrl || '',
        videoUrl: videoUrl || null,
        destUrl: postData.destUrl || null,
        communityId: communityId || null,
        authorId: req.user!.id,
        tags: {
          create: await Promise.all(
            tags.map(async (tagName) => {
              const tag = await prisma.tag.upsert({
                where: { name: tagName.toLowerCase().trim() },
                create: { name: tagName.toLowerCase().trim() },
                update: {},
              });
              return { tagId: tag.id };
            })
          ),
        },
      },
      select: POST_SELECT,
    });

    return res.status(201).json({
      post: {
        ...post,
        tags: post.tags.map(t => t.tag),
        isLiked: false,
        isSaved: false,
      },
    });
  } catch (error) {
    logger.error('Create post error:', error);
    return res.status(500).json({ error: 'Failed to create post' });
  }
});

// PUT /api/posts/:id - Update post
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existingPost = await prisma.post.findUnique({
      where: { id: req.params.id },
    });

    if (!existingPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (existingPost.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to edit this post' });
    }

    const result = updatePostSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    const { tags, ...updateData } = result.data;

    const post = await prisma.post.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        imageUrl: updateData.imageUrl ?? undefined,
        videoUrl: updateData.videoUrl ?? undefined,
        destUrl: updateData.destUrl ?? undefined,
        ...(tags !== undefined ? {
          tags: {
            deleteMany: {},
            create: await Promise.all(
              tags.map(async (tagName) => {
                const tag = await prisma.tag.upsert({
                  where: { name: tagName.toLowerCase().trim() },
                  create: { name: tagName.toLowerCase().trim() },
                  update: {},
                });
                return { tagId: tag.id };
              })
            ),
          },
        } : {}),
      },
      select: POST_SELECT,
    });

    return res.json({
      post: {
        ...post,
        tags: post.tags.map(t => t.tag),
      },
    });
  } catch (error) {
    logger.error('Update post error:', error);
    return res.status(500).json({ error: 'Failed to update post' });
  }
});

// DELETE /api/posts/:id - Delete post
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.authorId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await prisma.post.delete({ where: { id: req.params.id } });

    return res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    logger.error('Delete post error:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

// POST /api/posts/:id/like - Toggle like
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user!.id;

    const existing = await prisma.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      await prisma.like.delete({
        where: { userId_postId: { userId, postId } },
      });
      const count = await prisma.like.count({ where: { postId } });
      return res.json({ liked: false, count });
    } else {
      await prisma.like.create({ data: { userId, postId } });
      const count = await prisma.like.count({ where: { postId } });

      // Notify post author if someone else liked
      const targetPost = await prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } });
      if (targetPost && targetPost.authorId !== userId) {
        await prisma.notification.create({
          data: {
            recipientId: targetPost.authorId,
            senderId: userId,
            postId,
            type: 'like',
          },
        });
      }

      return res.json({ liked: true, count });
    }
  } catch (error) {
    logger.error('Like error:', error);
    return res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// POST /api/posts/:id/save - Toggle save
router.post('/:id/save', authenticate, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user!.id;

    const existing = await prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      await prisma.savedPost.delete({
        where: { userId_postId: { userId, postId } },
      });
      return res.json({ saved: false });
    } else {
      await prisma.savedPost.create({ data: { userId, postId } });
      return res.json({ saved: true });
    }
  } catch (error) {
    logger.error('Save error:', error);
    return res.status(500).json({ error: 'Failed to toggle save' });
  }
});

// GET /api/posts/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { postId: req.params.id },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ comments });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/posts/:id/comments
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const result = createCommentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Invalid comment', details: result.error.flatten().fieldErrors });
    }

    const post = await prisma.post.findUnique({ where: { id: req.params.id } });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = await prisma.comment.create({
      data: {
        content: result.data.content.trim(),
        postId: req.params.id,
        userId: req.user!.id,
      },
      select: {
        id: true,
        content: true,
        createdAt: true,
        user: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Notify author if another user commented
    if (post.authorId !== req.user!.id) {
      await prisma.notification.create({
        data: {
          recipientId: post.authorId,
          senderId: req.user!.id,
          postId: post.id,
          type: 'comment',
        },
      });
    }

    return res.status(201).json({ comment });
  } catch (error) {
    logger.error('Create comment error:', error);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
});

export default router;
