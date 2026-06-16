// ══════════════════════════════════════════════
// TRACE — Client Module Unit Tests
// Tests for i18n.js (translations, __(), setLanguage)
// and csv_import.js (CSV parsing, Getty import)
// Run: node tests/test_client.js
// ══════════════════════════════════════════════

var assert = require('assert');

// ── Mock browser environment ──
if (!global.window) global.window = {};
if (!global.document) {
  global.document = {
    documentElement: { lang: 'en' },
    querySelectorAll: function() { return []; },
    getElementById: function() { return null; },
    createElement: function() { return { style: {} }; }
  };
}
if (!global.localStorage) {
  var _storage = {};
  global.localStorage = {
    getItem: function(k) { return _storage[k] || null; },
    setItem: function(k, v) { _storage[k] = String(v); },
    removeItem: function(k) { delete _storage[k]; },
    clear: function() { _storage = {}; },
    get length() { return Object.keys(_storage).length; },
    key: function(i) { return Object.keys(_storage)[i] || null; }
  };
}
// Bridge globals
window.document = document;
window.localStorage = localStorage;

// Mock TRACE_REGISTRY as a proper global (modules reference it without "window.")
global.TRACE_REGISTRY = {
  _handlers: {},
  on: function(ev, fn) {
    if (!this._handlers[ev]) this._handlers[ev] = [];
    this._handlers[ev].push(fn);
  },
  emit: function(ev, data) {
    var handlers = this._handlers[ev] || [];
    handlers.forEach(function(fn) { if (fn) fn(data); });
  }
};
window.TRACE_REGISTRY = global.TRACE_REGISTRY;

// ── Load source modules ──
require('../src/i18n');
require('../src/csv_import');

// Clear any persisted state from module load
localStorage.clear();

// ── Test framework ──
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

console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log('  TRACE Client Module Unit Tests');
console.log('  i18n.js + csv_import.js');
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

// ══════════════════════════════════════════════
// I18N TESTS
// ══════════════════════════════════════════════

console.log('\n\u2500\u2500 i18n \u2014 __() Translation Function \u2500\u2500');

test('__(key) returns the correct English value', function() {
  assert.strictEqual(window.__('app_name'), 'TRACE \u00b7 Art Intelligence');
  assert.strictEqual(window.__('live'), 'LIVE');
  assert.strictEqual(window.__('begin_investigation'), 'BEGIN INVESTIGATION');
});

test('__(key) returns key itself for missing keys', function() {
  assert.strictEqual(window.__('nonexistent_key'), 'nonexistent_key');
  assert.strictEqual(window.__(''), '');
});

test('__(key) with template variables replaces {count}', function() {
  var result = window.__('profile_csv_imported', { count: 42 });
  assert.strictEqual(result, 'CSV imported: 42 records');
});

test('__(key) with template variables replaces multiple placeholders', function() {
  window.TRANSLATIONS.en._test_multi = 'Hello {name}, you have {count} messages';
  assert.strictEqual(window.__('_test_multi', { name: 'Alice', count: 5 }), 'Hello Alice, you have 5 messages');
  delete window.TRANSLATIONS.en._test_multi;
});

test('__(key) returns German translation after switching language', function() {
  window.setLanguage('de');
  assert.strictEqual(window.__('app_name'), 'TRACE \u00b7 Kunstintelligenz');
  assert.strictEqual(window.__('begin_investigation'), 'UNTERSUCHUNG STARTEN');
  window.setLanguage('en');
});

test('__(key) returns French translation', function() {
  window.setLanguage('fr');
  assert.strictEqual(window.__('app_name'), 'TRACE \u00b7 Intelligence Artistique');
  window.setLanguage('en');
});

test('__(key) returns Spanish translation', function() {
  window.setLanguage('es');
  assert.strictEqual(window.__('app_name'), 'TRACE \u00b7 Inteligencia Art\u00edstica');
  window.setLanguage('en');
});

test('__(key) returns Italian translation', function() {
  window.setLanguage('it');
  assert.strictEqual(window.__('app_name'), 'TRACE \u00b7 Intelligenza Artistica');
  window.setLanguage('en');
});

test('__(key) falls back to English when missing in other language', function() {
  window.setLanguage('de');
  assert.strictEqual(window.__('live'), 'LIVE');
  window.setLanguage('en');
});

test('__(key) handles unknown language gracefully, falls back to English', function() {
  window.setLanguage('xx');
  assert.strictEqual(window.__('app_name'), 'TRACE \u00b7 Art Intelligence');
});

console.log('\n\u2500\u2500 i18n \u2014 setLanguage() \u2500\u2500');

