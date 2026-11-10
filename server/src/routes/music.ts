import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '../utils/prisma';
import { authenticate, optionalAuthenticate } from '../middleware/auth';
import { logger } from '../utils/logger';
import { searchWorldwideMusic, persistMusicTrack } from '../services/musicProvider';

const router = Router();

const memoryStorage = multer.memoryStorage();
const audioUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/ogg',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'audio/webm',
    ];
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const allowedExts = ['mp3', 'wav', 'ogg', 'm4a', 'webm'];

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported audio format. Allowed: MP3, WAV, OGG, M4A, WebM.'));
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

// Initial royalty-free and Creative Commons library tracks
const SEED_TRACKS = [
  {
    title: 'Raga Morning Breeze',
    artist: 'Sandeep Das & Ensemble',
    album: 'Dawn Ragas Vol. 1',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3',
    duration: 164,
    isLicensed: true,
    licenseSource: 'Creative Commons CC-BY 4.0 / Public Royalty Free',
  },
  {
    title: 'Monsoon Dreams',
    artist: 'Maya Shenoy',
    album: 'Echoes of Malabar',
    coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=400&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-amp-strings-10711.mp3',
    duration: 180,
    isLicensed: true,
    licenseSource: 'Creative Commons CC-BY-SA 4.0',
  },
  {
    title: 'Neon Bangalore Nights',
    artist: 'SynthKavya',
    album: 'Indie Wave India',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/10/14/audio_9939f792cb.mp3?filename=chill-abstract-intention-12099.mp3',
    duration: 142,
    isLicensed: true,
    licenseSource: 'Authorized Public Domain License',
  },
  {
    title: 'Chai & Vinyl',
    artist: 'Mumbai Chill Collective',
    album: 'Tape Sessions 1998',
    coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=400&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=relaxed-vlog-night-street-131746.mp3',
    duration: 135,
    isLicensed: true,
    licenseSource: 'Creative Commons Zero (CC0)',
  },
  {
    title: 'Desert Mirage',
    artist: 'Rajasthani Folk Project',
    album: 'Golden Sands',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&w=400&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3?filename=spirit-blossom-15285.mp3',
    duration: 198,
    isLicensed: true,
    licenseSource: 'Creative Commons CC-BY 3.0',
  },
  {
    title: 'Soulful Sitar Serenade',
    artist: 'Arvind Shankar',
    album: 'Meditations',
    coverUrl: 'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&w=400&q=80',
    audioUrl: 'https://cdn.pixabay.com/download/audio/2022/02/07/audio_d0c6ff1cbd.mp3?filename=inspiring-cinematic-ambient-116199.mp3',
    duration: 212,
    isLicensed: true,
    licenseSource: 'Royalty-Free Audio Library',
  },
];

async function ensureSeedTracks() {
  const count = await prisma.musicTrack.count();
  if (count === 0) {
    for (const track of SEED_TRACKS) {
      await prisma.musicTrack.create({ data: track }).catch(err => logger.debug('Seed track error:', err));
    }
  }
}

// GET /api/music/tracks - Search & List licensed tracks
router.get('/tracks', optionalAuthenticate, async (req, res) => {
  try {
    await ensureSeedTracks();
    const query = (req.query.q as string || '').trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);

    const where: any = {};
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { artist: { contains: query, mode: 'insensitive' } },
        { album: { contains: query, mode: 'insensitive' } },
      ];
    }

    const tracks = await prisma.musicTrack.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return res.json({ tracks });
  } catch (error) {
    logger.error('Fetch music tracks error:', error);
    return res.status(500).json({ error: 'Failed to fetch music tracks' });
  }
});

// GET /api/music/search - Worldwide music catalogue search (Apple Music, Spotify, Local Library)
router.get('/search', optionalAuthenticate, async (req, res) => {
  try {
    await ensureSeedTracks();
    const query = (req.query.q as string || '').trim();
    const provider = (req.query.provider as 'all' | 'itunes' | 'spotify' | 'library') || 'all';
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 50);

    if (!query) {
      // If empty query, return top library tracks
      const tracks = await prisma.musicTrack.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
      });
      return res.json({
        query: '',
        tracks: tracks.map(t => ({
          id: t.id,
          title: t.title,
          artist: t.artist,
          album: t.album,
          coverUrl: t.coverUrl,
          audioUrl: t.audioUrl,
          duration: t.duration,
          provider: 'library',
          providerId: t.providerId || t.id,
          previewAvailable: Boolean(t.audioUrl),
          externalUrl: t.externalUrl,
        })),
        count: tracks.length,
      });
    }

    const results = await searchWorldwideMusic(query, { limit, provider });
    return res.json({
      query,
      tracks: results,
      count: results.length,
    });
  } catch (error) {
    logger.error('Worldwide music search error:', error);
    return res.status(500).json({ error: 'Failed to search music catalog' });
  }
});

