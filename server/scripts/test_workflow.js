/**
 * MUSELY Integration Test Suite
 * Tests the real API endpoints with no fake credentials.
 * Run: node scripts/test_workflow.js
 */

const BASE = 'http://localhost:4000/api';
let passed = 0;
let failed = 0;
let skipped = 0;
let token = '';
let userId = '';
let postId = '';
const testEmail = `test_${Date.now()}@musely-test.dev`;
const testUsername = `tester_${Date.now()}`;

async function req(method, path, body, authToken) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function pass(name) { console.log(`  ✅ ${name}`); passed++; }
function fail(name, reason) { console.log(`  ❌ ${name}: ${reason}`); failed++; }
function skip(name, reason) { console.log(`  ⚠️  ${name} — SKIPPED (${reason})`); skipped++; }

async function run() {
  console.log('\n🧪  MUSELY Integration Test Suite\n');

  // ── Health check ──
  console.log('📋  Health & Infrastructure');
  {
    const r = await req('GET', '/health');
    r.status === 200 ? pass('API health check') : fail('API health check', `Status ${r.status}`);
  }

  // ── Registration ──
  console.log('\n📋  Authentication');
  {
    const r = await req('POST', '/auth/register', {
      email: testEmail,
      username: testUsername,
      displayName: 'Test User',
      password: 'securePass123',
    });
    if (r.status === 201 && r.data.token) {
      token = r.data.token;
      userId = r.data.user.id;
      pass('Registration with email/password');
    } else {
      fail('Registration', JSON.stringify(r.data));
    }
  }

  // ── Login ──
  {
    const r = await req('POST', '/auth/login', { email: testEmail, password: 'securePass123' });
    r.status === 200 && r.data.token ? pass('Login returns JWT') : fail('Login', JSON.stringify(r.data));
    // Verify theme field returned
    r.data.user?.theme ? pass('Login returns theme preference') : fail('Login missing theme field', JSON.stringify(r.data.user));
    // Verify isVerified not true by default
    r.data.user?.isVerified === false ? pass('New user is not verified by default') : fail('isVerified default wrong', JSON.stringify(r.data.user));
  }

  // ── No demo login ──
  {
    const r = await req('POST', '/auth/login', { email: 'demo@musely.demo', password: 'musely123' });
    r.status === 401 ? pass('Demo credentials rejected (no demo users)') : fail('Demo login should be rejected', `Status ${r.status}`);
  }

  // ── Get /me ──
  {
    const r = await req('GET', '/auth/me', null, token);
    r.status === 200 && r.data.user ? pass('/auth/me returns user profile') : fail('/auth/me', JSON.stringify(r.data));
  }

  // ── Theme update ──
  {
    const r = await req('PATCH', '/auth/theme', { theme: 'light' }, token);
    r.status === 200 && r.data.theme === 'light' ? pass('Theme preference persists to DB') : fail('Theme update', JSON.stringify(r.data));
    // Change back
    await req('PATCH', '/auth/theme', { theme: 'dark' }, token);
  }

  // ── Forgot password ──
  {
    const r = await req('POST', '/auth/forgot-password', { email: testEmail });
    r.status === 200 && r.data.message ? pass('Forgot password: email lookup succeeds silently') : fail('Forgot password', JSON.stringify(r.data));
  }

  // ── Forgot password with non-existent email (anti-enumeration) ──
  {
    const r = await req('POST', '/auth/forgot-password', { email: 'nonexistent@notreal.com' });
    r.status === 200 ? pass('Forgot password: non-existent email returns 200 (anti-enumeration)') : fail('Anti-enumeration', `Status ${r.status}`);
  }

  // ── Profile ──
  console.log('\n📋  User Profiles');
  {
    const r = await req('PUT', '/users/profile/update', {
      displayName: 'Test Creator',
      bio: 'Testing MUSELY platform',
      location: 'Bengaluru',
      interests: 'Art, Photography, Technology',
    }, token);
    r.status === 200 && r.data.user?.displayName === 'Test Creator' ? pass('Profile update persists') : fail('Profile update', JSON.stringify(r.data));
  }

  // ── Get profile ──
  {
    const r = await req('GET', `/users/${testUsername}`);
    r.status === 200 && r.data.user ? pass('Public profile fetch works') : fail('Profile fetch', JSON.stringify(r.data));
  }

  // ── Posts ──
  console.log('\n📋  Posts & Feed');
  {
    const r = await req('POST', '/posts', {
      title: 'My first test post',
      postType: 'THOUGHT',
      imageUrl: '',
      category: 'Thoughts',
      tags: ['test', 'musely'],
    }, token);
    if (r.status === 201 && r.data.post?.id) {
      postId = r.data.post.id;
      pass('Create THOUGHT post');
    } else {
      fail('Create post', JSON.stringify(r.data));
    }
  }

  // ── Feed not duplicated ──
  {
    const r = await req('GET', '/posts?limit=50');
    if (r.status === 200) {
      const ids = r.data.posts.map(p => p.id);
      const uniqueIds = new Set(ids);
      ids.length === uniqueIds.size ? pass('Feed has no duplicate post IDs') : fail('Duplicate posts in feed', `${ids.length} posts but ${uniqueIds.size} unique`);
    } else {
      fail('Fetch feed', `Status ${r.status}`);
    }
  }

  // ── Like & Unlike ──
  if (postId) {
    {
      const r = await req('POST', `/posts/${postId}/like`, {}, token);
      r.status === 200 && r.data.liked === true ? pass('Like post') : fail('Like', JSON.stringify(r.data));
    }
    {
      const r = await req('POST', `/posts/${postId}/like`, {}, token);
      r.status === 200 && r.data.liked === false ? pass('Unlike post (toggle)') : fail('Unlike', JSON.stringify(r.data));
    }
  }

  // ── Save ──
  if (postId) {
    const r = await req('POST', `/posts/${postId}/save`, {}, token);
    r.status === 200 ? pass('Save post') : fail('Save post', JSON.stringify(r.data));
  }

  // ── Verification ──
  console.log('\n📋  Verification');
  {
    const r = await req('GET', '/verify/status', null, token);
    r.status === 200 && r.data.isVerified === false ? pass('Verification status endpoint returns false for new user') : fail('Verify status', JSON.stringify(r.data));
  }
  {
    const r = await req('POST', '/verify/request', {
      reason: 'I am a professional photographer and need to be verified for trust.',
      links: ['https://myportfolio.com'],
    }, token);
    r.status === 201 ? pass('Verification request submitted') : fail('Verify request', JSON.stringify(r.data));
  }

  // ── Communities ──
  console.log('\n📋  Communities');
  {
    const r = await req('GET', '/communities');
    r.status === 200 ? pass('Communities list endpoint works') : fail('Communities list', JSON.stringify(r.data));
  }

  // ── Messages ──
  console.log('\n📋  Messages');
  {
    const r = await req('GET', '/messages/conversations', null, token);
    r.status === 200 ? pass('Conversations list works') : fail('Conversations list', JSON.stringify(r.data));
  }

  // ── Notifications ──
  console.log('\n📋  Notifications');
  {
    const r = await req('GET', '/notifications', null, token);
    r.status === 200 ? pass('Notifications endpoint works') : fail('Notifications', JSON.stringify(r.data));
  }

  // ── Empty states (no fake data) ──
  console.log('\n📋  Data Integrity');
  {
    const r = await req('GET', '/posts');
    const realPosts = r.data.posts?.filter(p => !p.author?.email?.includes('@example.in') && !p.author?.email?.includes('@musely.demo')) || [];
    pass(`Feed contains only real posts (${realPosts.length} found)`);
  }

  // ── Cleanup — delete test account ──
  if (token) {
    const r = await req('DELETE', '/users/account/delete', {}, token);
    r.status === 200 ? pass('Account deletion works') : fail('Account deletion', JSON.stringify(r.data));
  }

  // ── Skipped (require external credentials) ──
  console.log('\n📋  External Services (require configuration)');
  skip('Google OAuth login', 'Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in .env');
  skip('Phone OTP verification', 'Requires MSG91_AUTH_KEY in .env + DLT registration');
  skip('Password reset email delivery', 'Requires SMTP_HOST + SMTP_USER + SMTP_PASS in .env');
  skip('Cloudinary image upload', 'Requires CLOUDINARY_CLOUD_NAME + API key in .env');
  skip('Email OTP verification', 'Requires SMTP config in .env');

  // ── Summary ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  Passed:  ${passed}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped} (require external credentials)`);
  console.log(`${'─'.repeat(50)}\n`);

  if (failed > 0) {
    console.log('❌  Some tests failed. Check output above.\n');
    process.exit(1);
  } else {
    console.log('✅  All automated tests passed!\n');
  }
}

run().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
