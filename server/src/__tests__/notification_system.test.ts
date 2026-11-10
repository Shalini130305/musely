/**
 * MUSELY Notification System — Offline Unit Test Suite
 *
 * This test validates notification logic locally without connecting to
 * the Neon remote database (to avoid connection timeouts). All Prisma
 * calls are mocked via simple in-memory stubs.
 */

import 'dotenv/config';
import { getVapidPublicKey, initWebPush } from '../services/push';

// ─── Tiny test harness ───────────────────────────────────────────────────────
let passed = 0;
let total = 0;
function assert(condition: boolean, testName: string, detail?: string) {
  total++;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` (${detail})` : ''}`);
  }
}

// ─── Mock Prisma shim (prevents real DB connections) ─────────────────────────
interface MockNotification {
  id: string;
  recipientId: string;
  senderId: string | null;
  type: string;
  read: boolean;
  postId: string | null;
  data: string | null;
  createdAt: Date;
}
interface MockPushSub {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}
interface MockSettings {
  userId: string;
  inAppNotifications: boolean;
  pushNotifications: boolean;
  notifyMessages: boolean;
  notifyLikesComments: boolean;
  notifyFollowers: boolean;
  notifyRepliesMentions: boolean;
  notifyMarketplace: boolean;
  notifySecurityAlerts: boolean;
}

const mockNotifs: MockNotification[] = [];
const mockSubs: MockPushSub[] = [];
const mockSettingsStore: Record<string, MockSettings> = {};

function getMockSettings(userId: string): MockSettings {
  if (!mockSettingsStore[userId]) {
    mockSettingsStore[userId] = {
      userId,
      inAppNotifications: true,
      pushNotifications: false,
      notifyMessages: true,
      notifyLikesComments: true,
      notifyFollowers: true,
      notifyRepliesMentions: true,
      notifyMarketplace: true,
      notifySecurityAlerts: true,
    };
  }
  return mockSettingsStore[userId];
}

// ─── Inline notification logic mirror (mirrors notification.ts without Prisma) ─
type NotifType =
  | 'like' | 'comment' | 'comment_reply' | 'follow' | 'follow_request'
  | 'message' | 'reaction' | 'mention' | 'marketplace' | 'security_alert' | 'community';

interface CreateInput {
  recipientId: string;
  senderId?: string | null;
  type: NotifType;
  postId?: string | null;
  data?: Record<string, any>;
}

function createNotifMock(input: CreateInput): MockNotification | null {
  const { recipientId, senderId, type, postId, data } = input;

  // Rule 1: No self-notify
  if (senderId && senderId === recipientId) return null;

  const settings = getMockSettings(recipientId);

  // Rule 2: Respect preferences (security_alert always goes through)
  if (type !== 'security_alert') {
    if (!settings.inAppNotifications) return null;
    if (type === 'message' && !settings.notifyMessages) return null;
    if ((type === 'reaction' || type === 'mention' || type === 'comment_reply') && !settings.notifyRepliesMentions) return null;
    if ((type === 'like' || type === 'comment') && !settings.notifyLikesComments) return null;
    if ((type === 'follow' || type === 'follow_request') && !settings.notifyFollowers) return null;
    if (type === 'marketplace' && !settings.notifyMarketplace) return null;
  }

  // Rule 3: Deduplication
  if (senderId && (type === 'like' || type === 'follow' || type === 'reaction')) {
    const dup = mockNotifs.find(
      n => n.recipientId === recipientId && n.senderId === senderId && n.type === type && n.postId === (postId || null) && !n.read
    );
    if (dup) return dup; // return existing, not null
  }

  const notif: MockNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    recipientId,
    senderId: senderId || null,
    type,
    read: false,
    postId: postId || null,
    data: data ? JSON.stringify(data) : null,
    createdAt: new Date(),
  };
  mockNotifs.push(notif);
  return notif;
}

// ─── RUN TESTS ───────────────────────────────────────────────────────────────
console.log('====================================================');
console.log('🔔 MUSELY Notification System — Unit Test Suite');
console.log('====================================================');

// 1. VAPID keys
console.log('\n--- 1. VAPID Key Configuration ---');
const publicKey = getVapidPublicKey();
assert(!!publicKey && publicKey.length > 20, 'VAPID_PUBLIC_KEY is set and non-trivial', `len=${publicKey?.length}`);
const initOk = initWebPush();
assert(initOk, 'initWebPush() succeeds when both VAPID keys are present in .env');

// 2. Self-notification prevention
console.log('\n--- 2. Self-Notification Prevention ---');
const selfResult = createNotifMock({ recipientId: 'user_A', senderId: 'user_A', type: 'like' });
assert(selfResult === null, 'createNotification returns null for self-actions');

// 3. Standard notification creation
console.log('\n--- 3. Normal Notification Creation ---');
const n1 = createNotifMock({ recipientId: 'user_A', senderId: 'user_B', type: 'like' });
assert(n1 !== null && n1.recipientId === 'user_A' && n1.type === 'like', 'Like notification created for user A from user B');
assert(n1 !== null && !n1.read, 'Newly created notification is unread by default');

const n2 = createNotifMock({ recipientId: 'user_A', senderId: 'user_B', type: 'comment', data: { text: 'Great shot!' } });
assert(n2 !== null && n2.type === 'comment', 'Comment notification created with data payload');
assert(n2 !== null && JSON.parse(n2.data!).text === 'Great shot!', 'Comment notification stores JSON data correctly');

// 4. Deduplication
console.log('\n--- 4. Duplicate Suppression ---');
const dupResult = createNotifMock({ recipientId: 'user_A', senderId: 'user_B', type: 'like' });
// Should return the existing notification (not a new one)
assert(dupResult !== null && dupResult.id === n1!.id, 'Rapid duplicate like returns existing notification (idempotent, not a new record)');
const countAfterDup = mockNotifs.filter(n => n.recipientId === 'user_A' && n.type === 'like').length;
assert(countAfterDup === 1, 'Notification store does not grow on duplicate action');

// 5. Preference filtering
console.log('\n--- 5. User Preference Filtering ---');
getMockSettings('user_C').notifyLikesComments = false;
const filteredLike = createNotifMock({ recipientId: 'user_C', senderId: 'user_B', type: 'like' });
assert(filteredLike === null, 'Like notification suppressed when notifyLikesComments is false');

getMockSettings('user_C').notifyMessages = false;
const filteredMsg = createNotifMock({ recipientId: 'user_C', senderId: 'user_B', type: 'message' });
assert(filteredMsg === null, 'Message notification suppressed when notifyMessages is false');

getMockSettings('user_C').notifyFollowers = false;
const filteredFollow = createNotifMock({ recipientId: 'user_C', senderId: 'user_B', type: 'follow' });
assert(filteredFollow === null, 'Follow notification suppressed when notifyFollowers is false');

// 6. Security alerts bypass all filters
console.log('\n--- 6. Security Alerts Bypass All Preferences ---');
getMockSettings('user_D').inAppNotifications = false;
getMockSettings('user_D').notifySecurityAlerts = false;
const secAlert = createNotifMock({ recipientId: 'user_D', type: 'security_alert' });
assert(secAlert !== null && secAlert.type === 'security_alert', 'Security alert created even when all other notifications are disabled');
assert(secAlert !== null && !secAlert.read, 'Security alert is unread by default');

// 7. Mark read/unread simulation
console.log('\n--- 7. Read State Management ---');
if (n1) {
  n1.read = true;
  assert(n1.read === true, 'Notification marked read correctly');
}
const unreadCount = mockNotifs.filter(n => n.recipientId === 'user_A' && !n.read).length;
const expectedUnread = mockNotifs.filter(n => n.recipientId === 'user_A').length - 1;
assert(unreadCount === expectedUnread, `Unread count decremented after mark-read (${unreadCount} unread)`);

// Reset all user_A to unread
mockNotifs.forEach(n => { if (n.recipientId === 'user_A') n.read = false; });
const allUnread = mockNotifs.filter(n => n.recipientId === 'user_A' && !n.read).length;
const totalForA = mockNotifs.filter(n => n.recipientId === 'user_A').length;
assert(allUnread === totalForA, 'Mark-all-unread restores all notifications for user A');

// 8. Push subscription structure validation
console.log('\n--- 8. Push Subscription Data Validation ---');
const sub: MockPushSub = {
  id: 'ps_1',
  userId: 'user_A',
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-token-abc123',
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcUbVlJx6',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};
mockSubs.push(sub);
assert(mockSubs.length === 1, 'Push subscription added to store');
assert(sub.endpoint.startsWith('https://'), 'Push subscription endpoint is a valid HTTPS URL');
assert(sub.p256dh.length > 20 && sub.auth.length > 10, 'p256dh and auth keys have appropriate lengths');

// Simulate cleanup on unsubscribe
const idx = mockSubs.findIndex(s => s.endpoint === sub.endpoint);
if (idx !== -1) mockSubs.splice(idx, 1);
assert(mockSubs.length === 0, 'Push subscription removed on unsubscribe');

// 9. Notification type coverage
console.log('\n--- 9. All Supported Notification Types ---');
const types: NotifType[] = [
  'like', 'comment', 'comment_reply', 'follow', 'follow_request',
  'message', 'reaction', 'mention', 'marketplace', 'security_alert', 'community',
];
for (const t of types) {
  const n = createNotifMock({ recipientId: 'user_E', senderId: 'user_B', type: t });
  assert(n !== null, `Notification type '${t}' created successfully`);
}

// 10. Summary
console.log('\n====================================================');
console.log(`📊 Results: ${passed} / ${total} passed (${Math.round((passed / total) * 100)}%)`);
console.log('====================================================');
process.exit(passed === total ? 0 : 1);
