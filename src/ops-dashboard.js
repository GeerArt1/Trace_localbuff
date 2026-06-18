// ══════════════════════════════════════════════
// TRACE — Ops Dashboard
// Populates the System Health screen with live
// watchdog state, module registry, and server status
// ══════════════════════════════════════════════

(function() {
  'use strict';

  /**
   * Refresh the ops dashboard with the latest watchdog state
   */
  window.refreshOpsDashboard = function refreshOpsDashboard() {
    var wd = window.TRACE_WATCHDOG;
    if (!wd) return;
    var state = wd.getState();

    // Connection status
    var connEl = document.getElementById('ops-connection-status');
    if (connEl) {
      var online = navigator.onLine;
      connEl.textContent = online ? 'Online' : 'Offline';
      connEl.className = 'ops-card-value ' + (online ? 'good' : 'bad');
    }

    // Server status
    var srvEl = document.getElementById('ops-server-status');
    if (srvEl) {
      var proxy = window.TRACE_API_PROXY || '';
      if (proxy) {
        srvEl.textContent = 'Checking\u2026';
        srvEl.className = 'ops-card-value';
        fetch(proxy + '/health')
          .then(function(r) { return r.json(); })
          .then(function(d) {
            srvEl.textContent = d.status === 'ok' ? 'Connected' : (d.status || 'Unknown');
            srvEl.className = 'ops-card-value ' + (d.status === 'ok' ? 'good' : 'warn');
          })
          .catch(function() {
            srvEl.textContent = 'Unreachable';
            srvEl.className = 'ops-card-value bad';
          });
      } else {
        srvEl.textContent = 'No proxy';
        srvEl.className = 'ops-card-value warn';
      }
    }

    // Error total
    var errEl = document.getElementById('ops-error-total');
    if (errEl) {
      errEl.textContent = state.errorCount + state.warningCount;
      errEl.className = 'ops-card-value ' + (state.errorCount > 0 ? 'bad' : (state.warningCount > 0 ? 'warn' : 'good'));
    }

    // Memory
    var memEl = document.getElementById('ops-memory-value');
    if (memEl) {
      if (performance && performance.memory) {
        memEl.textContent = Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB';
      } else {
        memEl.textContent = 'N/A';
      }
      memEl.className = 'ops-card-value';
    }

    // Modules list
    var modEl = document.getElementById('ops-modules-list');
    if (modEl && window.TRACE_REGISTRY) {
      var names = window.TRACE_REGISTRY.getModuleNames();
      if (names.length > 0) {
        modEl.innerHTML = names.map(function(n) {
          return '<span class="ops-module-item">' + window.esc(n) + '</span>';
        }).join('') + '<span class="text-ghost text-xs ml-4">(' + names.length + ' loaded)</span>';
      } else {
        modEl.innerHTML = '<span class="text-ghost">No modules registered</span>';
      }
    }

    // Errors by source
    var srcEl = document.getElementById('ops-errors-by-source');
    if (srcEl) {
      var bySrc = state.errorBySource;
      var keys = Object.keys(bySrc);
      if (keys.length > 0) {
        srcEl.innerHTML = keys.map(function(k) {
          return '<div class="flex-between p-2-0">' +
            '<span>' + window.esc(k) + '</span>' +
            '<span style="color:' + (bySrc[k] > 5 ? 'var(--red-lt)' : 'var(--text-dim)') + ';">' + bySrc[k] + ' error' + (bySrc[k] !== 1 ? 's' : '') + '</span></div>';
        }).join('');
      } else {
        srcEl.innerHTML = '<span class="text-green-lt">\u2713 No errors recorded</span>';
      }
    }

    // Recent reports with filter search
    var rptEl = document.getElementById('ops-recent-reports');
    var rptCount = document.getElementById('ops-report-count');
    var filterEl = document.getElementById('ops-report-filter');
    var filterText = filterEl ? filterEl.value.trim().toLowerCase() : '';
    if (rptEl) {
      var reports = state.recentReports || [];
      // Apply filter if set
      var filtered = reports;
      if (filterText.length > 0) {
        filtered = reports.filter(function(r) {
          return (r.source || '').toLowerCase().indexOf(filterText) >= 0 ||
                 (r.type || '').toLowerCase().indexOf(filterText) >= 0 ||
                 (r.message || '').toLowerCase().indexOf(filterText) >= 0;
        });
      }
      if (reports.length > 0) {
        if (rptCount) rptCount.textContent = filtered.length + '/' + reports.length;
        rptEl.innerHTML = filtered.slice(-8).reverse().map(function(r) {
          var typeClass = r.type === 'error' ? 'error' : (r.type === 'warning' ? 'warning' : 'info');
          var ts = new Date(r.ts);
          var timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return '<div class="ops-report-item">' +
            '<div><span class="ops-report-type ' + typeClass + '">' + window.esc(r.type) + '</span>' +
            ' <span class="text-ghost text-xs">' + window.esc(r.source) + '</span></div>' +
            '<div class="ops-report-msg">' + window.esc(r.message || '').slice(0, 120) + '</div>' +
            '<div class="ops-report-ts">' + timeStr + '</div></div>';
        }).join('');
      } else {
        rptEl.innerHTML = '<span class="text-ghost">No reports yet.</span>';
        if (rptCount) rptCount.textContent = '0';
      }
    }
  };

  /**
   * Clear the ops dashboard display and flush watchdog reports
   */
  window.clearOpsDashboard = function clearOpsDashboard() {
    if (window.TRACE_WATCHDOG && window.TRACE_WATCHDOG.getState) {
      if (window.TRACE_WATCHDOG.flush) window.TRACE_WATCHDOG.flush();
    }
    // Reset UI
    var errEl = document.getElementById('ops-error-total');
    if (errEl) { errEl.textContent = '0'; errEl.className = 'ops-card-value good'; }
    var srcEl = document.getElementById('ops-errors-by-source');
    if (srcEl) srcEl.innerHTML = '<span class="text-green-lt">\u2713 No errors recorded</span>';
    var rptEl = document.getElementById('ops-recent-reports');
    if (rptEl) rptEl.innerHTML = '<span class="text-ghost">No reports yet.</span>';
    window.toast('Dashboard cleared');
  };

  // ── Init: wire up event listeners and auto-refresh ──
  function init() {
    // Wire up the report filter's input event
    (function() {
      var fi = document.getElementById('ops-report-filter');
      if (fi) fi.addEventListener('input', function() {
        if (typeof window.refreshOpsDashboard === 'function') window.refreshOpsDashboard();
      });
    })();

    // Auto-refresh on nav to ops
    document.addEventListener('nav:changed', function(e) {
      if (e.detail && e.detail.screen === 'ops') {
        if (typeof window.refreshOpsDashboard === 'function') window.refreshOpsDashboard();
      }
    });

    // Refresh on load after a short delay
    setTimeout(function() {
      if (typeof window.refreshOpsDashboard === 'function') window.refreshOpsDashboard();
    }, 1500);

    console.log('[Ops Dashboard] Loaded');
  }

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('ops-dashboard', {
      version: '1.0.0',
      dependsOn: ['watchdog', 'utils'],
      init: init
    });
  } else {
    // Run standalone if registry not available
    setTimeout(init, 1000);
  }

  console.log('[TRACE Ops Dashboard] Loaded');
})();
