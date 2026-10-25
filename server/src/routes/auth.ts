import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { rateLimit } from 'express-rate-limit';
import { prisma } from '../utils/prisma';
import { generateToken, generateTemp2FAToken, verifyTemp2FAToken, authenticate } from '../middleware/auth';
import { registerSchema, loginSchema } from '../validators/schemas';
import { logger } from '../utils/logger';
import { sendPasswordResetEmail } from '../services/email';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 20 : 100,
  message: { error: 'Too many attempts, please try again later' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  message: { error: 'Too many password reset requests. Please try again in an hour.' },
});

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
  try {
    const result = registerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    const { email, username, displayName, password } = result.data;

    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      if (existing.email === email) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      return res.status(409).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, username, displayName, passwordHash },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        coverUrl: true,
        bio: true,
        website: true,
        location: true,
        interests: true,
        theme: true,
        isVerified: true,
        isAdmin: true,
        createdAt: true,
      },
    });

    const token = generateToken(user.id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    logger.info(`New user registered: ${user.username}`);
    return res.status(201).json({ user, token });
  } catch (error) {
    logger.error('Register error:', error);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.flatten().fieldErrors,
      });
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Two-Step Verification Check
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      const tempToken = generateTemp2FAToken(user.id);
      logger.info(`User ${user.username} entered valid credentials, awaiting 2FA verification`);
      return res.json({
        requires2FA: true,
        tempToken,
        message: 'Two-step verification code required',
      });
    }

    const token = generateToken(user.id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Record or update active session
    try {
      const sessionToken = crypto.randomBytes(24).toString('hex');
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
      const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
      await prisma.userSession.create({
        data: {
          userId: user.id,
          sessionToken,
          userAgent: req.headers['user-agent'] || 'Web Browser',
          ipHash,
          lastActiveAt: new Date(),
        },
      });
    } catch (sessionErr) {
      logger.debug('Session track error:', sessionErr);
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      bio: user.bio,
      website: user.website,
      location: user.location,
      interests: user.interests,
      theme: user.theme,
      isVerified: user.isVerified,
      isAdmin: user.isAdmin,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
    };

    logger.info(`User logged in: ${user.username}`);
    return res.json({ user: userResponse, token });
  } catch (error) {
    logger.error('Login error:', error);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/2fa/verify - Verify TOTP during login
router.post('/2fa/verify', authLimiter, async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ error: 'Temporary token and 6-digit code are required' });
    }

    let payload: { userId: string };
    try {
      payload = verifyTemp2FAToken(tempToken);
    } catch {
      return res.status(401).json({ error: '2FA verification session expired. Please log in again.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'Two-step verification is not configured for this account' });
    }

    const { verifyTOTP } = await import('../utils/totp');
    const isValid = verifyTOTP(code, user.twoFactorSecret);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid verification code. Please check your authenticator app.' });
    }

    const token = generateToken(user.id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // Record session
    try {
      const sessionToken = crypto.randomBytes(24).toString('hex');
      const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '127.0.0.1';
      const ipHash = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16);
      await prisma.userSession.create({
        data: {
          userId: user.id,
          sessionToken,
          userAgent: req.headers['user-agent'] || 'Web Browser',
          ipHash,
          lastActiveAt: new Date(),
        },
      });
    } catch (sessionErr) {
      logger.debug('Session track error:', sessionErr);
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      bio: user.bio,
      website: user.website,
      location: user.location,
      interests: user.interests,
      theme: user.theme,
      isVerified: user.isVerified,
      isAdmin: user.isAdmin,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
    };

    logger.info(`User passed 2FA verification: ${user.username}`);
    return res.json({ user: userResponse, token });
  } catch (error) {
    logger.error('2FA verification error:', error);
    return res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/2fa/recovery - Verify recovery code during login
router.post('/2fa/recovery', authLimiter, async (req, res) => {
  try {
    const { tempToken, recoveryCode } = req.body;
    if (!tempToken || !recoveryCode) {
      return res.status(400).json({ error: 'Temporary token and recovery code are required' });
    }

    let payload: { userId: string };
    try {
      payload = verifyTemp2FAToken(tempToken);
    } catch {
      return res.status(401).json({ error: '2FA session expired. Please log in again.' });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorRecoveryCodes) {
      return res.status(400).json({ error: 'Two-step verification is not configured for this account' });
    }

    const storedCodes: string[] = JSON.parse(user.twoFactorRecoveryCodes);
    const { verifyAndConsumeRecoveryCode } = await import('../utils/totp');
    const { valid, remainingHashedCodes } = verifyAndConsumeRecoveryCode(recoveryCode, storedCodes);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid or already used recovery code' });
    }

    // Update remaining codes
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: JSON.stringify(remainingHashedCodes) },
    });

    const token = generateToken(user.id);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const userResponse = {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      coverUrl: user.coverUrl,
      bio: user.bio,
      website: user.website,
      location: user.location,
      interests: user.interests,
      theme: user.theme,
      isVerified: user.isVerified,
      isAdmin: user.isAdmin,
      twoFactorEnabled: user.twoFactorEnabled,
      createdAt: user.createdAt,
    };

    logger.info(`User logged in using recovery code: ${user.username}. Remaining codes: ${remainingHashedCodes.length}`);
    return res.json({
      user: userResponse,
      token,
      remainingRecoveryCodesCount: remainingHashedCodes.length,
      warning: remainingHashedCodes.length <= 2 ? 'You have 2 or fewer recovery codes left. Please generate new ones in Settings.' : undefined,
    });
  } catch (error) {
    logger.error('Recovery code error:', error);
    return res.status(500).json({ error: 'Recovery failed' });
  }
});

