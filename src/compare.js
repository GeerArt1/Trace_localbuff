// ══════════════════════════════════════════════
// TRACE — Image Comparison Module (COMP)
// Side-by-side · Overlay blend · Split view
// Linked zoom/pan for comparative analysis
// ══════════════════════════════════════════════

window.TRACE_COMPARE = {
  imgA: null,
  imgB: null,
  labelA: '',
  labelB: '',
  mode: 'side',     // 'side' | 'overlay' | 'split'
  opacity: 0.5,
  splitPos: 0.5,
  zoom: 1,
  panX: 0,
  panY: 0,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  panStart: { x: 0, y: 0 },
  container: null,
  canvas: null,
  ctx: null,
  _imagesLoaded: 0,
  _imgEls: {},

  /**
   * Open the comparison viewer
   * @param {string} dataUrlA - First image
   * @param {string} dataUrlB - Second image
   * @param {string} labelA - Label for first image
   * @param {string} labelB - Label for second image
   */
  open: function(dataUrlA, dataUrlB, labelA, labelB) {
    var self = this;

    // Reset state
    self.zoom = 1;
    self.panX = 0;
    self.panY = 0;
    self.mode = 'side';
    self.opacity = 0.5;
    self.splitPos = 0.5;
    self._imagesLoaded = 0;
    self._imgEls = {};

    var overlay = document.getElementById('compare-overlay');
    var container = document.getElementById('compare-container');
    var canvas = document.getElementById('compare-canvas');

    if (!overlay || !container || !canvas) return;
    self.container = container;
    self.canvas = canvas;
    self.ctx = canvas.getContext('2d');

    // Set labels
    var labelElA = document.getElementById('compare-label-a');
    var labelElB = document.getElementById('compare-label-b');
    if (labelElA) labelElA.textContent = labelA || 'Image A';
    if (labelElB) labelElB.textContent = labelB || 'Image B';

    // Show mode controls
    self._updateModeButtons();

    overlay.classList.add('open');

    // Size the canvas
    self._sizeCanvas();

    // Load images
    self.imgA = new Image();
    self.imgB = new Image();
    self.labelA = labelA || 'Image A';
    self.labelB = labelB || 'Image B';

    self.imgA.onload = function() { self._onImageLoaded(); };
    self.imgB.onload = function() { self._onImageLoaded(); };
    self.imgA.src = dataUrlA;
    self.imgB.src = dataUrlB;

    // Mouse/touch handlers
    self._bindEvents();

    // Resize handler
    self._resizeHandler = function() {
      self._sizeCanvas();
      self._render();
    };
    window.addEventListener('resize', self._resizeHandler);

    self._render();
  },

  /**
   * Track image loading
   */
  _onImageLoaded: function() {
    this._imagesLoaded++;
    if (this._imagesLoaded >= 2) {
      this._render();
    }
  },

  /**
   * Size the canvas to fit the viewport
   */
  _sizeCanvas: function() {
    var container = this.container;
    if (!container) return;
    var rect = container.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
  },

  /**
   * Main render loop
   */
  _render: function() {
    var self = this;
    if (!self.ctx || !self.canvas) return;

    var ctx = self.ctx;
    var W = self.canvas.width;
    var H = self.canvas.height;

    ctx.clearRect(0, 0, W, H);

    if (!self.imgA || !self.imgB) return;

    var imgW = self.imgA.naturalWidth;
    var imgH = self.imgA.naturalHeight;

    // Calculate draw area with zoom/pan
    var drawW = imgW * self.zoom;
    var drawH = imgH * self.zoom;
    var cx = W / 2 + self.panX;
    var cy = H / 2 + self.panY;
    var sx = cx - drawW / 2;
    var sy = cy - drawH / 2;

    switch (self.mode) {
      case 'side':
        self._renderSideBySide(ctx, W, H, sx, sy, drawW, drawH);
        break;
      case 'overlay':
        self._renderOverlay(ctx, W, H, sx, sy, drawW, drawH);
        break;
      case 'split':
        self._renderSplit(ctx, W, H, sx, sy, drawW, drawH);
        break;
    }
  },

  /**
   * Side-by-side mode — draw two images side by side
   */
  _renderSideBySide: function(ctx, W, H, sx, sy, drawW, drawH) {
    var halfW = W / 2;

    // Left: Image A
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, halfW, H);
    ctx.clip();
    ctx.drawImage(this.imgA, sx, sy, drawW, drawH);
    ctx.restore();

    // Right: Image B
    ctx.save();
    ctx.beginPath();
    ctx.rect(halfW, 0, halfW, H);
    ctx.clip();
    ctx.drawImage(this.imgB, sx, sy, drawW, drawH);
    ctx.restore();

    // Divider
    ctx.strokeStyle = 'rgba(212,174,82,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(halfW, 0);
    ctx.lineTo(halfW, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.fillStyle = 'rgba(212,174,82,0.7)';
    ctx.font = '10px "Montserrat", sans-serif';
    ctx.fillText(this.labelA, 14, 24);
    ctx.textAlign = 'right';
    ctx.fillText(this.labelB, W - 14, 24);
    ctx.textAlign = 'left';
  },

  /**
   * Overlay mode — Image B overlaid on Image A with opacity
   */
  _renderOverlay: function(ctx, W, H, sx, sy, drawW, drawH) {
    // Draw Image A (full)
    ctx.drawImage(this.imgA, sx, sy, drawW, drawH);

    // Draw Image B with opacity
    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.drawImage(this.imgB, sx, sy, drawW, drawH);
    ctx.restore();

    // Opacity indicator
    var pct = Math.round(this.opacity * 100);
    ctx.fillStyle = 'rgba(212,174,82,0.5)';
    ctx.font = '10px "Courier Prime", monospace';
    ctx.fillText('Blend: ' + pct + '%', 14, 24);
  },

  /**
   * Split mode — divider reveals Image B on right
   */
  _renderSplit: function(ctx, W, H, sx, sy, drawW, drawH) {
    var splitX = W * this.splitPos;

    // Draw Image A (full)
    ctx.drawImage(this.imgA, sx, sy, drawW, drawH);

    // Draw Image B clipped to the right of split
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, W - splitX, H);
    ctx.clip();
    ctx.drawImage(this.imgB, sx, sy, drawW, drawH);
    ctx.restore();

    // Divider line
    ctx.strokeStyle = 'rgba(212,174,82,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, H);
    ctx.stroke();

    // Divider handle
    ctx.fillStyle = 'rgba(212,174,82,0.9)';
    ctx.beginPath();
    ctx.arc(splitX, H / 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#060402';
    ctx.beginPath();
    ctx.arc(splitX, H / 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px "Montserrat", sans-serif';
    ctx.fillText(this.labelA, 14, 24);
    ctx.textAlign = 'right';
    ctx.fillText(this.labelB, W - 14, 24);
    ctx.textAlign = 'left';
  },

  /**
   * Set comparison mode
   * @param {string} mode - 'side' | 'overlay' | 'split'
   */
  setMode: function(mode) {
    var valid = ['side', 'overlay', 'split'];
    if (valid.indexOf(mode) < 0) return;
    this.mode = mode;
    this._updateModeButtons();
    this._render();
  },

  /**
   * Update mode button active states
   */
  _updateModeButtons: function() {
    var modes = ['side', 'overlay', 'split'];
    modes.forEach(function(m) {
      var btn = document.getElementById('cmp-mode-' + m);
      if (btn) btn.classList.toggle('active', window.TRACE_COMPARE.mode === m);
    });

    // Show/hide opacity slider for overlay mode
    var opacityControl = document.getElementById('compare-opacity-control');
    if (opacityControl) {
      opacityControl.style.display = this.mode === 'overlay' ? 'flex' : 'none';
    }
  },

  /**
   * Set overlay opacity
   * @param {number} val - 0 to 1
   */
  setOpacity: function(val) {
    this.opacity = Math.max(0, Math.min(1, val));
    var label = document.getElementById('compare-opacity-val');
    if (label) label.textContent = Math.round(val * 100) + '%';
    this._render();
  },

  /**
   * Set split position
   * @param {number} pos - 0 to 1
   */
  setSplit: function(pos) {
    this.splitPos = Math.max(0.05, Math.min(0.95, pos));
    this._render();
  },

  /**
   * Zoom in
   */
  zoomIn: function() {
    this.zoom = Math.min(5, this.zoom * 1.3);
    this._render();
  },

  /**
   * Zoom out
   */
  zoomOut: function() {
    this.zoom = Math.max(0.2, this.zoom / 1.3);
    this._render();
  },

  /**
   * Reset zoom/pan
   */
  resetView: function() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this._render();
  },

  /**
   * Bind mouse/touch events for pan and split drag
   */
  _bindEvents: function() {
    var self = this;
    var canvas = self.canvas;
    if (!canvas) return;

    // Remove old listeners by cloning
    var oldCanvas = canvas;
    // We use a flag to avoid double-binding
    if (canvas._compareBound) return;
    canvas._compareBound = true;

    canvas.addEventListener('mousedown', function(e) {
      self.isDragging = true;
      self.dragStart.x = e.clientX;
      self.dragStart.y = e.clientY;
      self.panStart.x = self.panX;
      self.panStart.y = self.panY;

      if (self.mode === 'split') {
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var relX = mx / rect.width;        // If click near split handle, allow dragging
          if (Math.abs(relX - self.splitPos) < 0.08) {
          self._dragSplit = true;
        } else {
          self._dragSplit = false;
        }
      }
    });

    canvas.addEventListener('mousemove', function(e) {
      if (!self.isDragging) return;
      var dx = e.clientX - self.dragStart.x;
      var dy = e.clientY - self.dragStart.y;

      if (self.mode === 'split' && self._dragSplit) {
        var rect = canvas.getBoundingClientRect();
        self.setSplit((e.clientX - rect.left) / rect.width);
      } else {
        self.panX = self.panStart.x + dx;
        self.panY = self.panStart.y + dy;
        self._render();
      }
    });

    canvas.addEventListener('mouseup', function() {
      self.isDragging = false;
      self._dragSplit = false;
    });

    canvas.addEventListener('mouseleave', function() {
      self.isDragging = false;
      self._dragSplit = false;
    });

    // Touch events
    canvas.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        self.isDragging = true;
        self.dragStart.x = e.touches[0].clientX;
        self.dragStart.y = e.touches[0].clientY;
        self.panStart.x = self.panX;
        self.panStart.y = self.panY;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', function(e) {
      if (e.touches.length === 1 && self.isDragging) {
        var dx = e.touches[0].clientX - self.dragStart.x;
        var dy = e.touches[0].clientY - self.dragStart.y;
        self.panX = self.panStart.x + dx;
        self.panY = self.panStart.y + dy;
        self._render();
      }
    }, { passive: true });

    canvas.addEventListener('touchend', function() {
      self.isDragging = false;
    }, { passive: true });

    // Wheel zoom
    canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      if (e.deltaY < 0) {
        self.zoom = Math.min(5, self.zoom * 1.15);
      } else {
        self.zoom = Math.max(0.2, self.zoom / 1.15);
      }
      self._render();
    }, { passive: false });
  },

  /**
   * Close comparison view
   */
  close: function() {
    var overlay = document.getElementById('compare-overlay');
    if (overlay) overlay.classList.remove('open');
    this._imagesLoaded = 0;
    this.imgA = null;
    this.imgB = null;
    // Remove resize listener
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  }
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('compare', {
    version: '1.0.0',
    dependsOn: ['utils']
  });
}

console.log('[TRACE Compare] COMP module loaded');
