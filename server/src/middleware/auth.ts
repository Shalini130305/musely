import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'musely-dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as any });
}

export function generateTemp2FAToken(userId: string): string {
  return jwt.sign({ userId, purpose: '2fa_login' }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifyTemp2FAToken(token: string): { userId: string } {
  const payload = jwt.verify(token, JWT_SECRET) as { userId: string; purpose?: string };
  if (payload.purpose !== '2fa_login') {
    throw new Error('Invalid 2FA token purpose');
  }
  return { userId: payload.userId };
}

export function verifyToken(token: string): { userId: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: string };
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Check cookie
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    // Check query parameter (e.g. for direct download links)
    if (!token && typeof req.query?.token === 'string') {
      token = req.query.token;
    }

    // Check request body (e.g. navigator.sendBeacon which cannot set headers)
    if (!token && req.body && typeof req.body.token === 'string') {
      token = req.body.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        isAdmin: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token && typeof req.query?.token === 'string') {
      token = req.query.token;
    }

    if (token) {
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      });
      if (user) req.user = user;
    }
  } catch {
    // ignore
  }
  next();
}
