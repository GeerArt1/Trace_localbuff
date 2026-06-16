// ══════════════════════════════════════════════
// TRACE — IIIF Image Viewer
// ══════════════════════════════════════════════

var osdViewer = null;

/**
 * Load IIIF image from URL input
 */
window.loadIIIFImage = function loadIIIFImage() {
  var input = document.getElementById('iiif-url-input');
  if (!input) return;
  var url = input.value.trim();
  if (!url) { window.toast('Enter a IIIF Image API URL'); return; }
  try { new URL(url); } catch (e) { window.toast('Invalid URL'); return; }
  if (!url.endsWith('info.json')) {
    url = url.replace(/\/$/, '') + '/info.json';
    input.value = url;
  }
  window.initViewer(url);
};

/**
 * Load local image into viewer
 */
window.loadLocalImage = function loadLocalImage() {
  document.getElementById('viewer-file-input').click();
};

/**
 * Handle local file load for viewer
 * @param {Event} e
 */
window.viewerLoadLocal = function viewerLoadLocal(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    window.initViewer({ type: 'image', url: ev.target.result });
  };
  reader.readAsDataURL(file);
};

/**
 * Initialize OpenSeaDragon viewer
 * @param {Object|string} tileSource
 */
window.initViewer = function initViewer(tileSource) {
  var container = document.getElementById('openseadragon-viewer');
  var empty = document.getElementById('viewer-empty');
  var controls = document.getElementById('viewer-controls');
  if (!container) return;

  container.style.display = 'block';
  if (empty) empty.style.display = 'none';
  if (controls) controls.style.display = 'block';

  if (osdViewer && osdViewer.destroy) {
    osdViewer.destroy();
    osdViewer = null;
  }

  setTimeout(function() {
    if (typeof OpenSeadragon === 'undefined') {
      window.toast('OpenSeaDragon not loaded — check internet connection');
      return;
    }
    try {
      osdViewer = OpenSeadragon({
        id: 'openseadragon-viewer',
        prefixUrl: 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/',
        tileSources: tileSource,
        showNavigator: true,
        navigatorPosition: 'BOTTOM_RIGHT',
        navigatorHeight: 100,
        navigatorWidth: 120,
        showRotationControl: true,
        showSequenceControl: false,
        animationTime: 0.3,
        springStiffness: 6.0,
        gestureSettingsMouse: { clickToZoom: true, scrollToZoom: true, flickEnabled: true },
      });
      window.toast('Viewer loaded — scroll to zoom, drag to pan');
    } catch (e) {
      window.toast('Viewer error: ' + e.message);
    }
  }, 200);
};

/**
 * Reset viewer to home position
 */
window.resetViewer = function resetViewer() {
  if (osdViewer && osdViewer.viewport) {
    osdViewer.viewport.goHome(true);
  }
};

// Auto-load scan result image into viewer when navigating
(function() {
  var _navViewerId = null;
  var origNavViewer = window.nav;
  if (typeof origNavViewer === 'function') {
    window.nav = function(id) {
      origNavViewer(id);
      if (id === 'viewer' && _navViewerId !== 'viewer') {
        _navViewerId = 'viewer';
        var preview = document.getElementById('main-preview');
        if (preview && preview.src && preview.style.display !== 'none') {
          setTimeout(function() { window.initViewer({ type: 'image', url: preview.src }); }, 300);
        }
      } else {
        _navViewerId = id;
      }
    };
  }
})();

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('viewer', {
    version: '1.0.0',
    dependsOn: ['utils', 'nav']
  });
}

console.log('[TRACE Viewer] Loaded');
