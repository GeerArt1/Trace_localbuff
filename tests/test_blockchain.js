/** TRACE - Blockchain Module v2 Tests */
const fs = require("fs"), vm = require("vm");
let tp = 0, tf = 0;
function t(name, fn) { try { fn(); tp++; console.log("  OK " + name); } catch(e) { tf++; console.log("  FAIL " + name + ": " + e.message); } }
function eq(a, b, m) { if (a !== b) throw new Error((m||"") + " exp " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function tv(v, m) { if (!v) throw new Error((m||"") + " expected truthy"); }
function neq(a, b, m) { if (a === b) throw new Error((m||"") + " should differ"); }

console.log("\n--- Blockchain Module v2 Tests ---");
const c = fs.readFileSync(__dirname + "/../src/blockchain.js", "utf8");
const sb = { window: { TRACE: {} }, setTimeout, console, Math, Date, sha3: undefined };
new vm.Script(c).runInNewContext(sb);
const B = sb.window.TRACE.Blockchain;

t("Module loaded v2", function() { tv(B); eq(B.version, "2.0.0", "v2"); });
t("4 networks defined", function() {
  tv(B.networks); eq(Object.keys(B.networks).length, 4, "4 networks");
  tv(B.networks.ethereum); tv(B.networks.polygon); tv(B.networks.optimism); tv(B.networks.sepolia);
});
t("register requires title", function() {
  var r = B.registerProvenance({});
  eq(r.success, false, "fails"); tv(r.error, "has error");
});
t("register succeeds with valid data", function() {
  var r = B.registerProvenance({ title: "Starry Night", artist: "van Gogh", year: "1889", medium: "Oil" });
  tv(r.success, "success"); tv(r.transaction, "tx"); tv(r.transaction.txHash, "hash");
  eq(r.transaction.txHash.indexOf("0x"), 0, "0x prefix");
});
t("register defaults to sepolia", function() {
  var r = B.registerProvenance({ title: "Test" });
  eq(r.transaction.network, "sepolia", "default network");
});
t("register uses specified network", function() {
  var r = B.registerProvenance({ title: "Test Eth" }, "ethereum");
  eq(r.transaction.network, "ethereum", "ethereum");
});
t("getHistory returns array with entries", function() {
  var h = B.getHistory();
  tv(Array.isArray(h), "array"); tv(h.length > 0, "has entries");
});
t("verifyProvenance verifies registered artwork", function() {
  var data = { title: "Mona Lisa", artist: "da Vinci", year: "1503" };
  var reg = B.registerProvenance(data);
  var v = B.verifyProvenance(data, reg.transaction.txHash);
  tv(v.success, "verified"); tv(v.verification, "detail");
  eq(v.verification.match, true, "hash matches");
});
t("verifyProvenance returns false for unregistered", function() {
  var v = B.verifyProvenance({ title: "Nonexistent" });
  eq(v.success, false, "not verified");
});
t("renderPanel returns HTML", function() {
  var html = B.renderPanel();
  tv(html.length > 50, "html"); tv(typeof html === "string", "string");
});
t("_buildProvenanceString includes fields", function() {
  var s = B._buildProvenanceString({ title: "T", artist: "A", year: "Y" });
  tv(s.indexOf("TITLE:T") >= 0, "has title"); tv(s.indexOf("ARTIST:A") >= 0, "has artist");
  tv(s.indexOf("YEAR:Y") >= 0, "has year");
});
t("Provider switching works", function() {
  B.useSimulated();
  eq(B._getProvider().name, "Simulated", "revert to simulated");
});

console.log("\nBlockchain v2: " + tp + "/" + (tp+tf) + " passed");
process.exit(tf > 0 ? 1 : 0);
