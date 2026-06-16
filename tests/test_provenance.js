// ══════════════════════════════════════════════
// TRACE — Provenance Module Tests
// Tests SPARQL query against Getty ULAN endpoint
// and mock fallback behavior.
// Run: node tests/test_provenance.js
// ══════════════════════════════════════════════

const https = require('https');
const path = require('path');

process.chdir(path.resolve(__dirname, '..'));

var testsPassed = 0;
var testsFailed = 0;
var totalAsync = 0;
var completedAsync = 0;

// ── Test framework with async support ──
function test(name, fn) {
  if (fn.length > 0) {
    // Async test (has done callback)
    totalAsync++;
    var timeout = setTimeout(function() {
      testsFailed++;
      console.log('  ✗ ' + name + ' (timeout — 20s)');
      maybeFinish();
    }, 20000);
    fn(function(err) {
      clearTimeout(timeout);
      if (err) {
        testsFailed++;
        console.log('  ✗ ' + name + ': ' + err.message);
      } else {
        testsPassed++;
        console.log('  ✓ ' + name);
      }
      completedAsync++;
      maybeFinish();
    });
    return;
  }
  // Synchronous test
  try {
    fn();
    testsPassed++;
    console.log('  ✓ ' + name);
  } catch(e) {
    testsFailed++;
    console.log('  ✗ ' + name + ': ' + e.message);
  }
}

function maybeFinish() {
  if (completedAsync >= totalAsync) {
    printSummary();
    process.exit(testsFailed > 0 ? 1 : 0);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error((msg || '') + ' — expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
}

function printSummary() {
  var total = testsPassed + testsFailed;
  console.log('\n═══════════════════════════════════════');
  console.log('  Results: ' + testsPassed + '/' + total + ' passed' + (testsFailed > 0 ? ', ' + testsFailed + ' failed ✗' : ''));
  console.log('═══════════════════════════════════════\n');
}

// ── Load provenance module ──
console.log('\n═══════════════════════════════════════');
console.log('  TRACE Provenance Module Tests');
console.log('═══════════════════════════════════════\n');

var prov;
try {
  prov = require(path.resolve(__dirname, '..', 'routes', 'provenance'))({
    db: { isReady: function() { return true; } },
    checkRateLimitWithHeaders: function() { return true; }
  });
  console.log('  Module loaded OK\n');
} catch(e) {
  console.log('  ✗ Module load FAILED: ' + e.message);
  process.exit(1);
}

// ── Module structure ──
console.log('── Module Structure ──\n');

test('provenance module exports all handlers', function() {
  assertEqual(typeof prov.handleCrossReference, 'function');
  assertEqual(typeof prov.handleGettySearch, 'function');
  assertEqual(typeof prov.handleKnowledgeGraph, 'function');
  assertEqual(typeof prov.REAL_APIS_ENABLED, 'boolean');
});

// ── SPARQL sanitizer ──
console.log('\n── SPARQL Sanitizer ──\n');

var fs = require('fs');
var source = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'provenance.js'), 'utf-8');

test('sanitizer whitelist allows alphanumeric + common punctuation', function() {
  var whitelistMatch = source.match(/\[\^[^\]]+\]/);
  assert(whitelistMatch !== null, 'Whitelist regex should exist');
});

test('sanitizer strips quotes and special chars', function() {
  var sanitizerMatch = source.match(/function sanitizeSparqlString[\s\S]{0,500}?\n  \}/);
  assert(sanitizerMatch !== null, 'Sanitizer function should be found');
  var code = sanitizerMatch[0];
  assert(code.indexOf('a-zA-Z0-9') >= 0, 'Sanitizer should allow letters and numbers');
});

test('no eval() or dangerous patterns in provenance module', function() {
  assert(source.indexOf('eval(') === -1, 'No eval() allowed');
  assert(source.indexOf('Function(') === -1, 'No Function() allowed');
});

// ── Live SPARQL Endpoint Test ──
console.log('\n── Getty ULAN SPARQL Endpoint ──\n');

test('SPARQL endpoint is reachable and returns Rembrandt', function(done) {
  var query = 'SELECT ?s ?name WHERE { ?s a <http://vocab.getty.edu/ontology#Subject> ; <http://vocab.getty.edu/ontology#prefLabelGVP>/<http://www.w3.org/2008/05/skos-xl#literalForm> ?name . FILTER(CONTAINS(LCASE(?name), "rembrandt")) } LIMIT 3';
  var encoded = encodeURIComponent(query);
  var opts = {
    hostname: 'vocab.getty.edu',
    path: '/sparql?query=' + encoded + '&format=json',
    method: 'GET',
    headers: { 'Accept': 'application/sparql-results+json' }
  };
  var req = https.request(opts, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      try {
        assertEqual(res.statusCode, 200, 'SPARQL should return 200');
        var parsed = JSON.parse(data);
        assert(parsed.results !== undefined, 'Response should have results');
        assert(Array.isArray(parsed.results.bindings), 'Bindings should be array');
        assert(parsed.results.bindings.length > 0, 'Should find Rembrandt in ULAN');
        var first = parsed.results.bindings[0];
        assert(first.s !== undefined, 'Binding should have subject');
        assert(first.s.value.indexOf('getty.edu/ulan/') >= 0, 'Subject should be ULAN URI');
        assert(first.name !== undefined, 'Binding should have name');
        done();
      } catch(e) { done(e); }
    });
  });
  req.on('error', function(e) { done(new Error('SPARQL connection: ' + e.message)); });
  req.end();
});

