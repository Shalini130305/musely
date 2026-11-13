import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { createPostSchema, updatePostSchema, paginationSchema, createCommentSchema } from '../validators/schemas';
import { logger } from '../utils/logger';
import { createNotification } from '../services/notification';

const router = Router();

export const POST_SELECT = {
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
  audience: true,
  fileUrl: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  docType: true,
  caption: true,
  location: true,
  musicTrackId: true,
  musicTrack: {
    select: {
      id: true,
      title: true,
      artist: true,
      album: true,
      coverUrl: true,
      audioUrl: true,
      duration: true,
      isLicensed: true,
      licenseSource: true,
    },
  },
  audioUrl: true,
  audioDuration: true,
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
      isPrivate: true,
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

// Helper to check if a user is allowed to access a post based on post-level and account-level privacy
export async function canViewPost(userId: string | undefined, post: any): Promise<{ allowed: boolean; reason?: string }> {
  // If not published, only author can view
  if (!post.published) {
    if (userId && userId === post.authorId) return { allowed: true };
    return { allowed: false, reason: 'Post not found or unpublished' };
  }

  // Author can always view their own post
  if (userId && userId === post.authorId) {
    return { allowed: true };
  }

  // "ONLY_ME" audience is strictly author-only
  if (post.audience === 'ONLY_ME') {
    return { allowed: false, reason: 'This post is private to the author' };
  }

  // Check if viewer follows the author
  let isFollowing = false;
  if (userId) {
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: post.authorId,
        },
      },
    });
    isFollowing = !!follow;
  }

  // If author's account is private, viewer MUST be an approved follower
  if (post.author?.isPrivate && !isFollowing) {
    return {
      allowed: false,
      reason: 'This post is from a private account. Follow this user to see their posts.',
    };
  }

  // If post audience is "FOLLOWERS", viewer must be an approved follower
  if (post.audience === 'FOLLOWERS' && !isFollowing) {
    return {
      allowed: false,
      reason: 'This post is only visible to followers.',
    };
  }

  return { allowed: true };
}

// GET /api/posts - Get feed posts with filters & strict privacy enforcement
router.get('/', optionalAuthenticate, async (req, res) => {
  try {
    const parsed = paginationSchema.safeParse(req.query);
    const page = parsed.success ? parsed.data.page : 1;
    const limit = Math.min(parsed.success ? parsed.data.limit : 20, 50);
    const skip = (page - 1) * limit;
    const { category, type, sort } = req.query;

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

    // Base conditions
    const andConditions: any[] = [{ published: true }];

    if (category && typeof category === 'string' && category !== 'All') {
      andConditions.push({ category });
    }

    if (type && typeof type === 'string' && type !== 'All') {
      andConditions.push({ postType: type.toUpperCase() });
    }

    if (blockedUserIds.length > 0) {
      andConditions.push({ authorId: { notIn: blockedUserIds } });
    }

    // Privacy & Audience Rules
    if (!req.user) {
      // Guests only see PUBLIC posts from PUBLIC accounts
      andConditions.push({
        audience: 'PUBLIC',
        author: { isPrivate: false },
      });
    } else {
      // Authenticated users can see:
      // 1. Their own posts (regardless of audience)
      // 2. Posts from users they follow (PUBLIC or FOLLOWERS)
      // 3. PUBLIC posts from PUBLIC accounts
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

    const where = { AND: andConditions };

    let orderBy: any = { createdAt: 'desc' };
    if (sort === 'popular') {
      orderBy = [
        { likes: { _count: 'desc' } },
        { comments: { _count: 'desc' } },
        { createdAt: 'desc' },
      ];
    } else if (sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    }

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        select: POST_SELECT,
        orderBy,
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

// GET /api/posts/:id - Single post with access authorization
router.get('/:id', optionalAuthenticate, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      select: {
        ...POST_SELECT,
        authorId: true,
        cloudinaryId: true,
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isPrivate: true,
            settings: {
              select: {
                allowComments: true,
                allowLikes: true,
              },
            },
          },
        },
      },
    });

    if (!post || !post.published) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check authorization
    const authCheck = await canViewPost(req.user?.id, post);
    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason || 'Access denied' });
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

    // Track post view in analytics asynchronously
    if (post.authorId !== req.user?.id) {
      prisma.analyticsEvent.create({
        data: {
          eventType: 'POST_VIEW',
          userId: req.user?.id || null,
          targetUserId: post.authorId,
          postId: post.id,
        },
      }).catch(err => logger.debug('Analytics track error:', err));
    }

    // Related posts by category (respecting privacy)
    let relatedWhere: any = {
      category: post.category,
      published: true,
      id: { not: post.id },
    };

    if (!req.user) {
      relatedWhere.audience = 'PUBLIC';
      relatedWhere.author = { isPrivate: false };
    } else {
      const follows = await prisma.follow.findMany({
        where: { followerId: req.user.id },
        select: { followingId: true },
      });
      const followIds = follows.map(f => f.followingId);

      relatedWhere.OR = [
        { authorId: req.user.id },
        { authorId: { in: followIds }, audience: { in: ['PUBLIC', 'FOLLOWERS'] } },
        { author: { isPrivate: false }, audience: 'PUBLIC' },
      ];
    }

    const related = await prisma.post.findMany({
      where: relatedWhere,
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

// GET /api/posts/:id/download - Direct media download endpoint for post
router.get('/:id/download', optionalAuthenticate, (req, res) => {
  const queryStr = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  return res.redirect(307, `/api/upload/download/${req.params.id}${queryStr}`);
});

// ---------------------------------------------------------------------------
// Share resolution & link previews
// ---------------------------------------------------------------------------

// Public preview endpoints are read-only and safe to cache, but rate limited
// so they cannot be used to brute-force post IDs.
const sharePreviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many preview requests. Please slow down.' },
});

