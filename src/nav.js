// ══════════════════════════════════════════════
// TRACE — Navigation System
// ══════════════════════════════════════════════

window.ALL_SCREENS = ['intro', 'home', 'scan', 'chat', 'cases', 'timeline', 'learn', 'profile', 'research', 'spectral', 'geometry', 'viewer', 'knowledge'];

/**
 * Navigate to a screen
 * @param {string} id - Screen ID
 */
window.nav = function nav(id) {
  // Abort any in-flight scan analysis when navigating away from scan
  if (id !== 'scan' && window._scanAbortController) {
    window._scanAbortController.abort();
  }
  window.ALL_SCREENS.forEach(function(s) {
    var screenEl = document.getElementById('s-' + s);
    if (screenEl) screenEl.classList.remove('active');
    var navEl = document.getElementById('ni-' + s);
    if (navEl) navEl.classList.remove('active');
  });
  var targetScreen = document.getElementById('s-' + id);
  if (targetScreen) targetScreen.classList.add('active');
  var targetNav = document.getElementById('ni-' + id);
  if (targetNav) targetNav.classList.add('active');
  var bnav = document.getElementById('bottom-nav');
  if (bnav) bnav.style.display = id === 'intro' ? 'none' : 'flex';
  var scrollEl = targetScreen ? targetScreen.querySelector('.scroll') : null;
  if (scrollEl) scrollEl.scrollTo(0, 0);
  if (id === 'scan') {
    if (typeof window.startPickerPulse === 'function') setTimeout(window.startPickerPulse, 300);
  } else {
    if (typeof window.stopPickerPulse === 'function') window.stopPickerPulse();
  }
  // Auto-load scan image when navigating to geometry screen
  if (id === 'geometry') {
    setTimeout(function() {
      if (typeof window.sgLoadImage === 'function') {
        window.sgLoadImage();
      }
    }, 200);
  }
  // When navigating to timeline, populate it
  if (id === 'timeline' && !window._tlNavPending) {
    window._tlNavPending = true;
    setTimeout(function() {
      window._tlNavPending = false;
      if (typeof window.navTimeline === 'function') window.navTimeline();
    }, 0);
  }
};

/**
 * Render the saved timelines list
 */
window.renderSavedTimelines = function renderSavedTimelines() {
  var list = window.listSavedTimelines();
  var container = document.getElementById('tl-saved-list');
  var items = document.getElementById('tl-saved-items');
  var empty = document.getElementById('tl-saved-empty');
  var screen = document.getElementById('tl-screen');
  var strip = document.getElementById('tl-h-strip-container');
  if (!container) return;

  container.style.display = 'flex';
  if (screen) screen.style.display = 'none';
  if (strip) strip.style.display = 'none';

  if (!items) return;
  items.innerHTML = '';

  if (list.length === 0) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  list.forEach(function(t) {
    if (!t.title) return;
    var events = Array.isArray(t.events) ? t.events : [];

    var card = document.createElement('div');
    card.className = 'saved-tl-card';
    card.style.cssText = 'display:flex;align-items:center;padding:14px 20px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .2s;';
    card.onmouseenter = function() { card.style.background = 'var(--surface)'; };
    card.onmouseleave = function() { card.style.background = ''; };
    card.onclick = function() {
      window._lastTimeline = t;
      if (typeof window.navTimeline === 'function') window.navTimeline();
    };

    var eventCount = events.length;
    var gapCount = events.filter(function(e) {
      return e.event && (e.event.toLowerCase().includes('gap') || e.event.includes('\u26a0'));
    }).length;
    var firstYear = events.length > 0 ? events[0].year : '—';
    var lastYear = events.length > 0 ? events[events.length - 1].year : '—';

    card.innerHTML =
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:13px;color:var(--text);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + window.esc(t.title) + '</div>' +
      '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' + window.esc(t.sub || '') + '</div>' +
      '<div style="display:flex;gap:12px;margin-top:6px;">' +
      '<span style="font-size:8px;color:var(--text-dim);letter-spacing:.05em;">' + firstYear + ' → ' + lastYear + '</span>' +
      '<span style="font-size:8px;color:var(--text-dim);letter-spacing:.05em;">' + eventCount + ' events</span>' +
      (gapCount > 0 ? '<span style="font-size:8px;color:#E8A020;">' + gapCount + ' gaps</span>' : '') +
      '</div></div>' +
      '<button class="tl-delete-btn" onclick="event.stopPropagation();window.deleteSavedTimeline(\'' + window.escAttr(t.title) + '\')" style="background:none;border:none;color:var(--text-dim);font-size:16px;cursor:pointer;padding:4px 8px;opacity:.4;transition:opacity .2s;" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=.4" title="Delete timeline">✕</button>';

    items.appendChild(card);
  });
};

/**
 * Delete a saved timeline
 * @param {string} title
 */
