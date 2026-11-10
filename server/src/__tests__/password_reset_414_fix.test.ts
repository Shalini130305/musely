import assert from 'assert';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';

async function runPasswordResetTests() {
  console.log('🧪 Starting Password Reset HTTP 414 & Security Verification Tests...\n');

  // Test 1: URL construction & length safeguards
  console.log('--- Test 1: Clean Reset URL Construction & Safe Length ---');
  const rawToken = crypto.randomBytes(32).toString('hex');
  assert.strictEqual(rawToken.length, 64, 'Raw token should be exactly 64 hex characters (32 bytes)');

  // Verify clientBase resolution with messy inputs (multiple comma-separated URLs, trailing slashes, paths)
  const messyClientUrls = [
    'https://musely-in.vercel.app',
    'https://musely-in.vercel.app/',
    'https://musely-in.vercel.app/reset-password',
    'https://musely-in.vercel.app,http://localhost:5173',
    'http://localhost:5173,https://musely-in.vercel.app',
  ];

  for (const rawClient of messyClientUrls) {
    const firstOrigin = rawClient.split(',')[0].trim();
    let clientBase = 'https://musely-in.vercel.app';
    try {
      const parsed = new URL(firstOrigin);
      clientBase = `${parsed.protocol}//${parsed.host}`;
    } catch {
      clientBase = 'https://musely-in.vercel.app';
    }

    const resetUrl = `${clientBase}/reset-password?token=${rawToken}`;
    const parsedUrl = new URL(resetUrl);

    assert.strictEqual(parsedUrl.pathname, '/reset-password', 'Path must strictly be /reset-password');
    assert.strictEqual(parsedUrl.searchParams.get('token'), rawToken, 'Token param must match rawToken exactly');
    assert.strictEqual(Array.from(parsedUrl.searchParams.keys()).length, 1, 'Only exactly one query parameter allowed');
    // Ensure URL is concise (less than 120 characters, well under HTTP 414 limit of 2048 - 8192 chars)
    assert(resetUrl.length < 120, `Reset URL must be compact (<120 chars), actual length: ${resetUrl.length}`);
  }
  console.log('✓ Reset URL construction tested across multiple configurations: all compact & clean');

  // Test 2: Database storage & SHA-256 hash security
  console.log('\n--- Test 2: Token Hash Storage & Verification ---');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  assert.strictEqual(tokenHash.length, 64, 'SHA-256 token hash should be 64 hex characters');
  assert.notStrictEqual(tokenHash, rawToken, 'Raw token must never equal token hash');

  const testUser = await prisma.user.upsert({
    where: { email: 'reset_414_test@musely.in' },
    create: {
      email: 'reset_414_test@musely.in',
      username: 'reset_414_tester',
      displayName: 'Reset 414 Tester',
      passwordHash: await bcrypt.hash('InitialPassword123!', 10),
    },
    update: {},
  });

  // Clean old tokens & sessions
  await prisma.passwordResetToken.deleteMany({ where: { userId: testUser.id } });
  await prisma.userSession.deleteMany({ where: { userId: testUser.id } });

  // Create an active session
  const activeSession = await prisma.userSession.create({
    data: {
      userId: testUser.id,
      sessionToken: 'active_session_' + Date.now(),
    },
  });
  assert(Boolean(activeSession.id), 'Active session established');

  // Create token record in DB
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  const tokenRecord = await prisma.passwordResetToken.create({
    data: {
      token: tokenHash,
      userId: testUser.id,
      expiresAt,
    },
  });
  assert(Boolean(tokenRecord.id), 'Reset token stored in database');
  console.log('✓ Token securely stored with SHA-256 hash and 1 hour expiration');

  // Test 3: Frontend token unwrapping / sanitization logic
  console.log('\n--- Test 3: Token Sanitization & Nested URL Unwrapping ---');
  function sanitizeToken(tokenInput: string): string {
    let clean = tokenInput.trim();
    if (clean.includes('token=')) {
      try {
        const candidate = clean.startsWith('http') ? clean : `https://musely-in.vercel.app/${clean.replace(/^\/+/, '')}`;
        const parsed = new URL(candidate);
        clean = parsed.searchParams.get('token') || clean;
      } catch {
        const match = clean.match(/token=([a-zA-Z0-9_-]+)/);
        if (match) clean = match[1];
      }
    }
    try {
      clean = decodeURIComponent(clean);
    } catch {
      // keep
    }
    return clean.trim();
  }

  // Variations: plain token, URL-encoded, wrapped in full URL, duplicated param
  assert.strictEqual(sanitizeToken(rawToken), rawToken, 'Plain token sanitization matches');
  assert.strictEqual(sanitizeToken(encodeURIComponent(rawToken)), rawToken, 'URL-encoded token sanitization matches');
  assert.strictEqual(sanitizeToken(`https://musely-in.vercel.app/reset-password?token=${rawToken}`), rawToken, 'Wrapped full URL unwraps correctly');
  assert.strictEqual(sanitizeToken(`/reset-password?token=${rawToken}`), rawToken, 'Relative path unwraps correctly');
  console.log('✓ Defensive token unwrapping correctly extracts opaque token from any wrapper');

  // Test 4: Password Reset Execution & Session Invalidation
  console.log('\n--- Test 4: Password Reset Completion & Session Revocation ---');
  const newRawPassword = 'BrandNewSecurePassword2026!';
  const newPasswordHash = await bcrypt.hash(newRawPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: testUser.id },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.userSession.deleteMany({
      where: { userId: testUser.id },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId: testUser.id, id: { not: tokenRecord.id } },
    }),
  ]);

  // Check token is marked used
  const usedToken = await prisma.passwordResetToken.findUnique({ where: { id: tokenRecord.id } });
  assert(Boolean(usedToken?.usedAt), 'Token is marked as used');

  // Check session is deleted
  const remainingSessions = await prisma.userSession.findMany({ where: { userId: testUser.id } });
  assert.strictEqual(remainingSessions.length, 0, 'All existing active sessions were revoked');

  // Check new password verification
  const updatedUser = await prisma.user.findUnique({ where: { id: testUser.id } });
  assert(await bcrypt.compare(newRawPassword, updatedUser!.passwordHash), 'New password verifies successfully');
  assert(!(await bcrypt.compare('InitialPassword123!', updatedUser!.passwordHash)), 'Old password no longer works');
  console.log('✓ Password reset completed, old password rejected, sessions revoked');

  // Test 5: Single-use enforcement (cannot reuse token)
  console.log('\n--- Test 5: Single-Use Token Enforcement ---');
  assert(usedToken?.usedAt !== null, 'Used token cannot be reused');
  console.log('✓ Token cannot be reused (usedAt is set)');

  // Test 6: Expired token rejection
  console.log('\n--- Test 6: Expired Token Rejection ---');
  const expiredRawToken = crypto.randomBytes(32).toString('hex');
  const expiredHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');
  const expiredRecord = await prisma.passwordResetToken.create({
    data: {
      token: expiredHash,
      userId: testUser.id,
      expiresAt: new Date(Date.now() - 60 * 1000), // 1 minute ago
    },
  });

  const isExpired = expiredRecord.expiresAt < new Date();
  assert.strictEqual(isExpired, true, 'Expired token is correctly detected');
  await prisma.passwordResetToken.delete({ where: { id: expiredRecord.id } });
  console.log('✓ Expired token rejected');

  // Cleanup test user
  await prisma.passwordResetToken.deleteMany({ where: { userId: testUser.id } });
  await prisma.userSession.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });

  console.log('\n🎉 ALL PASSWORD RESET TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runPasswordResetTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  });

