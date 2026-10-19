import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate } from '../middleware/auth';
import { createCollectionSchema, updateCollectionSchema } from '../validators/schemas';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/collections - Get user's collections
router.get('/', authenticate, async (req, res) => {
  try {
    const collections = await prisma.collection.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        coverUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { posts: true } },
        posts: {
          take: 1,
          orderBy: { addedAt: 'desc' },
          select: {
            post: { select: { imageUrl: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return res.json({ collections });
  } catch (error) {
    logger.error('Get collections error:', error);
    return res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// GET /api/collections/:id - Get single collection
router.get('/:id', authenticate, async (req, res) => {
  try {
    const collection = await prisma.collection.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        coverUrl: true,
        createdAt: true,
        userId: true,
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        _count: { select: { posts: true } },
      },
    });

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    if (!collection.isPublic && collection.userId !== req.user!.id) {
      return res.status(403).json({ error: 'Not authorized to view this collection' });
    }

    // Get posts in collection
    const page = parseInt(req.query.page as string) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const collectionPosts = await prisma.collectionPost.findMany({
      where: { collectionId: req.params.id },
      select: {
        addedAt: true,
        post: {
          select: {
            id: true,
            title: true,
            imageUrl: true,
            imageWidth: true,
            imageHeight: true,
            category: true,
            author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
            _count: { select: { likes: true } },
          },
        },
      },
      orderBy: { addedAt: 'desc' },
      skip,
      take: limit,
    });

    return res.json({
      collection,
      posts: collectionPosts.map(cp => ({ ...cp.post, addedAt: cp.addedAt })),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

// POST /api/collections - Create collection
router.post('/', authenticate, async (req, res) => {
  try {
    const result = createCollectionSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    const collection = await prisma.collection.create({
      data: {
        ...result.data,
        userId: req.user!.id,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPublic: true,
        createdAt: true,
        _count: { select: { posts: true } },
      },
    });

    return res.status(201).json({ collection });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to create collection' });
  }
});

// PUT /api/collections/:id - Update collection
router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Collection not found' });
    if (existing.userId !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });

    const result = updateCollectionSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: 'Validation failed', details: result.error.flatten().fieldErrors });
    }

    const collection = await prisma.collection.update({
      where: { id: req.params.id },
      data: result.data,
      select: { id: true, name: true, description: true, isPublic: true, updatedAt: true },
    });

    return res.json({ collection });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update collection' });
  }
});

// DELETE /api/collections/:id - Delete collection
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const existing = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Collection not found' });
    if (existing.userId !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });

    await prisma.collection.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Collection deleted' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete collection' });
  }
});

// POST /api/collections/:id/posts/:postId - Add post to collection
router.post('/:id/posts/:postId', authenticate, async (req, res) => {
  try {
    const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.userId !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });

    const post = await prisma.post.findUnique({ where: { id: req.params.postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await prisma.collectionPost.upsert({
      where: {
        collectionId_postId: { collectionId: req.params.id, postId: req.params.postId },
      },
      create: { collectionId: req.params.id, postId: req.params.postId },
      update: {},
    });

    return res.json({ message: 'Post added to collection' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to add post to collection' });
  }
});

// DELETE /api/collections/:id/posts/:postId - Remove post from collection
router.delete('/:id/posts/:postId', authenticate, async (req, res) => {
  try {
    const collection = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (collection.userId !== req.user!.id) return res.status(403).json({ error: 'Not authorized' });

    await prisma.collectionPost.delete({
      where: {
        collectionId_postId: { collectionId: req.params.id, postId: req.params.postId },
      },
    });

    return res.json({ message: 'Post removed from collection' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to remove post' });
  }
});

export default router;
