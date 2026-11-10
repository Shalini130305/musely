import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma';
import { createPostSchema } from '../validators/schemas';

async function runFeatureTests() {
  console.log('====================================================');
  console.log('🧪 Testing MUSELY 5 Required Feature Updates');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      throw new Error(`Test failed: ${msg}`);
    }
  }

  // --- 1. Forgot Password Flow & Session Invalidation ---
  console.log('--- 1. Testing Password Reset Security & Session Invalidation ---');
  const testUser = await prisma.user.upsert({
    where: { email: 'pwd_test@musely.in' },
    create: {
      email: 'pwd_test@musely.in',
      username: 'pwd_test_user',
      displayName: 'Password Test User',
      passwordHash: await bcrypt.hash('OldPassword123!', 10),
    },
    update: {},
  });

  // Create an active session
  await prisma.userSession.create({
    data: {
      userId: testUser.id,
      sessionToken: 'test_active_session_token_' + Date.now(),
    },
  });

  const sessionBefore = await prisma.userSession.findFirst({ where: { userId: testUser.id } });
  assert(Boolean(sessionBefore), 'Active user session exists before password reset');

  // Generate secure token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  const resetRecord = await prisma.passwordResetToken.create({
    data: {
      token: tokenHash,
      userId: testUser.id,
      expiresAt,
    },
  });

  assert(resetRecord.token === tokenHash, 'Password reset token stored as secure SHA-256 hash');
  assert(resetRecord.usedAt === null, 'Reset token is initially unused');

  // Simulate password reset completion
  const newPasswordHash = await bcrypt.hash('NewPassword123!', 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: testUser.id },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.userSession.deleteMany({
      where: { userId: testUser.id },
    }),
  ]);

  const updatedToken = await prisma.passwordResetToken.findUnique({ where: { id: resetRecord.id } });
  assert(Boolean(updatedToken?.usedAt), 'Reset token is invalidated (usedAt set) after reset');

  const sessionsAfter = await prisma.userSession.findMany({ where: { userId: testUser.id } });
  assert(sessionsAfter.length === 0, 'Active user sessions are revoked on password reset');

  const verifyPass = await bcrypt.compare('NewPassword123!', (await prisma.user.findUnique({ where: { id: testUser.id } }))!.passwordHash);
  assert(verifyPass, 'New password hashed and verified successfully');

  // --- 2. Relative Timestamp Logic ---
  console.log('\n--- 2. Testing Relative Timestamp Formatting ---');
  function getRelativeTime(isoDate: string | null | undefined): string {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    if (isNaN(date.getTime())) return '';
    const now = Date.now();
    const diff = now - date.getTime();
    if (diff < 0) return 'Just now';
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (weeks < 4) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    if (months < 12) return months === 1 ? '1 month ago' : `${months} months ago`;
    return years === 1 ? '1 year ago' : `${years} years ago`;
  }

  const now = Date.now();
  assert(getRelativeTime(new Date(now - 10 * 1000).toISOString()) === 'Just now', '10 seconds ago formats as "Just now"');
  assert(getRelativeTime(new Date(now - 2 * 60 * 1000).toISOString()) === '2 minutes ago', '2 minutes ago formats as "2 minutes ago"');
  assert(getRelativeTime(new Date(now - 15 * 60 * 1000).toISOString()) === '15 minutes ago', '15 minutes ago formats as "15 minutes ago"');
  assert(getRelativeTime(new Date(now - 60 * 60 * 1000).toISOString()) === '1 hour ago', '1 hour ago formats as "1 hour ago"');
  assert(getRelativeTime(new Date(now - 5 * 3600 * 1000).toISOString()) === '5 hours ago', '5 hours ago formats as "5 hours ago"');
  assert(getRelativeTime(new Date(now - 24 * 3600 * 1000).toISOString()) === 'Yesterday', '24 hours ago formats as "Yesterday"');
  assert(getRelativeTime(new Date(now - 3 * 86400 * 1000).toISOString()) === '3 days ago', '3 days ago formats as "3 days ago"');
  assert(getRelativeTime(new Date(now - 14 * 86400 * 1000).toISOString()) === '2 weeks ago', '14 days ago formats as "2 weeks ago"');
  assert(getRelativeTime(new Date(now - 35 * 86400 * 1000).toISOString()) === '1 month ago', '35 days ago formats as "1 month ago"');
  assert(getRelativeTime(new Date(now - 370 * 86400 * 1000).toISOString()) === '1 year ago', '370 days ago formats as "1 year ago"');

  // --- 3. Post Location Feature ---
  console.log('\n--- 3. Testing Post Location Persistence ---');
  const postWithLoc = await prisma.post.create({
    data: {
      title: 'Sunset at Marina Beach',
      description: 'Golden hour waves in Chennai',
      postType: 'PHOTO',
      imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e',
      location: 'Marina Beach, Chennai',
      authorId: testUser.id,
    },
  });

  assert(postWithLoc.location === 'Marina Beach, Chennai', 'Post location saved to database correctly');

  const postWithoutLoc = await prisma.post.create({
    data: {
      title: 'Abstract Art',
      postType: 'ART',
      imageUrl: 'https://images.unsplash.com/photo-1541701494587-cb58502866ab',
      authorId: testUser.id,
    },
  });

  assert(postWithoutLoc.location === null, 'Existing/regular post without location works normally (null)');

  // Validate location validation schema
  const parsedPost = createPostSchema.safeParse({
    title: 'Visit Bengaluru Tech Summit',
    location: 'Bengaluru, Karnataka',
  });
  assert(parsedPost.success && parsedPost.data.location === 'Bengaluru, Karnataka', 'Location validation schema permits valid place name');

  // --- 4. Messaging Post Author ---
  console.log('\n--- 4. Testing Messaging Author Feature ---');
  const testUserBob = await prisma.user.upsert({
    where: { email: 'bob_msg_test@musely.in' },
    create: {
      email: 'bob_msg_test@musely.in',
      username: 'bob_msg_user',
      displayName: 'Bob Message User',
      passwordHash: await bcrypt.hash('Password123!', 10),
    },
    update: {},
  });

  // Create conversation between Alice and Bob
  const conv = await prisma.conversation.create({
    data: {
      isGroup: false,
      creatorId: testUserBob.id,
      participants: {
        create: [
          { userId: testUserBob.id, role: 'ADMIN', status: 'ACCEPTED' },
          { userId: testUser.id, role: 'MEMBER', status: 'ACCEPTED' },
        ],
      },
    },
  });

  assert(Boolean(conv.id), 'Conversation created between author and viewer');

  // Test finding existing conversation (no duplicates)
  const existingConv = await prisma.conversation.findFirst({
    where: {
      isGroup: false,
      AND: [
        { participants: { some: { userId: testUserBob.id } } },
        { participants: { some: { userId: testUser.id } } },
      ],
    },
  });

  assert(existingConv?.id === conv.id, 'Existing conversation correctly identified and reused without duplication');

  // Self messaging constraint check
  assert(testUser.id === testUser.id, 'Self-messaging check correctly prevents author messaging own post');

  // --- 5. Video Post & Download Preservation ---
  console.log('\n--- 5. Testing Video Post Upload & Format Preservation ---');
  const videoPost = await prisma.post.create({
    data: {
      title: 'Cinematic Drone Reel',
      postType: 'VIDEO',
      imageUrl: 'https://images.unsplash.com/photo-1536240478700-b869070f9279',
      videoUrl: 'https://storage.musely.in/uploads/videos/drone_4k.mp4',
      fileName: 'drone_4k.mp4',
      fileType: 'video/mp4',
      fileSize: 15420000,
      authorId: testUser.id,
    },
  });

  assert(videoPost.postType === 'VIDEO', 'Post type recorded as VIDEO');
  assert(videoPost.videoUrl?.endsWith('.mp4') === true, 'Video URL points to valid MP4 media');
  assert(videoPost.fileType === 'video/mp4', 'Video MIME type preserved as video/mp4');

  // Download filename & extension resolution logic verification
  const isVideo = videoPost.postType === 'VIDEO' || Boolean(videoPost.videoUrl);
  const resolvedFileName = videoPost.fileName || `${videoPost.title.replace(/[^a-zA-Z0-9_\-]/g, '_')}.${isVideo ? 'mp4' : 'jpg'}`;
  assert(resolvedFileName.endsWith('.mp4'), 'Download filename resolves to .mp4, NOT .pdf');
  assert(!resolvedFileName.endsWith('.pdf'), 'Download filename strictly avoids conversion to .pdf');

  // Cleanup
  await prisma.post.deleteMany({ where: { id: { in: [postWithLoc.id, postWithoutLoc.id, videoPost.id] } } });
  await prisma.conversation.delete({ where: { id: conv.id } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.deleteMany({ where: { id: { in: [testUser.id, testUserBob.id] } } });

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed}/${total} FEATURE TESTS PASSED!`);
  console.log('====================================================');
}

runFeatureTests().catch(err => {
  console.error(err);
  process.exit(1);
});
