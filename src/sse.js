// ══════════════════════════════════════════════
// TRACE — SSE Client
// Real-time Server-Sent Events connection.
// Receives live updates: lesson notifications,
// scan completions, subscription changes.
// Extracted from trace.html inline script.
// ══════════════════════════════════════════════

(function(){
  'use strict';

  function connect() {
    try {
      var sseUrl = (window.TRACE_API_PROXY || '') + '/api/events/stream';
      var sse = new EventSource(sseUrl);
      sse.onmessage = function(ev) {
        try {
          var e = JSON.parse(ev.data);
          if (!e || !e.type) return;

          // Handle lesson updates
          if (e.type === 'lesson_update' || e.type === 'lesson_ready') {
            var badge = document.getElementById('learn-badge');
            if (badge) {
              badge.textContent = '!';
              badge.style.display = 'flex';
            }
          }

          // Handle scan completion
          if (e.type === 'scan_complete') {
            var msg = e.message || 'Scan complete';
            if (typeof window.toast === 'function') window.toast(msg);
          }

          // Handle subscription changes
          if (e.type === 'subscription_update') {
            if (typeof window.checkSubscription === 'function') window.checkSubscription();
          }

          // Handle generic info events
          if (e.type === 'info' && e.message) {
            if (typeof window.toast === 'function') window.toast(e.message);
          }
        } catch(e2) {
          /* Malformed SSE data — ignore */
        }
      };
      sse.onerror = function() {
        // Reconnect handled automatically by EventSource
        sse.close();
        setTimeout(function() {
          try { sse = new EventSource(sseUrl); } catch(e) {
            /* EventSource may not be available in all contexts */
          }
        }, 5000);
      };
    } catch(e) {
      /* EventSource not available — SSE silently disabled */
    }
    console.log('[TRACE SSE] Real-time event stream connected');
  }

  // Auto-connect handled by registry lifecycle init

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('sse', {
      version: '1.0.0',
      init: connect
    });
  }

  console.log('[TRACE SSE Client] Loaded');
})();