test('setLanguage() changes window._lang', function() {
  window.setLanguage('de');
  assert.strictEqual(window._lang, 'de');
  window.setLanguage('en');
  assert.strictEqual(window._lang, 'en');
});

test('setLanguage() persists to localStorage', function() {
  window.setLanguage('fr');
  assert.strictEqual(localStorage.getItem('trace_lang'), 'fr');
  window.setLanguage('en');
  assert.strictEqual(localStorage.getItem('trace_lang'), 'en');
});

test('setLanguage() updates document.documentElement.lang', function() {
  window.setLanguage('de');
  assert.strictEqual(document.documentElement.lang, 'de');
  window.setLanguage('en');
  assert.strictEqual(document.documentElement.lang, 'en');
});

test('setLanguage() ignores invalid language codes', function() {
  window.setLanguage('en');
  window.setLanguage('invalid');
  assert.strictEqual(window._lang, 'en');
});

test('setLanguage() emits lang:changed event via registry', function() {
  var emitted = null;
  window.TRACE_REGISTRY.on('lang:changed', function(data) { emitted = data; });
  window.setLanguage('de');
  assert.ok(emitted !== null, 'Event should be emitted');
  assert.strictEqual(emitted.lang, 'de');
  window.setLanguage('en');
});

console.log('\n\u2500\u2500 i18n \u2014 getLanguages() \u2500\u2500');

test('getLanguages() returns 5 language objects', function() {
  var langs = window.getLanguages();
  assert.ok(Array.isArray(langs));
  assert.strictEqual(langs.length, 5);
  assert.strictEqual(langs[0].code, 'en');
  assert.strictEqual(langs[0].label, 'English');
});

test('getLanguages() includes all codes', function() {
  var codes = window.getLanguages().map(function(l) { return l.code; }).sort();
  assert.deepStrictEqual(codes, ['de', 'en', 'es', 'fr', 'it']);
});

test('getLanguages() labels match', function() {
  var labels = {};
  window.getLanguages().forEach(function(l) { labels[l.code] = l.label; });
  assert.strictEqual(labels.en, 'English');
  assert.strictEqual(labels.de, 'Deutsch');
  assert.strictEqual(labels.fr, 'Fran\u00e7ais');
  assert.strictEqual(labels.es, 'Espa\u00f1ol');
  assert.strictEqual(labels.it, 'Italiano');
});

console.log('\n\u2500\u2500 i18n \u2014 initI18n() \u2500\u2500');

test('initI18n() restores saved language from localStorage', function() {
  localStorage.setItem('trace_lang', 'de');
  window.initI18n();
  assert.strictEqual(window._lang, 'de');
  assert.strictEqual(document.documentElement.lang, 'de');
  localStorage.setItem('trace_lang', 'en');
  window.initI18n();
});

test('initI18n() defaults to English when no saved preference', function() {
  localStorage.removeItem('trace_lang');
  window.initI18n();
  assert.strictEqual(window._lang, 'en');
});

test('TRANSLATIONS has required keys for all 5 languages', function() {
  var requiredKeys = ['app_name', 'begin_investigation', 'scan_title', 'chat_title',
    'profile_language', 'cases_title', 'home_greeting'];
  var langs = ['en', 'de', 'fr', 'es', 'it'];
  langs.forEach(function(lang) {
    var dict = window.TRANSLATIONS[lang];
    assert.ok(dict, 'Translations exist for ' + lang);
    requiredKeys.forEach(function(key) {
      assert.ok(dict[key] !== undefined, lang + ' has "' + key + '"');
      assert.ok(dict[key].length > 0, lang + ' non-empty "' + key + '"');
    });
  });
});

// ══════════════════════════════════════════════
// CSV IMPORT TESTS
// ══════════════════════════════════════════════

console.log('\n\u2500\u2500 CSV \u2014 parseCSVLine() \u2500\u2500');

test('parseCSVLine() splits simple values', function() {
  assert.deepStrictEqual(window.parseCSVLine('a,b,c'), ['a', 'b', 'c']);
});

test('parseCSVLine() handles quoted fields with commas', function() {
  assert.deepStrictEqual(
    window.parseCSVLine('"Smith, John",30,Engineer'),
    ['Smith, John', '30', 'Engineer']
  );
});

test('parseCSVLine() handles escaped double-quotes', function() {
  var result = window.parseCSVLine('"Say ""Hello""",World');
  assert.deepStrictEqual(result, ['Say "Hello"', 'World']);
});

test('parseCSVLine() handles empty fields', function() {
  assert.deepStrictEqual(window.parseCSVLine('a,,c'), ['a', '', 'c']);
});

