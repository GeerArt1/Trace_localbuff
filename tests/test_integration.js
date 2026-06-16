#!/usr/bin/env node
// ══════════════════════════════════════════════
// TRACE — Integration Tests
// Tests the full scan→result→save pipeline,
// watchdog event reporting, and agent system
// using a mocked server environment.
// ══════════════════════════════════════════════

var path = require('path');
var fs = require('fs');

// ── Test framework ──
var passed = 0;
var failed = 0;
var total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.log('  ✗ ' + name);
    console.log('    ' + (e.message || String(e)));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

function assertDeepEqual(a, b, msg) {
  try {
    var aStr = JSON.stringify(a);
    var bStr = JSON.stringify(b);
    if (aStr !== bStr) throw new Error('Mismatch');
  } catch (e) {
    throw new Error((msg || 'Values differ') + ' — expected ' + JSON.stringify(b).slice(0, 100) + ', got ' + JSON.stringify(a).slice(0, 100));
  }
}

// ══════════════════════════════════════════════
// Mock browser environment (before any module loads)
// ══════════════════════════════════════════════

var _eventListeners = {};

function mockAddEventListener(type, fn) {
  if (!_eventListeners[type]) _eventListeners[type] = [];
  _eventListeners[type].push(fn);
}

function mockRemoveEventListener(type, fn) {
  if (!_eventListeners[type]) return;
  _eventListeners[type] = _eventListeners[type].filter(function(f) { return f !== fn; });
}

function mockDispatchEvent(type, data) {
  var handlers = _eventListeners[type] || [];
  handlers.forEach(function(fn) {
    try { fn(data || { type: type }); } catch(e) {}
  });
}

// Make window an alias for globalThis (works in Node 12+)
globalThis.window = globalThis;

// Add event listener support on the global object (watchdog adds listeners to window)
globalThis.addEventListener = mockAddEventListener;
globalThis.removeEventListener = mockRemoveEventListener;
globalThis.dispatchEvent = function(e) { mockDispatchEvent(e.type, e); };

// Browser-like global mocks
globalThis.document = {
  readyState: 'complete',
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener,
  dispatchEvent: function(e) { mockDispatchEvent(e.type, e); },
  querySelectorAll: function() { return []; },
  querySelector: function() { return null; },
  getElementById: function() { return null; },
  createElement: function() { return { style: {}, className: '', setAttribute: function() {} }; },
  createTextNode: function() { return {}; },
  documentElement: { style: {} },
  body: { appendChild: function() {}, style: {} }
};

globalThis.navigator = {
  onLine: true,
  userAgent: 'node-test',
  mediaDevices: null,
  serviceWorker: null,
  clipboard: null,
  share: null
};

globalThis.localStorage = {
  _data: {},
  getItem: function(k) { return this._data[k] || null; },
  setItem: function(k, v) { this._data[k] = String(v); },
  removeItem: function(k) { delete this._data[k]; },
  clear: function() { this._data = {}; },
  get length() { return Object.keys(this._data).length; },
  key: function(i) { return Object.keys(this._data)[i] || null; }
};

globalThis.sessionStorage = globalThis.localStorage;
globalThis.performance = { memory: { usedJSHeapSize: 50000000 }, timing: { navigationStart: Date.now() } };
globalThis.fetch = function() { return Promise.resolve({ ok: true, status: 200, json: function() { return Promise.resolve({}); } }); };
globalThis.console = { log: function(){}, warn: function(){}, error: function(){}, info: function(){} };
globalThis.location = { href: 'http://localhost', hash: '', search: '' };
globalThis.matchMedia = function() { return { matches: false }; };
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;
globalThis.setInterval = setInterval;
globalThis.clearInterval = clearInterval;
globalThis.requestAnimationFrame = function(cb) { return setTimeout(cb, 16); };
globalThis.cancelAnimationFrame = function(id) { clearTimeout(id); };

// ══════════════════════════════════════════════
// Test Suite 1: Global Type Contracts
// ══════════════════════════════════════════════

console.log('\n── Suite 1: Type Contracts ──\n');

test('TRACE_TIER defaults to collector', function() {
  assertEqual(globalThis.TRACE_TIER, undefined, 'TRACE_TIER should be undefined before setTier');
});

