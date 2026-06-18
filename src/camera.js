// ══════════════════════════════════════════════
// TRACE — Enhanced Mobile Camera Module
// Full-screen viewfinder · Grid overlay · Torch
// Multi-shot capture · Preview/retake flow
// ══════════════════════════════════════════════

window.TRACE_CAMERA = {
  stream: null,
  video: null,
  canvas: null,
  active: false,
  torchOn: false,
  gridOn: true,
  captures: {},       // { 'Front': [dataUrl, ...], 'Back / Label': [...], ... }
  currentTab: 'Front',
  currentCaptureIndex: -1,

  /**
   * Open the full-screen camera viewfinder
   * @param {string} tabName - Current scan tab
   */
  open: function(tabName) {
    var self = this;
    if (self.active) return;
    self.currentTab = tabName || 'Front';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.toast('Camera not available on this device');
      return;
    }

    var overlay = document.getElementById('camera-overlay');
    if (!overlay) return;
    overlay.classList.add('open');

    var video = document.getElementById('camera-video');
    var grid = document.getElementById('camera-grid');
    var tabLabel = document.getElementById('camera-tab-label');
    var shotCount = document.getElementById('camera-shot-count');
    var torchBtn = document.getElementById('camera-torch-btn');

    if (tabLabel) tabLabel.textContent = tabName;
    if (shotCount) {
      var shots = this.captures[tabName] || [];
      shotCount.textContent = shots.length + ' captured';
    }
    if (grid) grid.style.display = this.gridOn ? 'block' : 'none';
    if (torchBtn) torchBtn.classList.remove('on');

    var constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 4096 },
        height: { ideal: 3072 }
      },
      audio: false
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function(stream) {
        self.stream = stream;
        self.active = true;
        video.srcObject = stream;
        video.setAttribute('playsinline', '');
        video.play();
        self.video = video;

        // Torch support detection
        self._checkTorchSupport();

        // Auto-focus
        setTimeout(function() {
          try {
            var track = stream.getVideoTracks()[0];
            var capabilities = track.getCapabilities && track.getCapabilities();
            if (capabilities && capabilities.focusMode && capabilities.focusMode.indexOf('continuous') >= 0) {
              track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
            }
          } catch(e) { TRACE_WATCHDOG?.warn('Camera', e); }
        }, 500);
      })
      .catch(function(err) {
        window.toast('Camera access denied: ' + err.message);
        self.close();
      });
  },

  /**
   * Check if torch is supported on this device
   */
  _checkTorchSupport: function() {
    var self = this;
    var torchBtn = document.getElementById('camera-torch-btn');
    if (!torchBtn || !self.stream) return;

    try {
      var track = self.stream.getVideoTracks()[0];
      var capabilities = track.getCapabilities && track.getCapabilities();
      var supported = capabilities && (
        capabilities.torch ||
        (capabilities.fillLightMode && capabilities.fillLightMode.indexOf('torch') >= 0)
      );
      torchBtn.style.display = supported ? 'flex' : 'none';
    } catch(e) { TRACE_WATCHDOG?.warn('Camera', e);
      torchBtn.style.display = 'none';
    }
  },

  /**
   * Toggle torch/flash on/off
   */
  toggleTorch: function() {
    var self = this;
    if (!self.stream) return;
    try {
      var track = self.stream.getVideoTracks()[0];
      self.torchOn = !self.torchOn;
      track.applyConstraints({
        advanced: [{ torch: self.torchOn }]
      });
      var torchBtn = document.getElementById('camera-torch-btn');
      if (torchBtn) torchBtn.classList.toggle('on', self.torchOn);
    } catch(e) { TRACE_WATCHDOG?.warn('Camera', e);
      window.toast('Torch not supported');
    }
  },

  /**
   * Toggle grid overlay
   */
  toggleGrid: function() {
    this.gridOn = !this.gridOn;
    var grid = document.getElementById('camera-grid');
    if (grid) grid.style.display = this.gridOn ? 'block' : 'none';
  },

  /**
   * Capture a photo from the video stream
   */
  capture: function() {
    var self = this;
    if (!self.active || !self.video) return;

    var video = self.video;
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    var dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    // Store in captures for this tab
    if (!self.captures[self.currentTab]) {
      self.captures[self.currentTab] = [];
    }
    var idx = self.captures[self.currentTab].length;
    self.captures[self.currentTab].push(dataUrl);
    self.currentCaptureIndex = idx;

    // Update shot count
    var shotCount = document.getElementById('camera-shot-count');
    if (shotCount) {
      shotCount.textContent = self.captures[self.currentTab].length + ' captured';
    }

    // Flash animation
    var flash = document.getElementById('camera-flash');
    if (flash) {
      flash.classList.remove('flash-anim');
      void flash.offsetWidth; // reflow
      flash.classList.add('flash-anim');
    }

    // Show preview
    self.showPreview(dataUrl);
  },

  /**
   * Show captured photo preview with accept/retake
   * @param {string} dataUrl
   */
  showPreview: function(dataUrl) {
    var self = this;
    var overlay = document.getElementById('camera-overlay');
    var viewfinder = document.getElementById('camera-viewfinder');
    var previewArea = document.getElementById('camera-preview');
    var previewImg = document.getElementById('camera-preview-img');
    var actions = document.getElementById('camera-preview-actions');

    if (viewfinder) viewfinder.style.display = 'none';
    if (previewArea) previewArea.style.display = 'flex';
    if (previewImg) previewImg.src = dataUrl;
    if (actions) actions.style.display = 'flex';

    // Store current preview for retake/accept
    self._previewDataUrl = dataUrl;
  },

  /**
   * Accept the current preview — use as scan image
   */
  accept: function() {
    var self = this;
    if (!self._previewDataUrl) return;

    // Convert dataUrl to img64 format that scan.js expects
    var parts = self._previewDataUrl.split(',');
    var rawData = parts.length > 1 ? parts[1] : self._previewDataUrl;
    var mimeMatch = self._previewDataUrl.match(/^data:(image\/[^;]+);/);
    var mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    window.img64 = rawData;
    window.imgType = mimeType;
    window._scanImageData = { data: rawData, type: mimeType };
    window._hwImageType = 'camera_' + self.currentTab.toLowerCase().replace(/[^a-z]/g, '_');

    // Show in the scan preview
    var preview = document.getElementById('main-preview');
    if (preview) {
      preview.src = self._previewDataUrl;
      preview.style.display = 'block';
    }
    var empty = document.getElementById('main-empty');
    if (empty) empty.style.display = 'none';
    var bg = document.getElementById('btn-go');
    if (bg) bg.disabled = false;

    // Close camera overlay
    self.close();

    window.toast(self.currentTab + ' captured — ready to analyse');
  },

  /**
   * Retake — go back to viewfinder
   */
  retake: function() {
    var self = this;
    var viewfinder = document.getElementById('camera-viewfinder');
    var previewArea = document.getElementById('camera-preview');
    var actions = document.getElementById('camera-preview-actions');

    if (viewfinder) viewfinder.style.display = 'flex';
    if (previewArea) previewArea.style.display = 'none';
    if (actions) actions.style.display = 'none';
    self._previewDataUrl = null;

    // Remove the last capture
    if (self.captures[self.currentTab] && self.captures[self.currentTab].length > 0) {
      self.captures[self.currentTab].pop();
      var shotCount = document.getElementById('camera-shot-count');
      if (shotCount) {
        shotCount.textContent = self.captures[self.currentTab].length + ' captured';
      }
    }
  },

  /**
   * Close the camera overlay and release resources
   */
  close: function() {
    var self = this;
    self.active = false;
    self._previewDataUrl = null;
    self.torchOn = false;

    // Stop all tracks
    if (self.stream) {
      self.stream.getTracks().forEach(function(t) { t.stop(); });
      self.stream = null;
    }
    if (self.video) {
      self.video.srcObject = null;
      self.video = null;
    }

    var overlay = document.getElementById('camera-overlay');
    if (overlay) overlay.classList.remove('open');

    var viewfinder = document.getElementById('camera-viewfinder');
    var previewArea = document.getElementById('camera-preview');
    var actions = document.getElementById('camera-preview-actions');

    if (viewfinder) viewfinder.style.display = 'flex';
    if (previewArea) previewArea.style.display = 'none';
    if (actions) actions.style.display = 'none';
  },

  /**
   * Switch camera tab (front, back, etc) — keeps camera open
   * @param {string} tabName
   */
  switchTab: function(tabName) {
    this.currentTab = tabName;
    var tabLabel = document.getElementById('camera-tab-label');
    if (tabLabel) tabLabel.textContent = tabName;

    // Update shot count for this tab
    var shotCount = document.getElementById('camera-shot-count');
    if (shotCount) {
      var shots = this.captures[tabName] || [];
      shotCount.textContent = shots.length + ' captured';
    }

    // Reset view
    var viewfinder = document.getElementById('camera-viewfinder');
    var previewArea = document.getElementById('camera-preview');
    var actions = document.getElementById('camera-preview-actions');
    if (viewfinder) viewfinder.style.display = 'flex';
    if (previewArea) previewArea.style.display = 'none';
    if (actions) actions.style.display = 'none';
  },

  /**
   * Open camera roll viewer for all captures
   */
  showRoll: function() {
    var self = this;
    var allCaptures = [];
    for (let tab in self.captures) {
      if (self.captures.hasOwnProperty(tab)) {
        self.captures[tab].forEach(function(url) {
          allCaptures.push({ tab: tab, url: url });
        });
      }
    }

    if (allCaptures.length === 0) {
      window.toast('No captures yet');
      return;
    }

    var roll = document.getElementById('camera-roll');
    var rollGrid = document.getElementById('camera-roll-grid');
    if (!roll || !rollGrid) return;

    rollGrid.innerHTML = allCaptures.map(function(c, i) {
      return '<div class="cam-roll-item" data-roll-idx="' + i + '" title="' + window.esc(c.tab) + '">' +
        '<img src="' + c.url + '" alt="' + window.esc(c.tab) + '">' +
        '<span class="cam-roll-tab">' + window.esc(c.tab) + '</span>' +
        '</div>';
    }).join('');
    // Wire roll clicks via delegation
    if (!rollGrid._rollBound) {
      rollGrid._rollBound = true;
      rollGrid.addEventListener('click', function(e) {
        var item = e.target.closest('[data-roll-idx]');
        if (item && typeof window.TRACE_CAMERA !== 'undefined') {
          var idx = parseInt(item.dataset.rollIdx, 10);
          if (!isNaN(idx)) window.TRACE_CAMERA.selectFromRoll(idx);
        }
      });
    }

    roll.style.display = 'block';
    var viewfinder = document.getElementById('camera-viewfinder');
    if (viewfinder) viewfinder.style.display = 'none';
  },

  /**
   * Select a capture from the camera roll
   * @param {number} idx
   */
  selectFromRoll: function(idx) {
    var self = this;
    var allCaptures = [];
    for (let tab in self.captures) {
      if (self.captures.hasOwnProperty(tab)) {
        self.captures[tab].forEach(function(url) {
          allCaptures.push({ tab: tab, url: url });
        });
      }
    }

    if (idx >= 0 && idx < allCaptures.length) {
      self._previewDataUrl = allCaptures[idx].url;
      var previewArea = document.getElementById('camera-preview');
      var previewImg = document.getElementById('camera-preview-img');
      var actions = document.getElementById('camera-preview-actions');
      var roll = document.getElementById('camera-roll');

      if (previewImg) previewImg.src = allCaptures[idx].url;
      if (previewArea) previewArea.style.display = 'flex';
      if (actions) actions.style.display = 'flex';
      if (roll) roll.style.display = 'none';
    }
  },

  /**
   * Close camera roll
   */
  closeRoll: function() {
    var roll = document.getElementById('camera-roll');
    if (roll) roll.style.display = 'none';
    var viewfinder = document.getElementById('camera-viewfinder');
    if (viewfinder) viewfinder.style.display = 'flex';
  },

  /**
   * Open comparison view between two captures
   */
  compare: function() {
    var self = this;
    var allCaptures = [];
    for (let tab in self.captures) {
      if (self.captures.hasOwnProperty(tab)) {
        self.captures[tab].forEach(function(url) {
          allCaptures.push({ tab: tab, url: url });
        });
      }
    }

    if (allCaptures.length < 2) {
      window.toast('Need at least 2 captures to compare');
      return;
    }

    // Take the last two captures for comparison
    var imgA = allCaptures[allCaptures.length - 2];
    var imgB = allCaptures[allCaptures.length - 1];

    self.close();

    if (typeof window.TRACE_COMPARE !== 'undefined') {
      window.TRACE_COMPARE.open(imgA.url, imgB.url, imgA.tab, imgB.tab);
    }
  }
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('camera', {
    version: '1.0.0',
    dependsOn: ['utils', 'scan', 'compare']
  });
}

console.log('[TRACE Camera] Enhanced camera module loaded');
