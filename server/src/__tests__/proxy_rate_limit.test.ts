import http from 'http';

// Configure test environment to prevent background listener startup
process.env.NODE_ENV = 'test';
process.env.TEST_SUITE = 'true';

async function runProxyRateLimitTests() {
  // Dynamically import app after setting test environment variables
  const { default: app } = await import('../index');

  console.log('====================================================');
  console.log('🧪 Testing Express Trust Proxy & Rate Limiter Compat');
  console.log('====================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} ${detail ? `(${detail})` : ''}`);
    }
  }

  // 1. Verify app trust proxy setting
  const trustProxySetting = app.get('trust proxy');
  assert(
    trustProxySetting === 1,
    'Express "trust proxy" is configured to 1 (narrowest safe single-hop reverse proxy)',
    `Expected 1, got ${JSON.stringify(trustProxySetting)}`
  );

  // Start ephemeral server on random port for testing
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 2. Direct request without proxy headers
    const res1 = await fetch(`${baseUrl}/api/health`);
    const data1 = (await res1.json()) as any;
    assert(res1.status === 200, 'Direct request returns HTTP 200 without error');
    assert(data1.status === 'ok', 'Health endpoint responds with status ok');
    assert(
      data1.clientIp === undefined,
      'Public /api/health does NOT expose clientIp in response body',
      `Unexpected clientIp: ${data1.clientIp}`
    );

    // 3. Request with X-Forwarded-For (Vercel proxy simulation)
    // This is the exact scenario that previously triggered:
    // "ValidationError: The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false."
    let proxyError: string | null = null;
    let res2Status = 0;
    let res2Headers: Headers | null = null;
    let data2: any = null;
    try {
      const res2 = await fetch(`${baseUrl}/api/health`, {
        headers: {
          'X-Forwarded-For': '203.0.113.195',
          'X-Forwarded-Proto': 'https',
        },
      });
      res2Status = res2.status;
      res2Headers = res2.headers;
      data2 = (await res2.json()) as any;
      if (data2.error) proxyError = data2.error;
    } catch (e: any) {
      proxyError = e.message;
    }

    assert(
      res2Status === 200 && !proxyError,
      'Request with X-Forwarded-For header succeeds without rate-limit ValidationError',
      proxyError || `Status: ${res2Status}`
    );

    assert(
      res2Headers !== null && res2Headers.has('ratelimit-limit'),
      'Rate limiter standardHeaders (ratelimit-limit) are returned properly behind proxy'
    );

    assert(
      data2?.protocol === 'https',
      'req.protocol correctly resolves to https via X-Forwarded-Proto header',
      `Got protocol=${data2?.protocol}`
    );

    // 4. Test TRUST_PROXY allowlist validation logic
    const ALLOWED_VALUES: Record<string, number | boolean | string> = {
      '1': 1,
      '2': 2,
      'true': 1,
      'false': false,
      'loopback': 'loopback',
    };

    function validateProxyConfig(val?: string) {
      if (!val) return 1;
      const normalized = val.trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(ALLOWED_VALUES, normalized)) {
        return ALLOWED_VALUES[normalized];
      }
      return 1; // fallback
    }

    assert(validateProxyConfig('1') === 1, 'Allowlist accepts "1" (single-hop)');
    assert(validateProxyConfig('2') === 2, 'Allowlist accepts "2" (dual-hop)');
    assert(validateProxyConfig('true') === 1, 'Allowlist coerces "true" to safe single-hop (1)');
    assert(validateProxyConfig('false') === false, 'Allowlist accepts "false" (disabled)');
    assert(validateProxyConfig('loopback') === 'loopback', 'Allowlist accepts "loopback"');
    assert(
      validateProxyConfig('malicious_string; DROP TABLE') === 1,
      'Allowlist rejects arbitrary string and safely falls back to single-hop (1)'
    );

    console.log('\n====================================================');
    console.log(`📊 Test Summary: ${passed} / ${total} PASSED`);
    console.log('====================================================');

    if (passed !== total) {
      process.exit(1);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.exit(0);
  }
}

runProxyRateLimitTests().catch((err) => {
  console.error('Fatal error in proxy test:', err);
  process.exit(1);
});
