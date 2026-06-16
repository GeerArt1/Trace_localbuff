// ══════════════════════════════════════════════
// TRACE Server Core Unit Tests
// Tests for token generation, verification, and rate limiting
// Run: node tests/test_server_core.js
// ══════════════════════════════════════════════

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

process.chdir(path.resolve(__dirname, '..'));

// ── Mock crypto functions (same as server) ──
const SUBSCRIPTION_SECRET = 'test-secret-for-unit-tests';

function generateToken(tier, owner, expiresAt) {
  const payload = JSON.stringify({ tier, owner, expiresAt, iat: Date.now() });
  const sig = crypto.createHmac('sha256', SUBSCRIPTION_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
}

function verifyToken(token) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
    const { payload, sig } = decoded;
    const expectedSig = crypto.createHmac('sha256', SUBSCRIPTION_SECRET).update(payload).digest('hex');
    if (sig !== expectedSig) return null;
    const data = JSON.parse(payload);
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function generateLicenseKey() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(3).toString('hex').toUpperCase());
  }
  return 'TRACE-' + segments.join('-');
}

// ── Rate limit logic (same as server) ──
const RATE_LIMITS = { discover: 20, collector: 60, professional: 120 };
const RATE_MAX_DEFAULT = RATE_LIMITS.discover;
const RATE_WINDOW_MS = 60000;

function getRateLimitForTier(tier) {
  return RATE_LIMITS[tier] || RATE_MAX_DEFAULT;
}

// ── Tests ──
var testsPassed = 0;
var testsFailed = 0;

function test(name, fn) {
  console.log('  [TEST] ' + name);
  try {
    fn();
    console.log('    ✓ PASS');
    testsPassed++;
  } catch(e) {
    console.log('    ✗ FAIL: ' + e.message);
    testsFailed++;
  }
}

console.log('\n═══════════════════════════════════════');
console.log('  TRACE Server Core Unit Tests');
console.log('═══════════════════════════════════════\n');

// ── Token Generation & Verification ──
console.log('\n── Token Generation & Verification ──');

test('generateToken produces a valid base64url string', function() {
  var token = generateToken('collector', 'Test User', Date.now() + 86400000);
  assert.ok(typeof token === 'string', 'Token should be a string');
  assert.ok(token.length > 20, 'Token should be non-trivial length');
  // Should be base64url (no + or / chars)
  assert.strictEqual(token.includes('+'), false, 'Base64url should not contain +');
  assert.strictEqual(token.includes('/'), false, 'Base64url should not contain /');
});

test('verifyToken returns correct data for valid token', function() {
  var expiresAt = Date.now() + 86400000;
  var token = generateToken('professional', 'Alice', expiresAt);
  var result = verifyToken(token);
  assert.ok(result !== null, 'Valid token should verify');
  assert.strictEqual(result.tier, 'professional');
  assert.strictEqual(result.owner, 'Alice');
  assert.strictEqual(result.expiresAt, expiresAt);
  assert.ok(result.iat > 0, 'Should have iat timestamp');
});

test('verifyToken returns null for tampered token', function() {
  var token = generateToken('collector', 'Bob', Date.now() + 86400000);
  // Tamper with the payload
  var decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf-8'));
  var tamperedPayload = JSON.stringify({ tier: 'professional', owner: 'Bob', expiresAt: Date.now() + 86400000, iat: Date.now() });
  var tampered = Buffer.from(JSON.stringify({ payload: tamperedPayload, sig: decoded.sig })).toString('base64url');
  var result = verifyToken(tampered);
  assert.strictEqual(result, null, 'Tampered token should not verify');
});

test('verifyToken returns null for expired token', function() {
  var expiresAt = Date.now() - 1000; // Already expired
  var token = generateToken('discover', 'Charlie', expiresAt);
  var result = verifyToken(token);
  assert.strictEqual(result, null, 'Expired token should not verify');
});

test('verifyToken returns null for garbage input', function() {
  assert.strictEqual(verifyToken('not-a-valid-token'), null);
  assert.strictEqual(verifyToken(''), null);
  assert.strictEqual(verifyToken(null), null);
  assert.strictEqual(verifyToken('!!!invalid-base64!!!'), null);
});

