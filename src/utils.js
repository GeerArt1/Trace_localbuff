// ══════════════════════════════════════════════
// TRACE — Shared Utilities
// ══════════════════════════════════════════════

/**
 * HTML-escape a string
 * @param {*} s
 * @returns {string}
 */
window.esc = function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

/**
 * HTML-escape for attribute values
 * @param {string} s
 * @returns {string}
 */
window.escAttr = function escAttr(s) {
  return window.esc(s).replace(/'/g, '&apos;').replace(/"/g, '&quot;');
};

/**
 * Show a toast notification
 * @param {string} msg
 */
window.toast = function toast(msg) {
  var t = document.getElementById('main-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function() { t.classList.remove('show'); }, 2800);
};

/**
 * Update the clock display and greeting
 */
window.tick = function tick() {
  var n = new Date();
  var timeEl = document.getElementById('st-time');
  if (timeEl) {
    timeEl.textContent =
      String(n.getHours()).padStart(2, '0') + ':' +
      String(n.getMinutes()).padStart(2, '0');
  }
  var h = n.getHours();
  var period = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  var greetEl = document.getElementById('home-greeting');
  if (greetEl && window.TIER === 'collector') greetEl.textContent = 'Good ' + period + ', Collector';
  if (greetEl && window.TIER === 'professional') greetEl.textContent = 'Good ' + period + ' · Dashboard';
};

/**
 * Build empty timeline HTML
 * @returns {string}
 */
window.buildEmptyTL = function buildEmptyTL() {
  return '<div style="padding:40px 20px;text-align:center;color:var(--text-dim);font-size:13px;line-height:1.8;">' +
    '<div style="font-size:28px;opacity:.35;margin-bottom:14px;">◈</div>' +
    'Scan any artwork, person or landmark<br>to build its provenance timeline.' +
    '<div style="margin-top:20px;"><button onclick="window._goScan()" style="background:var(--gold);color:#060402;border:none;padding:12px 24px;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;">SCAN NOW ›</button></div>' +
    '</div>';
};

/**
 * Online/offline guard
 * @returns {boolean}
 */
window.requireOnline = function requireOnline() {
  if (!navigator.onLine) {
    window.toast('No internet connection. Please check your network.');
    return false;
  }
  return true;
};

// ── Online/offline event listeners ──
window.addEventListener('offline', function() {
  window.toast('Connection lost — working offline');
  var banner = document.getElementById('offline-banner');
  if (banner) banner.classList.add('on');
});
window.addEventListener('online', function() {
  window.toast('Connection restored');
  var banner = document.getElementById('offline-banner');
  if (banner) banner.classList.remove('on');
});

// Check initial online state
(function() {
  if (!navigator.onLine) {
    var banner = document.getElementById('offline-banner');
    if (banner) banner.classList.add('on');
  }
})();

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('utils', {
    version: '1.0.0'
  });
}

console.log('[TRACE Utils] Loaded');