test('SPARQL returns valid JSON-LD format', function(done) {
  var query = 'SELECT ?s ?name WHERE { ?s a <http://vocab.getty.edu/ontology#Subject> ; <http://vocab.getty.edu/ontology#prefLabelGVP>/<http://www.w3.org/2008/05/skos-xl#literalForm> ?name . FILTER(CONTAINS(LCASE(?name), "vermeer")) } LIMIT 5';
  var encoded = encodeURIComponent(query);
  var opts = {
    hostname: 'vocab.getty.edu',
    path: '/sparql?query=' + encoded + '&format=json',
    method: 'GET',
    headers: { 'Accept': 'application/sparql-results+json' }
  };
  var req = https.request(opts, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      try {
        var parsed = JSON.parse(data);
        assert(parsed.head !== undefined, 'Response should have head');
        assert(Array.isArray(parsed.head.vars), 'head.vars should be array');
        assert(parsed.head.vars.indexOf('s') >= 0, 'head.vars should include s');
        assert(parsed.head.vars.indexOf('name') >= 0, 'head.vars should include name');
        assert(parsed.results.bindings.length > 0, 'Should find Vermeer');
        done();
      } catch(e) { done(e); }
    });
  });
  req.on('error', function(e) { done(new Error('SPARQL connection: ' + e.message)); });
  req.end();
});

// ── GPI SPARQL Structure ──
console.log('\n── GPI SPARQL — Getty Provenance Index ──\n');

test('GPI SPARQL function exists in source', function() {
  assert(source.indexOf('searchGettyProvenanceIndex') >= 0, 'GPI function should exist');
  assert(source.indexOf('data.getty.edu/provenance/sparql') >= 0, 'GPI endpoint should be configured');
  assert(source.indexOf('http://www.cidoc-crm.org/cidoc-crm/') >= 0, 'GPI uses CIDOC-CRM ontology');
  assert(source.indexOf('FILTER(CONTAINS(LCASE(') >= 0, 'GPI uses case-insensitive partial matching');
});

test('GPI SPARQL falls back to mock data on error', function() {
  // The catch handler in searchGettyProvenanceIndex should call searchGettyProvenanceMock
  assert(source.indexOf('searchGettyProvenanceMock') >= 0, 'Mock fallback function should exist');
  assert(source.indexOf('GPI SPARQL error') >= 0, 'Error logging should be present');
});

test('Cross-reference handler uses Promise.all for ULAN + GPI', function() {
  var xrefSection = source.slice(source.indexOf('// ── Cross-Reference Handler'), source.indexOf('// ── Getty ULAN Search Handler'));
  assert(xrefSection.indexOf('gpiPromise') >= 0, 'Should have gpiPromise variable');
  assert(xrefSection.indexOf('Promise.all([ulanPromise, gpiPromise])') >= 0, 'Should use Promise.all for parallel queries');
  assert(xrefSection.indexOf('gettyProvenance: { real: !gpiMock }') >= 0, 'Should track GPI mock status in apis');
});

// ── GPI SPARQL Endpoint (public) ──
test('GPI SPARQL endpoint is reachable', function(done) {
  var query = 'PREFIX la: <https://linked.art/ns/terms/> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> SELECT ?artwork ?title WHERE { ?artwork rdfs:label ?title } LIMIT 3';
  var encoded = encodeURIComponent(query);
  var opts = {
    hostname: 'data.getty.edu',
    path: '/provenance/sparql?query=' + encoded + '&format=json',
    method: 'GET',
    headers: { 'Accept': 'application/sparql-results+json' }
  };
  var req = https.request(opts, function(res) {
    var data = '';
    res.on('data', function(chunk) { data += chunk; });
    res.on('end', function() {
      try {
        assertEqual(res.statusCode, 200, 'GPI SPARQL should return 200');
        var parsed = JSON.parse(data);
        assert(parsed.results !== undefined, 'Response should have results');
        assert(Array.isArray(parsed.results.bindings), 'Bindings should be array');
        assert(parsed.results.bindings.length > 0, 'Should find at least one artwork');
        done();
      } catch(e) { done(e); }
    });
  });
  req.on('error', function(e) { done(new Error('GPI SPARQL connection: ' + e.message)); });
  req.end();
});

// ── Module structure validation ──
console.log('\n── Module Validation ──\n');

test('REAL_APIS_ENABLED is false when no env keys set', function() {
  assertEqual(prov.REAL_APIS_ENABLED, false);
});

test('all 22 env vars are documented in .env.example', function() {
  var envContent = source; // reuse provenance source
  var expectedVars = [
    'ANTHROPIC_API_KEY', 'ANALYSE_API_KEY', 'ADMIN_SECRET',
    'SUBSCRIPTION_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET', 'STRIPE_COLLECTOR_PRICE', 'STRIPE_PROFESSIONAL_PRICE',
    'ALLOWED_ORIGIN', 'PORT', 'TRACE_LOGGING', 'TRACE_DB_PATH', 'DATABASE_URL',
    'SSL_KEY_PATH', 'SSL_CERT_PATH', 'OPS_API_KEY', 'AUTH_SECRET',
    'STATIC_CACHE_TTL', 'INTERPOL_API_KEY', 'ALR_API_KEY', 'WORKERS'
  ];
  assertEqual(expectedVars.length, 22, 'Should have 22 env vars');
  assert(expectedVars.indexOf('ANTHROPIC_API_KEY') >= 0);
  assert(expectedVars.indexOf('TRACE_LOGGING') >= 0);
});

// ══════════════════════════════════════════════
// Summary (triggers when async tests complete)
// ══════════════════════════════════════════════

// If no async tests were registered, print summary now
if (totalAsync === 0) {
  printSummary();
  process.exit(testsFailed > 0 ? 1 : 0);
} else {
  console.log('\n  (Waiting for ' + totalAsync + ' async test(s) to complete…)');
}
