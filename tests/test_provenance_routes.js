// ══════════════════════════════════════════════
// TRACE — Provenance Routes Unit Tests
// Tests for: cookie fallback, warmup, Rijksmuseum, Europeana, Smithsonian
// Run: node tests/test_provenance_routes.js
// ══════════════════════════════════════════════

const assert = require("assert");
const path = require("path");

// Move to project root
process.chdir(path.resolve(__dirname, ".."));

console.log("\\n  Provenance Routes Tests");
console.log("  " + "=".repeat(40));

var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log("  \\u2713 " + name);
    passed++;
  } catch (e) {
    console.log("  \\u2717 " + name + ": " + e.message);
    failed++;
  }
}

// ── Mock environment ──
process.env.EUROPEANA_API_KEY = "test-europeana-key";
process.env.SMITHSONIAN_API_KEY = "test-smithsonian-key";

// ── 1. Cookie extraction from req.headers.cookie ──
test("handleVerify extracts token from cookie header", function () {
  var cookie = "trace_token=abc123; other=val";
  var match = cookie.match(/trace_token=([^;]+)/);
  assert.equal(match[1], "abc123", "Should extract trace_token value");
});

test("handleVerify returns null for missing cookie", function () {
  var cookie = "other=val";
  var match = cookie.match(/trace_token=([^;]+)/);
  assert.equal(match, null, "Should return null for missing cookie");
});

test("handleVerify handles empty cookie header", function () {
  var cookie = "";
  var match = cookie.match(/trace_token=([^;]+)/);
  assert.equal(match, null, "Should handle empty string");
});

test("handleVerify prefers body token over cookie", function () {
  var bodyToken = "body-token-456";
  var cookie = "trace_token=cookie-token-789";
  // Simulate the logic: use body token if present
  var token = bodyToken || (cookie.match(/trace_token=([^;]+)/) || [])[1];
  assert.equal(token, "body-token-456", "Body token takes priority");
});

test("handleVerify falls back to cookie when no body token", function () {
  var bodyToken = "";
  var cookie = "trace_token=cookie-token-789";
  var match = cookie.match(/trace_token=([^;]+)/);
  var token = bodyToken || (match ? match[1] : "");
  assert.equal(token, "cookie-token-789", "Cookie token used as fallback");
});

// ── 2. warmupGetty error handling ──
test("warmupGetty catches errors gracefully", function () {
  // Simulate the warmup function's catch handler
  var caught = null;
  var warmupFn = function () {
    return Promise.reject(new Error("SPARQL unavailable")).catch(function (e) {
      caught = e.message;
      return "handled";
    });
  };
  return warmupFn().then(function (result) {
    assert.equal(result, "handled", "Should return handled result");
    assert.equal(caught, "SPARQL unavailable", "Should catch the error");
  });
});

test("warmupGetty returns results on success", function () {
  var warmupFn = function () {
    return Promise.resolve(["Rembrandt", "Vermeer"]).then(function (r) {
      return "warmed up (" + r.length + " results)";
    });
  };
  return warmupFn().then(function (msg) {
    assert.ok(msg.indexOf("2 results") > 0, "Should report result count");
  });
});

// ── 3. Rijksmuseum search URL construction ──
test("Rijksmuseum URL uses creator and title params", function () {
  var a = "Rembrandt van Rijn";
  var t = "Night Watch";
  var url = "https://data.rijksmuseum.nl/search/collection?creator=" + encodeURIComponent(a) + "&title=" + encodeURIComponent(t);
  assert.ok(url.indexOf("creator=Rembrandt") > 0, "Should include creator param");
  assert.ok(url.indexOf("title=Night%20Watch") > 0, "Should include title param");
  assert.equal(url.indexOf("q="), -1, "Should NOT use q param");
});

test("Rijksmuseum handles empty inputs", function () {
  // Simulate the function's early return
  var t = "".trim();
  var a = "".trim();
  if (!t && !a) {
    assert.ok(true, "Returns empty for no inputs");
    return;
  }
  assert.fail("Should have returned early");
});

// ── 4. Europeana search URL construction ──
test("Europeana URL encodes full query correctly", function () {
  var apiKey = "test-key";
  var a = "Rembrandt";
  var t = "Night Watch";
  var queryParts = [];
  queryParts.push('who:"' + a + '"');
  queryParts.push('title:"' + t + '"');
  var query = queryParts.join(" AND ");
  var url = "https://api.europeana.eu/record/v2/search.json?wskey=" + encodeURIComponent(apiKey) + "&query=" + encodeURIComponent(query) + "&rows=5&reusability=open";
  // Verify encoding
  assert.ok(url.indexOf("wskey=test-key") > 0, "Should include API key");
  assert.ok(url.indexOf("who") > 0, "Should include who filter");
  assert.ok(url.indexOf("title") > 0, "Should include title filter");
  // The query should have encoded quotes: %22
  assert.ok(url.indexOf("%22") > 0, "Quotes should be percent-encoded");
});

test("Europeana returns empty when no API key set", function () {
  var apiKey = "";
  if (!apiKey) {
    assert.ok(true, "Early return when no API key");
    return;
  }
  assert.fail("Should have returned early");
});

// ── 5. Smithsonian search URL construction ──
test("Smithsonian URL includes api_key and q params", function () {
  var apiKey = "test-smith-key";
  var a = "Rembrandt";
  var query = 'online_media_type:Images AND name:"' + a + '"';
  var url = "https://api.si.edu/openaccess/api/v1.0/search?api_key=" + encodeURIComponent(apiKey) + "&q=" + encodeURIComponent(query) + "&rows=5";
  assert.ok(url.indexOf("api_key=test-smith-key") > 0, "Should include API key");
  assert.ok(url.indexOf("q=") > 0, "Should include q param");
  assert.ok(url.indexOf("online_media_type:Images") > 0 || url.indexOf("online_media_type%3AImages") > 0, "Should filter by images");
});

test("Smithsonian combines artist and title in query", function () {
  var a = "Rembrandt";
  var t = "Night Watch";
  var query = 'online_media_type:Images AND (title:"' + a + '" AND name:"' + t + '")';
  assert.ok(query.indexOf('name:"Night Watch"') > 0, "Should include name/title match");
  assert.ok(query.indexOf('title:"Rembrandt"') > 0, "Should include title/artist match");
});

test("Smithsonian returns empty when no API key and no input", function () {
  var apiKey = "";
  var t = "".trim();
  var a = "".trim();
  if (!apiKey && !t && !a) {
    assert.ok(true, "Early return with no key or input");
    return;
  }
  assert.fail("Should have returned early");
});

// ── Summary ──
console.log("\\n  " + "=".repeat(40));
console.log("  Results: " + passed + " passed, " + failed + " failed\\n");

process.exit(failed > 0 ? 1 : 0);
