// ══════════════════════════════════════════════
// TRACE Database Unit Tests
// Tests for trace_db.js — SQLite persistence via better-sqlite3
// Run: TRACE_DB_PATH=trace_db_test.sqlite node tests/test_db.js
// ══════════════════════════════════════════════

const assert = require('assert');
const path = require('path');
const fs = require('fs');

process.chdir(path.resolve(__dirname, '..'));

// Set test DB path BEFORE loading the module
var testDbPath = path.resolve(__dirname, '..', 'trace_db_test.sqlite');
process.env.TRACE_DB_PATH = testDbPath;

// Clean up any previous test DB
try { fs.unlinkSync(testDbPath); } catch(e) {}
try { fs.unlinkSync(testDbPath + '.bak'); } catch(e) {}

// Fresh load of the DB module
delete require.cache[require.resolve('../trace_db')];
const db = require('../trace_db');

var testsPassed = 0;
var testsFailed = 0;

function test(name, fn) {
  console.log('  [TEST] ' + name);
  try {
    fn();
    console.log('    \u2713 PASS');
    testsPassed++;
  } catch(e) {
    console.log('    \u2717 FAIL: ' + e.message);
    testsFailed++;
  }
}

// ── Run Tests ──
async function runTests() {
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  TRACE Database Unit Tests');
  console.log('  DB: ' + testDbPath);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  // ── Init ──
  console.log('\n\u2500\u2500 Initialization \u2500\u2500');
  await db.init();
  test('isReady returns true after init', function() {
    assert.strictEqual(db.isReady(), true);
  });
  test('getEngine returns better-sqlite3', function() {
    assert.strictEqual(db.getEngine(), 'better-sqlite3');
  });

  // ── Subscription Operations ──
  console.log('\n\u2500\u2500 Subscription Operations \u2500\u2500');

  test('save and load a subscription', function() {
    var sub = {
      licenseKey: 'TRACE-TEST-0001-ABCD',
      tier: 'collector',
      owner: 'Test User',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
      createdAt: Date.now(),
      active: true
    };
    db.saveSubscription(sub);

    var loaded = db.loadAllSubscriptions();
    assert.ok(loaded.subscriptions[sub.licenseKey], 'Subscription should exist after save');
    assert.strictEqual(loaded.subscriptions[sub.licenseKey].tier, 'collector');
    assert.strictEqual(loaded.subscriptions[sub.licenseKey].owner, 'Test User');
    assert.strictEqual(loaded.subscriptions[sub.licenseKey].active, true);
  });

  test('save and load a license key', function() {
    var keyData = { tier: 'professional', expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000, owner: 'Pro User' };
    db.saveLicenseKey('TRACE-TEST-0002-EFGH', keyData);

    var loaded = db.loadAllSubscriptions();
    assert.ok(loaded.licenseKeys['TRACE-TEST-0002-EFGH'], 'License key should exist');
    assert.strictEqual(loaded.licenseKeys['TRACE-TEST-0002-EFGH'].tier, 'professional');
  });

  test('delete a subscription', function() {
    db.deleteSubscription('TRACE-TEST-0001-ABCD');

    var loaded = db.loadAllSubscriptions();
    assert.strictEqual(loaded.subscriptions['TRACE-TEST-0001-ABCD'], undefined, 'Deleted subscription should not exist');
    assert.strictEqual(loaded.licenseKeys['TRACE-TEST-0001-ABCD'], undefined, 'Deleted license key should not exist');
  });

  test('save and delete multiple subscriptions', function() {
    for (var i = 0; i < 5; i++) {
      db.saveSubscription({
        licenseKey: 'MLT-KEY-' + i,
        tier: 'discover',
        owner: 'Multi ' + i,
        expiresAt: Date.now(),
        createdAt: Date.now(),
        active: true
      });
    }
    var loaded = db.loadAllSubscriptions();
    assert.strictEqual(Object.keys(loaded.subscriptions).length, 5, 'Should have 5 subscriptions');

    for (var j = 0; j < 5; j++) {
      db.deleteSubscription('MLT-KEY-' + j);
    }
    var afterDelete = db.loadAllSubscriptions();
    assert.strictEqual(Object.keys(afterDelete.subscriptions).length, 0, 'Should be empty after delete');
  });

  // ── Timeline Operations ──
  console.log('\n\u2500\u2500 Timeline Operations \u2500\u2500');

  test('save and load a timeline', function() {
    var tl = {
      title: 'Mona Lisa',
      sub: 'Leonardo da Vinci',
      type: 'artwork',
      artist: 'Leonardo da Vinci',
      period: 'Renaissance',
      events: [
        { year: 1503, event: 'Painted', detail: 'Commissioned by Francesco del Giocondo' },
        { year: 1516, event: 'Moved to France', detail: 'Acquired by King Francis I' }
      ],
      savedAt: Date.now()
    };
    db.saveTimeline(tl);

    var loaded = db.loadAllTimelines();
    assert.ok(loaded['Mona Lisa'], 'Timeline should exist');
    assert.strictEqual(loaded['Mona Lisa'].artist, 'Leonardo da Vinci');
    assert.strictEqual(loaded['Mona Lisa'].events.length, 2);
  });

  test('update an existing timeline', function() {
    var tl = {
      title: 'Mona Lisa',
      sub: 'Leonardo da Vinci',
      type: 'artwork',
      artist: 'Leonardo da Vinci',
      period: 'Renaissance',
      events: [
        { year: 1503, event: 'Painted', detail: 'Started' },
        { year: 2024, event: 'Restored', detail: 'Latest restoration completed' }
      ],
      savedAt: Date.now()
    };
    db.saveTimeline(tl);

    var loaded = db.loadAllTimelines();
    assert.strictEqual(loaded['Mona Lisa'].events.length, 2, 'Events should be updated');
    assert.strictEqual(loaded['Mona Lisa'].events[1].year, 2024);
  });

  test('delete a timeline', function() {
    db.deleteTimeline('Mona Lisa');

    var loaded = db.loadAllTimelines();
    assert.strictEqual(loaded['Mona Lisa'], undefined, 'Deleted timeline should not exist');
  });

  test('handle empty database', function() {
    var loaded = db.loadAllTimelines();
    assert.strictEqual(Object.keys(loaded).length, 0, 'Database should be empty');
  });

  // ── Persistence ──
  console.log('\n\u2500\u2500 Persistence \u2500\u2500');

  test('flush persists data to disk', function() {
    db.saveTimeline({ title: 'PersistTest', sub: '', type: 'artwork', events: [], savedAt: Date.now() });
    db.flush();

    assert.ok(fs.existsSync(testDbPath), 'Database file should exist after flush');
    assert.ok(fs.statSync(testDbPath).size > 0, 'Database file should have content');
  });

  test('backup file exists after flush', function() {
    var bakPath = testDbPath + '.bak';
    assert.ok(fs.existsSync(bakPath), 'Backup file should exist');
  });

  // ── Edge Cases ──
  console.log('\n\u2500\u2500 Edge Cases \u2500\u2500');

  test('save timeline with empty title', function() {
    db.saveTimeline({ title: '', sub: '', type: 'artwork', events: [], savedAt: Date.now() });
    var loaded = db.loadAllTimelines();
    assert.ok(loaded[''] !== undefined, 'Empty title timeline should be saved');
    db.deleteTimeline('');
  });

  test('save timeline with special characters', function() {
    var specialTitle = 'Test "Quotes" & <Angles> — Emoji U+1F3A8';
    db.saveTimeline({ title: specialTitle, sub: '', type: 'artwork', artist: 'Van Gogh', events: [], savedAt: Date.now() });
    var loaded = db.loadAllTimelines();
    assert.strictEqual(loaded[specialTitle].artist, 'Van Gogh');
    db.deleteTimeline(specialTitle);
  });

  test('save subscription with edge case values (empty strings, false active)', function() {
    db.saveSubscription({
      licenseKey: 'EDGE-TEST',
      tier: 'discover',
      owner: '',
      expiresAt: 0,
      createdAt: Date.now(),
      active: false
    });
    var loaded = db.loadAllSubscriptions();
    assert.ok(loaded.subscriptions['EDGE-TEST'] !== undefined, 'Edge-case subscription should save');
    assert.strictEqual(loaded.subscriptions['EDGE-TEST'].active, false);
    assert.strictEqual(loaded.subscriptions['EDGE-TEST'].owner, '');
    db.deleteSubscription('EDGE-TEST');
  });

  test('loadAllTimelines called twice returns consistent data', function() {
    db.saveTimeline({ title: 'Consistency', sub: '', type: 'artwork', events: [], savedAt: 1000 });
    var first = db.loadAllTimelines();
    var second = db.loadAllTimelines();
    assert.strictEqual(Object.keys(first).length, Object.keys(second).length);
    assert.strictEqual(first['Consistency'].savedAt, second['Consistency'].savedAt);
    db.deleteTimeline('Consistency');
  });

  // ── Cache Mirroring ──
  console.log('\n\u2500\u2500 Cache Mirroring \u2500\u2500');

  test('getTlCache returns cached timelines', function() {
    db.saveTimeline({ title: 'CacheTest', sub: '', type: 'artwork', events: [], savedAt: Date.now() });
    var cache = db.getTlCache();
    assert.ok(cache['CacheTest'] !== undefined, 'Cache should contain saved timeline');
    db.deleteTimeline('CacheTest');
    var cache2 = db.getTlCache();
    assert.strictEqual(cache2['CacheTest'], undefined, 'Cache should reflect deletion');
  });

  test('getSubCache returns cached subscriptions', function() {
    db.saveSubscription({
      licenseKey: 'CACHE-KEY',
      tier: 'discover',
      owner: 'Cache User',
      expiresAt: 0,
      createdAt: Date.now(),
      active: true
    });
    var cache = db.getSubCache();
    assert.ok(cache['CACHE-KEY'] !== undefined, 'Cache should contain saved subscription');
    assert.strictEqual(cache['CACHE-KEY'].tier, 'discover');
    db.deleteSubscription('CACHE-KEY');
  });

  // ── Summary ──
  var total = testsPassed + testsFailed;
  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('  Results: ' + testsPassed + '/' + total + ' passed' + (testsFailed > 0 ? ', ' + testsFailed + ' failed \u2717' : ''));
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

  // Clean up test DB
  try { fs.unlinkSync(testDbPath); } catch(e) {}
  try { fs.unlinkSync(testDbPath + '.bak'); } catch(e) {}

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(function(err) {
  console.error('[TEST] Fatal error:', err.message);
  process.exit(1);
});