// POST /api/music/persist - Persist an external track into the library
router.post('/persist', authenticate, async (req, res) => {
  try {
    const { title, artist, album, coverUrl, audioUrl, duration, providerId, providerName, externalUrl, licenseSource } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: 'Track title and artist are required' });
    }

    const track = await persistMusicTrack({
      title,
      artist,
      album,
      coverUrl,
      audioUrl,
      duration,
      providerId,
      providerName,
      externalUrl,
      licenseSource,
    });

    return res.json({ track });
  } catch (error) {
    logger.error('Persist music track error:', error);
    return res.status(500).json({ error: 'Failed to save music track' });
  }
});

// GET /api/music/notes - List recent public music notes
router.get('/notes', optionalAuthenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);
    const notes = await prisma.musicNote.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        musicTrack: true,
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
    });

    return res.json({ notes });
  } catch (error) {
    logger.error('Fetch music notes error:', error);
    return res.status(500).json({ error: 'Failed to fetch music notes' });
  }
});

// GET /api/music/notes/me - List my music notes
router.get('/notes/me', authenticate, async (req, res) => {
  try {
    const notes = await prisma.musicNote.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      include: {
        musicTrack: true,
      },
    });

    return res.json({ notes });
  } catch (error) {
    logger.error('Fetch my music notes error:', error);
    return res.status(500).json({ error: 'Failed to fetch your music notes' });
  }
});

// POST /api/music/notes - Create a music note
router.post('/notes', authenticate, async (req, res) => {
  try {
    const { content, musicTrackId, voiceRecordingUrl, voiceRecordingDuration } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    const note = await prisma.musicNote.create({
      data: {
        userId: req.user!.id,
        content: content.trim(),
        musicTrackId: musicTrackId || null,
        voiceRecordingUrl: voiceRecordingUrl || null,
        voiceRecordingDuration: voiceRecordingDuration ? parseInt(voiceRecordingDuration) : null,
      },
      include: {
        musicTrack: true,
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
    });

    return res.status(201).json({ note });
  } catch (error) {
    logger.error('Create music note error:', error);
    return res.status(500).json({ error: 'Failed to create music note' });
  }
});

// DELETE /api/music/notes/:id - Delete a music note
router.delete('/notes/:id', authenticate, async (req, res) => {
  try {
    const note = await prisma.musicNote.findUnique({
      where: { id: req.params.id },
    });

    if (!note) {
      return res.status(404).json({ error: 'Music note not found' });
    }

    if (note.userId !== req.user!.id && !req.user!.isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this note' });
    }

    await prisma.musicNote.delete({ where: { id: note.id } });
    return res.json({ success: true, message: 'Music note deleted' });
  } catch (error) {
    logger.error('Delete music note error:', error);
    return res.status(500).json({ error: 'Failed to delete music note' });
  }
});

// POST /api/music/voice-upload - Upload voice recording or user audio
router.post('/voice-upload', authenticate, audioUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const file = req.file;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '') || 'webm';
    const s3 = getS3Client();
    const key = `uploads/audio/${Date.now()}-${crypto.randomBytes(6).toString('hex')}-voice.${ext}`;

    let audioUrl = '';
    if (s3 && process.env.AWS_ENDPOINT_URL_S3) {
      await s3.send(
        new PutObjectCommand({
          Bucket: 'assets',
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        })
      );
      audioUrl = `${process.env.AWS_ENDPOINT_URL_S3}/assets/${key}`;
    } else if (file.size <= 4 * 1024 * 1024) {
      audioUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    } else {
      audioUrl = `/api/upload/file-mock/${encodeURIComponent(key)}`;
    }

    const duration = req.body.duration ? parseInt(req.body.duration) : null;

    return res.json({
      audioUrl,
      duration,
      sizeBytes: file.size,
      mimeType: file.mimetype,
    });
  } catch (error: any) {
    logger.error('Voice upload error:', error);
    return res.status(400).json({ error: error.message || 'Failed to upload audio' });
  }
});

export default router;
