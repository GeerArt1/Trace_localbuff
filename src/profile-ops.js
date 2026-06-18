// ══════════════════════════════════════════════
// TRACE — Profile Watchdog Status
// Updates the System Health section in the
// Profile screen with live watchdog state
// ══════════════════════════════════════════════

(function() {
  'use strict';

  /**
   * Update the profile ops section with the latest watchdog state
   */
  function updateProfileOps() {
    var wd = window.TRACE_WATCHDOG;
    if (!wd) return;
    var state = wd.getState();
    var section = document.getElementById('profile-ops-section');
    if (!section) return;
    // Always show section — errors section is conditionally visible inside
    section.style.display = 'block';
    var errEl = document.getElementById('ops-error-count');
    if (errEl) {
      errEl.textContent = state.errorCount;
      errEl.style.color = state.errorCount > 0 ? 'var(--red-lt)' : 'var(--green-lt)';
    }
    var pendEl = document.getElementById('ops-pending-count');
    if (pendEl) pendEl.textContent = state.pendingBatch;
    var dotEl = document.getElementById('ops-status-dot');
    if (dotEl) {
      dotEl.style.background = state.pendingBatch > 0 ? 'var(--gold)' : (state.errorCount > 0 ? 'var(--red-lt)' : 'var(--green-lt)');
    }
  }

  // ── Init: wire up periodic updates ──
  function init() {
    // Update on load
    setTimeout(updateProfileOps, 1000);

    // Update every 10 seconds
    setInterval(updateProfileOps, 10000);

    // Update when nav changes to profile
    document.addEventListener('nav:changed', function(e) {
      if (e.detail && e.detail.screen === 'profile') {
        updateProfileOps();
      }
    });

    console.log('[Profile Ops] Loaded');
  }

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('profile-ops', {
      version: '1.0.0',
      dependsOn: ['watchdog', 'utils'],
      init: init
    });
  } else {
    setTimeout(init, 1000);
  }

  console.log('[TRACE Profile Ops] Loaded');
})();
