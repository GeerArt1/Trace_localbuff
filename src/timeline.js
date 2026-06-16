// ══════════════════════════════════════════════
// TRACE — Timeline System
// ══════════════════════════════════════════════

/**
 * Activate a screen directly without going through nav()'s full cycle.
 * This prevents recursive loops when timeline code needs to ensure
 * the timeline screen is visible without re-triggering timeline loading.
 * @param {string} id - Screen ID
 */
function _activateScreen(id) {
  if (!id) return;
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
}

/**
 * Navigate to the timeline view — resolves the best available timeline
 */
window.navTimeline = function navTimeline() {
  // Priority 1: _lastTimeline
  if (window._lastTimeline && window._lastTimeline.title) {
    var t = window._lastTimeline;
    window.openTimeline(t.title, t.sub || '', t.type || 'artwork', t.events || []);
    return;
  }
  // Priority 2: stored timelines
  var tls = window._timelines || {};
  var keys = Object.keys(tls);
  if (keys.length > 0) {
    var last = tls[keys[keys.length - 1]];
    if (last && last.title) {
      window.openTimeline(last.title, last.sub || '', last.type || 'artwork', last.events || []);
      return;
    }
  }
  // Priority 3: _lastResult
  var r = window._lastResult;
  if (r && r.title) {
    window.openTimeline(r.title, (r.artist || '') + (r.period ? ', ' + r.period : ''), r.subject_type || 'artwork', r.timeline || []);
    return;
  }
  // Priority 4: localStorage
  try {
    var stored = localStorage.getItem('trace_timelines');
    if (stored) {
      var data = JSON.parse(stored);
      var keys2 = Object.keys(data);
      if (keys2.length > 0) {
        var last2 = data[keys2[keys2.length - 1]];
        if (last2 && last2.title) {
          window._lastTimeline = last2;
          window.openTimeline(last2.title, last2.sub || '', last2.type || 'artwork', last2.events || []);
          return;
        }
      }
    }
  } catch(e) { TRACE_WATCHDOG?.warn('Timeline', e); }

  // Show saved timelines list
  var savedList = window.listSavedTimelines();
  if (savedList.length > 0) {
    window.renderSavedTimelines();
    _activateScreen('timeline');
    return;
  }

  // Empty state
  var pt = document.getElementById('tl-page-title');
  if (pt) pt.textContent = 'Timeline';
  var sn = document.getElementById('tl-sname');
  if (sn) sn.textContent = 'No investigations yet';
  var ss = document.getElementById('tl-ssub');
  if (ss) ss.textContent = 'Scan an artwork to begin';
  var st = document.getElementById('tl-stype');
  if (st) st.textContent = 'TRACE';
  var sc = document.getElementById('tl-screen');
  var gd = document.getElementById('tl-grid');
  var so = document.getElementById('tl-h-strip-container');
  if (gd) gd.innerHTML = '<div style="grid-column:1/-1;">' + window.buildEmptyTL() + '</div>';
  if (sc) sc.style.display = 'block';
  if (so) so.style.display = 'none';
  var sv = document.getElementById('tl-saved-list');
  if (sv) sv.style.display = 'none';
  var tlk = document.getElementById('tl-locked');
  if (tlk) tlk.style.display = 'none';
  _activateScreen('timeline');
};

/**
 * Open a timeline for a case by title
 * @param {string} title
 * @param {string} sub
 * @param {string} type
 */
window.openCaseTimeline = function openCaseTimeline(title, sub, type) {
  var tls = window._timelines || {};
  var stored = tls[title];
  var events = stored ? stored.events : (
    window._lastResult && window._lastResult.title === title ? window._lastResult.timeline : []
  );
  window.openTimeline(title, sub, type, events.length ? events : null);
};

/**
 * Open and render a full timeline
 * @param {string} title
 * @param {string} sub
 * @param {string} type
 * @param {Array|null} eventsArg
 */
