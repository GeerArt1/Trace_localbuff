#!/usr/bin/env node
// ══════════════════════════════════════════════
// TRACE — Combined Test Runner
// Runs all test suites in sequence and reports
// a unified pass/fail result.
// Usage: node tests/test_all.js
// ══════════════════════════════════════════════

var path = require('path');
var cp = require('child_process');

// Ensure we're in the trace/ directory
process.chdir(path.resolve(__dirname, '..'));

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║           TRACE — Full Test Suite                        ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

var suites = [
  { name: 'Server Core', file: 'tests/test_server_core.js', env: {} },
  { name: 'Database',    file: 'tests/test_db.js',           env: { TRACE_DB_PATH: path.resolve(__dirname, '..', 'trace_db_test.sqlite') } },
  { name: 'Client i18n + CSV', file: 'tests/test_client.js', env: {} },
  { name: 'Integration',      file: 'tests/test_integration.js', env: {} },
  { name: 'Provenance Timeline', file: 'tests/test_provenance_timeline.js', env: {} }
];

var passed = 0;
var failed = 0;
var results = [];

function runSuite(suiteIdx) {
  if (suiteIdx >= suites.length) {
    // All done — print summary
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  FINAL RESULTS                                          ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('');
    results.forEach(function(r) {
      var icon = r.exitCode === 0 ? '  ✓' : '  ✗';
      console.log(icon + '  ' + r.name + ': ' + (r.exitCode === 0 ? 'PASSED' : 'FAILED'));
    });
    var totalPassed = results.filter(function(r) { return r.exitCode === 0; }).length;
    var totalFailed = results.filter(function(r) { return r.exitCode !== 0; }).length;
    console.log('\n  ' + totalPassed + '/' + (totalPassed + totalFailed) + ' suites passed');
    if (totalFailed > 0) {
      console.log('  Some suites failed. Run individual suites for details.');
      process.exit(1);
    } else {
      console.log('  All suites passed.');
      process.exit(0);
    }
    return;
  }

  var suite = suites[suiteIdx];
  console.log('\n─────────────────────────────────────────────────────────────────');
  console.log('  Suite ' + (suiteIdx + 1) + '/' + suites.length + ': ' + suite.name);
  console.log('─────────────────────────────────────────────────────────────────\n');

  var child = cp.spawn('node', [suite.file], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'inherit', 'inherit'],
    env: Object.assign({}, process.env, suite.env)
  });

  child.on('close', function(code) {
    code = code === null ? 1 : code; // Treat signal-kill as failure
    results.push({ name: suite.name, exitCode: code });
    runSuite(suiteIdx + 1);
  });
}

runSuite(0);