window.deleteSavedTimeline = function deleteSavedTimeline(title) {
  if (!title) return;
  window.deleteTimelineLocal(title);
  var apiBase = window.TRACE_API_PROXY || '';
  if (apiBase) {
    var body = { title: title };
    if (typeof window.queueOfflineOp === 'function' && !navigator.onLine) {
      window.queueOfflineOp(apiBase + '/api/timeline/delete', 'POST', body, 'timeline_delete');
    } else {
      fetch(apiBase + '/api/timeline/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).catch(function() {
        if (typeof window.queueOfflineOp === 'function') {
          window.queueOfflineOp(apiBase + '/api/timeline/delete', 'POST', body, 'timeline_delete');
        }
      });
    }
  }
  window.renderSavedTimelines();
  window.toast('Deleted: ' + title);
};

/**
 * Search through saved timelines
 * @param {string} query - Search query
 */
window.searchTimelines = function searchTimelines(query) {
  var resultsEl = document.getElementById('tl-search-results');
  if (!resultsEl) return;
  query = (query || '').trim().toLowerCase();
  if (query.length < 2) {
    resultsEl.classList.remove('open');
    return;
  }
  var timelines = window.listSavedTimelines();
  var matches = timelines.filter(function(t) {
    if (!t.title) return false;
    return t.title.toLowerCase().indexOf(query) >= 0 ||
      (t.sub || '').toLowerCase().indexOf(query) >= 0 ||
      (t.artist || '').toLowerCase().indexOf(query) >= 0;
  });
  if (matches.length === 0) {
    resultsEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-dim);font-size:11px;">No results found</div>';
    resultsEl.classList.add('open');
    return;
  }
  resultsEl.innerHTML = matches.slice(0, 10).map(function(t) {
    return '<div class="search-item" onclick="window.searchSelectTimeline(\'' + window.escAttr(t.title) + '\')">' +
      '<div class="search-item-title">' + window.esc(t.title) + '</div>' +
      '<div class="search-item-sub">' + window.esc(t.sub || '') + '</div></div>';
  }).join('');
  resultsEl.classList.add('open');
};

/**
 * Select a timeline from search results
 * @param {string} title
 */
window.searchSelectTimeline = function searchSelectTimeline(title) {
  var resultsEl = document.getElementById('tl-search-results');
  if (resultsEl) resultsEl.classList.remove('open');
  var input = document.getElementById('tl-search-input');
  if (input) input.value = '';
  var timelines = window.listSavedTimelines();
  var match = timelines.filter(function(t) { return t.title === title; });
  if (match.length > 0) {
    window._lastTimeline = match[0];
    if (typeof window.navTimeline === 'function') window.navTimeline();
  }
};

/**
 * Go to scan screen (used by empty state button)
 */
window._goScan = function _goScan() {
  window.nav('scan');
};

// ══════════════════════════════════════════════
// TRACE — Keyboard, D-pad & Remote Navigation
// ══════════════════════════════════════════════

// ── API Proxy Default ──
window.TRACE_API_PROXY = window.TRACE_API_PROXY || 'http://localhost:3000';

// ── Keyboard Shortcuts ──
var SHORTCUTS = {
  '1': 'home', '2': 'scan', '3': 'chat', '4': 'cases', '5': 'timeline', '6': 'learn', '7': 'profile',
  'h': 'home', 's': 'scan', 'c': 'chat', 'f': 'cases', 't': 'timeline', 'l': 'learn', 'p': 'profile',
  'Escape': 'back', 'Backspace': 'back', '/': 'focus-search', '?': 'show-help',
};

var DPAD_MAP = {
  'ArrowUp': 'up', 'ArrowDown': 'down', 'ArrowLeft': 'left', 'ArrowRight': 'right',
  'Enter': 'select', ' ': 'select', 'Escape': 'back', 'Backspace': 'back',
  'MediaPlayPause': 'select', 'MediaTrackNext': 'right', 'MediaTrackPrevious': 'left',
  'Play': 'select', 'FastForward': 'right', 'Rewind': 'left',
};

var FOCUSABLE_SEL = 'button:not([disabled]):not([style*="display: none"]), [tabindex]:not([tabindex="-1"]), input, select, textarea, a[href]';

function getVisibleFocusables() {
  return Array.prototype.slice.call(
    document.querySelectorAll(FOCUSABLE_SEL)
  ).filter(function(el) {
    var r = el.getBoundingClientRect();
    var s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
  });
}

