import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { rateLimit } from 'express-rate-limit';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { prisma } from '../utils/prisma';
import { logger } from '../utils/logger';
import { canViewPost } from './posts';

const router = Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: { error: 'Upload limit reached. Please wait a bit before uploading again.' },
});

// File size limits
const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB
const MAX_DOC_SIZE = 30 * 1024 * 1024; // 30MB

// Dangerous extensions to strictly block
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.php', '.phtml', '.js', '.mjs',
  '.py', '.rb', '.pl', '.jar', '.apk', '.vbs', '.scr', '.msi', '.dll',
  '.com', '.bin', '.app', '.html', '.htm', '.xhtml', '.svg', '.jsp', '.asp',
  '.aspx', '.cgi', '.env', '.config',
]);

const ALLOWED_IMAGE_TYPES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

const ALLOWED_DOC_TYPES = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'],
  ['application/msword', 'doc'],
]);

export function isBlockedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  // Check for double extension attacks (e.g. file.pdf.exe)
  const parts = lower.split('.');
  if (parts.length > 2) {
    for (let i = 1; i < parts.length; i++) {
      if (BLOCKED_EXTENSIONS.has(`.${parts[i]}`)) return true;
    }
  }
  const ext = path.extname(lower);
  return BLOCKED_EXTENSIONS.has(ext);
}

export function sanitizeFileName(originalName: string): string {
  const base = path.basename(originalName);
  const ext = path.extname(base).toLowerCase();
  const nameWithoutExt = path.basename(base, ext)
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${nameWithoutExt || 'document'}${ext}`;
}

// Magic bytes validation
export function validateMagicBytes(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 4) return false;

  // JPEG: FF D8 FF
  if (mime === 'image/jpeg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  // PNG: 89 50 4E 47
  if (mime === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  // GIF: GIF8
  if (mime === 'image/gif') {
    return buffer.toString('ascii', 0, 4) === 'GIF8';
  }
  // WEBP: RIFF....WEBP
  if (mime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  // PDF: %PDF
  if (mime === 'application/pdf') {
    return buffer.toString('ascii', 0, 4) === '%PDF';
  }
  // DOCX / XLSX / ZIP: PK..
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  }
  // DOC (legacy binary): D0 CF 11 E0
  if (mime === 'application/msword') {
    return (
      buffer.length >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0
    );
  }

  return true;
}

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: MAX_DOC_SIZE },
  fileFilter: (_req, file, cb) => {
    if (isBlockedFile(file.originalname)) {
      return cb(new Error('Executable or dangerous file types are rejected for security.'));
    }
    const isImage = ALLOWED_IMAGE_TYPES.has(file.mimetype);
    const isDoc = ALLOWED_DOC_TYPES.has(file.mimetype);

    // Also check extension compatibility
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const isDocExt = ['pdf', 'doc', 'docx'].includes(ext);
    const isImgExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);

    if (isImage || isDoc || isDocExt || isImgExt) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported format. Allowed formats: JPG, PNG, WEBP, GIF, PDF, DOC, DOCX'));
    }
  },
});

let s3Client: S3Client | null = null;
function getS3Client(): S3Client | null {
  if (s3Client) return s3Client;
  if (
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_ENDPOINT_URL_S3
  ) {
    s3Client = new S3Client({
      endpoint: process.env.AWS_ENDPOINT_URL_S3,
      region: process.env.AWS_REGION || 'us-east-2',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

// POST /api/upload/image - Legacy & Image-specific upload
router.post('/image', authenticate, uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const file = req.file;

    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      return res.status(400).json({
        error: 'Invalid image type. Only JPEG, PNG, WebP, and GIF are allowed.',
      });
    }

    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      return res.status(400).json({ error: 'Corrupt or mismatched image file content.' });
    }

    const sanitizedName = sanitizeFileName(file.originalname);
    const ext = ALLOWED_IMAGE_TYPES.get(file.mimetype) || 'jpg';
    const s3 = getS3Client();

    if (s3 && process.env.AWS_ENDPOINT_URL_S3) {
      const key = `uploads/images/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: 'assets',
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      const publicUrl = `${process.env.AWS_ENDPOINT_URL_S3}/assets/${key}`;

      const savedFile = await prisma.uploadedFile.create({
        data: {
          userId: req.user!.id,
          key,
          url: publicUrl,
          fileName: sanitizedName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          format: ext,
          storageProvider: 'neon-object-storage',
        },
      });

      return res.json({
        imageUrl: publicUrl,
        fileUrl: publicUrl,
        id: savedFile.id,
        fileName: sanitizedName,
        storageProvider: 'neon-object-storage',
        bucket: 'assets',
        key,
        bytes: file.size,
        format: ext,
      });
    }

    // Local fallback for dev if S3 is not configured
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    return res.json({
      imageUrl: dataUrl,
      fileUrl: dataUrl,
      fileName: sanitizedName,
      bytes: file.size,
      format: ext,
      localDev: true,
    });
  } catch (error: any) {
    logger.error('Image upload error:', error);
    return res.status(400).json({ error: error.message || 'Failed to upload image' });
  }
});