function resolvePublicAppUrl(): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  return 'https://musely-in.vercel.app';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function resolveShareablePost(postId: string, viewerId?: string): Promise<{ post: any; allowed: boolean; reason?: string }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      description: true,
      caption: true,
      imageUrl: true,
      postType: true,
      published: true,
      audience: true,
      authorId: true,
      author: {
        select: { username: true, displayName: true, avatarUrl: true, isPrivate: true },
      },
    },
  });

  if (!post || !post.published) {
    return { post: null, allowed: false, reason: 'This post is unavailable.' };
  }

  const access = await canViewPost(viewerId, post);
  if (!access.allowed) {
    return { post: null, allowed: false, reason: access.reason || 'This post is private or restricted.' };
  }

  return { post, allowed: true };
}

// GET /api/posts/:id/share - Safe post metadata for share sheets and previews
router.get('/:id/share', sharePreviewLimiter, optionalAuthenticate, async (req, res) => {
  try {
    const result = await resolveShareablePost(req.params.id, req.user?.id);
    if (!result.allowed || !result.post) {
      const status = result.reason === 'This post is unavailable.' ? 404 : 403;
      return res.status(status).json({ error: result.reason, restricted: true });
    }

    const post = result.post;
    const appUrl = resolvePublicAppUrl();

    return res.json({
      post: {
        id: post.id,
        title: post.title,
        description: post.caption || post.description || '',
        imageUrl: post.imageUrl,
        postType: post.postType,
        author: post.author,
        url: `${appUrl}/post/${post.id}`,
      },
    });
  } catch (error) {
    logger.error('Share preview error:', error);
    return res.status(500).json({ error: 'Failed to resolve shared post' });
  }
});

