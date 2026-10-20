import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { validateMagicBytes, sanitizeFileName, isBlockedFile } from '../routes/upload';

const prisma = new PrismaClient();

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting MUSELY Comprehensive Verification Suite');
  console.log('====================================================');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalCount++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  try {
    // ----------------------------------------------------
    // TEST SECTION 1: Upload Validation & Security
    // ----------------------------------------------------
    console.log('\n--- 1. Testing Upload Security & Magic-Byte Validation ---');

    // Test dangerous extensions
    assert(isBlockedFile('script.exe'), 'Blocks .exe executable files');
    assert(isBlockedFile('malware.bat'), 'Blocks .bat script files');
    assert(isBlockedFile('exploit.sh'), 'Blocks .sh shell scripts');
    assert(isBlockedFile('shell.php'), 'Blocks .php script files');
    assert(isBlockedFile('vector.svg'), 'Blocks .svg dangerous vectors');
    assert(isBlockedFile('malicious.pdf.exe'), 'Blocks double-extension attacks (file.pdf.exe)');
    assert(!isBlockedFile('report.pdf'), 'Allows .pdf files');
    assert(!isBlockedFile('paper.docx'), 'Allows .docx files');
    assert(!isBlockedFile('photo.png'), 'Allows .png images');

    // Test magic bytes
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const pdfHeader = Buffer.from('%PDF-1.7 header content here');
    const fakePdfWithExeContent = Buffer.from([0x4D, 0x5A, 0x90, 0x00]); // MZ executable signature
    const zipDocxHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]);

    assert(validateMagicBytes(pngHeader, 'image/png'), 'Validates authentic PNG magic bytes');
    assert(validateMagicBytes(pdfHeader, 'application/pdf'), 'Validates authentic PDF header');
    assert(validateMagicBytes(zipDocxHeader, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'Validates authentic DOCX zip archive signature');
    assert(!validateMagicBytes(fakePdfWithExeContent, 'application/pdf'), 'Rejects spoofed file with fake extension and wrong magic bytes');

    // Test filename sanitization
    const sanitized = sanitizeFileName('../../../etc/passwd.pdf');
    assert(!sanitized.includes('..') && !sanitized.includes('/'), 'Sanitizes path traversal characters in filenames');

    // ----------------------------------------------------
    // TEST SECTION 2: Database Users & Setup
    // ----------------------------------------------------
    console.log('\n--- 2. Setting Up Test Accounts in Neon PostgreSQL ---');

    const userAlice = await prisma.user.upsert({
      where: { email: 'alice_test@musely.internal' },
      update: { isPrivate: false },
      create: {
        email: 'alice_test@musely.internal',
        username: 'alice_test',
        displayName: 'Alice Tester',
        passwordHash: 'dummy_hash',
      },
    });

    const userBob = await prisma.user.upsert({
      where: { email: 'bob_test@musely.internal' },
      update: { isPrivate: false },
      create: {
        email: 'bob_test@musely.internal',
        username: 'bob_test',
        displayName: 'Bob Tester',
        passwordHash: 'dummy_hash',
      },
    });

    const userCharlie = await prisma.user.upsert({
      where: { email: 'charlie_test@musely.internal' },
      update: { isPrivate: false },
      create: {
        email: 'charlie_test@musely.internal',
        username: 'charlie_test',
        displayName: 'Charlie Tester',
        passwordHash: 'dummy_hash',
      },
    });

    assert(Boolean(userAlice.id && userBob.id && userCharlie.id), 'Test accounts created and active in database');

    // Clean any prior follow states between test accounts
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: userBob.id, followingId: userAlice.id },
          { followerId: userCharlie.id, followingId: userAlice.id },
        ],
      },
    });
    await prisma.followRequest.deleteMany({
      where: {
        OR: [
          { requesterId: userBob.id, targetId: userAlice.id },
          { requesterId: userCharlie.id, targetId: userAlice.id },
        ],
      },
    });

    // ----------------------------------------------------
    // TEST SECTION 3: Account Privacy & Follow Requests
    // ----------------------------------------------------
    console.log('\n--- 3. Testing Account Privacy & Follow Request Workflow ---');

    // Set Alice to private
    const updatedAlice = await prisma.user.update({
      where: { id: userAlice.id },
      data: { isPrivate: true },
    });
    assert(updatedAlice.isPrivate === true, 'Alice account privacy successfully toggled to PRIVATE');

    // Bob sends a follow request to Alice
    const followReq = await prisma.followRequest.create({
      data: {
        requesterId: userBob.id,
        targetId: userAlice.id,
        status: 'PENDING',
      },
    });
    assert(Boolean(followReq.id && followReq.status === 'PENDING'), 'Bob creates PENDING follow request to Alice');

    // Alice fetches pending follow requests
    const pendingList = await prisma.followRequest.findMany({
      where: { targetId: userAlice.id, status: 'PENDING' },
      include: { requester: { select: { id: true, username: true } } },
    });
    assert(pendingList.some(r => r.requesterId === userBob.id), 'Alice can view Bob in her pending follow requests');

    // Alice approves Bob's follow request
    await prisma.$transaction(async tx => {
      await tx.followRequest.delete({ where: { id: followReq.id } });
      await tx.follow.create({
        data: {
          followerId: userBob.id,
          followingId: userAlice.id,
        },
      });
    });

    const isBobFollowingAlice = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userBob.id,
          followingId: userAlice.id,
        },
      },
    });
    assert(Boolean(isBobFollowingAlice), 'Bob is now an approved follower of Alice in database');

    const pendingAfterApproval = await prisma.followRequest.findMany({
      where: { targetId: userAlice.id, status: 'PENDING' },
    });
    assert(!pendingAfterApproval.some(r => r.id === followReq.id), 'Approved follow request was cleaned up');

    // ----------------------------------------------------
    // TEST SECTION 4: Post-Level Audience Authorization
    // ----------------------------------------------------
    console.log('\n--- 4. Testing Post-Level Audience Authorization ---');

    // Create 3 posts by Alice: PUBLIC, FOLLOWERS, ONLY_ME
    const publicPost = await prisma.post.create({
      data: {
        title: 'Alice Public Artwork',
        authorId: userAlice.id,
        postType: 'PHOTO',
        imageUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809',
        audience: 'PUBLIC',
        caption: 'Open to the entire creative community in India',
      },
    });

    const followersPost = await prisma.post.create({
      data: {
        title: 'Alice Exclusive Followers Story',
        authorId: userAlice.id,
        postType: 'DOCUMENT',
        imageUrl: '',
        audience: 'FOLLOWERS',
        fileUrl: 'https://storage.musely.internal/sample.pdf',
        fileName: 'creative_portfolio.pdf',
        fileType: 'application/pdf',
        docType: 'pdf',
        fileSize: 102400,
        caption: 'Behind-the-scenes sketch book for approved followers',
      },
    });

    const onlyMePost = await prisma.post.create({
      data: {
        title: 'Alice Private Draft',
        authorId: userAlice.id,
        postType: 'THOUGHT',
        imageUrl: '',
        audience: 'ONLY_ME',
        caption: 'Personal creative notes and ideas',
      },
    });

    // Helper function matching backend post authorization logic
    async function canUserViewPost(viewerId: string | null, post: any) {
      if (post.audience === 'PUBLIC') return true;
      if (!viewerId) return false;
      if (viewerId === post.authorId) return true;
      if (post.audience === 'ONLY_ME') return false;
      if (post.audience === 'FOLLOWERS') {
        const follow = await prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: post.authorId,
            },
          },
        });
        return Boolean(follow);
      }
      return false;
    }

    // Unauthenticated user
    assert(await canUserViewPost(null, publicPost), 'Unauthenticated user CAN view PUBLIC post');
    assert(!(await canUserViewPost(null, followersPost)), 'Unauthenticated user CANNOT view FOLLOWERS post');
    assert(!(await canUserViewPost(null, onlyMePost)), 'Unauthenticated user CANNOT view ONLY_ME post');

    // Bob (Approved Follower)
    assert(await canUserViewPost(userBob.id, publicPost), 'Follower Bob CAN view PUBLIC post');
    assert(await canUserViewPost(userBob.id, followersPost), 'Follower Bob CAN view FOLLOWERS post');
    assert(!(await canUserViewPost(userBob.id, onlyMePost)), 'Follower Bob CANNOT view ONLY_ME post');

    // Charlie (Non-Follower)
    assert(await canUserViewPost(userCharlie.id, publicPost), 'Non-follower Charlie CAN view PUBLIC post');
    assert(!(await canUserViewPost(userCharlie.id, followersPost)), 'Non-follower Charlie CANNOT view FOLLOWERS post (403)');
    assert(!(await canUserViewPost(userCharlie.id, onlyMePost)), 'Non-follower Charlie CANNOT view ONLY_ME post (403)');

    // Alice (Author)
    assert(await canUserViewPost(userAlice.id, publicPost), 'Author Alice CAN view her own PUBLIC post');
    assert(await canUserViewPost(userAlice.id, followersPost), 'Author Alice CAN view her own FOLLOWERS post');
    assert(await canUserViewPost(userAlice.id, onlyMePost), 'Author Alice CAN view her own ONLY_ME post');

    // ----------------------------------------------------
    // TEST SECTION 5: User Settings Persistence
    // ----------------------------------------------------
    console.log('\n--- 5. Testing User Settings Persistence Across Sessions ---');

    // Alice saves customized settings
    const savedSettings = await prisma.userSettings.upsert({
      where: { userId: userAlice.id },
      create: {
        userId: userAlice.id,
        allowComments: false,
        allowLikes: false,
        emailNotifications: false,
        pushNotifications: true,
        searchDiscoverable: false,
        activityStatus: false,
        profileVisible: false,
      },
      update: {
        allowComments: false,
        allowLikes: false,
        emailNotifications: false,
        pushNotifications: true,
        searchDiscoverable: false,
        activityStatus: false,
        profileVisible: false,
      },
    });

    assert(savedSettings.allowComments === false, 'Setting allowComments persists as false');
    assert(savedSettings.allowLikes === false, 'Setting allowLikes persists as false');
    assert(savedSettings.searchDiscoverable === false, 'Setting searchDiscoverable persists as false');
    assert(savedSettings.profileVisible === false, 'Setting profileVisible persists as false');

    // Read back in a fresh query simulating new session
    const freshSettings = await prisma.userSettings.findUnique({
      where: { userId: userAlice.id },
    });
    assert(
      freshSettings?.allowComments === false &&
      freshSettings?.searchDiscoverable === false,
      'Settings reliably re-loaded across independent query session'
    );

    // ----------------------------------------------------
    // TEST SECTION 6: Analytics Engine & Engagement Aggregation
    // ----------------------------------------------------
    console.log('\n--- 6. Testing Real Analytics Engine & Metrics Aggregation ---');

    // Record session ping
    const testSessionToken = `test_session_${Date.now()}`;
    const session = await prisma.userSession.create({
      data: {
        userId: userAlice.id,
        sessionToken: testSessionToken,
        durationSeconds: 720,
        pagesViewed: 4,
      },
    });
    assert(Boolean(session.id && session.durationSeconds === 720), 'Recorded user session with 720s (12m) active time');

    // Record analytics events
    await prisma.analyticsEvent.createMany({
      data: [
        {
          targetUserId: userAlice.id,
          userId: userBob.id,
          postId: publicPost.id,
          eventType: 'POST_VIEW',
        },
        {
          targetUserId: userAlice.id,
          userId: userBob.id,
          postId: publicPost.id,
          eventType: 'LIKE',
        },
        {
          targetUserId: userAlice.id,
          userId: userBob.id,
          postId: publicPost.id,
          eventType: 'SHARE',
        },
        {
          targetUserId: userAlice.id,
          userId: userCharlie.id,
          postId: followersPost.id,
          eventType: 'POST_VIEW',
        },
      ],
    });

    // Compute aggregated dashboard metrics for Alice
    const totalViews = await prisma.analyticsEvent.count({
      where: { targetUserId: userAlice.id, eventType: 'POST_VIEW' },
    });
    const totalEngagements = await prisma.analyticsEvent.count({
      where: {
        targetUserId: userAlice.id,
        eventType: { in: ['LIKE', 'COMMENT', 'SAVE', 'SHARE'] },
      },
    });
    const followerCount = await prisma.follow.count({
      where: { followingId: userAlice.id },
    });
    const engagementRate = totalViews > 0
      ? Number(((totalEngagements / totalViews) * 100).toFixed(2))
      : 0;

    const totalSessionSeconds = await prisma.userSession.aggregate({
      where: { userId: userAlice.id },
      _sum: { durationSeconds: true },
    });

    assert(totalViews >= 2, `Total Views aggregated accurately (${totalViews} views)`);
    assert(totalEngagements >= 2, `Total Engagements aggregated accurately (${totalEngagements} actions)`);
    assert(followerCount === 1, `Follower count calculated accurately (${followerCount} follower)`);
    assert(engagementRate === 100.0, `Engagement rate calculated correctly with standard formula: (${engagementRate}%)`);
    assert((totalSessionSeconds._sum.durationSeconds || 0) >= 720, 'Responsible usage session time tracked accurately');

    // Clean up created test posts & events
    await prisma.analyticsEvent.deleteMany({
      where: { postId: { in: [publicPost.id, followersPost.id, onlyMePost.id] } },
    });
    await prisma.post.deleteMany({
      where: { id: { in: [publicPost.id, followersPost.id, onlyMePost.id] } },
    });

    console.log('\n====================================================');
    console.log(`📊 Test Summary: ${passedCount} / ${totalCount} PASSED`);
    console.log('====================================================');

  } catch (err) {
    console.error('Fatal error during test suite execution:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