// POST /api/upload/document - PDF, DOC, DOCX upload
router.post('/document', authenticate, uploadLimiter, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No document file provided' });
    }

    const file = req.file;
    const sanitizedName = sanitizeFileName(file.originalname);
    const ext = path.extname(sanitizedName).toLowerCase().replace('.', '');

    // Determine normalized mime type
    let mimeType = file.mimetype;
    if (ext === 'pdf') mimeType = 'application/pdf';
    else if (ext === 'docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'doc') mimeType = 'application/msword';

    if (!['pdf', 'docx', 'doc'].includes(ext)) {
      return res.status(400).json({ error: 'Unsupported document format. Allowed: PDF, DOC, DOCX.' });
    }

    if (!validateMagicBytes(file.buffer, mimeType)) {
      return res.status(400).json({ error: 'Corrupt or invalid document file header.' });
    }

    const s3 = getS3Client();
    if (!s3 || !process.env.AWS_ENDPOINT_URL_S3) {
      return res.status(500).json({ error: 'Object storage is not configured for document uploads.' });
    }

    const key = `uploads/docs/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${sanitizedName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: 'assets',
        Key: key,
        Body: file.buffer,
        ContentType: mimeType,
      })
    );

    const publicUrl = `${process.env.AWS_ENDPOINT_URL_S3}/assets/${key}`;

    const savedFile = await prisma.uploadedFile.create({
      data: {
        userId: req.user!.id,
        key,
        url: publicUrl,
        fileName: sanitizedName,
        mimeType,
        sizeBytes: file.size,
        format: ext.toUpperCase(),
        storageProvider: 'neon-object-storage',
      },
    });

    return res.json({
      fileUrl: publicUrl,
      id: savedFile.id,
      fileName: sanitizedName,
      fileType: mimeType,
      fileSize: file.size,
      docType: ext.toUpperCase(),
      createdAt: savedFile.createdAt,
    });
  } catch (error: any) {
    logger.error('Document upload error:', error);
    return res.status(400).json({ error: error.message || 'Failed to upload document' });
  }
});

// POST /api/upload/file - Multi-format upload handler (images & documents)
router.post('/file', authenticate, uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const file = req.file;
    const sanitizedName = sanitizeFileName(file.originalname);
    const ext = path.extname(sanitizedName).toLowerCase().replace('.', '');

    const isImage = ALLOWED_IMAGE_TYPES.has(file.mimetype) || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
    const isDoc = ALLOWED_DOC_TYPES.has(file.mimetype) || ['pdf', 'docx', 'doc'].includes(ext);

    if (!isImage && !isDoc) {
      return res.status(400).json({
        error: 'Unsupported file format. Please upload JPG, PNG, WEBP, GIF, PDF, DOC, or DOCX.',
      });
    }

    let mimeType = file.mimetype;
    let docType = 'FILE';

    if (isImage) {
      docType = 'IMAGE';
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'gif') mimeType = 'image/gif';
    } else {
      if (ext === 'pdf') {
        docType = 'PDF';
        mimeType = 'application/pdf';
      } else if (ext === 'docx') {
        docType = 'DOCX';
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      } else if (ext === 'doc') {
        docType = 'DOC';
        mimeType = 'application/msword';
      }
    }

    if (!validateMagicBytes(file.buffer, mimeType)) {
      return res.status(400).json({ error: 'File content does not match its claimed type.' });
    }

    const s3 = getS3Client();
    const folder = isImage ? 'images' : 'docs';
    const key = `uploads/${folder}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${sanitizedName}`;

    let publicUrl = '';
    if (s3 && process.env.AWS_ENDPOINT_URL_S3) {
      await s3.send(
        new PutObjectCommand({
          Bucket: 'assets',
          Key: key,
          Body: file.buffer,
          ContentType: mimeType,
        })
      );
      publicUrl = `${process.env.AWS_ENDPOINT_URL_S3}/assets/${key}`;
    } else if (isImage && file.size <= 2 * 1024 * 1024) {
      publicUrl = `data:${mimeType};base64,${file.buffer.toString('base64')}`;
    } else {
      return res.status(500).json({ error: 'Persistent storage not configured for file uploads.' });
    }

    const savedFile = await prisma.uploadedFile.create({
      data: {
        userId: req.user!.id,
        key,
        url: publicUrl,
        fileName: sanitizedName,
        mimeType,
        sizeBytes: file.size,
        format: ext.toUpperCase(),
        storageProvider: s3 ? 'neon-object-storage' : 'local-data-url',
      },
    });

    return res.json({
      fileUrl: publicUrl,
      imageUrl: isImage ? publicUrl : undefined,
      id: savedFile.id,
      fileName: sanitizedName,
      fileType: mimeType,
      fileSize: file.size,
      docType,
      format: ext.toUpperCase(),
      createdAt: savedFile.createdAt,
    });
  } catch (error: any) {
    logger.error('File upload error:', error);
    return res.status(400).json({ error: error.message || 'Failed to upload file' });
  }
});

// GET /api/upload/my-files - List user's uploaded files
router.get('/my-files', authenticate, async (req, res) => {
  try {
    const files = await prisma.uploadedFile.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return res.json({ files });
  } catch (error) {
    logger.error('Get my files error:', error);
    return res.status(500).json({ error: 'Failed to retrieve uploaded files' });
  }
});

// DELETE /api/upload/:fileId - Delete an uploaded file
router.delete('/:fileId', authenticate, async (req, res) => {
  try {
    const file = await prisma.uploadedFile.findUnique({
      where: { id: req.params.fileId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.userId !== req.user!.id && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized to delete this file' });
    }

    const s3 = getS3Client();
    if (s3 && file.key && file.storageProvider === 'neon-object-storage') {
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: 'assets',
            Key: file.key,
          })
        );
      } catch (s3Err) {
        logger.warn('Failed to delete object from S3:', s3Err);
      }
    }

    await prisma.uploadedFile.delete({
      where: { id: file.id },
    });

    return res.json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Delete file error:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
});

// GET /api/upload/download/:fileId - Download file proxy with proper headers, access authorization & streaming
router.get('/download/:fileId', optionalAuthenticate, async (req, res) => {
  try {
    const { fileId } = req.params;
    let targetUrl = '';
    let fileName = '';
    let mimeType = 'application/octet-stream';
    let sizeBytes: number | null = null;
    let s3Key: string | null = null;
    let storageProvider: string | null = null;
    let targetPost: any = null;

    // 1. Try finding file in UploadedFile
    const file = await prisma.uploadedFile.findUnique({
      where: { id: fileId },
    });

    if (file) {
      targetUrl = file.url;
      fileName = file.fileName;
      mimeType = file.mimeType;
      sizeBytes = file.sizeBytes;
      s3Key = file.key;
      storageProvider = file.storageProvider;

      // Check if attached to a post to verify post permissions
      targetPost = await prisma.post.findFirst({
        where: {
          OR: [
            { fileUrl: file.url },
            { imageUrl: file.url },
            { videoUrl: file.url },
          ],
        },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, isPrivate: true },
          },
        },
      });

      if (targetPost) {
        const accessCheck = await canViewPost(req.user?.id, targetPost);
        if (!accessCheck.allowed) {
          return res.status(403).json({ error: accessCheck.reason || 'Access denied to this file' });
        }
      } else if (file.userId !== req.user?.id && !req.user?.isAdmin) {
        // Enforce private account rules if file author is private
        const fileOwner = await prisma.user.findUnique({
          where: { id: file.userId },
          select: { id: true, isPrivate: true },
        });
        if (fileOwner?.isPrivate) {
          let isFollowing = false;
          if (req.user?.id) {
            const follow = await prisma.follow.findUnique({
              where: {
                followerId_followingId: { followerId: req.user.id, followingId: file.userId },
              },
            });
            isFollowing = !!follow;
          }
          if (!isFollowing) {
            return res.status(403).json({ error: 'Access denied: Author account is private' });
          }
        }
      }
    } else {
      // 2. Try finding as a Post ID
      targetPost = await prisma.post.findUnique({
        where: { id: fileId },
        include: {
          author: {
            select: { id: true, username: true, displayName: true, isPrivate: true },
          },
        },
      });

      if (!targetPost) {
        return res.status(404).json({ error: 'File or post media not found' });
      }

      const accessCheck = await canViewPost(req.user?.id, targetPost);
      if (!accessCheck.allowed) {
        return res.status(403).json({ error: accessCheck.reason || 'Access denied to this post media' });
      }

      targetUrl = targetPost.fileUrl || targetPost.videoUrl || targetPost.imageUrl;
      if (!targetUrl) {
        return res.status(404).json({ error: 'No downloadable media found for this post' });
      }

      const rawExt =
        targetPost.docType?.toLowerCase() ||
        (targetPost.fileUrl ? path.extname(targetPost.fileUrl).replace('.', '') : '') ||
        (targetPost.postType === 'VIDEO' ? 'mp4' : 'jpg');
      const ext = rawExt.toLowerCase();

      fileName =
        targetPost.fileName ||
        sanitizeFileName(`${targetPost.title || 'musely_media'}.${ext}`);

      mimeType =
        targetPost.fileType ||
        (ext === 'pdf'
          ? 'application/pdf'
          : ext === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : ext === 'doc'
          ? 'application/msword'
          : ext === 'mp4'
          ? 'video/mp4'
          : 'image/jpeg');

      sizeBytes = targetPost.fileSize || null;
    }

    // Record DOWNLOAD analytics asynchronously
    if (targetPost && targetPost.authorId !== req.user?.id) {
      prisma.analyticsEvent.create({
        data: {
          eventType: 'DOWNLOAD',
          userId: req.user?.id || null,
          targetUserId: targetPost.authorId,
          postId: targetPost.id,
          metadata: JSON.stringify({ fileName, mimeType }),
        },
      }).catch(err => logger.debug('Download analytics track error:', err));
    }

    // Set download headers
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    if (sizeBytes) {
      res.setHeader('Content-Length', sizeBytes.toString());
    }

    // Stream from S3 if configured
    const s3 = getS3Client();
    if (s3 && s3Key && storageProvider === 'neon-object-storage') {
      try {
        const getCommand = new GetObjectCommand({
          Bucket: 'assets',
          Key: s3Key,
        });
        const response = await s3.send(getCommand);
        if (response.Body) {
          const stream = response.Body as NodeJS.ReadableStream;
          return stream.pipe(res);
        }
      } catch (s3Err) {
        logger.warn('S3 direct stream failed, attempting remote url fallback:', s3Err);
      }
    }

    // Handle base64 data URLs
    if (targetUrl.startsWith('data:')) {
      const parts = targetUrl.split(',');
      if (parts.length === 2) {
        const buffer = Buffer.from(parts[1], 'base64');
        res.setHeader('Content-Length', buffer.length.toString());
        return res.end(buffer);
      }
    }

    // Handle remote URLs via streaming proxy to prevent cross-origin issues
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      try {
        const fetchRes = await fetch(targetUrl);
        if (fetchRes.ok && fetchRes.body) {
          const remoteType = fetchRes.headers.get('content-type');
          if (remoteType) res.setHeader('Content-Type', remoteType);
          const remoteLen = fetchRes.headers.get('content-length');
          if (remoteLen) res.setHeader('Content-Length', remoteLen);

          const reader = fetchRes.body.getReader();
          const { Readable } = await import('stream');
          const stream = new Readable({
            async read() {
              try {
                const { done, value } = await reader.read();
                if (done) {
                  this.push(null);
                } else {
                  this.push(Buffer.from(value));
                }
              } catch (rErr) {
                this.destroy(rErr as Error);
              }
            },
          });
          return stream.pipe(res);
        }
      } catch (proxyErr) {
        logger.warn('Remote stream proxy failed, falling back to redirect:', proxyErr);
      }
    }

    // Direct redirect fallback
    return res.redirect(targetUrl);
  } catch (error) {
    logger.error('Download error:', error);
    return res.status(500).json({ error: 'Failed to download file' });
  }
});

export default router;
