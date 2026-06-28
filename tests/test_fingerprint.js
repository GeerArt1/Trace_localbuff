/** TRACE - Fingerprint Module v2 Tests */
const fs = require("fs"), vm = require("vm");
let tp = 0, tf = 0;
function t(name, fn) { try { var r = fn(); if(r && typeof r.then==="function") { r.then(function(){console.log("  OK "+name);}).catch(function(e){tf++;console.log("  FAIL "+name+": "+e.message);}); tp++; } else { tp++; console.log("  OK "+name); } } catch(e) { tf++; console.log("  FAIL "+name+": "+e.message); } }
function eq(a, b, m) { if (a !== b) throw new Error((m||"") + " exp " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function tv(v, m) { if (!v) throw new Error((m||"") + " expected truthy"); }
function neq(a, b, m) { if (a === b) throw new Error((m||"") + " should differ"); }

console.log("\n--- Fingerprint Module v2 Tests ---");
const c = fs.readFileSync(__dirname + "/../src/fingerprint.js", "utf8");
const CryptoMock = { subtle: null }; // Simulate no crypto.subtle for Node
const sb = { window: { TRACE: {} }, crypto: CryptoMock, setTimeout, console, Math, Date, TextEncoder: require("util").TextEncoder, Uint8Array, Float64Array, ArrayBuffer };
new vm.Script(c).runInNewContext(sb);
const F = sb.window.TRACE.Fingerprint;

t("Module loaded v2", function() { tv(F); eq(F.version, "2.0.0", "v2"); });
t("Hash types defined", function() { tv(F.hashTypes); eq(F.hashTypes.length, 3, "3 types"); });
t("generate with null returns demo", async function() {
  var r = await F.generate(null);
  tv(r, "result"); tv(r.fingerprint_id, "has id"); eq(r.metadata.mode, "demo", "demo mode");
});
t("generate with input hashes", async function() {
  var r = await F.generate({ title: "Mona Lisa", artist: "da Vinci", year: "1503", medium: "Oil" });
  tv(r, "result"); tv(r.hashTypes.sha256, "has sha256"); tv(r.hashTypes.dhash, "has dhash");
  tv(r.hash_string, "hash string"); eq(r.source, "Mona Lisa", "source");
});
t("provenanceFingerprint with events", async function() {
  var r = await F.provenanceFingerprint([{ date: "1503", event: "Created", party: "da Vinci" }]);
  tv(r, "hash"); tv(typeof r === "string", "string");
  neq(r, "", "non-empty");
});
t("provenanceFingerprint null returns deterministic", async function() {
  var r = await F.provenanceFingerprint(null);
  tv(r, "hash"); tv(typeof r === "string", "string");
});
t("similarity identical returns 1", function() {
  var fp = { hashTypes: { dhash: "abc123", phash: "def456", sha256: "789abc" } };
  eq(F.similarity(fp, fp), 1, "identical");
});
t("similarity completely different returns 0", function() {
  var a = { hashTypes: { dhash: "0000000000000000", phash: "0000000000000000", sha256: "0000000000000000" } };
  var b = { hashTypes: { dhash: "ffffffffffffffff", phash: "ffffffffffffffff", sha256: "ffffffffffffffff" } };
  eq(F.similarity(a, b), 0, "no similarity");
});
t("similarity null returns 0", function() {
  eq(F.similarity(null, { hashTypes: {} }), 0, "null");
  eq(F.similarity({ hashTypes: {} }, null), 0, "null");
});
t("verifyAgainstStolen empty db returns empty", function() {
  var fp = { hashTypes: { dhash: "abc", phash: "def", sha256: "ghi" } };
  eq(F.verifyAgainstStolen(fp, []).length, 0, "empty");
});
t("render returns HTML for valid fp", function() {
  var fp = { fingerprint_id: "FP-TEST", source: "Test", version: "2.0.0", generated_at: "2025-01-01", hashTypes: { sha256: "abc" }, hash_string: "abc:def:ghi" };
  var html = F.render(fp);
  tv(html.length > 30, "html"); tv(html.indexOf(fp.fingerprint_id) >= 0, "contains id");
});
t("render null returns placeholder", function() {
  eq(F.render(null).indexOf("No fingerprint generated yet.") >= 0, true, "placeholder contains text");
});

console.log("\nFingerprint v2: " + tp + "/" + (tp+tf) + " passed");
process.exit(tf > 0 ? 1 : 0);