test('parseCSVLine() handles trailing empty field', function() {
  assert.deepStrictEqual(window.parseCSVLine('a,b,'), ['a', 'b', '']);
});

test('parseCSVLine() handles single value', function() {
  assert.deepStrictEqual(window.parseCSVLine('justone'), ['justone']);
});

test('parseCSVLine() preserves whitespace inside fields', function() {
  assert.deepStrictEqual(window.parseCSVLine('  a  ,  b  ,  c  '), ['  a  ', '  b  ', '  c  ']);
});

console.log('\n\u2500\u2500 CSV \u2014 parseGettyCSV() \u2500\u2500');

var SAMPLE_CSV = 'Title,Artist,Year,Medium,CurrentLocation,GPIReference,ULAN_ID\n'
  + '"The Night Watch","Rembrandt van Rijn",1642,"Oil on canvas",Rijksmuseum,GPI-NL-00142,500031291\n'
  + '"Girl with a Pearl Earring","Johannes Vermeer",1665,"Oil on canvas",Mauritshuis,GPI-NL-00165,500115493\n'
  + '"Mona Lisa","Leonardo da Vinci",1503,"Oil on poplar panel","Musee du Louvre",GPI-FR-01503,500030849\n';

test('parseGettyCSV() parses standard Getty CSV', function() {
  var records = window.parseGettyCSV(SAMPLE_CSV);
  assert.strictEqual(records.length, 3, 'Should parse 3 records');
  assert.strictEqual(records[0].title, 'The Night Watch');
  assert.strictEqual(records[0].artist, 'Rembrandt van Rijn');
  assert.strictEqual(records[0].year, '1642');
  assert.strictEqual(records[0].reference, 'GPI-NL-00142');
});

test('parseGettyCSV() auto-detects different column ordering', function() {
  var csv = 'Artist,Title,Year,Reference\n'
    + '"van Gogh","Sunflowers",1888,GPI-NL-01888\n'
    + '"Monet","Water Lilies",1916,GPI-FR-01916\n';
  var records = window.parseGettyCSV(csv);
  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0].artist, 'van Gogh');
  assert.strictEqual(records[0].title, 'Sunflowers');
});

test('parseGettyCSV() handles alternative column names', function() {
  var csv = 'Object Name,Creator,Date\n'
    + '"The Persistence of Memory","Salvador Dali",1931\n';
  var records = window.parseGettyCSV(csv);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].title, 'The Persistence of Memory');
  assert.strictEqual(records[0].artist, 'Salvador Dali');
});

test('parseGettyCSV() skips empty rows', function() {
  var records = window.parseGettyCSV('Title,Artist,Year\n\n\n"Test",Artist,2020\n\n');
  assert.strictEqual(records.length, 1);
});

test('parseGettyCSV() returns empty for header-only CSV', function() {
  assert.strictEqual(window.parseGettyCSV('Title,Artist,Year').length, 0);
});

test('parseGettyCSV() returns empty for empty string', function() {
  assert.strictEqual(window.parseGettyCSV('').length, 0);
});

test('parseGettyCSV() handles CRLF line endings', function() {
  var csv = 'Title,Artist,Year\r\n"Starry Night","Vincent van Gogh",1889\r\n';
  var records = window.parseGettyCSV(csv);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].title, 'Starry Night');
});

test('parseGettyCSV() adds importedAt timestamp', function() {
  var records = window.parseGettyCSV(SAMPLE_CSV);
  records.forEach(function(r) {
    assert.ok(r.importedAt, 'Record should have importedAt');
    assert.ok(!isNaN(Date.parse(r.importedAt)), 'importedAt valid ISO date');
  });
});

test('parseGettyCSV() trims whitespace from values', function() {
  var csv = 'Title,Artist,Year,Medium\n'
    + '  "Guernica"  ,  Picasso  ,  1937  ,  "Oil on canvas"  \n';
  var records = window.parseGettyCSV(csv);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].title, 'Guernica');
  assert.strictEqual(records[0].artist, 'Picasso');
});

console.log('\n\u2500\u2500 CSV \u2014 localStorage Persistence \u2500\u2500');

test('save/load round-trips through localStorage', function() {
  var records = [{ title: 'Test', artist: 'Artist', year: '2024', importedAt: new Date().toISOString() }];
  window.saveGettyCSVRecords(records);
  var loaded = window.loadGettyCSVRecords();
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].title, 'Test');
});

test('loadGettyCSVRecords() returns empty when nothing stored', function() {
  localStorage.removeItem('trace_getty_csv');
  window._gettyCSVRecords = null;
  assert.strictEqual(window.loadGettyCSVRecords().length, 0);
});

