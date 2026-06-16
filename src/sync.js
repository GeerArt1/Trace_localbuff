// ══════════════════════════════════════════════
// TRACE — Sync Engine v2.0 (Compatibility Layer)
// Delegates all queue management to src/offline.js.
// Preserves the window.TRACE_SYNC API for
// backward compatibility with code that calls
// TRACE_SYNC.queue(), .process(), .start(), .stop().
// ══════════════════════════════════════════════
// v2.0 consolidates sync into offline.js (single
// localStorage queue) and removes the competing
// sync mechanism that was writing to the same
// queue key (trace_sync_queue) with independent
// processing logic. This eliminates duplicate
// API calls on reconnect and lost operations
// from race conditions between the two engines.
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var SYNC_INTERVAL = 30000; // 30s between sync checks
  var syncTimer = null;

  // ── Get API base URL ──
  function getAPIBase() {
    return window.TRACE_API_PROXY || '';
  }

  // ── Queue an operation for sync (delegates to offline.js) ──
  function queueOp(url, method, body, opType) {
    if (typeof window.queueOfflineOp === 'function') {
      window.queueOfflineOp(url, method, body, opType);
      return Promise.resolve();
    }
    return Promise.reject(new Error('offline.js not loaded'));
  }

  // ── Process sync queue (delegates to offline.js) ──
  function processQueue() {
    if (!navigator.onLine) return Promise.resolve(false);
    var apiBase = getAPIBase();
    if (!apiBase) return Promise.resolve(false);

    if (window.traceOffline && typeof window.traceOffline.processQueue === 'function') {
      window.traceOffline.processQueue();
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  // ── Start periodic sync checks ──
  function startSync() {
    if (syncTimer) return;
    syncTimer = setInterval(function() {
      if (navigator.onLine) processQueue();
    }, SYNC_INTERVAL);
    // Process once after startup
    setTimeout(processQueue, 2000);
  }

  // ── Stop periodic sync ──
  function stopSync() {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  // ── Track online/offline ──
  window.addEventListener('online', function() {
    setTimeout(processQueue, 500);
  });

  // ── Public API (preserved for backward compatibility) ──
  window.TRACE_SYNC = {
    queue: queueOp,
    process: processQueue,
    start: startSync,
    stop: stopSync,
    isSyncing: function() { return false; }
  };

  // Auto-start handled by registry lifecycle init

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('sync', {
      version: '2.0.0',
      dependsOn: ['offline', 'utils'],
      init: startSync
    });
  }

  console.log('[TRACE Sync] v2.0 loaded — delegated to offline.js');
})();
