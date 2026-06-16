// ══════════════════════════════════════════════
// TRACE — Cases
// ══════════════════════════════════════════════

/**
 * Add the current result as a case
 */
window.addCase = function addCase() {
  var r = window._lastResult;
  if (!r) return;
  var conf = r.provenance_confidence || 55;
  var card = document.createElement('div');
  card.className = 'case-card';
  var events = Array.isArray(r.timeline) ? r.timeline : [];
  var tl = events.slice(0, 4).map(function(t) {
    return '<div class="tl-dot"><div class="tl-dot-mark"></div><div class="tl-dot-year">' + window.esc(t.year) + '</div><div class="tl-dot-ev">' + window.esc((t.event || '').substring(0, 10)) + '</div></div>';
  }).join('');
  var tlStrip = tl ? '<div class="tl-strip"><div style="position:absolute;left:22px;right:22px;top:17px;height:1px;background:var(--gold-dim);"></div>' + tl + '</div>' : '';
  card.dataset.status = 'active';
  card.dataset.type = r.subject_type || 'artwork';
  card.dataset.saved = 'true';
  card.innerHTML =
    '<div class="card-inner" onclick="window.openCaseTimeline(\'' + window.escAttr(r.title || '') + '\',\'' + window.escAttr(r.artist || '') + '\',\'' + window.escAttr(r.subject_type || 'artwork') + '\')">' +
    '<div class="card-title">' + window.esc(r.title || 'Unknown') + '</div>' +
    '<div class="card-attr">' + window.esc(r.artist || '') + (r.period ? ', ' + window.esc(r.period) : '') + '</div>' +
    '<div class="card-foot"><div class="cbar"><div class="cfill" style="width:' + conf + '%"></div></div><div class="pill pill-inv">Active</div></div></div>' +
    tlStrip;

  var list = document.getElementById('cases-list');
  list.prepend(card);
  var ps = document.getElementById('ps-cases');
  if (ps) ps.textContent = parseInt(ps.textContent || 0) + 1;
  window.toast('Added · ' + window._lastId);
  var ba = document.getElementById('btn-add');
  if (ba) ba.classList.remove('on');

  window._timelines = window._timelines || {};
  window._timelines[r.title] = {
    title: r.title,
    sub: (r.artist || '') + (r.period ? ', ' + r.period : ''),
    type: r.subject_type || 'artwork',
    events: r.timeline || []
  };
  if (typeof window.saveTimelineLocal === 'function') window.saveTimelineLocal(r.title, window._timelines[r.title]);
  setTimeout(function() {
    if (typeof window.syncTimelineToServer === 'function') window.syncTimelineToServer(r.title);
  }, 100);
  if (typeof window.addCaseToIndex === 'function') window.addCaseToIndex(r.title, r.subject_type || 'artwork');
};

/**
 * Show upgrade dialog for locked features
 * @param {string} key - Feature key
 */
window.showUpgradeCard = window.showUpgradeCard || function showUpgradeCard(key) {
  var cards = {
    chat: { title: 'Unlimited AI Chat', body: 'Ask unlimited questions about any artwork. Upgrade for unlimited access.', tier: 'collector' },
    batch: { title: 'Batch Scanning', body: 'Upload up to 20 artworks at once for bulk analysis.', tier: 'professional' },
    timeline: { title: 'Full Provenance Timeline', body: 'See the complete ownership chain from creation to present day.', tier: 'collector' },
  };
  var card = cards[key] || cards.chat;
  var overlay = document.createElement('div');
  overlay.id = 'upgrade-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:600;background:rgba(5,4,3,0.7);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
  overlay.innerHTML =
    '<div style="background:var(--surface);border:1px solid var(--border-strong);padding:28px 24px;max-width:360px;width:100%;text-align:center;">' +
    '<div style="font-size:36px;color:var(--gold);margin-bottom:12px;">\u25C8</div>' +
    '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:400;color:var(--text);margin-bottom:10px;">' + card.title + '</div>' +
    '<div style="font-size:12px;line-height:1.7;color:var(--text-mid);margin-bottom:20px;">' + card.body + '</div>' +
    '<button onclick="this.closest(\'#upgrade-overlay\').remove();if(typeof TRACE_SUB !== \'undefined\')TRACE_SUB.showUpgradeFlow(\'' + card.tier + '\')" style="width:100%;background:var(--gold);color:#060402;border:none;padding:14px;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;">UPGRADE NOW</button>' +
    '<button onclick="this.closest(\'#upgrade-overlay\').remove()" style="background:none;border:none;color:var(--text-dim);padding:10px;font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;width:100%;">Maybe later</button></div>';
  document.body.appendChild(overlay);
};

/**
 * Navigate to profile / upgrade
 */
window.showUpgrade = function showUpgrade() {
  window.nav('profile');
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('cases', {
    version: '1.0.0',
    dependsOn: ['utils', 'persistence', 'nav']
  });
}

console.log('[TRACE Cases] Loaded');