test('tokens with different secrets do not verify', function() {
  const wrongSecret = 'wrong-secret';
  var payload = JSON.stringify({ tier: 'collector', owner: 'Test', expiresAt: Date.now() + 86400000, iat: Date.now() });
  var sig = crypto.createHmac('sha256', wrongSecret).update(payload).digest('hex');
  var token = Buffer.from(JSON.stringify({ payload, sig })).toString('base64url');
  var result = verifyToken(token);
  assert.strictEqual(result, null, 'Token signed with wrong secret should not verify');
});

// ── License Key Generation ──
console.log('\n── License Key Generation ──');

test('generateLicenseKey produces TRACE-XXXX-XXXX-XXXX-XXXX format', function() {
  var key = generateLicenseKey();    assert.ok(/^TRACE-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/.test(key), 'Key should match TRACE-XXXXXX-XXXXXX-XXXXXX-XXXXXX format. Got: ' + key);
});

test('generateLicenseKey produces unique keys', function() {
  var keys = new Set();
  for (var i = 0; i < 100; i++) {
    keys.add(generateLicenseKey());
  }
  assert.strictEqual(keys.size, 100, 'All 100 keys should be unique');
});

// ── Rate Limiting ──
console.log('\n── Rate Limiting ──');

test('getRateLimitForTier returns correct limits', function() {
  assert.strictEqual(getRateLimitForTier('discover'), 20);
  assert.strictEqual(getRateLimitForTier('collector'), 60);
  assert.strictEqual(getRateLimitForTier('professional'), 120);
});

test('getRateLimitForTier defaults to discover for unknown tier', function() {
  assert.strictEqual(getRateLimitForTier('unknown'), 20);
  assert.strictEqual(getRateLimitForTier(''), 20);
  assert.strictEqual(getRateLimitForTier(null), 20);
  assert.strictEqual(getRateLimitForTier(undefined), 20);
});

test('RATE_LIMITS object is correctly structured', function() {
  assert.strictEqual(RATE_LIMITS.discover < RATE_LIMITS.collector, true, 'Discover < Collector');
  assert.strictEqual(RATE_LIMITS.collector < RATE_LIMITS.professional, true, 'Collector < Professional');
  assert.strictEqual(RATE_LIMITS.discover > 0, true, 'All limits positive');
});

// ── HMAC Signature ──
console.log('\n── HMAC/Security ──');

test('HMAC-SHA256 produces consistent signatures', function() {
  var payload = JSON.stringify({ test: 'data' });
  var sig1 = crypto.createHmac('sha256', SUBSCRIPTION_SECRET).update(payload).digest('hex');
  var sig2 = crypto.createHmac('sha256', SUBSCRIPTION_SECRET).update(payload).digest('hex');
  assert.strictEqual(sig1, sig2, 'Same input should produce same signature');
});

test('HMAC-SHA256 produces different signatures for different payloads', function() {
  var sig1 = crypto.createHmac('sha256', SUBSCRIPTION_SECRET).update('payload1').digest('hex');
  var sig2 = crypto.createHmac('sha256', SUBSCRIPTION_SECRET).update('payload2').digest('hex');
  assert.notStrictEqual(sig1, sig2, 'Different payloads should produce different signatures');
});

// ── File Listing (matching /api/files endpoint logic) ──
console.log('\n── File Listing ──');

var FILE_EXT_ORDER = ['.html', '.js', '.css', '.json'];

function isAllowedFile(name) {
  if (name === 'node_modules' || name.startsWith('.') || name.indexOf('.sqlite') >= 0 ||
      name === 'trace_package.json' || name === 'package-lock.json' || name === '.env.example' ||
      name === 'server.log' || name === 'trace_events.log' || name === 'trace_optimize.log' ||
      name.endsWith('.bak') || name === 'trace_optimize.sh' || name === 'Casks' ||
      name === 'Formulae' || name === 'Searching' || name === 'package.json' ||
      name.endsWith('.sh') || name === 'fix_critical_bugs.py') return false;
  var ext = path.extname(name).toLowerCase();
  if (!FILE_EXT_ORDER.includes(ext) && ext !== '.png' && ext !== '.svg') return false;
  return true;
}

var MOCK_FILES = [
  'trace.html', 'trace_server.js', 'trace_hq.html', 'trace_db.js', 'trace.css',
  'manifest.json', '.gitignore', 'node_modules', 'package-lock.json', 'trace_optimize.sh',
  'trace_db.sqlite', 'server.log', 'trace_events.log', '.subscriptions.json',
  'some_file.ts', 'Makefile', 'README.md'
];

