// ══════════════════════════════════════════════
// TRACE — Sacred Geometry Module
// Golden ratio, rule of thirds, spiral, dynamic
// symmetry, and radial overlay analysis
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var SG = {
    imageData: null,       // { data: base64, type: string }
    canvas: null,
    ctx: null,
    img: null,
    overlays: {},           // { golden: false, thirds: false, spiral: false, symmetry: false, radial: false }
    compareMode: false,
    imageLoaded: false,
    animFrame: null,
    W: 0,
    H: 0,

    // ── AI-detected data ──
    _aiData: null,
    _spiralCenter: null,
    _spiralRotation: 0,
    _radialCenter: null,

    /**
     * Check if there's a scan image to share
     * Priority: 1) _scanImageData from scan.js, 2) img64 global, 3) visible preview element
     */
    _getSharedImage: function() {
      // Primary signal: scan.js sets this when a fresh image is uploaded
      if (window._scanImageData && window._scanImageData.data) {
        return window._scanImageData;
      }
      // Fallback: check if img64 global is set (older direct reference)
      if (typeof window.img64 !== 'undefined' && window.img64 && window.imgType) {
        return { data: window.img64, type: window.imgType };
      }
      // Last resort: check the preview element — but only if it has a real image loaded
      var preview = document.getElementById('main-preview');
      if (preview && preview.src && preview.naturalWidth > 0) {
        var src = preview.src;
        var m = src.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (m) {
          return { data: m[2], type: m[1] };
        }
        // Non-base64 src — use as-is
        return { data: src, type: 'url' };
      }
      return null;
    },

    /**
     * Load the scan image or prompt for upload
     */
    loadImage: function() {
      // If image already loaded (e.g. navigating back), just redraw
      if (this.imageLoaded && this.imageData) {
        this.redraw();
        return;
      }
      var shared = this._getSharedImage();
      if (shared) {
        this.imageData = shared;
        this._renderImage(shared);
        window.toast('Loaded scan image for composition analysis');
        return;
      }
      // Fall back to file picker
      document.getElementById('sg-file-input').click();
    },

    /**
     * Handle file selection from the geometry file input
     */
    onFile: function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      var self = this;
      reader.onload = function(ev) {
        var dataUrl = ev.target.result;
        var m = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (m) {
          self.imageData = { data: m[2], type: m[1] };
        } else {
          self.imageData = { data: dataUrl, type: 'url' };
        }
        self._renderImage(self.imageData);
        window.toast('Image loaded for composition analysis');
      };
      reader.readAsDataURL(file);
      // Reset the input so the same file can be selected again
      e.target.value = '';
    },

    /**
     * Render the image on the canvas and show controls
     */
    _renderImage: function(imgData) {
      var wrap = document.getElementById('sg-canvas-wrap');
      var controls = document.getElementById('sg-controls');
      var uploadBtn = document.getElementById('sg-upload-btn');
      var canvas = document.getElementById('sg-canvas');
      if (!canvas || !wrap) return;

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');

      var img = new Image();
      var self = this;
      img.onload = function() {
        self.img = img;
        self.imageLoaded = true;

        // Size the canvas to fit the viewport while maintaining aspect ratio
        var scroll = document.getElementById('sg-scroll');
        var maxW = scroll ? scroll.clientWidth - 28 : window.innerWidth - 40;
        var maxH = window.innerHeight * 0.55;
        var scale = Math.min(maxW / img.width, maxH / img.height, 1);
        self.W = Math.round(img.width * scale);
        self.H = Math.round(img.height * scale);
        canvas.width = self.W;
        canvas.height = self.H;
        canvas.style.width = self.W + 'px';
        canvas.style.height = self.H + 'px';

        wrap.style.display = 'block';
        if (controls) controls.style.display = 'flex';
        if (uploadBtn) uploadBtn.textContent = '↑ Change image';

        self._draw();
      };
      // If it's a URL, use directly; if base64, reconstruct
      if (imgData.type === 'url') {
        img.src = imgData.data;
      } else {
        img.src = 'data:' + imgData.type + ';base64,' + imgData.data;
      }
    },

    /**
     * Main draw function — renders image + active overlays
     */
    _draw: function() {
      if (!this.ctx || !this.imageLoaded) return;
      var ctx = this.ctx;
      var W = this.W, H = this.H;

      // Clear
      ctx.clearRect(0, 0, W, H);

      // Draw the image
      if (this.img) {
        ctx.drawImage(this.img, 0, 0, W, H);
      }

      // In compare mode: draw original on left half, overlays on right half
      if (this.compareMode) {
        // Save full state, clip to left half, draw image only
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W / 2 - 1, H);
        ctx.clip();
        if (this.img) ctx.drawImage(this.img, 0, 0, W, H);
        ctx.restore();

        // Draw divider
        ctx.strokeStyle = 'rgba(212, 174, 82, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(W / 2, 0);
        ctx.lineTo(W / 2, H);
        ctx.stroke();
        ctx.setLineDash([]);

        // Labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '10px "Courier Prime", monospace';
        ctx.fillText('Original', 8, 18);
        ctx.fillText('Overlays', W / 2 + 8, 18);

        // Draw overlays on right half
        ctx.save();
        ctx.beginPath();
        ctx.rect(W / 2 + 1, 0, W / 2 - 1, H);
        ctx.clip();
        // Re-draw the image on right half too
        if (this.img) ctx.drawImage(this.img, 0, 0, W, H);
        if (this.overlays.golden) this._drawGoldenRatio(ctx, W, H);
        if (this.overlays.thirds) this._drawRuleOfThirds(ctx, W, H);
        if (this.overlays.spiral) this._drawGoldenSpiral(ctx, W, H);
        if (this.overlays.symmetry) this._drawDynamicSymmetry(ctx, W, H);
        if (this.overlays.radial) this._drawRadial(ctx, W, H);
        ctx.restore();
      } else {
        // Normal mode — draw all overlays across full canvas
        if (this.overlays.golden) this._drawGoldenRatio(ctx, W, H);
        if (this.overlays.thirds) this._drawRuleOfThirds(ctx, W, H);
        if (this.overlays.spiral) this._drawGoldenSpiral(ctx, W, H);
        if (this.overlays.symmetry) this._drawDynamicSymmetry(ctx, W, H);
        if (this.overlays.radial) this._drawRadial(ctx, W, H);
      }

      // Update analysis text
      this._updateAnalysis();
    },

    /**
     * Toggle an overlay on/off
     */
    toggle: function(type) {
      var valid = ['golden', 'thirds', 'spiral', 'symmetry', 'radial'];
      if (valid.indexOf(type) < 0) return;
      this.overlays[type] = !this.overlays[type];

      // Update button state
      var btn = document.getElementById('sg-btn-' + type);
      if (btn) {
        btn.classList.toggle('active', this.overlays[type]);
      }

      this._draw();
    },

    /**
     * Clear all overlays
     */
    clear: function() {
      var types = ['golden', 'thirds', 'spiral', 'symmetry', 'radial'];
      var self = this;
      types.forEach(function(t) {
        self.overlays[t] = false;
        var btn = document.getElementById('sg-btn-' + t);
        if (btn) btn.classList.remove('active');
      });
      this.compareMode = false;
      var cmpBtn = document.getElementById('sg-btn-compare');
      if (cmpBtn) cmpBtn.classList.remove('active');
      var hint = document.getElementById('sg-compare-hint');
      if (hint) hint.style.display = 'none';
      this._draw();
    },

    /**
     * Redraw (call on resize/window size change)
     */
    redraw: function() {
      if (this.imageLoaded) {
        // Re-render with current dimensions
        var scroll = document.getElementById('sg-scroll');
        var maxW = scroll ? scroll.clientWidth - 28 : window.innerWidth - 40;
        var maxH = window.innerHeight * 0.55;
        if (this.img) {
          var scale = Math.min(maxW / this.img.width, maxH / this.img.height, 1);
          var newW = Math.round(this.img.width * scale);
          var newH = Math.round(this.img.height * scale);
          if (newW !== this.W || newH !== this.H) {
            this.W = newW;
            this.H = newH;
            this.canvas.width = this.W;
            this.canvas.height = this.H;
            this.canvas.style.width = this.W + 'px';
            this.canvas.style.height = this.H + 'px';
          }
        }
        this._draw();
      }
    },

    /**
     * Update the analysis text based on active overlays
     */
    _updateAnalysis: function() {
      var body = document.getElementById('sg-analysis-body');
      var panel = document.getElementById('sg-analysis');
      if (!body) return;

      var active = [];
      if (this.overlays.golden) active.push('Golden Ratio (\u03c6=1.618)');
      if (this.overlays.thirds) active.push('Rule of Thirds');
      if (this.overlays.spiral) active.push('Golden Spiral');
      if (this.overlays.symmetry) active.push('Dynamic Symmetry');
      if (this.overlays.radial) active.push('Radial Harmony');

      if (active.length === 0) {
        body.textContent = 'Toggle overlays above to analyse the compositional structure. The golden ratio (\u03c6\u22481.618) appears throughout classical and Renaissance art.';
        if (panel) panel.style.display = 'none';
        return;
      }

      var text = 'Active overlays: ' + active.join(', ') + '. ';
      if (this.overlays.golden) {
        text += 'The golden ratio creates a sense of natural harmony and balance. ';
      }
      if (this.overlays.thirds) {
        text += 'The rule of thirds places key elements at intersection points for dynamic composition. ';
      }
      if (this.overlays.spiral) {
        text += 'The golden spiral follows the natural growth pattern found in shells, galaxies, and classical art. ';
      }
      if (this.overlays.symmetry) {
        text += 'Dynamic symmetry rectangles (\u221a2, \u221a3, \u221a4, \u221a5) were used by Renaissance masters to structure their compositions. ';
      }
      if (this.overlays.radial) {
        text += 'Radial harmony creates a sense of order radiating from a central focal point. ';
      }
      body.textContent = text.trim();
      if (panel) panel.style.display = 'block';
    },

    // ── OVERLAY DRAWING ──

    /**
     * Draw golden ratio spiral and grid
     * Uses AI-detected focal points when available via _aiData
     */
    _drawGoldenRatio: function(ctx, W, H) {
      var phi = 1.618;
      ctx.save();
      ctx.strokeStyle = 'rgba(212, 174, 82, 0.7)';
      ctx.lineWidth = 1.5;

      // Golden rectangle split
      var a = W / (1 + 1/phi);
      ctx.strokeRect(0, 0, W, H);
      ctx.beginPath();
      ctx.moveTo(a, 0);
      ctx.lineTo(a, H);
      ctx.stroke();

      // Square section
      ctx.strokeStyle = 'rgba(212, 174, 82, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(a, 0);
      ctx.lineTo(a, a);
      ctx.lineTo(0, a);
      ctx.stroke();
      ctx.setLineDash([]);

      // Sequence of golden rectangles
      var x = a, y = 0, w = W - a, h = H;
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = 'rgba(212, 174, 82, ' + (0.5 - i * 0.06) + ')';
        ctx.lineWidth = 1.2 - i * 0.15;
        ctx.strokeRect(x, y, w, h);

        // Next rectangle
        if (w > h) {
          var nw = w - h;
          x += h;
          w = nw;
        } else {
          var nh = h - w;
          y += w;
          h = nh;
        }
        if (w < 5 || h < 5) break;
      }

      // AI-detected or default focal points
      var pts = [];
      if (this._aiData && this._aiData.golden_ratio && this._aiData.golden_ratio.focal_points) {
        pts = this._aiData.golden_ratio.focal_points.map(function(p) {
          return [p[0] * W, p[1] * H];
        });
      } else {
        pts = [
          [a * 0.382, H * 0.382], [a * 0.618, H * 0.382],
          [a * 0.382, H * 0.618], [a * 0.618, H * 0.618],
          [a + (W-a) * 0.382, H * 0.382], [a + (W-a) * 0.618, H * 0.382],
          [a + (W-a) * 0.382, H * 0.618], [a + (W-a) * 0.618, H * 0.618]
        ];
      }

      pts.forEach(function(p) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(232, 196, 90, 0.8)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(232, 196, 90, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      });

      ctx.restore();
    },

    /**
     * Draw rule of thirds grid
     * Uses AI-detected active intersection points when available
     */
    _drawRuleOfThirds: function(ctx, W, H) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 0.8;

      var x1 = W / 3, x2 = 2 * W / 3;
      var y1 = H / 3, y2 = 2 * H / 3;

      // Vertical lines
      ctx.beginPath();
      ctx.moveTo(x1, 0); ctx.lineTo(x1, H);
      ctx.moveTo(x2, 0); ctx.lineTo(x2, H);
      // Horizontal lines
      ctx.moveTo(0, y1); ctx.lineTo(W, y1);
      ctx.moveTo(0, y2); ctx.lineTo(W, y2);
      ctx.stroke();

      // Which intersection points to highlight (AI-detected or all)
      var activeIndices = [0, 1, 2, 3];
      if (this._aiData && this._aiData.thirds && this._aiData.thirds.active_intersections) {
        activeIndices = this._aiData.thirds.active_intersections;
      }

      var allPoints = [[x1, y1], [x2, y1], [x1, y2], [x2, y2]];
      allPoints.forEach(function(p, i) {
        var isActive = activeIndices.indexOf(i) >= 0;
        ctx.beginPath();
        ctx.arc(p[0], p[1], isActive ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? 'rgba(212, 174, 82, 0.9)' : 'rgba(212, 174, 82, 0.35)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p[0], p[1], isActive ? 10 : 6, 0, Math.PI * 2);
        ctx.strokeStyle = isActive ? 'rgba(212, 174, 82, 0.5)' : 'rgba(212, 174, 82, 0.15)';
        ctx.lineWidth = isActive ? 1.2 : 0.5;
        ctx.stroke();
      });

      ctx.restore();
    },

    /**
     * Draw golden spiral using proper logarithmic spiral equation
     * r(θ) = a * e^(b*θ) where b = ln(φ) / (π/2) ensures growth by φ per quarter-turn
     * Uses AI-detected center and rotation when available
     */
    _drawGoldenSpiral: function(ctx, W, H) {
      ctx.save();
      ctx.strokeStyle = 'rgba(212, 174, 82, 0.7)';
      ctx.lineWidth = 2;

      // Use AI-detected center or default
      var cx = W / 2, cy = H / 2;
      if (this._spiralCenter) {
        cx = this._spiralCenter.x * W;
        cy = this._spiralCenter.y * H;
      }
      var rotationOffset = (this._spiralRotation || 0) * Math.PI / 180;

      var maxR = Math.min(W, H) * 0.42;
      var phi = 1.6180339887;
      // Growth factor per radian: b = ln(φ) / (π/2)
      // This makes the spiral grow by factor φ every 90°
      var b = Math.log(phi) / (Math.PI / 2);
      var a = maxR * 0.08; // Starting radius at θ=0

      // Draw the logarithmic spiral
      ctx.beginPath();
      var steps = 300;
      var maxTheta = Math.PI * 3.5; // ~1.75 full rotations

      for (let i = 0; i <= steps; i++) {
        var t = i / steps;
        var theta = t * maxTheta + rotationOffset;
        var r = a * Math.exp(b * theta);
        var px = cx + r * Math.cos(theta);
        var py = cy + r * Math.sin(theta);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Center marker
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 196, 90, 0.7)';
      ctx.fill();

      // Draw Fibonacci tiling squares as faint guides
      ctx.strokeStyle = 'rgba(212, 174, 82, 0.2)';
      ctx.lineWidth = 0.5;
      ctx.setLineDash([3, 3]);

      var fib = [1, 1, 2, 3, 5, 8, 13, 21];
      var scale = maxR * 0.018;
      var tiles = [
        [-0.5, -0.5],   // 1x1: centered
        [0.5, -0.5],    // 1x1: right
        [-0.5, -1.5],   // 2x2: above
        [-3.5, -1.5],   // 3x3: left
        [-3.5, 1.5],    // 5x5: below
        [1.5, -1.5],    // 8x8: right
        [-3.5, -14.5],  // 13x13: above
        [-24.5, -14.5], // 21x21: left
      ];

      for (let j = 0; j < tiles.length; j++) {
        var side = fib[j] * scale;
        ctx.strokeRect(cx + tiles[j][0] * scale, cy + tiles[j][1] * scale, side, side);
        if (side > maxR * 0.8) break;
      }

      ctx.setLineDash([]);

      ctx.restore();
    },

    /**
     * Draw dynamic symmetry rectangles (√2, √3, √4, √5)
     * Uses AI-detected root type when available
     */
    _drawDynamicSymmetry: function(ctx, W, H) {
      ctx.save();
      var roots = [1.414, 1.732, 2.0, 2.236]; // √2, √3, √4, √5
      var colors = [
        'rgba(255, 100, 100, 0.4)',
        'rgba(100, 200, 255, 0.4)',
        'rgba(100, 255, 150, 0.4)',
        'rgba(255, 200, 50, 0.4)'
      ];
      var labels = ['√2', '√3', '√4', '√5'];

      var aspect = W / H;
      var closest = 0, closestDiff = Infinity;

      // If AI detected a specific root type, use that
      if (this._aiData && this._aiData.symmetry && this._aiData.symmetry.root_type !== 'none') {
        var rootStr = this._aiData.symmetry.root_type;
        var rootNum = parseFloat(rootStr.replace('√', ''));
        if (isNaN(rootNum)) {
          for (let ri = 0; ri < roots.length; ri++) {
            var diff = Math.abs(aspect - roots[ri]);
            if (diff < closestDiff) { closestDiff = diff; closest = ri; }
          }
        } else {
          for (let rj = 0; rj < roots.length; rj++) {
            if (Math.abs(roots[rj] - rootNum) < 0.01) { closest = rj; break; }
          }
        }
      } else {
        roots.forEach(function(r, i) {
          var diff = Math.abs(aspect - r);
          if (diff < closestDiff) { closestDiff = diff; closest = i; }
        });
      }

      // Draw the closest root rectangle
      ctx.strokeStyle = colors[closest];
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(0, 0, W, H);

      // Draw diagonals
      ctx.setLineDash([]);
      ctx.strokeStyle = colors[closest];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(W, H);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W, 0);
      ctx.lineTo(0, H);
      ctx.stroke();

      // Subdivision grid (5 sections)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 5; i++) {
        var div = i / 5;
        ctx.beginPath();
        ctx.moveTo(W * div, 0);
        ctx.lineTo(W * div, H);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, H * div);
        ctx.lineTo(W, H * div);
        ctx.stroke();
      }

      // Label
      ctx.fillStyle = colors[closest];
      ctx.font = '11px "Courier Prime", monospace';
      ctx.fillText('Root ' + labels[closest] + ' = ' + roots[closest].toFixed(3), 10, 20);

      ctx.restore();
    },

    /**
     * Draw radial harmony overlay
     * Uses AI-detected center when available
     */
    _drawRadial: function(ctx, W, H) {
      ctx.save();
      var cx = W / 2, cy = H / 2;
      if (this._radialCenter) {
        cx = this._radialCenter.x * W;
        cy = this._radialCenter.y * H;
      }
      var maxR = Math.sqrt(
        Math.max(cx, W-cx) * Math.max(cx, W-cx) +
        Math.max(cy, H-cy) * Math.max(cy, H-cy)
      );

      // Concentric circles
      ctx.strokeStyle = 'rgba(212, 174, 82, 0.2)';
      ctx.lineWidth = 0.5;
      for (let r = maxR * 0.1; r <= maxR; r += maxR * 0.1) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Radiating lines (every 15 degrees)
      ctx.strokeStyle = 'rgba(212, 174, 82, 0.2)';
      ctx.lineWidth = 0.5;
      for (let deg = 0; deg < 360; deg += 15) {
        var rad = deg * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + maxR * Math.cos(rad), cy + maxR * Math.sin(rad));
        ctx.stroke();
      }

      // Highlighted primary axes (every 45 deg)
      ctx.strokeStyle = 'rgba(232, 196, 90, 0.35)';
      ctx.lineWidth = 1;
      for (let d = 0; d < 360; d += 45) {
        var r2 = d * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx + maxR * 0.1 * Math.cos(r2), cy + maxR * 0.1 * Math.sin(r2));
        ctx.lineTo(cx + maxR * Math.cos(r2), cy + maxR * Math.sin(r2));
        ctx.stroke();
      }

      // Center point
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232, 196, 90, 0.6)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(232, 196, 90, 0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Golden angle spirals (137.5 deg)
      ctx.strokeStyle = 'rgba(212, 174, 82, 0.12)';
      ctx.lineWidth = 0.5;
      var goldenAngle = 137.5 * Math.PI / 180;
      for (let s = 0; s < 3; s++) {
        ctx.beginPath();
        var angle = s * Math.PI * 2 / 3;
        for (let step = 0; step < 200; step++) {
          var t = step / 200;
          var r3 = maxR * t;
          var a = angle + step * goldenAngle / 20;
          var px = cx + r3 * Math.cos(a);
          var py = cy + r3 * Math.sin(a);
          if (step === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      ctx.restore();
    },

    // ── AI-POWERED ANALYSIS ──

    /**
     * AI-powered composition analysis — sends the loaded image to Claude
     * and parses detected geometry patterns, then renders them on canvas.
     */
    analyzeWithAI: function() {
      var self = this;
      if (!self.imageLoaded || !self.imageData) {
        window.toast('Load an image first');
        return;
      }

      var btn = document.getElementById('sg-ai-btn');
      if (btn) { btn.disabled = true; btn.textContent = '\u2726 Analyzing\u2026'; }
      window.toast('AI analyzing composition\u2026');

      // Build the geometry-specific prompt
      var geometryPrompt =
        'You are a master art composition analyst. Analyze this artwork image and detect:\n' +
        '1. **Golden ratio** \u2014 Does the composition follow golden ratio proportions (\u03c6\u22481.618)? Where are the key focal points?\n' +
        '2. **Rule of thirds** \u2014 Are key elements aligned with third-lines? Which intersection points are most active?\n' +
        '3. **Golden spiral** \u2014 Does the composition follow a logarithmic spiral? Where is the center and what is the rotation?\n' +
        '4. **Dynamic symmetry** \u2014 Does the canvas aspect ratio match a root rectangle (\u221a2, \u221a3, \u221a4, \u221a5)?\n' +
        '5. **Radial harmony** \u2014 Is there a central focal point with radiating elements? What is the center?\n' +
        '6. **Focal points** \u2014 Where are the main focal points in the composition (as fractions of width/height from top-left)?\n' +
        '\nRespond ONLY with a valid JSON object, no markdown, no backticks, no other text. The object must have EXACTLY this structure:\n' +
        '{\n' +
        '  "golden_ratio": { "active": true/false, "focal_points": [[x,y], [x,y]], "description": "string" },\n' +
        '  "thirds": { "active": true/false, "active_intersections": [0,1,2,3], "description": "string" },\n' +
        '  "spiral": { "active": true/false, "center_x": 0.0-1.0, "center_y": 0.0-1.0, "rotation": 0-360, "direction": "clockwise/counterclockwise", "description": "string" },\n' +
        '  "symmetry": { "active": true/false, "root_type": "\u221a2/\u221a3/\u221a4/\u221a5/none", "description": "string" },\n' +
        '  "radial": { "active": true/false, "center_x": 0.0-1.0, "center_y": 0.0-1.0, "description": "string" },\n' +
        '  "focal_points": [[x,y,"label"], [x,y,"label"]],\n' +
        '  "composition_analysis": "2-3 sentences about the overall composition"\n' +
        '}\n' +
        'All coordinates are fractions of the image dimensions (0.0-1.0) from top-left. focal_points is an array of [x, y, label] tuples.';

      // Use IIFE for async context since object methods can't be async
      (async function() {
        try {
          var apiBase = window.TRACE_API_PROXY || '';
          var apiUrl = apiBase ? apiBase + '/analyse' : 'https://api.anthropic.com/v1/messages';
          var apiHeaders = { 'Content-Type': 'application/json' };
          if (!apiBase) {
            apiHeaders['anthropic-version'] = '2023-06-01';
          }
          if (window.TRACE_ANALYSE_KEY) {
            apiHeaders['x-api-key'] = window.TRACE_ANALYSE_KEY;
          }

          var imgData = self.imageData;
          var mediaType = imgData.type === 'url' ? 'image/jpeg' : imgData.type;
          var base64Data = imgData.type === 'url' ? '' : imgData.data;

          var body = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1500,
            system: 'You are a precise art composition analyst. Return ONLY valid JSON matching the requested structure. No markdown, no code fences, no other text.',
            messages: [{
              role: 'user',
              content: base64Data ? [
                { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
                { type: 'text', text: geometryPrompt }
              ] : [
                { type: 'text', text: geometryPrompt + '\n\n(Note: image available via URL: ' + imgData.data + ')' }
              ]
            }]
          };

          // If URL-based, fetch the image and convert to base64
          if (imgData.type === 'url') {
            try {
              var imgResp = await fetch(imgData.data);
              var imgBlob = await imgResp.blob();
              base64Data = await new Promise(function(resolve) {
                var reader = new FileReader();
                reader.onloadend = function() {
                  var result = reader.result;
                  resolve(result.split(',')[1]);
                };
                reader.readAsDataURL(imgBlob);
              });
              mediaType = imgBlob.type || 'image/jpeg';
              body.messages[0].content[0].source = { type: 'base64', media_type: mediaType, data: base64Data };
            } catch(e) {
              window.toast('Could not process image URL');
              if (btn) { btn.disabled = false; btn.textContent = '\u2726 AI Analyze'; }
              return;
            }
          }

          var res = await fetch(apiUrl, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify(body)
          });

          if (!res.ok) {
            var errData;
            try { errData = await res.json(); } catch(e) { errData = {}; }
            throw new Error((errData.error && errData.error.message) || 'API error ' + res.status);
          }

          var data = await res.json();
          var raw = data.content.map(function(b) { return b.text || ''; }).join('');
          var result = null;

          // Parse JSON from response
          try { result = JSON.parse(raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()); } catch(e) { TRACE_WATCHDOG?.warn('Geometry', e); }
          if (!result) {
            try {
              var s = raw.indexOf('{'), e2 = raw.lastIndexOf('}');
              if (s >= 0 && e2 > s) result = JSON.parse(raw.slice(s, e2 + 1));
            } catch(e) { TRACE_WATCHDOG?.warn('Geometry', e); }
          }

          if (!result) {
            window.toast('AI could not parse geometry data');
            if (btn) { btn.disabled = false; btn.textContent = '\u2726 AI Analyze'; }
            return;
          }

          // Apply detected overlays
          self.clear();
          self._aiData = result;

          if (result.golden_ratio && result.golden_ratio.active) {
            self.overlays.golden = true;
            var gBtn = document.getElementById('sg-btn-golden');
            if (gBtn) gBtn.classList.add('active');
          }
          if (result.thirds && result.thirds.active) {
            self.overlays.thirds = true;
            var tBtn = document.getElementById('sg-btn-thirds');
            if (tBtn) tBtn.classList.add('active');
          }
          if (result.spiral && result.spiral.active) {
            self.overlays.spiral = true;
            self._spiralCenter = { x: result.spiral.center_x || 0.5, y: result.spiral.center_y || 0.5 };
            self._spiralRotation = result.spiral.rotation || 0;
            var sBtn = document.getElementById('sg-btn-spiral');
            if (sBtn) sBtn.classList.add('active');
          }
          if (result.symmetry && result.symmetry.active) {
            self.overlays.symmetry = true;
            var symBtn = document.getElementById('sg-btn-symmetry');
            if (symBtn) symBtn.classList.add('active');
          }
          if (result.radial && result.radial.active) {
            self.overlays.radial = true;
            self._radialCenter = { x: result.radial.center_x || 0.5, y: result.radial.center_y || 0.5 };
            var rBtn = document.getElementById('sg-btn-radial');
            if (rBtn) rBtn.classList.add('active');
          }

          // Show composition text
          var analysisBody = document.getElementById('sg-analysis-body');
          var analysisPanel = document.getElementById('sg-analysis');
          if (analysisBody && result.composition_analysis) {
            analysisBody.innerHTML = '<strong>AI Detected:</strong> ' + result.composition_analysis;
            if (result.focal_points && result.focal_points.length) {
              analysisBody.innerHTML += '<br><br><strong>Key focal points:</strong><br>' +
                result.focal_points.map(function(fp) {
                  var px = (fp[0] * 100).toFixed(0);
                  var py = (fp[1] * 100).toFixed(0);
                  return '\u2022 (' + px + '%, ' + py + '%) \u2014 ' + (fp[2] || 'Point');
                }).join('<br>');
            }
            if (analysisPanel) analysisPanel.style.display = 'block';
          }

          // Update confidence indicators
          self._renderConfidenceIndicators(result);

          self._draw();
          window.toast('AI composition analysis complete');

        } catch(err) {
          window.toast('AI analysis failed: ' + (err.message || 'Unknown error'));
        }

        if (btn) { btn.disabled = false; btn.textContent = '\u2726 AI Analyze'; }
      })();
    }
  };

  // ── Expose global functions ──

  window.sgLoadImage = function() { SG.loadImage(); };
  window.sgOnFile = function(e) { SG.onFile(e); };
  window.sgToggle = function(type) { SG.toggle(type); };
  window.sgClear = function() { SG.clear(); };
  window.sgRedraw = function() { SG.redraw(); };
  window.sgAnalyzeWithAI = function() { SG.analyzeWithAI(); };
  window.sgExportPNG = function() { SG.exportPNG(); };
  window.sgToggleCompare = function() { SG.toggleCompare(); };

  /**
   * Export the canvas with overlays as a PNG download
   */
  SG.exportPNG = function() {
    var canvas = document.getElementById('sg-canvas');
    if (!canvas || !this.imageLoaded) {
      window.toast('No image loaded to export');
      return;
    }
    // Temporarily disable compare mode for export if active — we want the full overlays view
    var wasCompare = this.compareMode;
    if (wasCompare) {
      this.compareMode = false;
      this._draw();
    }
    var link = document.createElement('a');
    link.download = 'trace-geometry-' + new Date().toISOString().slice(0, 19).replace(/[:-]/g, '') + '.png';
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.toast('Exported composition analysis as PNG');
    // Restore compare mode
    if (wasCompare) {
      this.compareMode = true;
      this._draw();
    }
  };

  /**
   * Toggle split-comparison mode (original vs overlays)
   */
  SG.toggleCompare = function() {
    if (!this.imageLoaded) {
      window.toast('Load an image first');
      return;
    }
    this.compareMode = !this.compareMode;
    var btn = document.getElementById('sg-btn-compare');
    if (btn) btn.classList.toggle('active', this.compareMode);
    var hint = document.getElementById('sg-compare-hint');
    if (hint) hint.style.display = this.compareMode ? 'block' : 'none';
    // Add animation class to canvas for visual feedback
    var canvas = document.getElementById('sg-canvas');
    if (canvas) {
      canvas.classList.remove('sg-compare-anim');
      // Force reflow so the animation re-triggers
      void canvas.offsetWidth;
      canvas.classList.add('sg-compare-anim');
    }
    this._draw();
  };

  /**
   * Render AI confidence indicators in the analysis panel
   */
  SG._renderConfidenceIndicators = function(result) {
    var container = document.getElementById('sg-analysis-confidence');
    if (!container) return;
    if (!result) {
      container.style.display = 'none';
      return;
    }

    var patterns = [
      { key: 'golden_ratio', label: 'Golden Ratio', enabled: result.golden_ratio && result.golden_ratio.active },
      { key: 'thirds', label: 'Rule of Thirds', enabled: result.thirds && result.thirds.active },
      { key: 'spiral', label: 'Golden Spiral', enabled: result.spiral && result.spiral.active },
      { key: 'symmetry', label: 'Dynamic Symmetry', enabled: result.symmetry && result.symmetry.active },
      { key: 'radial', label: 'Radial Harmony', enabled: result.radial && result.radial.active }
    ];

    var html = '<div class="sg-conf-title">AI Detected Patterns</div><div class="sg-conf-grid">';
    patterns.forEach(function(p) {
      html += '<div class="sg-conf-item' + (p.enabled ? ' sg-conf-detected' : ' sg-conf-not-detected') + '">' +
        '<span class="sg-conf-dot"></span>' +
        '<span class="sg-conf-label">' + p.label + '</span>' +
        '<span class="sg-conf-status">' + (p.enabled ? 'Detected' : 'Not found') + '</span>' +
        '</div>';
    });
    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
  };

  // ── Keyboard shortcuts for geometry screen ──
  window.addEventListener('keydown', function(e) {
    // Only when geometry screen is active and not typing in input
    var geo = document.getElementById('s-geometry');
    if (!geo || !geo.classList.contains('active')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var key = e.key.toLowerCase();
    if (key === 'c') { SG.toggleCompare(); e.preventDefault(); }
    else if (key === 'e') { SG.exportPNG(); e.preventDefault(); }
    else if (key === 'a') { SG.analyzeWithAI(); e.preventDefault(); }
  });

  // Auto-redraw on resize
  var _resizeTimer = null;
  window.addEventListener('resize', function() {
    if (_resizeTimer) clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() { SG.redraw(); }, 200);
  });

  console.log('[TRACE Geometry] Loaded \u2014 Sacred Geometry Module');

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('geometry', {
      version: '1.0.0',
      dependsOn: ['utils', 'scan']
    });
    // Subscribe to scan:complete to auto-load image
    TRACE_REGISTRY.on('scan:complete', function(data) {
      if (data && data.result) {
        setTimeout(function() { SG.loadImage(); }, 300);
      }
    });
  }
})();