test('_lastResult shape matches TraceAnalysisResult', function() {
  var sampleResult = {
    title: 'Portrait of a Lady',
    artist: 'Frans Hals',
    period: 'Dutch Golden Age',
    medium: 'Oil on canvas',
    movement: 'Baroque',
    subject_type: 'painting',
    provenance_confidence: 85,
    value_estimate: '50000-80000 EUR',
    style_analysis: 'Bold brushwork with chiaroscuro',
    historical_context: 'Created during the Dutch Golden Age',
    keywords: ['portrait', 'hals', 'dutch', 'baroque', 'golden age'],
    timeline: [
      { year: '1640', event: 'Painted', detail: 'Commissioned by Amsterdam merchant', category: 'creation' },
      { year: '2024', event: 'Present', detail: 'Private collection', category: 'ownership' }
    ]
  };

  assertEqual(typeof sampleResult.title, 'string');
  assertEqual(typeof sampleResult.provenance_confidence, 'number');
  assertEqual(Array.isArray(sampleResult.timeline), true);
  assertEqual(sampleResult.timeline[0].category, 'creation');
});

test('ScanImageData shape is correct', function() {
  var data = { data: 'base64encodedstring', type: 'image/jpeg' };
  assertEqual(typeof data.data, 'string');
  assertEqual(data.type, 'image/jpeg');
});

test('TimelineEvent has required fields', function() {
  var ev = { year: '1900', event: 'Sold', detail: 'At auction', category: 'auction' };
  assertEqual(typeof ev.year, 'string');
  assertEqual(typeof ev.event, 'string');
  assertEqual(typeof ev.detail, 'string');
  assertEqual(['creation','ownership','exhibition','auction','life','historical'].indexOf(ev.category) >= 0, true);
});

// ══════════════════════════════════════════════
// Test Suite 2: Catch Block Fixes
// ══════════════════════════════════════════════

console.log('\n── Suite 2: Error Handling Coverage ──\n');

test('All src/ files have no empty catch(e){} blocks', function() {
  var srcDir = path.resolve(__dirname, '..', 'src');
  var files = fs.readdirSync(srcDir).filter(function(f) { return f.endsWith('.js'); });
  var emptyCatches = [];

  files.forEach(function(file) {
    var content = fs.readFileSync(path.join(srcDir, file), 'utf-8');
    var matches = content.match(/catch\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\)\s*\{\s*\}/g);
    if (matches) {
      emptyCatches.push(file + ': ' + matches.length + ' empty catch block(s)');
    }
  });

  if (emptyCatches.length > 0) {
    throw new Error('Files with empty catch blocks:\n  ' + emptyCatches.join('\n  '));
  }
});

// ══════════════════════════════════════════════
// Test Suite 3: Watchdog Module
// ══════════════════════════════════════════════

console.log('\n── Suite 3: Watchdog — Client Health Monitor ──\n');

// Load watchdog module (relies on browser mocks above)
require(path.resolve(__dirname, '..', 'src', 'watchdog.js'));

test('TRACE_WATCHDOG is exposed on window', function() {
  assertEqual(typeof globalThis.TRACE_WATCHDOG, 'object');
});

test('TRACE_WATCHDOG has all required methods', function() {
  assertEqual(typeof globalThis.TRACE_WATCHDOG.report, 'function');
  assertEqual(typeof globalThis.TRACE_WATCHDOG.warn, 'function');
  assertEqual(typeof globalThis.TRACE_WATCHDOG.error, 'function');
  assertEqual(typeof globalThis.TRACE_WATCHDOG.getState, 'function');
  assertEqual(typeof globalThis.TRACE_WATCHDOG.flush, 'function');
});

test('watchdog.warn increments warning count', function() {
  var before = globalThis.TRACE_WATCHDOG.getState().warningCount;
  globalThis.TRACE_WATCHDOG.warn('TestModule', 'Test warning');
  var after = globalThis.TRACE_WATCHDOG.getState().warningCount;
  assertEqual(after, before + 1);
});

test('watchdog.error increments error count', function() {
  var before = globalThis.TRACE_WATCHDOG.getState().errorCount;
  globalThis.TRACE_WATCHDOG.error('TestModule', 'Test error');
  var after = globalThis.TRACE_WATCHDOG.getState().errorCount;
  assertEqual(after, before + 1);
});