test('isAllowedFile allows .html files', function() {
  assert.ok(isAllowedFile('trace.html'), '.html should be allowed');
  assert.ok(isAllowedFile('trace_hq.html'), '.html should be allowed');
});

test('isAllowedFile allows .js files', function() {
  assert.ok(isAllowedFile('trace_server.js'), '.js should be allowed');
  assert.ok(isAllowedFile('trace_subscription.js'), '.js should be allowed');
});

test('isAllowedFile allows .css and .json files', function() {
  assert.ok(isAllowedFile('trace.css'), '.css should be allowed');
  assert.ok(isAllowedFile('manifest.json'), '.json should be allowed');
});

test('isAllowedFile rejects hidden files starting with dot', function() {
  assert.strictEqual(isAllowedFile('.gitignore'), false, 'Hidden files should be rejected');
  assert.strictEqual(isAllowedFile('.env'), false, '.env should be rejected');
  assert.strictEqual(isAllowedFile('.subscriptions.json'), false, 'Subscription DB should be rejected');
});

test('isAllowedFile rejects node_modules', function() {
  assert.strictEqual(isAllowedFile('node_modules'), false, 'node_modules should be rejected');
});

test('isAllowedFile rejects SQLite database files', function() {
  assert.strictEqual(isAllowedFile('trace_db.sqlite'), false, 'SQLite DB should be rejected');
  assert.strictEqual(isAllowedFile('trace_db.sqlite-wal'), false, 'SQLite WAL should be rejected');
});

test('isAllowedFile rejects log files', function() {
  assert.strictEqual(isAllowedFile('server.log'), false, 'Server log should be rejected');
  assert.strictEqual(isAllowedFile('trace_events.log'), false, 'Events log should be rejected');
  assert.strictEqual(isAllowedFile('trace_optimize.log'), false, 'Optimize log should be rejected');
});

test('isAllowedFile rejects shell scripts and python files', function() {
  assert.strictEqual(isAllowedFile('trace_optimize.sh'), false, '.sh should be rejected');
  assert.strictEqual(isAllowedFile('restart.sh'), false, 'restart.sh should be rejected');
  assert.strictEqual(isAllowedFile('fix_critical_bugs.py'), false, '.py should be rejected');
});

test('isAllowedFile rejects lock files', function() {
  assert.strictEqual(isAllowedFile('package-lock.json'), false, 'package-lock.json should be rejected');
  assert.strictEqual(isAllowedFile('trace_package.json'), false, 'trace_package.json should be rejected');
  assert.strictEqual(isAllowedFile('package.json'), false, 'package.json should be rejected');
});

test('isAllowedFile rejects non-standard extensions', function() {
  assert.strictEqual(isAllowedFile('some_file.ts'), false, '.ts should be rejected');
  assert.strictEqual(isAllowedFile('Makefile'), false, 'Makefile should be rejected');
  assert.strictEqual(isAllowedFile('README.md'), false, '.md should be rejected');
});

test('isAllowedFile filters mock file list correctly', function() {
  var allowed = MOCK_FILES.filter(isAllowedFile);
  var expected = ['trace.html', 'trace_server.js', 'trace_hq.html', 'trace_db.js', 'trace.css', 'manifest.json'];
  assert.strictEqual(JSON.stringify(allowed), JSON.stringify(expected), 
    'Should only allow: ' + expected.join(', '));
});

test('FILE_EXT_ORDER prioritizes html over js over css over json', function() {
  assert.strictEqual(FILE_EXT_ORDER.indexOf('.html'), 0, '.html should be first');
  assert.strictEqual(FILE_EXT_ORDER.indexOf('.js'), 1, '.js should be second');
  assert.strictEqual(FILE_EXT_ORDER.indexOf('.css'), 2, '.css should be third');
  assert.strictEqual(FILE_EXT_ORDER.indexOf('.json'), 3, '.json should be fourth');
});

// ── Summary ──
var total = testsPassed + testsFailed;
console.log('\n═══════════════════════════════════════');
console.log('  Results: ' + testsPassed + '/' + total + ' passed' + (testsFailed > 0 ? ', ' + testsFailed + ' failed ✗' : ''));
console.log('═══════════════════════════════════════\n');

process.exit(testsFailed > 0 ? 1 : 0);
