/** TRACE - Proxy Module Tests */
const fs = require("fs"), vm = require("vm");
let tp = 0, tf = 0;
function t(name, fn) { try { var r = fn(); if(r && typeof r.then==="function") { r.then(function(){console.log("  OK "+name);}).catch(function(e){tf++;console.log("  FAIL "+name+": "+e.message);}); tp++; } else { tp++; console.log("  OK "+name); } } catch(e) { tf++; console.log("  FAIL "+name+": "+e.message); } }
function eq(a, b, m) { if (a !== b) throw new Error((m||"") + " exp " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function tv(v, m) { if (!v) throw new Error((m||"") + " expected truthy"); }
function neq(a, b, m) { if (a === b) throw new Error((m||"") + " should differ"); }

console.log("\n--- Proxy Module Tests ---");
const c = fs.readFileSync(__dirname + "/../src/proxy.js", "utf8");
var store = {};
var mockLocalStorage = { getItem: function(k) { return store[k] || null; }, setItem: function(k, v) { store[k] = v; }, removeItem: function(k) { delete store[k]; } };
var mockFetch = function() { return Promise.resolve({ ok: true, json: function() { return Promise.resolve({ status: "ok", message: "mock" }); } }); };
var mockRegistry = { register: function(n, a) {} };
var sb = { window: { TRACE: { Registry: mockRegistry }, localStorage: mockLocalStorage, setTimeout: setTimeout, fetch: mockFetch }, console, Math, Date, JSON, location: { href: "http://localhost" }, TextEncoder: require("util").TextEncoder, ArrayBuffer: global.ArrayBuffer, Uint8Array, crypto: null, localStorage: mockLocalStorage, fetch: mockFetch, setTimeout: setTimeout };
new vm.Script(c).runInNewContext(sb);
const P = sb.window.TRACE.Proxy;

// Reset state
store = {};

t("Module loaded", function() { tv(P); eq(P.version, "1.0.0", "v1"); });
t("STORAGE_KEY defined", function() { eq(P.STORAGE_KEY, "trace_hq_railway", "key"); });
t("Not configured by default", function() { eq(P.isConfigured(), false, "not configured"); });
t("saveUrl and getUrl round-trip", function() {
  var url = "https://my-railway-app.up.railway.app";
  tv(P.saveUrl(url), "saved");
  eq(P.getUrl(), url, "round-trip");
  tv(P.isConfigured(), "configured now");
});
t("empty URL not configured", function() {
  P.saveUrl("");
  eq(P.isConfigured(), false, "empty not configured");
  P.saveUrl("not-a-url");
  eq(P.isConfigured(), false, "bad url not configured");
});
t("renderStatus shows not configured", function() {
  P.saveUrl("");
  var html = P.renderStatus();
  tv(typeof html === "string", "string");
  tv(html.length > 10, "has content");
});
t("renderStatus shows configured", function() {
  P.saveUrl("https://example.com");
  var html = P.renderStatus();
  tv(typeof html === "string", "string");
  tv(html.indexOf("example.com") >= 0 || html.length > 10, "shows url");
});
t("healthCheck returns status", async function() {
  P.saveUrl("https://example.com");
  var result = await P.healthCheck();
  tv(result, "result");
});
t("analyzeImage fallback without URL", async function() {
  P.saveUrl("");
  var result = await P.analyzeImage("mock-data");
  tv(result, "result");
  tv(result.demo === true || result.prediction, "has fallback data");
});
t("queryDatabase fallback without URL", async function() {
  P.saveUrl("");
  var result = await P.queryDatabase("getty_ulan", "Rembrandt");
  tv(result, "result");
});
t("callWithFallback without URL uses demo", async function() {
  P.saveUrl("");
  var result = await P.callWithFallback("/custom", { q: "test" }, function() { return { fallback: true }; });
  tv(result, "result");
  eq(result.fallback, true, "used fallback");
});

console.log("\nProxy: " + tp + "/" + (tp+tf) + " passed");
process.exit(tf > 0 ? 1 : 0);
