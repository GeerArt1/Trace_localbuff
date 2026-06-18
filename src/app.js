// ══════════════════════════════════════════════
// TRACE — Application Entry Point
// ══════════════════════════════════════════════

(function() {
  'use strict';

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('app', {
      version: '1.0.0',
      dependsOn: ['i18n', 'tiers', 'persistence', 'cases', 'utils', 'domBuilder', 'nav']
    });
  }

  /**
   * Spawn floating ambient particles in the background
   */
  function spawnAmbientParticles() {
    var container = document.getElementById('ambient-particles');
    if (!container) return;
    var count = 15;
    for (let i = 0; i < count; i++) {
      var p = document.createElement('div');
      p.className = 'ambient-particle';
      p.style.left = (Math.random() * 100) + '%';
      p.style.animationDelay = (Math.random() * -20) + 's';
      p.style.animationDuration = (10 + Math.random() * 12) + 's';
      container.appendChild(p);
    }
  }

  /**
   * Initialize the TRACE application
   */
  function init() {
    // ── Initialize registry (runs all registered module init functions) ──
    if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.init === 'function') {
      TRACE_REGISTRY.init();
    }

    // ── Initialize i18n (multi-language support) ──
    if (typeof window.initI18n === 'function') {
      window.initI18n();
    }

    // ── Initialize language picker ──
    if (typeof window.initLangPicker === 'function') {
      window.initLangPicker();
    }

    // ── Set tier from URL hash ──
    var hash = window.location.hash.replace('#', '');
    var validTiers = ['discover', 'collector', 'professional'];
    var tier = validTiers.indexOf(hash) !== -1 ? hash : 'collector';
    window.setTier(tier);

    // ── Load persisted timelines from localStorage ──
    if (typeof window.loadTimelinesFromStorage === 'function') {
      window.loadTimelinesFromStorage();
    }

    // ── Restore last result — try IndexedDB first, fall back to localStorage ──
    function restoreLastResult() {
      // Try IndexedDB first (richer data)
      if (typeof window.IDB !== 'undefined' && window.IDB.ready && window.IDB.ready()) {
        return window.IDB.get('results', 'last_analysis').then(function(cached) {
          if (cached && cached.result) {
            window._lastResult = cached.result;
            return;
          }
          // Fallback to localStorage
          restoreFromLocalStorage();
        }).catch(function() {
          restoreFromLocalStorage();
        });
      }
      restoreFromLocalStorage();
    }
    function restoreFromLocalStorage() {
      try {
        var _sr = localStorage.getItem('trace_lastResult');
        if (_sr) {
          window._lastResult = JSON.parse(_sr);
        }
      } catch(e) { TRACE_WATCHDOG?.warn('App', e); }
    }
    restoreLastResult();

    // ── Restore most recent timeline ──
    if (typeof window.listSavedTimelines === 'function') {
      var saved = window.listSavedTimelines();
      if (saved.length > 0) {
        window._lastTimeline = saved[0];
        window._timelines = window._timelines || {};
        window._timelines[saved[0].title] = saved[0];
      }
    }

    // ── Load saved cases into the Cases screen ──
    if (typeof window.loadCasesFromStorage === 'function') {
      window.loadCasesFromStorage();
    }

    // ── Start clock ──
    if (typeof window.tick === 'function') {
      window.tick();
      setInterval(window.tick, 60000);
    }

    // ── Server sync on startup (fire-and-forget) ──
    setTimeout(function() {
      if (typeof window.loadTimelinesFromServer === 'function') {
        window.loadTimelinesFromServer().then(function(serverTimelines) {
          if (serverTimelines && serverTimelines.length > 0) {
            if (!window._lastTimeline) {
              window._lastTimeline = serverTimelines[serverTimelines.length - 1];
            }
          }
        });
      }
    }, 500);

    // ── Register service worker (PWA) ──
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/trace_sw.js', { scope: '/' })
        .then(function(reg) {
          console.log('[TRACE App] Service Worker registered — scope:', reg.scope);

          // Check for SW updates every hour
          setInterval(function() {
            reg.update();
          }, 3600000);

          // Listen for updatefound
          reg.addEventListener('updatefound', function() {
            var newWorker = reg.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', function() {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available — notify user
                  if (typeof window.toast === 'function') {
                    window.toast('🔄 Update available — refresh to get latest TRACE');
                  }
                }
              });
            }
          });
        })
        .catch(function(err) {
          console.warn('[TRACE App] SW registration failed:', err.message);
        });
    }

    // ── Offline sync on reconnect ──
    if (typeof window.traceOffline !== 'undefined') {
      setTimeout(function() {
        if (typeof window.traceOffline.showInstallPrompt === 'function') {
          // Install prompt is triggered by beforeinstallprompt event in offline.js
        }
      }, 10000);
    }

    // ── Generate ambient floating particles ──
    spawnAmbientParticles();

    // ── Load Getty CSV records on startup ──
    if (typeof window.loadGettyCSVRecords === 'function') {
      window.loadGettyCSVRecords();
    }

    console.log('[TRACE App] Initialized');
  }

  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

console.log('[TRACE App] Loaded');
