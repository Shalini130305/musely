import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { authenticate } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: { error: 'Too many uploads, please try again later' },
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.'));
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

// POST /api/upload/image
router.post('/image', authenticate, uploadLimiter, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const file = req.file;

    // 1. Neon Object Storage (Primary persistent storage)
    const s3 = getS3Client();
    if (s3 && process.env.AWS_ENDPOINT_URL_S3) {
      const ext = file.mimetype.split('/')[1] === 'jpeg' ? 'jpg' : file.mimetype.split('/')[1];
      const key = `uploads/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: 'assets',
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );

      const publicUrl = `${process.env.AWS_ENDPOINT_URL_S3}/assets/${key}`;
      return res.json({
        imageUrl: publicUrl,
        storageProvider: 'neon-object-storage',
        bucket: 'assets',
        key,
        bytes: file.size,
        format: ext,
      });
    }

    // 2. Cloudinary (Alternative)
    const cloudinaryConfigured = !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );

    if (cloudinaryConfigured) {
      const cloudinary = require('cloudinary').v2;
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: 'musely',
            resource_type: 'image',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
          },
          (error: any, result: any) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(file.buffer);
      });

      return res.json({
        imageUrl: uploadResult.secure_url,
        cloudinaryId: uploadResult.public_id,
        width: uploadResult.width,
        height: uploadResult.height,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
      });
    }

    // 3. Local fallback (data URL)
    logger.warn('Persistent storage not configured. Using local data URL.');
    if (file.size > 2 * 1024 * 1024) {
      return res.status(400).json({
        error: 'Please configure Neon Object Storage or upload an image under 2MB.',
      });
    }

    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;

    return res.json({
      imageUrl: dataUrl,
      cloudinaryId: null,
      width: null,
      height: null,
      format: file.mimetype.split('/')[1],
      bytes: file.size,
      localDev: true,
    });
  } catch (error: any) {
    logger.error('Upload error:', error);
    if (error.message?.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to upload image' });
  }
});

export default router;
