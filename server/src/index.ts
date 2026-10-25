import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { prisma } from './utils/prisma';
import { logger } from './utils/logger';
import authRoutes from './routes/auth';
import postRoutes from './routes/posts';
import userRoutes from './routes/users';
import collectionRoutes from './routes/collections';
import searchRoutes from './routes/search';
import uploadRoutes from './routes/upload';
import notificationRoutes from './routes/notifications';
import messageRoutes from './routes/messages';
import communityRoutes from './routes/communities';
import moderationRoutes from './routes/moderation';
import verificationRoutes from './routes/verification';
import analyticsRoutes from './routes/analytics';
import { initWebSocketServer } from './services/websocket';

const app = express();
const PORT = process.env.PORT || 4000;

// Configure Express trust proxy for Vercel's reverse proxy deployment topology.
// Narrowest safe setting: trust exactly 1 hop (the immediate front-facing reverse proxy).
// Validate TRUST_PROXY against an explicit allowlist of supported values to prevent passing arbitrary strings.
function getValidatedTrustProxy(): number | boolean | string {
  const envVal = process.env.TRUST_PROXY?.trim();
  if (!envVal) {
    return 1; // Default for Vercel single-hop reverse proxy
  }

  // Explicit allowlist of supported proxy trust configurations
  const ALLOWED_VALUES: Record<string, number | boolean | string> = {
    '1': 1,
    '2': 2,
    'true': 1, // Safely coerce 'true' to single-hop to prevent blind arbitrary trust
    'false': false,
    'loopback': 'loopback',
  };

  const normalized = envVal.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ALLOWED_VALUES, normalized)) {
    return ALLOWED_VALUES[normalized];
  }

  logger.warn(`Invalid or unsupported TRUST_PROXY value "${envVal}". Defaulting to safe single-hop (1).`);
  return 1;
}

const trustProxyConfig = getValidatedTrustProxy();
if (trustProxyConfig !== false) {
  app.set('trust proxy', trustProxyConfig);
}

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS
const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
];

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultOrigins]));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow Vercel preview deployments if enabled or matching .vercel.app
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }

    logger.warn(`Blocked by CORS: ${origin}`);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Global rate limit
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/moderation', moderationRoutes);
app.use('/api/verify', verificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Root & Health check
app.get('/', (_req, res) => {
  res.json({
    name: 'MUSELY India API',
    status: 'online',
    version: '1.0.0',
    health: '/api/health',
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    protocol: req.protocol,
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function main() {
  try {
    await prisma.$connect();
    logger.info('Database connected');
    const httpServer = http.createServer(app);
    initWebSocketServer(httpServer);
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} (HTTP + WebSocket)`);
    });
    // Graceful shutdown
    const shutdown = async () => {
      await prisma.$disconnect();
      httpServer.close(() => process.exit(0));
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start server listener when running as standalone process
// In automated test suites, the test imports app without binding the port.
// In Vercel serverless functions, Vercel invokes the exported app directly.
if (process.env.NODE_ENV !== 'test' && !process.env.TEST_SUITE) {
  main();
}

export default app;
