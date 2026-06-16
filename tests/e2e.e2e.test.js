// ══════════════════════════════════════════════
// TRACE — E2E API Tests
// Tests core server flows: health, auth, subscription, timeline
// Run: npx playwright test tests/e2e.e2e.test.js
// ══════════════════════════════════════════════

const { test, expect } = require('@playwright/test');

const API_BASE = 'http://localhost:3000';
const ADMIN_TOKEN = 'trace-admin-demo-2024'; // Matches server default

// ── Test data ──
const TEST_USER = {
  name: 'E2E Test User',
  email: 'e2e_' + Date.now() + '@test.trace',
  password: 'testpass123!'
};

let authToken = null;
let csrfToken = null;

// Helper: login to get a fresh CSRF token
async function loginForCsrf(request) {
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password }
  });
  if (res.ok()) {
    const body = await res.json();
    return body.csrfToken || '';
  }
  return '';
}

// ══════════════════════════════════════════════
// Health Check
// ══════════════════════════════════════════════

test('GET /health returns server status', async ({ request }) => {
  const res = await request.get(`${API_BASE}/health`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('status', 'ok');
  expect(body).toHaveProperty('service', 'TRACE API Proxy v3.1');
  expect(body).toHaveProperty('uptime');
  expect(typeof body.uptime).toBe('number');
});

test('GET /health reports API key status', async ({ request }) => {
  const res = await request.get(`${API_BASE}/health`);
  const body = await res.json();
  expect(['configured', 'missing']).toContain(body.apiKey);
});

test('GET /health reports subscription count', async ({ request }) => {
  const res = await request.get(`${API_BASE}/health`);
  const body = await res.json();
  expect(typeof body.subscriptions).toBe('number');
});

// ══════════════════════════════════════════════
// Auth — Registration
// ══════════════════════════════════════════════

test('POST /api/auth/register creates new user', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/register`, {
    data: TEST_USER
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('ok', true);
  expect(body).toHaveProperty('token');
  expect(body).toHaveProperty('csrfToken');
  expect(body).toHaveProperty('user');
  expect(body.user.email).toBe(TEST_USER.email);
  expect(body.user.tier).toBe('discover');

  // Store for later tests
  authToken = body.token;
  csrfToken = body.csrfToken;
});

test('POST /api/auth/register rejects missing fields', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/register`, {
    data: { email: '', password: '' }
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toHaveProperty('error');
});

test('POST /api/auth/register rejects short passwords', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/register`, {
    data: { email: 'short@test.com', password: '123' }
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toContain('8 characters');
});

test('POST /api/auth/register rejects duplicate email', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/register`, {
    data: TEST_USER
  });
  expect(res.status()).toBe(409);
  const body = await res.json();
  expect(body.error).toContain('already exists');
});

// ══════════════════════════════════════════════
// Auth — Login
// ══════════════════════════════════════════════

test('POST /api/auth/login with valid credentials', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: TEST_USER.email, password: TEST_USER.password }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('ok', true);
  expect(body).toHaveProperty('token');
  expect(body).toHaveProperty('csrfToken');
  expect(body.user.email).toBe(TEST_USER.email);
  expect(body.user.tier).toBe('discover');
});

test('POST /api/auth/login with wrong password', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: TEST_USER.email, password: 'wrongpassword!' }
  });
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error).toContain('Invalid');
});

test('POST /api/auth/login with non-existent user', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: 'nobody@nonexistent.com', password: 'testpass123!' }
  });
  expect(res.status()).toBe(401);
});

// ══════════════════════════════════════════════
// Auth — Token Verification
// ══════════════════════════════════════════════

test('POST /api/auth/verify with valid token', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/verify`, {
    data: { token: authToken }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('authenticated', true);
  expect(body.user.email).toBe(TEST_USER.email);
});

test('POST /api/auth/verify with invalid token', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/verify`, {
    data: { token: 'invalid-token-here' }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('authenticated', false);
});

test('POST /api/auth/verify with empty token', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/auth/verify`, {
    data: { token: '' }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('authenticated', false);
});

// ══════════════════════════════════════════════
// Subscription — Create License Key
// ══════════════════════════════════════════════

test('POST /api/subscribe creates license key (with admin token)', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/subscribe`, {
    data: {
      tier: 'collector',
      owner: 'E2E Test Owner',
      adminToken: ADMIN_TOKEN
    }
  });
  // Debug: capture actual status + body on failure
  const body = await res.json();
  if (!res.ok()) {
    console.log('Subscribe failed:', res.status(), JSON.stringify(body));
  }
  expect(res.ok()).toBeTruthy();
  expect(body).toHaveProperty('ok', true);
  expect(body).toHaveProperty('licenseKey');
  expect(body.licenseKey).toMatch(/^TRACE-/);
  expect(body).toHaveProperty('token');
  expect(body.tier).toBe('collector');
});

test('POST /api/subscribe works without admin token on localhost (auto-generated secret)', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/subscribe`, {
    data: {
      tier: 'professional',
      owner: 'Localhost Test'
    }
  });
  // With auto-generated ADMIN_SECRET on localhost, the admin token check is bypassed
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('ok', true);
  expect(body).toHaveProperty('licenseKey');
});

test('POST /api/subscribe rejects invalid tier', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/subscribe`, {
    data: {
      tier: 'nonexistent',
      owner: 'Test',
      adminToken: ADMIN_TOKEN
    }
  });
  expect(res.ok()).toBeFalsy();
  const body = await res.json();
  expect(body).toHaveProperty('error');
});

