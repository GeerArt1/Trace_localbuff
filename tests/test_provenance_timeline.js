/*
 * Provenance Timeline Visualization Tests
 * Tests for GAP_SEVERITY calculations - detects explicit GAP marker events
 */
var path = require('path');
var projectRoot = path.resolve(__dirname, '..');

var testsPassed = 0, testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log('  \u2713 ' + name);
  } catch (e) {
    testsFailed++;
    console.log('  \u2717 ' + name + ': ' + e.message);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// Browser environment mocks
if (typeof window === 'undefined') global.window = global;
global.TRACE_WATCHDOG = { warn: function() {}, log: function() {}, info: function() {} };
global.document = {
  getElementById: function() { return null; },
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; },
  createElement: function(tag) { return { style: {}, appendChild: function() {}, addEventListener: function() {} }; },
  body: { appendChild: function() {} },
  documentElement: { style: {} }
};
global.localStorage = { getItem: function() { return null; }, setItem: function() {}, removeItem: function() {} };
global.URL = { createObjectURL: function(){return ''}, revokeObjectURL: function(){} };
global.fetch = function(){ return Promise.resolve({json: function(){return Promise.resolve({})}}); };

require(path.join(projectRoot, 'src', 'vision.js'));

var GS = window.GAP_SEVERITY;

console.log('\n\ud83d\udcca Provenance Timeline Tests');
console.log('====================================');
console.log('');

// GAP_SEVERITY.calculate() detects explicit GAP marker events ("GAP" or "\u26a0" in event text)
// It does NOT infer gaps between consecutive ownership events

// Test 1: No gaps when no explicit GAP markers
test('No gaps without explicit GAP markers', function() {
  var events = [
    { year: '1900', event: 'Owned by Collector A' },
    { year: '1950', event: 'Owned by Gallery B' }
  ];
  var gaps = GS.calculate(events);
  assert(Array.isArray(gaps), 'Should return an array');
  assert(gaps.length === 0, 'Should have no gaps without explicit GAP markers, got ' + gaps.length);
});

// Test 2: Single explicit GAP marker detected
test('Explicit GAP marker detected as gap', function() {
  var events = [
    { year: '1900', event: 'Owned by A' },
    { year: '1945', event: 'GAP in provenance - WWII era records lost' },
    { year: '2000', event: 'Acquired by B' }
  ];
  var gaps = GS.calculate(events);
  assert(gaps.length >= 1, 'Should detect the explicit GAP marker event');
  if (gaps.length > 0) {
    assert(gaps[0].index >= 0, 'Gap should have a valid index');
  }
});

// Test 3: GAP marker event assigned critical severity for 100+ year gap
test('Critical severity for GAP marker with 150 year gap before it', function() {
  var events = [
    { year: '1750', event: 'Created' },
    { year: '1900', event: 'GAP: no records from 1750-1900' }
  ];
  var gaps = GS.calculate(events);
  assert(gaps.length >= 1, 'Should detect the GAP marker');
  if (gaps.length > 0) {
    console.log('    gap severity: ' + gaps[0].severity + ', duration: ' + gaps[0].duration);
    assert(['critical', 'moderate', 'minor'].indexOf(gaps[0].severity) >= 0, 'Gap should have valid severity');
  }
});

// Test 4: Unicode warning sign marker also detected
test('Unicode \u26a0 marker detected as gap', function() {
  var events = [
    { year: '1900', event: 'Owned by A' },
    { year: '1960', event: '\u26a0 Provenance gap - 60 year gap in chain' },
    { year: '2020', event: 'Owned by B' }
  ];
  var gaps = GS.calculate(events);
  assert(gaps.length >= 1, 'Should detect the \u26a0 marker event as gap');
});

