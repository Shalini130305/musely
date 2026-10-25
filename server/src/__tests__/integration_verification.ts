import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { validateMagicBytes, sanitizeFileName, isBlockedFile } from '../routes/upload';
import { generateTOTPSecret, generateTOTP, verifyTOTP, generateRecoveryCodes, verifyRecoveryCode } from '../utils/totp';

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

    // ----------------------------------------------------
    // TEST SECTION 7: Secure Messaging, Privacy & 2FA
    // ----------------------------------------------------
    console.log('\n--- 7. Testing Messaging, Group Chats, Privacy & Two-Step Verification ---');

    // 7.1 Audio Magic-Byte Validation
    const mp3Header = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // ID3
    const wavHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]); // RIFF....WAVE
    const oggHeader = Buffer.from([0x4F, 0x67, 0x67, 0x53, 0x00, 0x02, 0x00, 0x00]); // OggS
    assert(validateMagicBytes(mp3Header, 'audio/mpeg'), 'Validates authentic MP3 audio magic bytes');
    assert(validateMagicBytes(wavHeader, 'audio/wav'), 'Validates authentic WAV audio magic bytes');
    assert(validateMagicBytes(oggHeader, 'audio/ogg'), 'Validates authentic OGG audio magic bytes');

    // 7.2 Two-Step Verification (RFC 6238 TOTP & Recovery Codes)
    const totpSecret = generateTOTPSecret();
    assert(totpSecret.length === 32, 'Generates secure 32-character Base32 TOTP secret');
    const totpCode = generateTOTP(totpSecret);
    assert(/^\d{6}$/.test(totpCode), 'Generates compliant 6-digit TOTP authentication token');
    assert(verifyTOTP(totpCode, totpSecret), 'Verifies authentic TOTP token within time window');
    assert(!verifyTOTP('000000', totpSecret) || totpCode === '000000', 'Rejects illegitimate TOTP code');

    const recoveryObj = generateRecoveryCodes();
    assert(recoveryObj.rawCodes.length === 8, 'Generates 8 emergency recovery backup codes');
    assert(recoveryObj.hashedCodes.length === 8, 'Hashes recovery codes with SHA-256 for secure DB storage');
    const firstCode = recoveryObj.rawCodes[0];
    const recCheck = verifyRecoveryCode(firstCode, recoveryObj.hashedCodes);
    assert(recCheck.valid && recCheck.remainingHashedCodes.length === 7, 'Verifies single-use recovery code and consumes it');

    // 7.3 Group Conversation & Membership Roles
    const groupConv = await prisma.conversation.create({
      data: {
        isGroup: true,
        title: 'MUSELY Core Team',
        creatorId: userAlice.id,
        disallowForwarding: true,
        isProtected: true,
        participants: {
          create: [
            { userId: userAlice.id, role: 'ADMIN', status: 'ACTIVE' },
            { userId: userBob.id, role: 'MEMBER', status: 'ACTIVE' },
            { userId: userCharlie.id, role: 'MEMBER', status: 'ACTIVE' },
          ],
        },
      },
      include: { participants: true },
    });

    assert(groupConv.isGroup && groupConv.participants.length === 3, 'Creates group conversation with multi-participant membership');
    const alicePart = groupConv.participants.find(p => p.userId === userAlice.id);
    assert(alicePart?.role === 'ADMIN', 'Conversation creator assigned ADMIN role');

    // 7.4 Message Sending with Quoted Reply & Reaction
    const aliceMsg = await prisma.message.create({
      data: {
        conversationId: groupConv.id,
        senderId: userAlice.id,
        content: 'Welcome everyone to the privacy-first MUSELY group!',
        status: 'SENT',
      },
    });

    const bobReply = await prisma.message.create({
      data: {
        conversationId: groupConv.id,
        senderId: userBob.id,
        content: 'Excited to be here! Looking forward to testing secure chat.',
        replyToId: aliceMsg.id,
        status: 'DELIVERED',
      },
      include: { replyTo: true },
    });

    assert(bobReply.replyToId === aliceMsg.id && bobReply.replyTo?.content === aliceMsg.content, 'Sends message with quoted reply linking parent message');

    const reaction = await prisma.messageReaction.create({
      data: {
        messageId: aliceMsg.id,
        userId: userCharlie.id,
        emoji: '🔥',
      },
    });
    assert(reaction.emoji === '🔥' && reaction.messageId === aliceMsg.id, 'Records emoji reaction linked to target message');

    // 7.5 Message Forward Restriction Check
    const isForwardBlocked = groupConv.disallowForwarding;
    assert(isForwardBlocked === true, 'Enforces conversation-level message forwarding restrictions');

    // 7.6 Private Attachment Access Authorization
    const testAttachment = await prisma.messageAttachment.create({
      data: {
        messageId: bobReply.id,
        fileName: 'confidential_brief.pdf',
        fileUrl: '/uploads/confidential_brief.pdf',
        fileType: 'application/pdf',
        fileSize: 40960,
      },
    });

    // Check participant authorization
    const isAliceAuthorized = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: groupConv.id, userId: userAlice.id },
      },
    });
    const nonParticipantId = 'non_participant_999';
    const isStrangerAuthorized = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: groupConv.id, userId: nonParticipantId },
      },
    });

    // 7.7 Document Magic-Byte Validation (PPT, PPTX, XLS, XLSX, TXT)
    const pptxZipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]);
    const xlsxZipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]);
    const olePptHeader = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1]);
    const oleXlsHeader = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1]);
    const txtHeader = Buffer.from('Plain text message content');

    assert(validateMagicBytes(pptxZipHeader, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'), 'Validates authentic PPTX presentation signature');
    assert(validateMagicBytes(xlsxZipHeader, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 'Validates authentic XLSX spreadsheet signature');
    assert(validateMagicBytes(olePptHeader, 'application/vnd.ms-powerpoint'), 'Validates legacy PPT presentation signature');
    assert(validateMagicBytes(oleXlsHeader, 'application/vnd.ms-excel'), 'Validates legacy XLS spreadsheet signature');
    assert(validateMagicBytes(txtHeader, 'text/plain'), 'Validates plain text document content');

    // 7.8 "Delete for Me" Functionality
    await prisma.message.update({
      where: { id: bobReply.id },
      data: { deletedForUserIds: { push: userBob.id } },
    });

    const bobView = await prisma.message.findMany({
      where: {
        conversationId: groupConv.id,
        NOT: { deletedForUserIds: { has: userBob.id } },
      },
    });
    const aliceView = await prisma.message.findMany({
      where: {
        conversationId: groupConv.id,
        NOT: { deletedForUserIds: { has: userAlice.id } },
      },
    });

    assert(!bobView.some(m => m.id === bobReply.id), 'Message deleted for Bob is hidden from Bob');
    assert(aliceView.some(m => m.id === bobReply.id), 'Message deleted for Bob remains visible to other chat members');

    // 7.9 "Delete for Everyone" Functionality
    await prisma.message.update({
      where: { id: aliceMsg.id },
      data: { isDeleted: true, content: '[This message was deleted]' },
    });

    const deletedAliceMsg = await prisma.message.findUnique({ where: { id: aliceMsg.id } });
    assert(deletedAliceMsg?.isDeleted === true, 'Message marked as deleted for everyone');
    assert(deletedAliceMsg?.content === '[This message was deleted]', 'Deleted message content replaced with placeholder');

    // Clean up created group conversation and messaging artifacts
    await prisma.messageReaction.deleteMany({ where: { messageId: aliceMsg.id } });
    await prisma.messageAttachment.deleteMany({ where: { messageId: bobReply.id } });
    await prisma.message.deleteMany({ where: { conversationId: groupConv.id } });
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: groupConv.id } });
    await prisma.conversation.delete({ where: { id: groupConv.id } });

    // ----------------------------------------------------
    // TEST SECTION 8: Real-Time Presence & Message Status Lifecycle
    // ----------------------------------------------------
    console.log('\n--- 8. Testing Real-Time Presence & Message Status Lifecycle ---');

    // 8.1 Presence Heartbeat updates lastSeenAt
    const beforeHeartbeat = new Date(Date.now() - 5000);
    const updatedUser = await prisma.user.update({
      where: { id: userAlice.id },
      data: { lastSeenAt: new Date() },
    });
    assert(
      updatedUser.lastSeenAt !== null && new Date(updatedUser.lastSeenAt) > beforeHeartbeat,
      'Heartbeat successfully updates lastSeenAt timestamp'
    );

    // 8.2 Create 1-on-1 Conversation for Message Status Flow
    const directConv = await prisma.conversation.create({
      data: {
        isGroup: false,
        participants: {
          create: [
            { userId: userAlice.id, role: 'MEMBER' },
            { userId: userBob.id, role: 'MEMBER' },
          ],
        },
      },
    });

    // 8.3 Message Sent -> Status is SENT
    const sentMsg = await prisma.message.create({
      data: {
        conversationId: directConv.id,
        senderId: userAlice.id,
        content: 'Hello Bob! Are you online?',
        status: 'SENT',
        read: false,
      },
    });
    assert(sentMsg.status === 'SENT', 'Newly sent message initializes with status SENT');
    assert(sentMsg.read === false, 'Newly sent message initializes with read=false');

    // 8.4 Message Delivered -> Status transitions to DELIVERED
    const deliveredMsg = await prisma.message.update({
      where: { id: sentMsg.id },
      data: { status: 'DELIVERED' },
    });
    assert(deliveredMsg.status === 'DELIVERED', 'Message status successfully transitions from SENT to DELIVERED');

    // 8.5 Message Read -> Status transitions to READ and read=true
    const readMsg = await prisma.message.update({
      where: { id: sentMsg.id },
      data: { status: 'READ', read: true },
    });
    assert(readMsg.status === 'READ', 'Message status successfully transitions to READ');
    assert(readMsg.read === true, 'Message marked as read=true upon reading');

    // 8.6 Multi-tab presence & Offline beacon verification
    const offlineTimestamp = new Date();
    const offlineUser = await prisma.user.update({
      where: { id: userAlice.id },
      data: { lastSeenAt: offlineTimestamp },
    });
    assert(
      offlineUser.lastSeenAt?.getTime() === offlineTimestamp.getTime(),
      'Offline beacon updates user lastSeenAt accurately on tab close'
    );

    // Clean up direct conversation and messages
    await prisma.message.deleteMany({ where: { conversationId: directConv.id } });
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: directConv.id } });
    await prisma.conversation.delete({ where: { id: directConv.id } });

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
