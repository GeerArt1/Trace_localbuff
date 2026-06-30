// ══════════════════════════════════════════════
// TRACE — Offline & Sync Module (PWA)
// Handles online/offline detection, sync queue,
// install prompt, and connectivity UI
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var SYNC_QUEUE_KEY = 'trace_sync_queue';
  var INSTALL_PROMPT_KEY = 'trace_install_prompted';
  var deferredPrompt = null;
  var isOnline = navigator.onLine;

  // ── Banner element ──
  function getBanner() {
    return document.getElementById('offline-banner');
  }

  function getStatusDot() {
    return document.querySelector('.badge-live');
  }

  // ── Update UI based on connectivity ──
  function updateOfflineUI(online) {
    isOnline = online;
    var banner = getBanner();
    if (!banner) return;

    if (online) {
      banner.classList.remove('on');
      // Update live badge if present
      var dot = getStatusDot();
      if (dot) {
        dot.style.color = '#70B890';
        dot.style.borderColor = 'rgba(58,138,90,0.3)';
        dot.style.background = 'rgba(58,138,90,0.15)';
      }
    } else {
      banner.classList.add('on');
      var dot = getStatusDot();
      if (dot) {
        dot.style.color = '#E8A020';
        dot.style.borderColor = 'rgba(232,160,32,0.3)';
        dot.style.background = 'rgba(232,160,32,0.15)';
      }
    }
  }

  // ── Sync Queue ──

  function getQueue() {
    try {
      var raw = localStorage.getItem(SYNC_QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch(e) { return []; }
  }

  function saveQueue(queue) {
    try { localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue)); } catch(e) { TRACE_WATCHDOG?.warn('Offline', e); }
  }

  /**
   * Queue an operation for sync when back online.
   * @param {string} url - API endpoint
   * @param {string} method - HTTP method
   * @param {Object} body - Request body
   * @param {string} opType - Human-readable operation type
   */
  window.queueOfflineOp = function(url, method, body, opType) {
    var queue = getQueue();
    queue.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      url: url,
      method: method || 'POST',
      body: body,
      type: opType || 'unknown',
      timestamp: Date.now()
    });
    saveQueue(queue);
    console.log('[TRACE Offline] Queued ' + (opType || 'operation') + ' — ' + queue.length + ' pending');

    // Register background sync so the SW can process on reconnect
    registerSync();

    // Show toast if we have queued operations
    if (window.toast && !navigator.onLine) {
      window.toast('Queued ' + (opType || 'operation') + ' — will sync when online');
    }
  };

  /**
   * Process the sync queue — send all pending operations to server.
   */
  function processSyncQueue() {
    var queue = getQueue();
    if (queue.length === 0) return;

    console.log('[TRACE Offline] Processing ' + queue.length + ' queued operations...');

    var pending = queue.slice(); // copy to process
    var succeeded = [];

    function processNext() {
      if (pending.length === 0) {
        // All done — remove succeeded items from queue
        var current = getQueue();
        var updated = current.filter(function(item) {
          return succeeded.indexOf(item.id) < 0;
        });
        saveQueue(updated);

        if (succeeded.length > 0 && typeof window.toast === 'function') {
          window.toast('Synced ' + succeeded.length + ' pending operation' + (succeeded.length > 1 ? 's' : ''));
        }
        return;
      }

      var op = pending.shift();
      var fetchOpts = {
        method: op.method || 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      if (op.body) fetchOpts.body = JSON.stringify(op.body);

      fetch(op.url, fetchOpts).then(function(resp) {
        if (resp.ok) {
          succeeded.push(op.id);
          console.log('[TRACE Offline] Synced: ' + (op.type || 'op'));
        } else {
          console.warn('[TRACE Offline] Sync failed: ' + (op.type || 'op') + ' — ' + resp.status);
          // Put back in pending for retry on next online event
          pending.push(op);
        }
      }).catch(function() {
        // Network error — preserve the current operation in pending for retry
        console.warn('[TRACE Offline] Network error during sync — will retry');
        pending.push(op);
      }).then(function() {
        processNext();
      });
    }

    processNext();
  }

  // postSyncToSW removed — operations are managed in the client-side
  // localStorage queue only. The SW handles cache-first serving of static
  // assets and network-first for API calls, but does not maintain a
  // separate sync queue to avoid duplicate operation processing.

  // ── Background Sync Registration ──

  function registerSync() {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      navigator.serviceWorker.ready.then(function(reg) {
        return reg.sync.register('trace-sync');
      }).catch(function() {
        // Background sync not supported — process on online event instead
      });
    }
  }

  // ── Install Prompt (PWA add to home screen) ──

  window.addEventListener('beforeinstallprompt', function(e) {
    // Prevent Chrome 67+ from automatically showing the prompt
    e.preventDefault();
    deferredPrompt = e;

    // Show install prompt after a delay (don't show immediately)
    setTimeout(function() {
      // Check if user has been prompted before
      var prompted = false;
      try { prompted = localStorage.getItem(INSTALL_PROMPT_KEY) === 'true'; } catch(e) { TRACE_WATCHDOG?.warn('Offline', e); }

      if (!prompted) {
        showInstallPrompt();
      }
    }, 60000); // Wait 60 seconds before suggesting install
  });

  function showInstallPrompt() {
    // Don't show if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    var existing = document.getElementById('pwa-install-prompt');
    if (existing) return;

    var prompt = dom('div', {
      id: 'pwa-install-prompt',
      style: 'position:fixed;bottom:calc(var(--nav-h, 68px) + 16px);left:14px;right:14px;' +
        'z-index:450;background:var(--surface);border:1px solid var(--border-strong);' +
        'padding:16px;display:flex;align-items:center;gap:12px;' +
        'animation:slideUp .4s cubic-bezier(.16,1,.3,1);' +
        'box-shadow:0 8px 32px rgba(0,0,0,0.6);'
    }).append(
      dom('div', 'pwa-install-icon')
        .style({ flexShrink: 0, width: '40px', height: '40px', borderRadius: '8px',
          background: 'var(--gold)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'Georgia,serif', fontSize: '20px',
          color: '#060402', fontWeight: '600' })
        .text('T'),
      dom('div', { style: 'flex:1;min-width:0;' }).append(
        dom('div', { style: 'font-size:12px;color:var(--text);font-weight:500;' }).text('Install TRACE'),
        dom('div', { style: 'font-size:10px;color:var(--text-dim);margin-top:2px;' }).text('Add to home screen for offline use')
      ),
      dom('button', {
        id: 'pwa-install-btn',
        style: 'background:var(--gold);color:#060402;border:none;padding:8px 14px;' +
          'font-family:var(--font-ui);font-size:8px;font-weight:700;' +
          'letter-spacing:.15em;text-transform:uppercase;cursor:pointer;white-space:nowrap;'
      }).text('INSTALL'),
      dom('button', {
        id: 'pwa-dismiss-btn',
        style: 'background:none;border:none;color:var(--text-dim);font-size:16px;cursor:pointer;padding:4px;'
      }).text('\u2715')
    ).appendTo(document.body);

    document.getElementById('pwa-install-btn').addEventListener('click', function() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function(choice) {
          if (choice.outcome === 'accepted') {
            console.log('[TRACE PWA] User installed TRACE');
          }
          deferredPrompt = null;
        });
      }
      prompt.remove();
      try { localStorage.setItem(INSTALL_PROMPT_KEY, 'true'); } catch(e) { TRACE_WATCHDOG?.warn('Offline', e); }
    });

    document.getElementById('pwa-dismiss-btn').addEventListener('click', function() {
      prompt.remove();
      try { localStorage.setItem(INSTALL_PROMPT_KEY, 'true'); } catch(e) { TRACE_WATCHDOG?.warn('Offline', e); }
    });
  }

  // ── Event Handlers ──

  window.addEventListener('online', function() {
    updateOfflineUI(true);
    // Process any queued operations
    processSyncQueue();
    // Register background sync as fallback
    registerSync();

    if (window.toast) {
      // Don't show toast if there were queued items (processSyncQueue handles it)
      var queue = getQueue();
      if (queue.length === 0 && window.toast) {
        window.toast('Connection restored');
      }
    }
  });

  window.addEventListener('offline', function() {
    updateOfflineUI(false);
  });

  // ── Init: Set initial UI state (called by registry lifecycle) ──
  function init() {
    updateOfflineUI(navigator.onLine);
    // Attempt to process any leftover queue
    if (navigator.onLine) {
      setTimeout(processSyncQueue, 2000);
    }

    // Listen for app installed event
    window.addEventListener('appinstalled', function() {
      console.log('[TRACE PWA] App installed');
      try { localStorage.setItem(INSTALL_PROMPT_KEY, 'true'); } catch(e) { TRACE_WATCHDOG?.warn('Offline', e); }
    });

    console.log('[TRACE Offline] Module loaded — online: ' + navigator.onLine);
  }

  // Expose for external use
  window.traceOffline = {
    isOnline: function() { return navigator.onLine; },
    queueCount: function() { return getQueue().length; },
    processQueue: processSyncQueue,
    showInstallPrompt: showInstallPrompt
  };

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('offline', {
      version: '1.0.0',
      dependsOn: ['dom', 'utils'],
      init: init
    });
  }
})();