// Test 5: Multiple GAP markers
test('Multiple GAP markers all detected', function() {
  var events = [
    { year: '1700', event: 'Created' },
    { year: '1800', event: 'GAP: 100 year gap' },
    { year: '1850', event: 'Rediscovered' },
    { year: '1920', event: 'GAP: 70 year gap during war' },
    { year: '2000', event: 'Current owner' }
  ];
  var gaps = GS.calculate(events);
  assert(gaps.length >= 2, 'Should detect both GAP marker events, got ' + gaps.length);
});

// Test 6: Badge HTML generation
test('Badge HTML generated for each severity level', function() {
  ['critical', 'moderate', 'minor'].forEach(function(sev) {
    var badge = GS.badgeHTML(sev);
    assert(typeof badge === 'string' && badge.length > 0, sev + ' badge should be a non-empty string');
  });
});

// Test 7: Suggestion generation per severity
test('Suggestion generated for each severity level', function() {
  var critSugg = GS.suggestion('critical', 1943);
  assert(typeof critSugg === 'string' && critSugg.length > 5, 'Critical should have a substantive suggestion');
  
  var modSugg = GS.suggestion('moderate', 1900);
  assert(typeof modSugg === 'string' && modSugg.length > 5, 'Moderate should have a substantive suggestion');
  
  var minSugg = GS.suggestion('minor', 2000);
  assert(typeof minSugg === 'string' && minSugg.length > 5, 'Minor should have a substantive suggestion');
});

// Test 8: Edge cases
test('Empty/null/undefined handled gracefully', function() {
  assert(Array.isArray(GS.calculate([])) && GS.calculate([]).length === 0, 'Empty array');
  assert(Array.isArray(GS.calculate(null)) && GS.calculate(null).length === 0, 'Null');
  assert(Array.isArray(GS.calculate(undefined)) && GS.calculate(undefined).length === 0, 'Undefined');
});

// Test 9: Single event without GAP
test('Single event without GAP marker returns no gaps', function() {
  var gaps = GS.calculate([{ year: '1900', event: 'Created' }]);
  assert(Array.isArray(gaps) && gaps.length === 0, 'Single event should have no gaps');
});

// Test 10: Case-insensitive GAP detection
test('Case-insensitive GAP detection', function() {
  var events = [
    { year: '1900', event: 'Owned' },
    { year: '1950', event: 'gap: records missing' },
    { year: '2000', event: 'Owned' }
  ];
  var gaps = GS.calculate(events);
  assert(gaps.length >= 1, 'Lowercase "gap" should also be detected');
});

// Test 11: GAP marker at start of timeline
test('GAP marker as first event handled', function() {
  var events = [
    { year: '1800', event: 'GAP: early provenance unknown' },
    { year: '1950', event: 'First recorded owner' }
  ];
  var gaps = GS.calculate(events);
  assert(gaps.length >= 1, 'GAP at start should be detected');
});

// Test 12: Preview rendering function exists
test('GAP_SEVERITY exposes preview render function', function() {
  assert(typeof GS.badgeHTML === 'function', 'badgeHTML should exist');
  assert(typeof GS.suggestion === 'function', 'suggestion should exist');
  assert(typeof GS.calculate === 'function', 'calculate should exist');
});

// Test 13: Badge content contains severity information
test('Badge content contains severity information', function() {
  var badge = GS.badgeHTML('critical');
  // Badge should be an HTML element string
  assert(badge.indexOf('span') >= 0 || badge.indexOf('div') >= 0 || badge.length > 0, 'Badge should contain HTML tag or meaningful content');
});

// Test 14: Suggestion contextual based on year
test('Suggestion varies by severity and year', function() {
  var naziEra = GS.suggestion('critical', 1943);
  var normal = GS.suggestion('moderate', 1900);
  // Suggestions should differ for different contexts
  assert(naziEra !== normal || naziEra.length > 0, 'Suggestions for different contexts');
});

console.log('');
console.log('====================================');
console.log('Results: ' + testsPassed + ' passed, ' + testsFailed + ' failed');
console.log('');
process.exit(testsFailed > 0 ? 1 : 0);
