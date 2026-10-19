import { Router } from 'express';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { createCommunitySchema, createMessageSchema } from '../validators/schemas';
import slugify from 'slugify';
import { logger } from '../utils/logger';

const router = Router();

// GET /api/communities - Explore communities
router.get('/', optionalAuthenticate, async (req, res) => {
  try {
    const { category, q } = req.query;

    const where: any = {
      isPublic: true,
      ...(category && category !== 'All' ? { category: String(category) } : {}),
    };

    if (q) {
      where.OR = [
        { name: { contains: String(q) } },
        { description: { contains: String(q) } },
      ];
    }

    const communities = await prisma.community.findMany({
      where,
      include: {
        _count: {
          select: { members: true, posts: true },
        },
        owner: {
          select: { id: true, username: true, displayName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });

    let userJoinedIds = new Set<string>();
    if (req.user) {
      const memberships = await prisma.communityMember.findMany({
        where: { userId: req.user.id },
        select: { communityId: true },
      });
      userJoinedIds = new Set(memberships.map(m => m.communityId));
    }

    return res.json({
      communities: communities.map(c => ({
        ...c,
        isMember: userJoinedIds.has(c.id),
      })),
    });
  } catch (error) {
    logger.error('List communities error:', error);
    return res.status(500).json({ error: 'Failed to fetch communities' });
  }
});

// GET /api/communities/user - Communities joined by current user
router.get('/user', authenticate, async (req, res) => {
  try {
    const memberships = await prisma.communityMember.findMany({
      where: { userId: req.user!.id },
      include: {
        community: {
          include: {
            _count: { select: { members: true, posts: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });

    return res.json({
      communities: memberships.map(m => ({
        ...m.community,
        role: m.role,
        isMember: true,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch user communities' });
  }
});

// POST /api/communities - Create new community
router.post('/', authenticate, async (req, res) => {
  try {
    const parsed = createCommunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
    }

    const { name, description, category, imageUrl, isPublic } = parsed.data;
    const baseSlug = slugify(name, { lower: true, strict: true }) || 'community';
    let slug = baseSlug;
    let counter = 1;

    while (await prisma.community.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const community = await prisma.community.create({
      data: {
        name,
        slug,
        description: description || null,
        category,
        imageUrl: imageUrl || null,
        isPublic,
        ownerId: req.user!.id,
        members: {
          create: {
            userId: req.user!.id,
            role: 'ADMIN',
          },
        },
      },
      include: {
        _count: { select: { members: true, posts: true } },
      },
    });

    return res.status(201).json({ community });
  } catch (error) {
    logger.error('Create community error:', error);
    return res.status(500).json({ error: 'Failed to create community' });
  }
});

// GET /api/communities/:slug - Get single community details
router.get('/:slug', optionalAuthenticate, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({
      where: { slug: req.params.slug },
      include: {
        owner: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        _count: { select: { members: true, posts: true, messages: true } },
      },
    });

    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    let isMember = false;
    let memberRole: string | null = null;

    if (req.user) {
      const member = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: { communityId: community.id, userId: req.user.id },
        },
      });
      if (member) {
        isMember = true;
        memberRole = member.role;
      }
    }

    return res.json({
      community: {
        ...community,
        isMember,
        memberRole,
      },
    });
  } catch (error) {
    logger.error('Get community error:', error);
    return res.status(500).json({ error: 'Failed to fetch community' });
  }
});

// POST /api/communities/:slug/join - Join community
router.post('/:slug/join', authenticate, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({ where: { slug: req.params.slug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    await prisma.communityMember.upsert({
      where: {
        communityId_userId: { communityId: community.id, userId: req.user!.id },
      },
      create: {
        communityId: community.id,
        userId: req.user!.id,
        role: 'MEMBER',
      },
      update: {},
    });

    const count = await prisma.communityMember.count({ where: { communityId: community.id } });
    return res.json({ joined: true, memberCount: count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to join community' });
  }
});

// POST /api/communities/:slug/leave - Leave community
router.post('/:slug/leave', authenticate, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({ where: { slug: req.params.slug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    if (community.ownerId === req.user!.id) {
      return res.status(400).json({ error: 'Owner cannot leave their own community' });
    }

    await prisma.communityMember.deleteMany({
      where: { communityId: community.id, userId: req.user!.id },
    });

    const count = await prisma.communityMember.count({ where: { communityId: community.id } });
    return res.json({ joined: false, memberCount: count });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to leave community' });
  }
});

// GET /api/communities/:slug/posts - Get community discussions/posts
router.get('/:slug/posts', optionalAuthenticate, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({ where: { slug: req.params.slug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const posts = await prisma.post.findMany({
      where: { communityId: community.id, published: true },
      include: {
        author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        tags: { select: { tag: { select: { id: true, name: true } } } },
        _count: { select: { likes: true, comments: true, savedBy: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return res.json({
      posts: posts.map(p => ({ ...p, tags: p.tags.map(t => t.tag) })),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch community posts' });
  }
});

// GET /api/communities/:slug/chat - Group text chat messages
router.get('/:slug/chat', authenticate, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({ where: { slug: req.params.slug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Verify membership
    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: req.user!.id } },
    });

    if (!member && !community.isPublic) {
      return res.status(403).json({ error: 'Must be a member to access private community chat' });
    }

    const messages = await prisma.communityMessage.findMany({
      where: { communityId: community.id },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return res.json({ messages });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch community chat' });
  }
});

// POST /api/communities/:slug/chat - Send group text message
router.post('/:slug/chat', authenticate, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({ where: { slug: req.params.slug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Must be a member to send group chat messages
    const member = await prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: req.user!.id } },
    });

    if (!member) {
      return res.status(403).json({ error: 'Join the community to participate in discussions' });
    }

    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Message content cannot be empty' });
    }

    const message = await prisma.communityMessage.create({
      data: {
        communityId: community.id,
        senderId: req.user!.id,
        content: parsed.data.content.trim(),
      },
      include: {
        sender: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    return res.status(201).json({ message });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send group message' });
  }
});

// GET /api/communities/:slug/members - List members
router.get('/:slug/members', optionalAuthenticate, async (req, res) => {
  try {
    const community = await prisma.community.findUnique({ where: { slug: req.params.slug } });
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const members = await prisma.communityMember.findMany({
      where: { communityId: community.id },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true, bio: true } },
      },
      orderBy: { joinedAt: 'asc' },
      take: 100,
    });

    return res.json({
      members: members.map(m => ({
        ...m.user,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch members' });
  }
});

export default router;