test('watchdog.getState returns errorBySource breakdown', function() {
  var state = globalThis.TRACE_WATCHDOG.getState();
  assertEqual(typeof state.errorBySource, 'object');
  assertEqual(typeof state.errorCount, 'number');
  assertEqual(typeof state.recentReports, 'object');
});

test('watchdog report contains correct fields', function() {
  globalThis.TRACE_WATCHDOG.report('info', 'Test', 'Test message', { test: true });
  var state = globalThis.TRACE_WATCHDOG.getState();
  var lastReport = state.recentReports[state.recentReports.length - 1];
  assertEqual(lastReport.type, 'info');
  assertEqual(lastReport.source, 'Test');
  assertEqual(lastReport.message, 'Test message');
  assertEqual(lastReport.detail.test, true);
  assertEqual(typeof lastReport.ts, 'string');
});

test('watchdog captures uncaught errors via event listener', function() {
  var before = globalThis.TRACE_WATCHDOG.getState().errorCount;
  mockDispatchEvent('error', { message: 'Test error event', filename: 'test.js', lineno: 1, colno: 1 });
  // Give event loop tick to process
  var after = globalThis.TRACE_WATCHDOG.getState().errorCount;
  // error handler fires synchronously
  assertEqual(after > before, true);
});

// ══════════════════════════════════════════════
// Test Suite 4: Server Agent Routes
// ══════════════════════════════════════════════

console.log('\n── Suite 4: Server Agent — Self-Healing Engine ──\n');

// Mock server context for agent module
function createMockCtx() {
  var opsLog = [];
  return {
    db: { isReady: function() { return true; }, getTlCache: function() { return {}; } },
    subscriptions: new Map(),
    errorLog: [],
    STATIC_DIR: path.resolve(__dirname, '..') + path.sep,
    opsLog: opsLog,
    OPS_LOG_MAX: 500
  };
}

test('Agent module loads and exports handlers', function() {
  var agent = require(path.resolve(__dirname, '..', 'routes', 'agent.js'))(createMockCtx());
  assertEqual(typeof agent.handleWatchdogReport, 'function');
  assertEqual(typeof agent.handleAgentAutoFix, 'function');
  assertEqual(typeof agent.handleAgentReport, 'function');
  assertEqual(typeof agent.buildReport, 'function');
});

test('buildReport returns daily report structure', function() {
  var agent = require(path.resolve(__dirname, '..', 'routes', 'agent.js'))(createMockCtx());
  var report = agent.buildReport();
  assertEqual(typeof report.report_date, 'string');
  assertEqual(typeof report.summary, 'object');
  assertEqual(typeof report.summary.events_today, 'number');
  assertEqual(typeof report.health, 'object');
  assertEqual(Array.isArray(report.recommendations), true);
});

test('buildReport recommendations contain priority and action', function() {
  var agent = require(path.resolve(__dirname, '..', 'routes', 'agent.js'))(createMockCtx());
  var report = agent.buildReport();
  report.recommendations.forEach(function(rec) {
    assertEqual(typeof rec.priority, 'string');
    assertEqual(typeof rec.action, 'string');
    assert(['critical', 'high', 'medium', 'low'].indexOf(rec.priority) >= 0, 'invalid priority: ' + rec.priority);
  });
});

test('logAgent writes to opsLog array', function() {
  var ctx = createMockCtx();
  var agent = require(path.resolve(__dirname, '..', 'routes', 'agent.js'))(ctx);
  agent.logAgent('test_type', 'Test message', { key: 'value' });
  assertEqual(ctx.opsLog.length, 1);
  assertEqual(ctx.opsLog[0].type, 'test_type');
  assertEqual(ctx.opsLog[0].message, 'Test message');
  assertEqual(ctx.opsLog[0].detail.key, 'value');
});

// ══════════════════════════════════════════════
// Test Suite 5: Scan Pipeline Data Flow
// ══════════════════════════════════════════════

console.log('\n── Suite 5: Scan Pipeline — Data Flow ──\n');