// GET /api/posts/:id/og - Open Graph / Twitter-card HTML for chat link previews.
// Crawlers read the meta tags; browsers are forwarded to the SPA post page.
router.get('/:id/og', sharePreviewLimiter, optionalAuthenticate, async (req, res) => {
  try {
    const result = await resolveShareablePost(req.params.id, req.user?.id);
    const appUrl = resolvePublicAppUrl();
    const canonical = `${appUrl}/post/${encodeURIComponent(req.params.id)}`;
    const fallbackImage = `${appUrl}/og-image.png`;

    let title = 'Post unavailable on MUSELY';
    let description = 'This post is unavailable. It may have been deleted or made private.';
    let image = fallbackImage;

    if (result.allowed && result.post) {
      const author = result.post.author.displayName || result.post.author.username;
      title = `${result.post.title} — @${result.post.author.username} on MUSELY`;
      description = (result.post.caption || result.post.description || `Shared by ${author} on MUSELY.`).slice(0, 200);
      image = result.post.imageUrl || fallbackImage;
      if (image.startsWith('/')) image = `${appUrl}${image}`;
    } else if (result.reason !== 'This post is unavailable.') {
      title = 'Restricted post on MUSELY';
      description = 'This post is private or restricted. Sign in to MUSELY to request access.';
    }

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
<meta property="og:site_name" content="MUSELY" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:alt" content="${escapeHtml(title)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@musely_in" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body>
<p>Opening this post on MUSELY…</p>
<p><a href="${escapeHtml(canonical)}">Open post on MUSELY</a></p>
<script>window.location.replace(${JSON.stringify(canonical)});</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', result.allowed ? 'public, max-age=300' : 'no-store');
    return res.send(html);
  } catch (error) {
    logger.error('OG preview error:', error);
    return res.status(500).send('Failed to render preview');
  }
});

// POST /api/posts - Create multi-format post (Photo, Document, Video, Thought, Art, Community)
router.post('/', authenticate, async (req, res) => {
  try {
    const result = createPostSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    const {
      tags,
      postType,
      videoUrl,
      communityId,
      audience,
      fileUrl,
      fileName,
      fileType,
      fileSize,
      docType,
      caption,
      location,
      musicTrackId,
      audioUrl,
      audioDuration,
      ...postData
    } = result.data;

    const post = await prisma.post.create({
      data: {
        ...postData,
        postType: postType || 'PHOTO',
        imageUrl: postData.imageUrl || '',
        videoUrl: videoUrl || null,
        destUrl: postData.destUrl || null,
        communityId: communityId || null,
        audience: audience || 'PUBLIC',
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
        fileSize: fileSize || null,
        docType: docType || (fileUrl ? 'DOC' : null),
        caption: caption || null,
        location: location ? location.trim() : null,
        musicTrackId: musicTrackId || null,
        audioUrl: audioUrl || null,
        audioDuration: audioDuration || null,
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

    const {
      tags,
      audience,
      fileUrl,
      fileName,
      fileType,
      fileSize,
      docType,
      caption,
      ...updateData
    } = result.data;

    const post = await prisma.post.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        imageUrl: updateData.imageUrl ?? undefined,
        videoUrl: updateData.videoUrl ?? undefined,
        destUrl: updateData.destUrl ?? undefined,
        ...(audience !== undefined ? { audience } : {}),
        ...(fileUrl !== undefined ? { fileUrl } : {}),
        ...(fileName !== undefined ? { fileName } : {}),
        ...(fileType !== undefined ? { fileType } : {}),
        ...(fileSize !== undefined ? { fileSize } : {}),
        ...(docType !== undefined ? { docType } : {}),
        ...(caption !== undefined ? { caption } : {}),
        ...(updateData.location !== undefined ? { location: updateData.location ? updateData.location.trim() : null } : {}),
        ...(result.data.musicTrackId !== undefined ? { musicTrackId: result.data.musicTrackId } : {}),
        ...(result.data.audioUrl !== undefined ? { audioUrl: result.data.audioUrl } : {}),
        ...(result.data.audioDuration !== undefined ? { audioDuration: result.data.audioDuration } : {}),
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

    if (post.authorId !== req.user!.id && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await prisma.post.delete({ where: { id: req.params.id } });

    return res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    logger.error('Delete post error:', error);
    return res.status(500).json({ error: 'Failed to delete post' });
  }
});

// POST /api/posts/:id/like - Toggle like with permission & settings check
router.post('/:id/like', authenticate, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user!.id;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          include: { settings: true },
        },
      },
    });

    if (!post || !post.published) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if viewer has access to the post
    const authCheck = await canViewPost(userId, post);
    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason || 'Access denied' });
    }

    // Check if author disabled likes
    if (post.author.settings && post.author.settings.allowLikes === false) {
      return res.status(403).json({ error: 'Likes are disabled on this post by the creator.' });
    }

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

      // Track like in analytics
      prisma.analyticsEvent.create({
        data: {
          eventType: 'LIKE',
          userId,
          targetUserId: post.authorId,
          postId,
        },
      }).catch(err => logger.debug('Analytics error:', err));

      // Notify post author if someone else liked
      if (post.authorId !== userId) {
        createNotification({
          recipientId: post.authorId,
          senderId: userId,
          postId,
          type: 'like',
        }).catch(err => logger.debug('Like notification error:', err));
      }

      return res.json({ liked: true, count });
    }
  } catch (error) {
    logger.error('Like error:', error);
    return res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// GET /api/posts/:id/likes - List users who liked this post
router.get('/:id/likes', optionalAuthenticate, async (req, res) => {
  try {
    const postId = req.params.id;
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        audience: true,
        authorId: true,
        author: { select: { isPrivate: true } },
      },
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const likes = await prisma.like.findMany({
      where: { postId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            isVerified: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return res.json({
      count: likes.length,
      users: likes.map(l => l.user),
    });
  } catch (error) {
    logger.error('Fetch post likes error:', error);
    return res.status(500).json({ error: 'Failed to fetch likes' });
  }
});

// POST /api/posts/:id/save - Toggle save with permission check
router.post('/:id/save', authenticate, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user!.id;

    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: { author: true },
    });

    if (!post || !post.published) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const authCheck = await canViewPost(userId, post);
    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason || 'Access denied' });
    }

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

      // Track save in analytics
      prisma.analyticsEvent.create({
        data: {
          eventType: 'SAVE',
          userId,
          targetUserId: post.authorId,
          postId,
        },
      }).catch(err => logger.debug('Analytics error:', err));

      return res.json({ saved: true });
    }
  } catch (error) {
    logger.error('Save error:', error);
    return res.status(500).json({ error: 'Failed to toggle save' });
  }
});