// ══════════════════════════════════════════════
// Subscription — Verify
// ══════════════════════════════════════════════

test('POST /api/verify-subscription with valid license key', async ({ request }) => {
  // First create a key
  const createRes = await request.post(`${API_BASE}/api/subscribe`, {
    data: {
      tier: 'professional',
      owner: 'Verify Test',
      adminToken: ADMIN_TOKEN
    }
  });
  expect(createRes.ok()).toBeTruthy();
  const { licenseKey } = await createRes.json();

  // Then verify it — server returns 200 with { ok: true, tier, owner, expiresAt, token }
  const verifyRes = await request.post(`${API_BASE}/api/verify-subscription`, {
    data: { licenseKey }
  });
  expect(verifyRes.ok()).toBeTruthy();
  const body = await verifyRes.json();
  expect(body).toHaveProperty('ok', true);
  expect(body.tier).toBe('professional');
  expect(body).toHaveProperty('token');
});

test('POST /api/verify-subscription with garbage key', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/verify-subscription`, {
    data: { licenseKey: 'TRACE-000000-000000-000000-000000' }
  });
  // Server returns 401 for invalid keys, not 200
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body).toHaveProperty('error');
});

// ══════════════════════════════════════════════
// Subscription — Status
// ══════════════════════════════════════════════

test('GET /api/subscription-status returns active subscriptions', async ({ request }) => {
  const res = await request.get(`${API_BASE}/api/subscription-status`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('subscriptions');
  expect(Array.isArray(body.subscriptions)).toBeTruthy();
  // Should have at least the key we created
  expect(body.subscriptions.length).toBeGreaterThanOrEqual(1);
});

// ══════════════════════════════════════════════
// Timeline — Save / List / Delete
// ══════════════════════════════════════════════

const testTimeline = {
  title: 'E2E Test Timeline',
  sub: 'Test Artist, 1600',
  type: 'artwork',
  events: [
    { year: '1600', event: 'Created', detail: 'Painted in Rome', category: 'creation' },
    { year: '1650', event: 'Sold', detail: 'Private collection, Florence', category: 'ownership' },
    { year: '1800', event: 'Exhibited', detail: 'Museo Nazionale, Naples', category: 'exhibition' }
  ]
};

test('POST /api/timeline/save saves a timeline', async ({ request }) => {
  // Get a fresh CSRF token (login again since previous token was consumed)
  const freshCsrf = await loginForCsrf(request);

  const res = await request.post(`${API_BASE}/api/timeline/save`, {
    data: testTimeline,
    headers: {
      'x-csrf-token': freshCsrf,
      'Content-Type': 'application/json'
    }
  });
  // Debug: capture response on failure
  if (!res.ok()) {
    const body = await res.json();
    console.log('Timeline save failed:', res.status(), JSON.stringify(body));
    console.log('CSRF token used:', freshCsrf);
  }
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('ok', true);
});

test('GET /api/timeline/list returns saved timelines', async ({ request }) => {
  // Give server a moment to persist
  await new Promise(r => setTimeout(r, 200));

  const res = await request.get(`${API_BASE}/api/timeline/list`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('timelines');
  expect(Array.isArray(body.timelines)).toBeTruthy();
  expect(body.timelines.length).toBeGreaterThanOrEqual(1);

  const found = body.timelines.find(t => t.title === testTimeline.title);
  expect(found).toBeTruthy();
  expect(found.type).toBe('artwork');
  expect(found.events.length).toBe(3);
});

test('POST /api/timeline/delete removes a timeline', async ({ request }) => {
  // Get a fresh CSRF token
  const freshCsrf = await loginForCsrf(request);

  const res = await request.post(`${API_BASE}/api/timeline/delete`, {
    data: { title: testTimeline.title },
    headers: {
      'x-csrf-token': freshCsrf,
      'Content-Type': 'application/json'
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('ok', true);

  // Verify deletion
  const listRes = await request.get(`${API_BASE}/api/timeline/list`);
  const listBody = await listRes.json();
  const found = listBody.timelines.find(t => t.title === testTimeline.title);
  expect(found).toBeFalsy();
});

test('POST /api/timeline/delete with missing title', async ({ request }) => {
  const freshCsrf = await loginForCsrf(request);

  const res = await request.post(`${API_BASE}/api/timeline/delete`, {
    data: {},
    headers: {
      'x-csrf-token': freshCsrf,
      'Content-Type': 'application/json'
    }
  });
  expect(res.ok()).toBeFalsy();
});

// ══════════════════════════════════════════════
// Debug endpoint
// ══════════════════════════════════════════════

test('GET /api/debug returns full diagnostics', async ({ request }) => {
  const res = await request.get(`${API_BASE}/api/debug`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body).toHaveProperty('status', 'ok');
  expect(body).toHaveProperty('config');
  expect(body.config).toHaveProperty('apiKey');
  expect(body).toHaveProperty('subscriptions');
  expect(body).toHaveProperty('recentErrors');
  expect(Array.isArray(body.recentErrors)).toBeTruthy();
});