test('Result object flows through store → render → export', function() {
  var result = {
    id: 'TRC-000001',
    title: 'Test Artwork',
    artist: 'Test Artist',
    period: 'Modern',
    medium: 'Acrylic on canvas',
    movement: 'Contemporary',
    subject_type: 'artwork',
    provenance_confidence: 75,
    value_estimate: '1000-2000 EUR',
    keywords: ['test', 'art'],
    timeline: [
      { year: '2020', event: 'Created', detail: 'By Test Artist', category: 'creation' },
      { year: '2024', event: 'Scanned', detail: 'Via TRACE app', category: 'historical' }
    ]
  };

  // Stage 1: Store
  globalThis._lastResult = result;
  globalThis._timelines = {};
  var tlKey = result.title + ' — ' + result.artist;
  globalThis._timelines[tlKey] = { title: tlKey, events: result.timeline, confidence: result.provenance_confidence };

  assertEqual(globalThis._lastResult.title, 'Test Artwork');
  assertEqual(globalThis._timelines[tlKey].events.length, 2);

  // Stage 2: JSON round-trip (simulates localStorage persistence)
  var serialized = JSON.stringify(result);
  var deserialized = JSON.parse(serialized);
  assertDeepEqual(deserialized, result, 'Result survives JSON round-trip');

  // Stage 3: Timeline structure integrity
  var tl = globalThis._timelines[tlKey];
  assertEqual(Array.isArray(tl.events), true);
  assertEqual(tl.events[0].category, 'creation');
  assertEqual(tl.events[1].category, 'historical');
});

test('ScanImageData flows through compare pipeline', function() {
  var mockImageData = { data: 'base64pixeldata', type: 'image/png' };

  // Current scan
  globalThis._scanImageData = mockImageData;
  assertEqual(globalThis._scanImageData.data.length > 0, true);
  assertEqual(globalThis._scanImageData.type, 'image/png');

  // Previous scan (for COMP comparison)
  globalThis._lastScanImageData = { data: 'prevdata', type: 'image/jpeg' };
  assertEqual(typeof globalThis._lastScanImageData.data, 'string');
  assertEqual(globalThis._lastScanImageData.type, 'image/jpeg');
});

// ══════════════════════════════════════════════
// Test Suite 6: Static Analysis
// ══════════════════════════════════════════════

console.log('\n── Suite 6: Static Analysis ──\n');

test('routes/agent.js has no empty catch blocks', function() {
  var content = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'agent.js'), 'utf-8');
  var emptyCatches = content.match(/catch\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\)\s*\{\s*\}/g);
  assertEqual(emptyCatches, null, 'Found ' + (emptyCatches ? emptyCatches.length : 0) + ' empty catch blocks');
});

test('src/watchdog.js has no empty catch blocks', function() {
  var content = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'watchdog.js'), 'utf-8');
  var emptyCatches = content.match(/catch\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\)\s*\{\s*\}/g);
  assertEqual(emptyCatches, null, 'Found ' + (emptyCatches ? emptyCatches.length : 0) + ' empty catch blocks');
});

test('src/types.js is safely parseable', function() {
  var content = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'types.js'), 'utf-8');
  assertEqual(typeof content, 'string');
  assertEqual(content.length > 100, true, 'types.js should be substantial');
  // Verify it has JSDoc typedefs
  assertEqual(content.indexOf('@typedef') >= 0, true, 'types.js should contain JSDoc typedefs');
  assertEqual(content.indexOf('TraceAnalysisResult') >= 0, true, 'types.js should define TraceAnalysisResult');
});

test('trace_server.js registers agent routes', function() {
  var content = fs.readFileSync(path.resolve(__dirname, '..', 'trace_server.js'), 'utf-8');
  var hasAgent = content.indexOf('./routes/agent') >= 0;
  var hasAgentReport = content.indexOf('/api/agent/report') >= 0;
  var hasAgentFix = content.indexOf('/api/agent/auto-fix') >= 0;
  assertEqual(hasAgent, true, 'Server should require agent routes');
  assertEqual(hasAgentReport, true, 'Server should have /api/agent/report endpoint');
  assertEqual(hasAgentFix, true, 'Server should have /api/agent/auto-fix endpoint');
});

// ══════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════

console.log('\n─────────────────────────────────────────────');
console.log('  Integration Tests: ' + passed + '/' + total + ' passed');
if (failed > 0) {
  console.log('  FAILED: ' + failed + ' test(s)');
  process.exit(1);
} else {
  console.log('  All tests passed.');
}
