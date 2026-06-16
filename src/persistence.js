// ══════════════════════════════════════════════
// TRACE — Persistence Layer
// ══════════════════════════════════════════════

var TL_STORE_KEY = 'trace_timelines';
var CASES_STORE_KEY = 'trace_cases';

/**
 * Load timelines from IndexedDB primary store, fallback to localStorage
 */
window.loadTimelinesFromStorage = function loadTimelinesFromStorage() {
  // Try IndexedDB first
  if (window.IDB && window.IDB.ready()) {
    window.IDB.loadAllTimelines().then(function(map) {
      window._timelines = window._timelines || {};
      Object.keys(map).forEach(function(key) {
        window._timelines[key] = map[key];
      });
      // Also update cases
      if (typeof window.loadCasesFromStorage === 'function') {
        window.loadCasesFromStorage();
      }
    }).catch(function() {
      // Fallback to localStorage
      loadFromLocalStorage();
    });
  } else {
    loadFromLocalStorage();
  }

  function loadFromLocalStorage() {
    try {
      // 1. Migrate from sessionStorage if found (legacy)
      var legacy = sessionStorage.getItem('trace_lastTimeline');
      if (legacy) {
        var parsed = JSON.parse(legacy);
        if (parsed) {
          if (!parsed.title) parsed.title = parsed.sub || 'Artwork ' + new Date().toISOString().slice(0, 10);
          window.saveTimelineLocal(parsed.title, parsed);
        }
        try { sessionStorage.removeItem('trace_lastTimeline'); } catch(e) { TRACE_WATCHDOG?.warn('Persistence', e); }
      }
      var legacyResult = sessionStorage.getItem('trace_lastResult');
      if (legacyResult) {
        try { sessionStorage.removeItem('trace_lastResult'); } catch(e) { TRACE_WATCHDOG?.warn('Persistence', e); }
      }

      // 2. Load all timelines from localStorage
      var raw = localStorage.getItem(TL_STORE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        window._timelines = window._timelines || {};
        Object.keys(data).forEach(function(key) {
          window._timelines[key] = data[key];
        });
      }
    } catch (e) { /* storage may be full or corrupt */ }
  }
};

// On load, try to migrate localStorage data to IndexedDB
setTimeout(function() {
  if (window.IDB && window.IDB.ready()) {
    window.IDB.migrateFromLocalStorage();
  }
}, 2000);

/**
 * Save a timeline to IndexedDB primary store, fallback to localStorage
 * @param {string} title
 * @param {Object} data
 */
window.saveTimelineLocal = function saveTimelineLocal(title, data) {
  try {
    window._timelines = window._timelines || {};
    window._timelines[title] = data;

    // Save to IndexedDB primary store
    if (window.IDB && window.IDB.ready()) {
      window.IDB.saveTimeline({
        title: data.title || title,
        sub: data.sub || '',
        type: data.type || 'artwork',
        events: Array.isArray(data.events) ? data.events : [],
        artist: data.artist || '',
        period: data.period || '',
        confidence: data.confidence || 0,
        savedAt: Date.now()
      });
    }

    // Also save to localStorage as backup
    var all = {};
    Object.keys(window._timelines).forEach(function(k) {
      var t = window._timelines[k];
      all[k] = {
        title: t.title || k,
        sub: t.sub || '',
        type: t.type || 'artwork',
        events: Array.isArray(t.events) ? t.events : [],
        artist: t.artist || '',
        period: t.period || '',
        confidence: t.confidence || 0,
        savedAt: Date.now()
      };
    });
    try {
      localStorage.setItem(TL_STORE_KEY, JSON.stringify(all));
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        window.toast('Timeline storage full — consider exporting or deleting old cases');
      }
    }
  } catch(e) { TRACE_WATCHDOG?.warn('Persistence', e); }
};

/**
 * Delete a timeline from localStorage
 * @param {string} title
 */
window.deleteTimelineLocal = function deleteTimelineLocal(title) {
  if (window._timelines && window._timelines[title]) {
    delete window._timelines[title];
  }
  try {
    var raw = localStorage.getItem(TL_STORE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      delete data[title];
      localStorage.setItem(TL_STORE_KEY, JSON.stringify(data));
    }
  } catch(e) { TRACE_WATCHDOG?.warn('Persistence', e); }
};

/**
 * List all saved timelines sorted by date descending
 * @returns {Array}
 */
