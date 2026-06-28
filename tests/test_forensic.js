/** TRACE - Forensic Module Tests */
const fs = require("fs"), vm = require("vm");
let tp = 0, tf = 0;
function t(name, fn) { try { fn(); tp++; console.log("  OK " + name); } catch(e) { tf++; console.log("  FAIL " + name + ": " + e.message); } }
function eq(a, b, m) { if (a !== b) throw new Error((m||"") + " exp " + JSON.stringify(b) + " got " + JSON.stringify(a)); }
function tv(v, m) { if (!v) throw new Error((m||"") + " expected truthy"); }
console.log("\n--- Forensic Module Tests ---");
const c = fs.readFileSync(__dirname + "/../src/forensic.js", "utf8");
const sb = { window: { TRACE: {} }, setTimeout, console, Math, Date };
new vm.Script(c).runInNewContext(sb);
const F = sb.window.TRACE.Forensic;
t("Module loaded", function() { tv(F); eq(F.version, "2.0.0"); });
t("7 stages", function() { eq(F.stages.length, 7, "count"); });
t("analyze returns 7 stages", function() { var r = F.analyze(null,"Artist","canvas","17th"); ["macro","pigment","dendro","craquelure","ir","xrf","uv"].forEach(function(s){ tv(r[s]); }); });
t("analyze handles null", function() { tv(F.analyze(null,null,null,null).macro); });
t("dendro n/a for canvas", function() { eq(F.analyze(null,"A","canvas","17th").dendro.status, "n/a"); });
t("dendro estimated for panel", function() { var r = F.analyze(null,"A","panel","17th"); eq(r.dendro.status,"estimated"); });
t("pigment period-appropriate", function() { var r = F.analyze(null,"A","canvas","15th"); tv(r.pigment.pigments_expected.length > 0); });
t("generateReport returns HTML", function() { tv(F.analyze(null,"A","canvas","17th")); var h = F.generateReport(F.analyze(null,"A","canvas","17th")); tv(h.length > 50); });
t("generateReport null fallback", function() { tv(F.generateReport(null).indexOf("No results") >= 0); });
tp += tf; console.log("\nResults: " + tp + "/" + (tp+tf) + " passed"); if (tf > 0) process.exit(1);
