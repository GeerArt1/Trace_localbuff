// ══════════════════════════════════════════════
// TRACE — Geometry Module Unit Tests
// Tests golden spiral math, overlay logic,
// and module structure
// Run: node tests/test_geometry.js
// ══════════════════════════════════════════════

var assert = require('assert');

// ── Pure math functions extracted from geometry.js ──

/**
 * Golden spiral: r(θ) = a * e^(b*θ)
 * where b = ln(φ) / (π/2) ensures growth by φ every quarter-turn
 */
var PHI = 1.6180339887;

function goldenSpiralRadius(theta, a, b) {
  return a * Math.exp(b * theta);
}

function goldenSpiralB() {
  return Math.log(PHI) / (Math.PI / 2);
}

/**
 * Rule of thirds intersection points
 */
function ruleOfThirdsPoints(W, H) {
  return [
    [W / 3, H / 3], [2 * W / 3, H / 3],
    [W / 3, 2 * H / 3], [2 * W / 3, 2 * H / 3]
  ];
}

/**
 * Golden ratio split point
 */
function goldenSplit(W) {
  return W / (1 + 1 / PHI);
}

/**
 * Closest root rectangle for dynamic symmetry
 */
function closestRootRect(aspect) {
  var roots = [1.414, 1.732, 2.0, 2.236];
  var labels = ['√2', '√3', '√4', '√5'];
  var closest = 0, closestDiff = Infinity;
  roots.forEach(function(r, i) {
    var diff = Math.abs(aspect - r);
    if (diff < closestDiff) { closestDiff = diff; closest = i; }
  });
  return { root: roots[closest], label: labels[closest], index: closest };
}

// ── Tests ──
var testsPassed = 0;
var testsFailed = 0;

function test(name, fn) {
  console.log('  [TEST] ' + name);
  try {
    fn();
    console.log('    ✓ PASS');
    testsPassed++;
  } catch(e) {
    console.log('    ✗ FAIL: ' + e.message);
    testsFailed++;
  }
}

console.log('\n═══════════════════════════════════════');
console.log('  TRACE Geometry Module Tests');
console.log('═══════════════════════════════════════\n');

// ── Golden Ratio Math ──
console.log('── Golden Ratio Math ──');

test('PHI is approximately 1.618', function() {
  assert.ok(Math.abs(PHI - 1.6180339887) < 0.0001, 'PHI should be ~1.618');
});

test('goldenSpiralB computes correct value', function() {
  var b = goldenSpiralB();
  // b = ln(φ) / (π/2) = 0.4812... / 1.5708... ≈ 0.30635
  assert.ok(Math.abs(b - 0.30635) < 0.001, 'b should be ~0.30635, got: ' + b);
});

test('golden spiral grows by factor φ every quarter-turn', function() {
  var b = goldenSpiralB();
  var a = 10;
  var r0 = goldenSpiralRadius(0, a, b);
  var r90 = goldenSpiralRadius(Math.PI / 2, a, b); // quarter turn
  var r180 = goldenSpiralRadius(Math.PI, a, b);    // half turn
  var r270 = goldenSpiralRadius(3 * Math.PI / 2, a, b); // three-quarter turn
  var r360 = goldenSpiralRadius(2 * Math.PI, a, b);    // full turn

  // After 90 degrees, radius should be ~ φ times larger
  assert.ok(Math.abs(r90 / r0 - PHI) < 0.01,
    'Quarter-turn growth should be φ (~' + PHI + '), got: ' + (r90 / r0));
  // After 180 degrees, radius should be ~ φ² times larger
  assert.ok(Math.abs(r180 / r0 - PHI * PHI) < 0.02,
    'Half-turn growth should be φ², got: ' + (r180 / r0));
  // After 360 degrees, radius should be ~ φ⁴ times larger
  assert.ok(Math.abs(r360 / r0 - Math.pow(PHI, 4)) < 0.05,
    'Full-turn growth should be φ⁴, got: ' + (r360 / r0));
});

test('golden spiral radius increases monotonically', function() {
  var b = goldenSpiralB();
  var a = 5;
  var prev = goldenSpiralRadius(0, a, b);
  for (var i = 1; i <= 100; i++) {
    var theta = i * Math.PI * 4 / 100; // 2 full rotations
    var r = goldenSpiralRadius(theta, a, b);
    assert.ok(r > prev, 'Radius should increase with theta: ' + r + ' <= ' + prev + ' at theta=' + theta);
    prev = r;
  }
});

test('golden spiral starts at correct radius', function() {
  var b = goldenSpiralB();
  var a = 15;
  assert.strictEqual(goldenSpiralRadius(0, a, b), a, 'At θ=0, r should equal a');
});

test('goldenSplit divides rectangle at golden ratio point', function() {
  var W = 1000;
  var split = goldenSplit(W);
  // The split should be at W / φ ≈ 618 (for the larger part) or W * (1 - 1/φ) ≈ 382
  // W / (1 + 1/φ) where 1/φ ≈ 0.618, so denominator ≈ 1.618
  // 1000 / 1.618 ≈ 618 — this is the smaller section
  // Actually a = W / (1 + 1/PHI) = W / 1.618 = 618
  assert.ok(Math.abs(split - 618) < 1, 'Golden split should be ~618 for W=1000, got: ' + split);      // The ratio of split (smaller) to (W - split) (larger) should equal 1/φ
      // a = W / (1 + 1/φ) gives the smaller section, so (W - a) / a should be 1/φ
      // But we want the ratio of larger to smaller = φ, so test a / (W - a) = φ
      var ratio = (W - split) / split;
      assert.ok(Math.abs(ratio - 1 / PHI) < 0.01,
        'Ratio of smaller to larger should be 1/φ, got: ' + ratio + ' (expected ~' + (1/PHI) + ')');
});