test('saveGettyCSVRecords() updates cache', function() {
  var records = [{ title: 'Cached', artist: 'Test', importedAt: new Date().toISOString() }];
  window.saveGettyCSVRecords(records);
  assert.strictEqual(window._gettyCSVRecords.length, 1);
  assert.strictEqual(window._gettyCSVRecords[0].title, 'Cached');
});

test('CSV storage round-trips exactly', function() {
  var original = [
    { title: 'A', artist: 'X', year: '1900', reference: 'REF1', importedAt: '2024-01-01' },
    { title: 'B', artist: 'Y', year: '1910', reference: 'REF2', importedAt: '2024-01-02' },
  ];
  window.saveGettyCSVRecords(original);
  assert.strictEqual(JSON.stringify(window.loadGettyCSVRecords()), JSON.stringify(original));
});

console.log('\n\u2500\u2500 CSV \u2014 searchGettyCSV() \u2500\u2500');

test('searchGettyCSV() finds by title', function() {
  window.saveGettyCSVRecords([
    { title: 'Mona Lisa', artist: 'Leonardo da Vinci', reference: 'REF001', importedAt: '2024-01-01' },
    { title: 'The Last Supper', artist: 'Leonardo da Vinci', reference: 'REF002', importedAt: '2024-01-01' },
    { title: 'Starry Night', artist: 'Vincent van Gogh', reference: 'REF003', importedAt: '2024-01-01' }
  ]);
  var results = window.searchGettyCSV('mona');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].title, 'Mona Lisa');
});

test('searchGettyCSV() finds by artist', function() {
  var results = window.searchGettyCSV('van gogh');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].title, 'Starry Night');
});

test('searchGettyCSV() finds by reference', function() {
  var results = window.searchGettyCSV('REF002');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].title, 'The Last Supper');
});

test('searchGettyCSV() is case-insensitive', function() {
  var results = window.searchGettyCSV('MONA');
  assert.strictEqual(results.length, 1);
});

test('searchGettyCSV() returns empty for no match', function() {
  assert.strictEqual(window.searchGettyCSV('zzzznotfound').length, 0);
});

test('searchGettyCSV() returns empty for empty query', function() {
  assert.strictEqual(window.searchGettyCSV('').length, 0);
});

test('searchGettyCSV() returns empty with no records', function() {
  localStorage.removeItem('trace_getty_csv');
  window._gettyCSVRecords = null;
  assert.strictEqual(window.searchGettyCSV('test').length, 0);
});

console.log('\n\u2500\u2500 CSV \u2014 getGettyCSVStats() \u2500\u2500');

test('getGettyCSVStats() returns correct totals', function() {
  window.saveGettyCSVRecords([
    { title: 'A', artist: 'X', importedAt: '2024-01-01' },
    { title: 'B', artist: 'Y', importedAt: '2024-01-01' },
    { title: 'C', artist: 'X', importedAt: '2024-01-01' }
  ]);
  var stats = window.getGettyCSVStats();
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.artists, 2);
});

test('getGettyCSVStats() handles empty', function() {
  window.saveGettyCSVRecords([]);
  var stats = window.getGettyCSVStats();
  assert.strictEqual(stats.total, 0);
  assert.strictEqual(stats.artists, 0);
});

console.log('\n\u2500\u2500 CSV \u2014 Dedup on Import \u2500\u2500');

test('dedup logic by reference works', function() {
  var existing = [
    { title: 'Mona Lisa', artist: 'Leonardo', reference: 'GPI-001', importedAt: '2024-01-01' }
  ];
  window.saveGettyCSVRecords(existing);

  var newRecords = [
    { title: 'Mona Lisa', artist: 'Leonardo', reference: 'GPI-001', importedAt: '2024-01-02' },
    { title: 'New Work', artist: 'New Artist', reference: 'GPI-002', importedAt: '2024-01-02' }
  ];

  // Simulate handleGettyCSV dedup
  var existingRefs = {};
  existing.forEach(function(r) { if (r.reference) existingRefs[r.reference] = true; });
  var merged = existing.slice();
  var added = 0;
  newRecords.forEach(function(r) {
    if (r.reference && existingRefs[r.reference]) return;
    merged.push(r);
    added++;
  });
  assert.strictEqual(added, 1);
  assert.strictEqual(merged.length, 2);
  assert.strictEqual(merged[1].reference, 'GPI-002');
});

// ══════════════════════════════════════════════
// SUMMARY
// ══════════════════════════════════════════════

var total = testsPassed + testsFailed;
console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
console.log('  Results: ' + testsPassed + '/' + total + ' passed' + (testsFailed > 0 ? ', ' + testsFailed + ' failed \u2717' : ''));
console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n');

process.exit(testsFailed > 0 ? 1 : 0);