window.listSavedTimelines = function listSavedTimelines() {
  try {
    var raw = localStorage.getItem(TL_STORE_KEY);
    if (raw) {
      var data = JSON.parse(raw);
      var list = [];
      Object.keys(data).forEach(function(k) {
        list.push(data[k]);
      });
      list.sort(function(a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
      return list;
    }
  } catch(e) { TRACE_WATCHDOG?.warn('Persistence', e); }
  return [];
};

/**
 * Sync a timeline to the server (fire-and-forget, queues when offline)
 * @param {string} title
 */
window.syncTimelineToServer = function syncTimelineToServer(title) {
  var timeline = window._timelines && window._timelines[title];
  if (!timeline) return;
  var apiBase = window.TRACE_API_PROXY || '';
  if (!apiBase) return;

  var body = {
    title: timeline.title,
    sub: timeline.sub || '',
    type: timeline.type || 'artwork',
    events: timeline.events || [],
    artist: timeline.artist || '',
    period: timeline.period || ''
  };

  // If offline, queue the operation instead of fire-and-forget
  if (typeof window.queueOfflineOp === 'function' && !navigator.onLine) {
    window.queueOfflineOp(apiBase + '/api/timeline/save', 'POST', body, 'timeline_save');
    return;
  }

  fetch(apiBase + '/api/timeline/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).catch(function() {
    // Network failed mid-flight — queue for retry
    if (typeof window.queueOfflineOp === 'function') {
      window.queueOfflineOp(apiBase + '/api/timeline/save', 'POST', body, 'timeline_save');
    }
  });
};

/**
 * Load timelines from server (fire-and-forget)
 * @returns {Promise<Array>}
 */
window.loadTimelinesFromServer = function loadTimelinesFromServer() {
  var apiBase = window.TRACE_API_PROXY || '';
  if (!apiBase) return Promise.resolve([]);
  return fetch(apiBase + '/api/timeline/list')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data && data.timelines && data.timelines.length) {
        window._timelines = window._timelines || {};
        data.timelines.forEach(function(t) {
          if (t.title && !window._timelines[t.title]) {
            window._timelines[t.title] = {
              title: t.title,
              sub: t.sub || '',
              type: t.type || 'artwork',
              events: Array.isArray(t.events) ? t.events : [],
              artist: t.artist || '',
              period: t.period || ''
            };
          }
        });
        Object.keys(window._timelines).forEach(function(k) {
          window.saveTimelineLocal(k, window._timelines[k]);
        });
        return data.timelines;
      }
      return [];
    })
    .catch(function() { return []; });
};

/**
 * Add a case to the cases index
 * @param {string} title
 * @param {string} type
 */
window.addCaseToIndex = function addCaseToIndex(title, type) {
  try {
    var raw = localStorage.getItem(CASES_STORE_KEY);
    var cases = raw ? JSON.parse(raw) : [];
    if (!cases.find(function(c) { return c.title === title; })) {
      cases.push({ title: title, type: type || 'artwork', addedAt: Date.now() });
      localStorage.setItem(CASES_STORE_KEY, JSON.stringify(cases));
    }
  } catch(e) { TRACE_WATCHDOG?.warn('Persistence', e); }
};

/**
 * Remove a case from the cases index
 * @param {string} title
 */
window.removeCaseFromIndex = function removeCaseFromIndex(title) {
  try {
    var raw = localStorage.getItem(CASES_STORE_KEY);
    var cases = raw ? JSON.parse(raw) : [];
    cases = cases.filter(function(c) { return c.title !== title; });
    localStorage.setItem(CASES_STORE_KEY, JSON.stringify(cases));
  } catch(e) { TRACE_WATCHDOG?.warn('Persistence', e); }
};

/**
 * Get all saved cases from the index
 * @returns {Array}
 */
window.getSavedCases = function getSavedCases() {
  try {
    var raw = localStorage.getItem(CASES_STORE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
};

/**
 * Load saved cases from the index into the Cases screen
 */
window.loadCasesFromStorage = function loadCasesFromStorage() {
  var cases = window.getSavedCases();
  var list = document.getElementById('cases-list');
  if (!list) return;

  if (cases.length === 0) {
    var savedCards = list.querySelectorAll('.case-card[data-saved="true"]');
    savedCards.forEach(function(c) { c.remove(); });
    return;
  }

  var existingCards = list.querySelectorAll('.case-card');
  existingCards.forEach(function(c) { c.remove(); });

  cases.forEach(function(c) {
    var saved = window.listSavedTimelines().filter(function(t) { return t.title === c.title; });
    if (saved.length === 0) return;
    var t = saved[0];
    var events = Array.isArray(t.events) ? t.events : [];
    var tl = events.slice(0, 4).map(function(ev) {
      return '<div class="tl-dot"><div class="tl-dot-mark"></div><div class="tl-dot-year">' + window.esc(ev.year) + '</div><div class="tl-dot-ev">' + window.esc((ev.event || '').substring(0, 10)) + '</div></div>';
    }).join('');
    var tlStrip = tl ? '<div class="tl-strip"><div style="position:absolute;left:22px;right:22px;top:17px;height:1px;background:var(--gold-dim);"></div>' + tl + '</div>' : '';

    var card = document.createElement('div');
    card.className = 'case-card';
    card.dataset.status = 'active';
    card.dataset.type = c.type || 'artwork';
    card.innerHTML = '<div class="card-inner" onclick="window.openCaseTimeline(\'' + window.escAttr(t.title || '') + '\',\'' + window.escAttr(t.sub || '') + '\',\'' + window.escAttr(t.type || 'artwork') + '\')"><div class="card-title">' + window.esc(t.title || 'Unknown') + '</div><div class="card-attr">' + window.esc(t.sub || '') + '</div><div class="card-foot"><div class="cbar"><div class="cfill" style="width:' + (t.confidence || 50) + '%"></div></div><div class="pill pill-inv">Active</div></div></div>' + tlStrip;
    list.appendChild(card);
  });

  var ps = document.getElementById('ps-cases');
  if (ps) ps.textContent = cases.length;
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('persistence', {
    version: '1.1.0',
    dependsOn: ['utils', 'idb', 'offline']
  });
}

console.log('[TRACE Persistence] Loaded');