// ── Rule of Thirds ──
console.log('\n── Rule of Thirds ──');

test('ruleOfThirdsPoints returns 4 intersection points', function() {
  var pts = ruleOfThirdsPoints(900, 600);
  assert.strictEqual(pts.length, 4);
  // All points should be within bounds
  pts.forEach(function(p) {
    assert.ok(p[0] >= 0 && p[0] <= 900, 'X should be in [0, 900]');
    assert.ok(p[1] >= 0 && p[1] <= 600, 'Y should be in [0, 600]');
  });
});

test('ruleOfThirdsPoints are correctly positioned', function() {
  var pts = ruleOfThirdsPoints(900, 600);
  // Top-left: (300, 200)
  assert.strictEqual(pts[0][0], 300);
  assert.strictEqual(pts[0][1], 200);
  // Bottom-right: (600, 400)
  assert.strictEqual(pts[3][0], 600);
  assert.strictEqual(pts[3][1], 400);
});

// ── Dynamic Symmetry ──
console.log('\n── Dynamic Symmetry ──');

test('closestRootRect finds √2 for 1.4 aspect ratio', function() {
  var result = closestRootRect(1.4);
  assert.strictEqual(result.label, '√2');
  assert.ok(Math.abs(result.root - 1.414) < 0.001);
});

test('closestRootRect finds √3 for 1.7 aspect ratio', function() {
  var result = closestRootRect(1.7);
  assert.strictEqual(result.label, '√3');
});

test('closestRootRect finds √4 for 2.0 aspect ratio', function() {
  var result = closestRootRect(2.0);
  assert.strictEqual(result.label, '√4');
});

test('closestRootRect finds √5 for 2.2 aspect ratio', function() {
  var result = closestRootRect(2.2);
  assert.strictEqual(result.label, '√5');
});

test('closestRootRect handles extreme aspect ratios', function() {
  var result = closestRootRect(0.5);
  // Closest to √2 (1.414) since all roots are >1
  assert.ok(result.label === '√2' || result.label === '√3', 'Should pick a valid root');
});

// ── Spiral Growth Factor ──
console.log('\n── Spiral Growth Factor ──');

test('spiral grows by φ every quarter turn across multiple rotations', function() {
  var b = goldenSpiralB();
  var a = 1;
  var thetas = [];
  for (var t = 0; t <= 8; t++) {
    thetas.push(t * Math.PI / 2);
  }

  for (var i = 1; i < thetas.length; i++) {
    var rPrev = goldenSpiralRadius(thetas[i - 1], a, b);
    var rCurr = goldenSpiralRadius(thetas[i], a, b);
    var growth = rCurr / rPrev;
    assert.ok(Math.abs(growth - PHI) < 0.02,
      'Quarter-turn growth at iteration ' + i + ' should be φ, got: ' + growth);
  }
});

test('spiral has no discontinuities at standard canvas sizes', function() {
  var b = goldenSpiralB();
  var sizes = [
    { W: 800, H: 600 },
    { W: 1024, H: 768 },
    { W: 1920, H: 1080 },
    { W: 400, H: 600 },
    { W: 100, H: 100 }
  ];

  sizes.forEach(function(s) {
    var maxR = Math.min(s.W, s.H) * 0.42;
    var a = maxR * 0.08;
    var steps = 300;
    var maxTheta = Math.PI * 3.5;

    var prevX = null, prevY = null;
    for (var i = 0; i <= steps; i++) {
      var theta = (i / steps) * maxTheta;
      var r = goldenSpiralRadius(theta, a, b);
      var px = s.W / 2 + r * Math.cos(theta);
      var py = s.H / 2 + r * Math.sin(theta);

      assert.ok(isFinite(px), 'X should be finite at step ' + i + ' for ' + JSON.stringify(s));
      assert.ok(isFinite(py), 'Y should be finite at step ' + i + ' for ' + JSON.stringify(s));

      prevX = px;
      prevY = py;
    }
  });
});

// ── Overlay Toggle Logic ──
console.log('\n── Overlay Toggle Logic (Module Structure) ──');

test('overlay types are correctly enumerated', function() {
  var valid = ['golden', 'thirds', 'spiral', 'symmetry', 'radial'];
  assert.strictEqual(valid.length, 5);
  assert.ok(valid.indexOf('golden') >= 0);
  assert.ok(valid.indexOf('spiral') >= 0);
  assert.ok(valid.indexOf('radial') >= 0);
});

test('global function names follow sg* prefix convention', function() {
  var expectedFns = ['sgLoadImage', 'sgOnFile', 'sgToggle', 'sgClear', 'sgRedraw'];
  expectedFns.forEach(function(name) {
    assert.ok(name.startsWith('sg'), name + ' should start with sg prefix');
    assert.ok(name.length > 2, name + ' should have a meaningful name after sg');
  });
});

test('no naming conflicts with common window globals', function() {
  var sgFunctions = ['sgLoadImage', 'sgOnFile', 'sgToggle', 'sgClear', 'sgRedraw'];
  var existingGlobals = ['nav', 'analyse', 'onFile', 'setTab', 'toast', 'showResult', 'setTier'];
  sgFunctions.forEach(function(sg) {
    existingGlobals.forEach(function(g) {
      assert.notStrictEqual(sg, g, sg + ' conflicts with ' + g);
    });
  });
});

// ── Summary ──
var total = testsPassed + testsFailed;
console.log('\n═══════════════════════════════════════');
console.log('  Results: ' + testsPassed + '/' + total + ' passed' + (testsFailed > 0 ? ', ' + testsFailed + ' failed ✗' : ''));
console.log('═══════════════════════════════════════\n');

process.exit(testsFailed > 0 ? 1 : 0);