function focusElement(el) {
  if (!el) return;
  el.focus();
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function focusInDirection(currentEl, direction) {
  var rect = currentEl.getBoundingClientRect();
  var all = getVisibleFocusables();
  var results = [];
  all.forEach(function(el) {
    if (el === currentEl) return;
    var r = el.getBoundingClientRect();
    var dx = r.left - rect.left;
    var dy = r.top - rect.top;
    var dist = Math.sqrt(dx * dx + dy * dy);
    switch (direction) {
      case 'up':    if (dy < -5 && Math.abs(dx) < Math.abs(dy) * 2) results.push({ el: el, dist: dist }); break;
      case 'down':  if (dy > 5 && Math.abs(dx) < Math.abs(dy) * 2) results.push({ el: el, dist: dist }); break;
      case 'left':  if (dx < -5 && Math.abs(dy) < Math.abs(dx) * 2) results.push({ el: el, dist: dist }); break;
      case 'right': if (dx > 5 && Math.abs(dy) < Math.abs(dx) * 2) results.push({ el: el, dist: dist }); break;
    }
  });
  results.sort(function(a, b) { return a.dist - b.dist; });
  return results.length ? results[0].el : null;
}

function showKeyboardHelp() {
  var existing = document.getElementById('trace-keyboard-help');
  if (existing) { existing.remove(); return; }
  var overlay = document.createElement('div');
  overlay.id = 'trace-keyboard-help';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:pointer;';
  var content = document.createElement('div');
  content.style.cssText = 'background:var(--surface);border:1px solid var(--border-mid);padding:28px;max-width:380px;width:90%;max-height:80vh;overflow-y:auto;';
  content.innerHTML = '<div style="font-family:Cormorant Garamond,serif;font-size:22px;color:var(--text);margin-bottom:16px;">Keyboard Shortcuts</div>' +
    '<div style="font-size:12px;line-height:2;color:var(--text-mid);">' +
    '<div><span style="color:var(--gold);font-family:Courier Prime,monospace;">1-7</span> Navigate screens</div>' +
    '<div><span style="color:var(--gold);font-family:Courier Prime,monospace;">H S C F T L P</span> Home, Scan, Chat, Files, Timeline, Learn, Profile</div>' +
    '<div><span style="color:var(--gold);font-family:Courier Prime,monospace;">↑ ↓ ← →</span> D-pad navigation (TV remote)</div>' +
    '<div><span style="color:var(--gold);font-family:Courier Prime,monospace;">Enter / Space</span> Select / Activate</div>' +
    '<div><span style="color:var(--gold);font-family:Courier Prime,monospace;">Esc / Backspace</span> Go back</div>' +
    '<div><span style="color:var(--gold);font-family:Courier Prime,monospace;">?</span> Toggle this help</div>' +
    '</div>' +
    '<div style="margin-top:16px;font-size:10px;color:var(--text-ghost);">Press Esc or ? to close</div>';
  overlay.appendChild(content);
  overlay.onclick = function() { overlay.remove(); };
  document.body.appendChild(overlay);
}

// ── Key handler ──
document.addEventListener('keydown', function(e) {
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }

  var key = e.key;
  if (!e.ctrlKey && !e.metaKey && !e.altKey && SHORTCUTS[key]) {
    var target = SHORTCUTS[key];
    e.preventDefault();
    if (target === 'back') { window.nav('home'); return; }
    if (target === 'show-help') { showKeyboardHelp(); return; }
    window.nav(target);
    return;
  }

  var action = DPAD_MAP[key];
  if (!action) return;
  e.preventDefault();

  if (action === 'back') { window.nav('home'); return; }
  if (action === 'select') {
    var current = document.activeElement;
    if (current && current.tagName === 'BUTTON') { current.click(); return; }
    var activeScreen = document.querySelector('.screen.active');
    if (activeScreen) {
      var firstBtn = activeScreen.querySelector(FOCUSABLE_SEL);
      if (firstBtn) focusElement(firstBtn);
    }
    return;
  }
  var current = document.activeElement;
  if (current && current !== document.body && current !== document.documentElement) {
    var next = focusInDirection(current, action);
    if (next) { focusElement(next); return; }
  }
  if (!current || current === document.body) {
    var screen = document.querySelector('.screen.active');
    if (screen) {
      var first = screen.querySelector(FOCUSABLE_SEL);
      if (first) focusElement(first);
    }
  }
});

// ── Kiosk Mode Detection ──
(function() {
  var isTV = /SmartTV|Tizen|webOS|AndroidTV|Wii|PlayStation|Roku/i.test(navigator.userAgent);
  var isLargeScreen = window.screen.width >= 1280 || window.screen.height >= 720;
  if (isTV || isLargeScreen) {
    document.body.classList.add('trace-kiosk');
  }
  // Auto-focus first element for kiosk after nav
  var _origNav = window.nav;
  if (typeof _origNav === 'function') {
    window.nav = function(id) {
      _origNav(id);
      setTimeout(function() {
        if (document.body.classList.contains('trace-kiosk')) {
          var screen = document.getElementById('s-' + id);
          if (screen) {
            var first = screen.querySelector(FOCUSABLE_SEL);
            if (first) focusElement(first);
          }
        }
      }, 100);
    };
  }
})();

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('nav', {
    version: '1.0.0',
    dependsOn: ['utils', 'tiers', 'i18n'],
    init: function() {
      // Keyboard and d-pad handlers are registered at module load time
      // No additional init needed here
    }
  });
}

console.log('[TRACE Nav] Loaded');