// POST /api/auth/2fa/setup - Initiate enrollment (generates secret + recovery codes, does NOT enable yet)
router.post('/2fa/setup', authenticate, async (req, res) => {
  try {
    const { generateBase32Secret, generateRecoveryCodes } = await import('../utils/totp');
    const secret = generateBase32Secret();
    const { rawCodes, hashedCodes } = generateRecoveryCodes(8);

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Store pending secret and hashed recovery codes, but leave twoFactorEnabled as false!
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorSecret: secret,
        twoFactorRecoveryCodes: JSON.stringify(hashedCodes),
      },
    });

    const otpauthUrl = `otpauth://totp/MUSELY:${encodeURIComponent(user.username)}?secret=${secret}&issuer=MUSELY`;

    return res.json({
      secret,
      otpauthUrl,
      recoveryCodes: rawCodes, // Displayed once to user!
      message: 'Scan the QR code or enter the secret in your authenticator app, then confirm with a 6-digit code.',
    });
  } catch (error) {
    logger.error('2FA setup error:', error);
    return res.status(500).json({ error: 'Failed to initiate 2FA setup' });
  }
});

// POST /api/auth/2fa/confirm-setup - Verify initial code to complete enrollment
router.post('/2fa/confirm-setup', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string' || code.length !== 6) {
      return res.status(400).json({ error: 'A 6-digit verification code is required' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: '2FA setup was not initiated. Please start setup first.' });
    }

    const { verifyTOTP } = await import('../utils/totp');
    const isValid = verifyTOTP(code, user.twoFactorSecret);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code. Please verify the code displayed on your authenticator app.' });
    }

    // Now officially enable 2FA
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true },
    });

    logger.info(`2FA enabled for user: ${user.username}`);
    return res.json({
      success: true,
      message: 'Two-step verification has been successfully enabled for your account.',
    });
  } catch (error) {
    logger.error('2FA confirm setup error:', error);
    return res.status(500).json({ error: 'Failed to confirm 2FA setup' });
  }
});

// POST /api/auth/2fa/disable - Require password re-authentication before disabling
router.post('/2fa/disable', authenticate, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Your current account password is required to disable two-step verification' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password. Re-authentication failed.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: null,
      },
    });

    logger.info(`2FA disabled for user: ${user.username}`);
    return res.json({ success: true, message: 'Two-step verification has been disabled.' });
  } catch (error) {
    logger.error('2FA disable error:', error);
    return res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// GET /api/auth/2fa/status - Check status and remaining recovery codes count
router.get('/2fa/status', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { twoFactorEnabled: true, twoFactorRecoveryCodes: true },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    let remainingRecoveryCodes = 0;
    if (user.twoFactorRecoveryCodes) {
      try {
        const codes = JSON.parse(user.twoFactorRecoveryCodes);
        remainingRecoveryCodes = Array.isArray(codes) ? codes.length : 0;
      } catch {
        // ignore
      }
    }

    return res.json({
      enabled: user.twoFactorEnabled,
      remainingRecoveryCodes,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

// GET /api/auth/sessions - List active sessions for user
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user!.id },
      orderBy: { lastActiveAt: 'desc' },
      take: 20,
    });

    return res.json({ sessions });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// DELETE /api/auth/sessions/:sessionId - Revoke a specific session
router.delete('/sessions/:sessionId', authenticate, async (req, res) => {
  try {
    await prisma.userSession.deleteMany({
      where: {
        id: req.params.sessionId,
        userId: req.user!.id,
      },
    });
    return res.json({ message: 'Session revoked successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// DELETE /api/auth/sessions-other - Revoke all other active sessions
router.delete('/sessions-other', authenticate, async (req, res) => {
  try {
    // Delete all sessions for this user except the most recent one
    const mostRecent = await prisma.userSession.findFirst({
      where: { userId: req.user!.id },
      orderBy: { lastActiveAt: 'desc' },
    });

    if (mostRecent) {
      await prisma.userSession.deleteMany({
        where: {
          userId: req.user!.id,
          id: { not: mostRecent.id },
        },
      });
    }

    return res.json({ message: 'All other sessions have been logged out.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to revoke other sessions' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        coverUrl: true,
        bio: true,
        website: true,
        location: true,
        interests: true,
        theme: true,
        isVerified: true,
        isAdmin: true,
        twoFactorEnabled: true,
        lastSeenAt: true,
        createdAt: true,
        _count: {
          select: { posts: true, followers: true, following: true },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (error) {
    logger.error('Get me error:', error);
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    // Invalidate any existing tokens
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    // Generate secure token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { token: tokenHash, userId: user.id, expiresAt },
    });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${rawToken}`;

    // Send email (logs to console if email not configured)
    await sendPasswordResetEmail(user.email, user.displayName, resetUrl);

    logger.info(`Password reset requested for: ${user.email}`);
    return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (error) {
    logger.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (resetToken.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    if (resetToken.usedAt) {
      return res.status(400).json({ error: 'This reset link has already been used' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    logger.info(`Password reset completed for: ${resetToken.user.email}`);
    return res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    logger.error('Reset password error:', error);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// PATCH /api/auth/theme — Persist theme preference for logged-in users
router.patch('/theme', authenticate, async (req, res) => {
  try {
    const { theme } = req.body;
    if (!['dark', 'light', 'system'].includes(theme)) {
      return res.status(400).json({ error: 'Invalid theme. Must be dark, light, or system.' });
    }

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { theme },
      select: { id: true, theme: true },
    });

    return res.json({ theme: user.theme });
  } catch (error) {
    logger.error('Theme update error:', error);
    return res.status(500).json({ error: 'Failed to update theme' });
  }
});

export default router;