window.openTimeline = function openTimeline(title, sub, type, eventsArg) {
  var events = (eventsArg && eventsArg.length) ? eventsArg : [];
  if (!events.length && window._lastTimeline) events = window._lastTimeline.events || [];
  if (!events.length && title && window._timelines && window._timelines[title])
    events = window._timelines[title].events || [];
  if (!events.length && window._lastResult && window._lastResult.title === title)
    events = window._lastResult.timeline || [];

  var stripOuter = document.getElementById('tl-h-strip-container');
  var screen = document.getElementById('tl-screen');
  var grid = document.getElementById('tl-grid');
  var locked = document.getElementById('tl-locked');
  if (locked) locked.style.display = 'none';
  if (screen) screen.style.display = 'block';
  var svList = document.getElementById('tl-saved-list');
  if (svList) svList.style.display = 'none';
  if (!document.getElementById('s-timeline') || !document.getElementById('s-timeline').classList.contains('active')) {
    _activateScreen('timeline');
  }

  var pTitle = document.getElementById('tl-page-title');
  var sName = document.getElementById('tl-sname');
  var sSub = document.getElementById('tl-ssub');
  var sType = document.getElementById('tl-stype');
  if (pTitle) pTitle.textContent = 'Provenance Timeline';
  if (sName) sName.textContent = title || 'Unknown';
  if (sSub) sSub.textContent = sub || '';
  if (sType) sType.textContent = (type || 'artwork').toUpperCase();

  if (!grid) return;
  grid.innerHTML = '';
  if (stripOuter) stripOuter.innerHTML = '';

  if (!events.length) {
    if (stripOuter) stripOuter.style.display = 'none';
    grid.innerHTML = '<div style="grid-column:1/-1;padding:40px 20px;text-align:center;">' + window.buildEmptyTL() + '</div>';
    return;
  }

  // Horizontal strip
  if (stripOuter) {
    stripOuter.style.display = 'block';
    var inner = document.createElement('div');
    inner.style.cssText = 'display:flex;align-items:center;padding:10px 16px;gap:0;position:relative;min-width:max-content;';
    var line = document.createElement('div');
    line.style.cssText = 'position:absolute;left:28px;right:28px;top:50%;height:1px;background:var(--surface3);transform:translateY(-4px);';
    inner.appendChild(line);
    events.forEach(function(ev, i) {
      var isGap = ev.event && (ev.event.toLowerCase().includes('gap') || ev.event.includes('\u26a0'));
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:72px;flex-shrink:0;cursor:pointer;position:relative;z-index:1;gap:4px;';
      wrap.onclick = function() { window.scrollToEvent(i); };
      var dot = document.createElement('div');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;border:1.5px solid ' + (isGap ? '#E8A020' : 'var(--gold-dim)') + ';background:var(--bg);transition:all .25s;' + (isGap ? 'box-shadow:0 0 5px rgba(232,160,32,0.5);' : '');
      var yr = document.createElement('div');
      yr.style.cssText = 'font-family:\'Courier Prime\',monospace;font-size:8px;color:' + (isGap ? '#E8A020' : 'var(--text-dim)') + ';text-align:center;white-space:nowrap;';
      yr.textContent = ev.year;
      wrap.appendChild(dot);
      wrap.appendChild(yr);
      inner.appendChild(wrap);
    });
    stripOuter.appendChild(inner);
  }

  // Grid rows
  events.forEach(function(ev, i) {
    var isGap = ev.event && (ev.event.toLowerCase().includes('gap') || ev.event.includes('\u26a0'));

    // Spine cell
    var sc = document.createElement('div');
    sc.style.cssText = 'position:relative;border-bottom:1px solid var(--border);display:flex;flex-direction:column;align-items:center;padding-top:18px;box-sizing:border-box;';
    if (i < events.length - 1) {
      var ln = document.createElement('div');
      ln.style.cssText = 'position:absolute;left:50%;top:30px;bottom:0;width:1px;background:var(--border);transform:translateX(-50%);z-index:0;';
      sc.appendChild(ln);
    }
    var sDot = document.createElement('div');
    sDot.style.cssText = 'width:9px;height:9px;border-radius:50%;border:1.5px solid ' + (isGap ? '#E8A020' : 'var(--gold-dim)') + ';background:var(--bg);position:relative;z-index:1;transition:all .25s;flex-shrink:0;' + (isGap ? 'box-shadow:0 0 5px rgba(232,160,32,0.5);' : '');
    var sYr = document.createElement('div');
    sYr.style.cssText = 'font-family:\'Courier Prime\',monospace;font-size:9px;color:' + (isGap ? '#E8A020' : 'var(--text-dim)') + ';margin-top:5px;text-align:center;line-height:1.2;transition:color .25s;word-break:break-all;max-width:60px;';
    sYr.textContent = ev.year;
    sc.appendChild(sDot);
    sc.appendChild(sYr);
    grid.appendChild(sc);

    // Body cell
    var bc = document.createElement('div');
    bc.style.cssText = 'padding:14px 16px 14px 12px;border-bottom:1px solid var(--border);box-sizing:border-box;' + (isGap ? 'background:rgba(232,160,32,0.04);' : '');
    var evEl = document.createElement('div');
    evEl.style.cssText = 'font-size:13px;color:' + (isGap ? '#E8A020' : 'var(--text-dim)') + ';margin-bottom:5px;line-height:1.35;font-weight:400;transition:color .25s;';
    evEl.textContent = (isGap ? '\u26a0 ' : '') + ev.event;
    var dtEl = document.createElement('div');
    dtEl.style.cssText = 'font-size:12px;color:var(--text-dim);line-height:1.6;transition:color .25s;';
    dtEl.textContent = ev.detail || '';
    var cats = { creation: 'rgba(80,136,168,.15)', ownership: 'rgba(212,174,82,.1)', exhibition: 'rgba(58,138,90,.1)', auction: 'rgba(196,72,72,.1)', life: 'rgba(150,120,80,.1)', historical: 'rgba(140,100,180,.1)' };
    var catEl = document.createElement('span');
    catEl.style.cssText = 'display:inline-block;margin-top:8px;font-size:8px;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;background:' + (cats[ev.category] || cats.ownership) + ';color:var(--text-dim);border:1px solid var(--border);';
    catEl.textContent = ev.category || 'ownership';
    bc.appendChild(evEl);
    if (ev.detail) bc.appendChild(dtEl);
    bc.appendChild(catEl);
    grid.appendChild(bc);
  });

  // Scroll sync
  var _lastActiveIdx = -1;
  function updateActive() {
    var cells = grid.querySelectorAll('div:nth-child(even)');
    var gridRect = screen.getBoundingClientRect();
    var atBottom = screen.scrollTop + screen.clientHeight >= screen.scrollHeight - 8;
    var activeIdx = 0;
    if (atBottom) {
      activeIdx = cells.length - 1;
    } else {
      cells.forEach(function(cell, i) {
        var top = cell.getBoundingClientRect().top - gridRect.top;
        if (top <= gridRect.height * 0.3) activeIdx = i;
      });
    }
    if (activeIdx === _lastActiveIdx) return;
    _lastActiveIdx = activeIdx;

    // Horizontal strip dots
    if (stripOuter) {
      var wraps = stripOuter.querySelectorAll('div[style*="cursor:pointer"]');
      wraps.forEach(function(w, i) {
        var isAct = i === activeIdx;
        var dot = w.querySelector('div');
        var yr = w.querySelector('div:last-child');
        if (dot) {
          dot.style.background = isAct ? (events[i] && events[i].event && events[i].event.toLowerCase().includes('gap') ? '#E8A020' : 'var(--gold)') : 'var(--bg)';
          dot.style.transform = isAct ? 'scale(1.5)' : 'scale(1)';
        }
        if (yr) {
          yr.style.color = isAct ? 'var(--gold)' : 'var(--text-dim)';
          yr.style.fontWeight = isAct ? '700' : '400';
        }
      });
    }

    // Spine dots
    grid.querySelectorAll('div:first-child').forEach(function(sp, i) {
      if (i >= events.length) return;
      var isAct = i === activeIdx;
      var dot = sp.querySelector('div');
      var yr = sp.querySelector('div:last-child');
      if (dot) {
        dot.style.background = isAct ? (events[i] && events[i].event && events[i].event.toLowerCase().includes('gap') ? '#E8A020' : 'var(--gold)') : 'var(--bg)';
        dot.style.transform = isAct ? 'scale(1.5)' : 'scale(1)';
      }
      if (yr) {
        yr.style.color = isAct ? 'var(--gold)' : (events[i] && events[i].event && events[i].event.toLowerCase().includes('gap') ? 'rgba(232,160,32,0.5)' : 'var(--text-dim)');
        yr.style.fontWeight = isAct ? '700' : '400';
      }
    });
  }

  screen.onscroll = updateActive;
  requestAnimationFrame(updateActive);
};

/**
 * Scroll to a specific timeline event
 * @param {number} idx
 */
window.scrollToEvent = function scrollToEvent(idx) {
  var screen = document.getElementById('tl-screen');
  if (!screen) return;
  var cells = screen.querySelectorAll('div[style*="padding:14px 16px"]');
  if (cells[idx]) cells[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('timeline', {
    version: '1.1.0',
    dependsOn: ['utils', 'persistence', 'nav']
  });
}

console.log('[TRACE Timeline] Loaded');