// GET /api/posts/:id/comments - Comments with post privacy check
router.get('/:id/comments', optionalAuthenticate, async (req, res) => {
  try {
    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: { author: true },
    });

    if (!post || !post.published) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const authCheck = await canViewPost(req.user?.id, post);
    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason || 'Access denied' });
    }

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

// POST /api/posts/:id/comments - Create comment with permission & setting check
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const result = createCommentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid comment',
        details: result.error.flatten().fieldErrors,
      });
    }

    const post = await prisma.post.findUnique({
      where: { id: req.params.id },
      include: {
        author: {
          include: { settings: true },
        },
      },
    });

    if (!post || !post.published) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const authCheck = await canViewPost(req.user!.id, post);
    if (!authCheck.allowed) {
      return res.status(403).json({ error: authCheck.reason || 'Access denied' });
    }

    // Check author setting: allowComments
    if (post.author.settings && post.author.settings.allowComments === false) {
      return res.status(403).json({ error: 'Comments have been disabled for this post.' });
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

    // Track comment in analytics
    prisma.analyticsEvent.create({
      data: {
        eventType: 'COMMENT',
        userId: req.user!.id,
        targetUserId: post.authorId,
        postId: post.id,
      },
    }).catch(err => logger.debug('Analytics error:', err));

    // Notify author if another user commented
    if (post.authorId !== req.user!.id) {
      createNotification({
        recipientId: post.authorId,
        senderId: req.user!.id,
        postId: post.id,
        type: 'comment',
        data: {
          commentSnippet: comment.content.slice(0, 80),
        },
      }).catch(err => logger.debug('Comment notification error:', err));
    }

    // Process mentions in comment
    if (comment.content && comment.content.includes('@')) {
      const mentionMatches = comment.content.match(/@([a-zA-Z0-9_]+)/g);
      if (mentionMatches && mentionMatches.length > 0) {
        const usernames = Array.from(new Set(mentionMatches.map(m => m.slice(1))));
        prisma.user.findMany({
          where: { username: { in: usernames, mode: 'insensitive' } },
          select: { id: true, username: true },
        }).then(users => {
          for (const u of users) {
            if (u.id !== req.user!.id && u.id !== post.authorId) {
              createNotification({
                recipientId: u.id,
                senderId: req.user!.id,
                postId: post.id,
                type: 'mention',
                data: {
                  preview: comment.content.slice(0, 80),
                },
              }).catch(() => {});
            }
          }
        }).catch(() => {});
      }
    }

    return res.status(201).json({ comment });
  } catch (error) {
    logger.error('Create comment error:', error);
    return res.status(500).json({ error: 'Failed to create comment' });
  }
});

// PUT /api/posts/:postId/comments/:commentId - Edit comment (own comment only)
router.put('/:postId/comments/:commentId', authenticate, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty' });
    }

    if (content.trim().length > 1000) {
      return res.status(400).json({ error: 'Comment must be under 1000 characters' });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.postId !== postId) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    if (comment.userId !== req.user!.id && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'You can only edit your own comments' });
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content: content.trim() },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });

    return res.json({ comment: updated });
  } catch (error) {
    logger.error('Edit comment error:', error);
    return res.status(500).json({ error: 'Failed to edit comment' });
  }
});

// DELETE /api/posts/:postId/comments/:commentId - Delete comment (own comment, post author, or admin)
router.delete('/:postId/comments/:commentId', authenticate, async (req, res) => {
  try {
    const { postId, commentId } = req.params;

    const [comment, post] = await Promise.all([
      prisma.comment.findUnique({ where: { id: commentId } }),
      prisma.post.findUnique({ where: { id: postId }, select: { authorId: true } }),
    ]);

    if (!comment || comment.postId !== postId) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const isCommentAuthor = comment.userId === req.user!.id;
    const isPostAuthor = post?.authorId === req.user!.id;
    const isAdmin = req.user!.isAdmin;

    if (!isCommentAuthor && !isPostAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await prisma.comment.delete({ where: { id: commentId } });
    const remainingCount = await prisma.comment.count({ where: { postId } });

    return res.json({
      message: 'Comment deleted successfully',
      commentId,
      count: remainingCount,
    });
  } catch (error) {
    logger.error('Delete comment error:', error);
    return res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;
