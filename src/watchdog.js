// ══════════════════════════════════════════════
// TRACE — Watchdog: Self-Healing Client Agent
// Monitors runtime health, catches errors,
// reports to the server-side AI Agent for
// auto-diagnosis and fix, generates developer
// reports.
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var FLUSH_INTERVAL_MS = 30000;      // Flush reports every 30s
  var MAX_REPORTS = 50;               // Max stored locally
  var MAX_RETRY = 3;                  // Max send retries
  var AGENT_API_PATH = '/api/ops';    // Server agent endpoint

  /** @type {WatchdogState} */
  var state = {
    errorCount: 0,
    warningCount: 0,
    lastReportTs: 0,
    errorBySource: {},
    recentReports: []
  };

  var flushTimer = null;
  var pendingBatch = [];

  // ── Get server agent base URL ──
  function getAgentURL() {
    var proxy = window.TRACE_API_PROXY || '';
    return proxy ? proxy + AGENT_API_PATH : AGENT_API_PATH;
  }

  // ── Build browser environment snapshot ──
  function getBrowserInfo() {
    return {
      userAgent: (navigator.userAgent || '').slice(0, 200),
      memoryMB: performance && performance.memory
        ? Math.round(performance.memory.usedJSHeapSize / 1048576)
        : null,
      moduleCount: window.TRACE_REGISTRY
        ? window.TRACE_REGISTRY.count()
        : null,
      tier: window.TRACE_TIER || 'unknown',
      online: navigator.onLine,
      url: (window.location.href || '').slice(0, 200)
    };
  }

  // ── Create a report entry ──
  function createReport(type, source, message, detail) {
    return {
      ts: new Date().toISOString(),
      type: type,
      source: source || 'unknown',
      message: String(message || '').slice(0, 500),
      detail: detail || null,
      browser: getBrowserInfo()
    };
  }

  // ── Add to local state ──
  function addToState(report) {
    state.recentReports.push(report);
    if (state.recentReports.length > MAX_REPORTS) {
      state.recentReports.shift();
    }
    if (report.type === 'error') {
      state.errorCount++;
      state.errorBySource[report.source] = (state.errorBySource[report.source] || 0) + 1;
    } else if (report.type === 'warning') {
      state.warningCount++;
    }
    state.lastReportTs = Date.now();
  }

  // ── Send batch of reports to server agent ──
  function sendBatch(batch) {
    if (!batch || batch.length === 0) return Promise.resolve(0);
    var url = getAgentURL() + '/log';

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'watchdog_batch',
        message: 'Watchdog batch — ' + batch.length + ' event(s)',
        detail: { batch: batch, batchSize: batch.length }
      })
    }).then(function(resp) {
      if (resp.ok) return batch.length;
      console.warn('[Watchdog] Server returned ' + resp.status + ' for batch');
      return 0;
    }).catch(function() {
      // Network failure — keep batch for retry
      return 0;
    });
  }

  // ── Flush pending reports to server ──
  function flush() {
    if (pendingBatch.length === 0) return;

    var batch = pendingBatch.slice();
    pendingBatch = [];

    sendBatch(batch).then(function(sent) {
      if (sent < batch.length && state.errorCount < 100) {
        // Re-queue unsent reports (up to a limit)
        var unsent = batch.slice(sent);
        if (pendingBatch.length + unsent.length <= MAX_REPORTS) {
          pendingBatch = pendingBatch.concat(unsent);
        }
      }
    });
  }

  // ── Show a toast notification for user-facing feedback ──
  function showToast(msg) {
    if (typeof window.toast === 'function') {
      try { window.toast(msg); } catch(e) { /* toast may not be ready yet */ }
    }
  }

  // ── Public: Report an event to the watchdog ──
  function report(type, source, message, detail) {
    var entry = createReport(type, source, message, detail);
    addToState(entry);

    // Show user-facing toast for errors
    if (type === 'error') {
      showToast('⚠ ' + source + ': ' + String(message || 'error').slice(0, 80));
    }

    // Add to pending batch for next flush
    pendingBatch.push(entry);
    if (pendingBatch.length >= 10) {
      flush();
    }
  }

  // ── Public: Log a warning ──
  function warn(source, message, detail) {
    // Pass message as separate arg to preserve stack trace in console
    console.warn('[Watchdog] [' + source + ']', message);
    report('warning', source, typeof message === 'string' ? message : String(message || '').slice(0, 500), detail || (message && message.stack ? message.stack.slice(0, 300) : null));
  }

  // ── Public: Log an error ──
  function error(source, message, detail) {
    // Pass message as separate arg to preserve stack trace in console
    console.error('[Watchdog] [' + source + ']', message);
    report('error', source, typeof message === 'string' ? message : String(message || '').slice(0, 500), detail || (message && message.stack ? message.stack.slice(0, 300) : null));
  }

  // ── Public: Get current state ──
  function getState() {
    return {
      errorCount: state.errorCount,
      warningCount: state.warningCount,
      lastReportTs: state.lastReportTs,
      errorBySource: Object.assign({}, state.errorBySource),
      pendingBatch: pendingBatch.length,
      recentReports: state.recentReports.slice(-10)
    };
  }

  // ── Periodic flush ──
  function startFlushTimer() {
    if (flushTimer) return;
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    if (flushTimer && flushTimer.unref) flushTimer.unref();
  }

  // ── Global error handler (uncaught exceptions) ──
  window.addEventListener('error', function(ev) {
    var msg = ev.message || 'Unknown error';
    var source = 'global';
    if (ev.filename) {
      var parts = ev.filename.split('/');
      source = parts[parts.length - 1] || 'global';
    }
    error(source, msg, {
      lineno: ev.lineno,
      colno: ev.colno,
      filename: ev.filename
    });
  });

  // ── Global promise rejection handler ──
  window.addEventListener('unhandledrejection', function(ev) {
    var reason = ev.reason;
    var msg = reason && reason.message ? reason.message : String(reason || 'Unknown rejection');
    error('Promise', msg, { stack: reason && reason.stack ? reason.stack.slice(0, 300) : null });
  });

  // ── Online/offline tracking ──
  window.addEventListener('online', function() {
    report('info', 'Watchdog', 'Connection restored');
    // Flush any queued reports now that we're back online
    setTimeout(flush, 500);
  });

  window.addEventListener('offline', function() {
    report('warning', 'Watchdog', 'Connection lost — queuing reports');
  });

  // ── Periodic health check (client→server) ──
  function startHealthCheck() {
    var proxy = window.TRACE_API_PROXY || '';
    if (!proxy) return; // No server to check
    function ping() {
      fetch(proxy + '/health', { method: 'GET', headers: { 'Accept': 'application/json' } })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.status === 'shutting_down') {
            showToast('⚠ Server is shutting down');
          }
        })
        .catch(function() {
          // Silent — server may be temporarily unreachable
        });
    }
    ping();
    setInterval(ping, 30000); // Check every 30s
  }

  // ── Init: auto-start (called by registry lifecycle) ──
  function init() {
    startFlushTimer();
    startHealthCheck();

    // Report app startup
    report('info', 'Watchdog', 'Watchdog initialized', {
      modules: window.TRACE_REGISTRY ? window.TRACE_REGISTRY.count() : 0,
      tier: window.TRACE_TIER || 'unknown',
      online: navigator.onLine
    });

    console.log('[Watchdog] Agent armed — monitoring health');
  }

  // ── Public API ──
  window.TRACE_WATCHDOG = {
    report: report,
    warn: warn,
    error: error,
    getState: getState,
    flush: flush
  };

  // ── Expose convenience functions on window ──
  // These are thin wrappers so modules can call watchdog.warn(...)
  // or just use console.warn (which gets intercepted by the watchdog)
  window._wd_warn = warn;
  window._wd_error = error;

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('watchdog', {
      version: '1.0.0',
      init: init
    });
  }

  console.log('[TRACE Watchdog] Loaded');
})();
