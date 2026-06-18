// ══════════════════════════════════════════════
// TRACE — Tier System
// ══════════════════════════════════════════════

// ── TIER CONFIG ──
window.TIERS = {
  discover: {
    name: 'TRACE Discover', badge: 'DISCOVER',
    bodyClass: 'tier-discover',
    tagline: 'Art Intelligence',
    eye1: 'Discover the Story', h1: 'Every artwork has a story. <em>Find yours.</em>',
    b1: 'Point your camera at any painting, sculpture, portrait or photograph. TRACE reveals its story.',
    h2: 'Free to discover.', b2: 'Upgrade to unlock full provenance timelines, case management, and professional tools.',
    homeGreeting: 'Welcome', homeTitle: 'What is this artwork?',
    scanEye: 'Discover the Story', scanHint: 'Photograph anything — artworks, portraits, photos',
    scanTabs: ['Front', 'Back / Label', 'Signature', 'Detail'],
    scanCtaLabel: 'Photograph any artwork',
    qScanLabel: 'Discover Story', tlSubLabel: 'Unlock in Collector',
    hasCases: false, hasTimeline: false, hasExport: false, hasPro: false,
    nav: [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'scan', label: 'Scan', icon: 'scan' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'learn', label: 'Learn', icon: 'learn' },
      { id: 'profile', label: 'Profile', icon: 'profile' },
    ],
    chatIntro: 'Ask me anything about the artwork you just scanned. You have 5 free chats per day — upgrade for unlimited access.',
    chatSuggestions: ['Is this signature authentic?', 'What period does this style suggest?', 'Similar works to compare?'],
    systemPrompt: 'You are TRACE Discover — a universal visual intelligence guide. You identify and tell the story of ANYTHING: artworks, paintings, animals, landmarks, architecture, people, places, natural wonders, objects, food, plants, vehicles — anything visual. Be warm, engaging and accessible. You MUST respond ONLY with a valid JSON object — NO text before or after, NO markdown, NO code fences containing these fields: title (string), artist (string, or species/breed/person name), period (string), medium (string), movement (string), subject_type (one of: artwork|painting|sculpture|photograph|person|animal|landmark|architecture|place|nature|object|food|vehicle|fashion|unknown), provenance_confidence (integer 0-100), value_estimate (string, e.g. "500-2000 EUR" or "N/A"), the_story (3-4 engaging sentences about what this is and why it matters), fascinating_fact (one surprising detail), what_to_look_for (one specific observation), similar_to (string), keywords (array of 4-5 strings), timeline (REQUIRED array of 6-12 objects from creation/discovery to present day, always ending with current status, each: year, event, detail, category). No markdown, no backticks, no code blocks. The timeline (REQUIRED array of 6-12 objects from creation/discovery to present day, always ending with current status, each: year, event, detail, category). Always end timeline with a "Present" entry. Return ONLY the JSON object — nothing else.',
    planRow: 'Free · Discover', dbRow: 'Public databases', apiRow: false, exportVal: 'Save to collection',
    instLabel: 'Art Explorer',
  },
  collector: {
    name: 'TRACE Collector', badge: 'COLLECTOR',
    bodyClass: 'tier-collector',
    tagline: 'Art Intelligence',
    eye1: 'Art Intelligence', h1: 'Every painting hides a <em>secret history</em>',
    b1: 'TRACE uses AI to investigate the full ownership chain of any artwork — from a flea market find to a potential Old Master.',
    h2: 'Museums. Collectors. <em>Curious minds.</em>', b2: 'From world-class curator to someone wanting to know who\'s in a portrait — TRACE speaks your language.',
    homeGreeting: 'Good Morning, Collector', homeTitle: 'What story does your artwork hide?',
    scanEye: 'AI Identification', scanHint: 'Photograph an artwork to begin AI identification',
    scanTabs: ['Front', 'Back / Label', 'Signature', 'Detail'],
    scanCtaLabel: 'Photograph an artwork',
    qScanLabel: 'Scan Artwork', tlSubLabel: 'Provenance history',
    hasCases: true, hasTimeline: true, hasExport: false, hasPro: false,
    nav: [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'scan', label: 'Scan', icon: 'scan' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'cases', label: 'Cases', icon: 'cases' },
      { id: 'timeline', label: 'Timeline', icon: 'timeline' },
      { id: 'geometry', label: 'Geometry', icon: 'geometry' },
      { id: 'knowledge', label: 'Graph', icon: 'knowledge' },
      { id: 'profile', label: 'Profile', icon: 'profile' },
    ],
    chatIntro: 'Ask me anything about this artwork — style, attribution, provenance gaps, or suggested next steps.',
    chatSuggestions: ['Is this attribution reliable?', 'What should I investigate next?', 'Are there provenance gaps?', 'What is the estimated value?'],
    systemPrompt: 'You are TRACE Collector — art intelligence and provenance specialist. Primary focus: paintings, sculptures, prints, drawings, decorative arts, antiquities, photographs, and portraits. Also handle architectural subjects and notable objects. Apply the rigour of a world-class curator and provenance investigator. Respond ONLY with a valid JSON object containing these fields: title, artist, period, medium, movement, subject_type (artwork|painting|sculpture|photograph|person|animal|landmark|architecture|place|nature|object|antiquity|unknown), provenance_confidence (integer 0-100), value_estimate (string auction estimate or N/A), style_analysis (2-3 sentences on technique and composition), historical_context (2-3 sentences on period and significance), investigation_notes (1-2 sentences on what to investigate further), similar_works (string), keywords (array of 5 strings), timeline (REQUIRED array of 8-14 objects from creation to present day — ALWAYS end with a "Present" entry showing current location/status, each object has: year string, event string max 8 words, detail string max 25 words, category: creation|ownership|exhibition|auction|life|historical). No markdown, no backticks. Return only the JSON object.',
    planRow: 'Collector · €49/mo', dbRow: 'Getty · INTERPOL', apiRow: false, exportVal: 'PDF / CSV',
    instLabel: 'Collector',
  },
  professional: {
    name: 'TRACE Professional', badge: 'PROFESSIONAL',
    bodyClass: 'tier-professional',
    tagline: 'The Standard for Provenance Intelligence',
    eye1: 'Institutional Standard', h1: 'The standard for <em>provenance intelligence</em>',
    b1: 'TRACE Professional is used by museums, auction houses, and institutional collectors worldwide for certified provenance investigation.',
    h2: 'Institutions. Dealers. <em>Auction Houses.</em>', b2: 'Deep provenance chains, risk assessment, WWII gap analysis, Getty submission, certified PDF reports.',
    homeGreeting: 'Investigation Dashboard', homeTitle: 'Active Cases & Alerts',
    scanEye: 'Professional Analysis', scanHint: 'Upload artwork for deep provenance analysis',
    scanTabs: ['Front', 'Back / Label', 'Signature', 'UV Detail', 'X-Ray Ref'],
    scanCtaLabel: 'Upload artwork for analysis',
    qScanLabel: 'Deep Analysis', tlSubLabel: 'Full ownership chain',
    hasCases: true, hasTimeline: true, hasExport: true, hasPro: true,
    nav: [
      { id: 'home', label: 'Dashboard', icon: 'home' },
      { id: 'scan', label: 'Scan', icon: 'scan' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'cases', label: 'Cases', icon: 'cases' },
      { id: 'timeline', label: 'Timeline', icon: 'timeline' },
      { id: 'research', label: 'Research', icon: 'research' },
      { id: 'viewer', label: 'Zoom', icon: 'viewer' },
      { id: 'geometry', label: 'Geometry', icon: 'geometry' },
      { id: 'knowledge', label: 'Graph', icon: 'knowledge' },
      { id: 'profile', label: 'Profile', icon: 'profile' },
    ],
    chatIntro: 'Institutional analysis ready. Ask about attribution, provenance chains, risk assessment, or recommended actions.',
    chatSuggestions: ['Analyse provenance gaps', 'Compare to auction records', 'Assess restitution risk', 'Generate PDF report'],
    systemPrompt: 'You are TRACE Professional — institutional art intelligence for museums, auction houses, dealers and appraisers. Expert analysis of paintings, sculptures, prints, decorative arts, antiquities, photographs, and cultural artefacts. Respond with institutional-grade rigour. Respond ONLY with a valid JSON object containing: title, artist, period, medium, movement, subject_type (artwork|painting|sculpture|photograph|person|landmark|architecture|antiquity|decorative_art|unknown), provenance_confidence (integer 0-100), value_estimate (string with market estimate), professional_assessment (2-3 authoritative sentences), provenance_chain (2-3 sentences on ownership history), risk_assessment (1-2 sentences on restitution or theft risk), recommended_actions (2-3 specific professional next steps citing Getty, ALR, AAMD, UNESCO 1970), exhibition_history (string if known), keywords (array of 5 strings), timeline (REQUIRED array of 8-14 objects from creation to present day — ALWAYS end with a "Present" entry showing current location/status, each object has: year string, event string max 8 words, detail string max 25 words, category: creation|ownership|exhibition|auction|life|historical). No markdown, no backticks. Return only the JSON object.',
    planRow: 'Professional · €299/mo', dbRow: 'Getty · INTERPOL · ALR', apiRow: true, exportVal: 'PDF · CSV · Getty API',
    instLabel: 'Institution',
  }
};

// ── NAV ICONS ──
window.ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12L12 4l9 8"/><path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/></svg>',
  scan: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M3 9V6a1 1 0 011-1h3M3 15v3a1 1 0 001 1h3M21 9V6a1 1 0 00-1-1h-3M21 15v3a1 1 0 01-1 1h-3"/></svg>',
  cases: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  timeline: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><line x1="7" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="17" y2="12"/><line x1="5" y1="7" x2="5" y2="10"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="19" y1="7" x2="19" y2="10"/><line x1="5" y1="14" x2="5" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="19" y1="14" x2="19" y2="17"/></svg>',
  learn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>',
  profile: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  chat: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
  geometry: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1010 10"/><path d="M12 2a10 10 0 0110 10"/><circle cx="12" cy="12" r="3"/><path d="M12 2v20M2 12h20"/></svg>',
  viewer: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  knowledge: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><line x1="7" y1="12" x2="10" y2="12"/><line x1="14" y1="12" x2="17" y2="12"/><line x1="12" y1="7" x2="12" y2="10"/><line x1="12" y1="14" x2="12" y2="17"/></svg>',
  research: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>',
};

/** @type {string} Current active tier */
window.TIER = 'collector';

/**
 * Set the active tier and update all tier-specific UI
 * @param {string} t - Tier name: 'discover', 'collector', or 'professional'
 */
window.setTier = function setTier(t) {
  window.TIER = t;
  // Persist tier for HQ analytics dashboard
  try { localStorage.setItem('trace_tier', t); } catch(e) { TRACE_WATCHDOG?.warn('Tiers', e); }
  var cfg = window.TIERS[t];
  if (!cfg) return;
  var body = document.body;

  // Body class for CSS tier overrides
  body.className = cfg.bodyClass || '';

  // Badge
  var badgeEl = document.getElementById('tier-badge');
  if (badgeEl) badgeEl.textContent = cfg.badge;

  // Intro content
  var ctag = document.getElementById('cin-tagline');
  if (ctag) ctag.textContent = cfg.tagline;
  var ce1 = document.getElementById('cin-eye1');
  if (ce1) ce1.textContent = cfg.eye1;
  var ch1 = document.getElementById('cin-h1');
  if (ch1) ch1.innerHTML = cfg.h1;
  var cb1 = document.getElementById('cin-b1');
  if (cb1) cb1.textContent = cfg.b1;
  var ch2 = document.getElementById('cin-h2');
  if (ch2) ch2.innerHTML = cfg.h2;
  var cb2 = document.getElementById('cin-b2');
  if (cb2) cb2.textContent = cfg.b2;
  var cact = document.getElementById('cin-actions');
  if (cact) {
    var bg = cact.querySelector('.btn-gold');
    if (bg) bg.textContent = t === 'discover' ? 'DISCOVER NOW' : 'BEGIN INVESTIGATION';
  }

  // Home
  var hg = document.getElementById('home-greeting');
  if (hg) hg.textContent = cfg.homeGreeting;
  var ht = document.getElementById('home-title');
  if (ht) ht.textContent = cfg.homeTitle;
  var scl = document.getElementById('scan-cta-label');
  if (scl) scl.textContent = cfg.scanCtaLabel;
  var hcs = document.getElementById('home-cases-section');
  if (hcs) hcs.style.display = cfg.hasCases ? 'block' : 'none';
  var hds = document.getElementById('home-discover-section');
  if (hds) hds.style.display = t === 'discover' ? 'block' : 'none';

  // Scan
  var sh = document.getElementById('scan-zone-hint');
  if (sh) sh.textContent = cfg.scanHint;
  window.buildTabs(cfg.scanTabs);

  // Cases
  var cl = document.getElementById('cases-list');
  if (cl) cl.style.display = cfg.hasCases ? 'block' : 'none';
  var clk = document.getElementById('cases-locked');
  if (clk) clk.style.display = cfg.hasCases ? 'none' : 'block';

  // Timeline
  var tlk = document.getElementById('tl-locked');
  if (tlk) tlk.style.display = cfg.hasTimeline ? 'none' : 'block';
  var rtl = document.getElementById('result-tl-wrap');
  if (rtl) rtl.style.display = 'none';

  // Export
  var er = document.getElementById('export-row');
  if (er) er.classList.toggle('on', cfg.hasExport);
  var ar = document.getElementById('api-row');
  if (ar) ar.style.display = cfg.apiRow ? 'flex' : 'none';

  // Profile
  var pi = document.getElementById('prof-inst');
  if (pi) pi.textContent = cfg.instLabel;
  var pn = document.getElementById('prof-name');
  if (pn) pn.textContent = t === 'professional' ? 'Dr. A. van der Berg' : 'Geert';
  var pp = document.getElementById('prof-plan');
  if (pp) pp.textContent = cfg.name;
  var pr = document.getElementById('plan-row');
  if (pr) pr.textContent = cfg.planRow;
  var dbr = document.getElementById('db-row');
  if (dbr) dbr.textContent = cfg.dbRow;
  var ubx = document.getElementById('upgrade-box');
  if (ubx) ubx.style.display = t === 'discover' ? 'block' : 'none';
  var erv = document.getElementById('export-row-val');
  if (erv) erv.textContent = cfg.exportVal;

  // Getty CSV import — Professional tier only
  var csvSection = document.getElementById('getty-csv-section');
  if (csvSection) {
    csvSection.style.display = t === 'professional' ? 'block' : 'none';
  }

  // Update language display
  var langCurrent = document.getElementById('lang-current');
  if (langCurrent) {
    var langInfo = window.getLanguages ? window.getLanguages() : [];
    var curr = '';
    langInfo.forEach(function(l) { if (l.code === window._lang) curr = l.label; });
    langCurrent.textContent = curr || 'English';
  }

  // Build bottom nav
  window.buildNav(cfg.nav);

  // Navigate to home — but NOT during intro
  var cc = document.getElementById('cin-content');
  if (cc && cc.classList.contains('risen')) cc.style.display = 'none';
  var intro = document.getElementById('s-intro');
  if (!intro || !intro.classList.contains('active')) {
    if (typeof window.nav === 'function') window.nav('home');
  }
};

/**
 * Build scan mode tabs
 * @param {string[]} tabs - Array of tab labels
 */
window.buildTabs = function buildTabs(tabs) {
  var el = document.getElementById('scan-tabs');
  if (!el) return;
  el.innerHTML = tabs.map(function(t, i) {
    return '<button class="mtab' + (i === 0 ? ' active' : '') + '" data-scan-tab="' + window.escAttr(t) + '">' + window.esc(t) + '</button>';
  }).join('');
  // Wire up tab clicks via delegation — only once
  if (!el._tabBound) {
    el._tabBound = true;
    el.addEventListener('click', function(e) {
      var btn = e.target.closest('.mtab[data-scan-tab]');
      if (btn && typeof window.setTab === 'function') {
        window.setTab(btn, btn.dataset.scanTab);
      }
    });
  }
};

/**
 * Build the bottom navigation bar
 * @param {Array<{id:string,label:string,icon:string}>} items - Nav items
 */
window.buildNav = function buildNav(items) {
  var nav = document.getElementById('bottom-nav');
  if (!nav) return;
  nav.innerHTML = items.map(function(item) {
    var iconHtml = window.ICONS[item.icon] || '';
    return '<button type="button" class="ni" id="ni-' + window.escAttr(item.id) + '" data-nav="' + window.escAttr(item.id) + '">' +
      iconHtml +
      '<span class="ni-label">' + window.esc(item.label) + '</span></button>';
  }).join('');
  nav.style.cssText = 'display:flex;width:100%;';
  // Wire up nav clicks via delegation — only once
  if (!nav._navBound) {
    nav._navBound = true;
    nav.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-nav]');
      if (btn && typeof window.nav === 'function') {
        window.nav(btn.dataset.nav);
      }
    });
  }
};

/**
 * Set filter in Cases screen
 * @param {HTMLElement} btn - The clicked filter button
 */
window.setFilter = function setFilter(btn) {
  // Clear all tabs
  var parent = btn.parentElement;
  if (parent) {
    parent.querySelectorAll('.mtab').forEach(function(b) {
      b.classList.remove('active');
      b.style.borderBottom = '';
      b.style.color = '';
    });
  }
  btn.classList.add('active');

  var filter = btn.textContent.trim().toLowerCase();
  var cards = document.querySelectorAll('#cases-list .case-card');
  cards.forEach(function(card) {
    var status = card.dataset.status || 'active';
    var type = card.dataset.type || 'artwork';
    var show = false;
    if (filter === 'all') show = true;
    else if (filter === 'active') show = status === 'active';
    else if (filter === 'confirmed') show = status === 'confirmed';
    else if (filter === 'alerts') show = status === 'alert';
    else if (filter === 'people') show = type === 'person';
    else show = true;
    card.style.display = show ? 'block' : 'none';
  });

  // Show empty state if no cards visible
  var visible = Array.from(cards).filter(function(c) { return c.style.display !== 'none'; });
  var emptyEl = document.getElementById('cases-empty');
  if (!visible.length) {
    var filterLabels = { all: 'No cases yet', active: 'No active cases', confirmed: 'No confirmed cases', alerts: 'No alert cases', people: 'No people identified yet' };
    var filterSubs = { all: 'Scan an artwork to begin.', active: 'Active investigations appear here.', confirmed: 'Confirmed identifications appear here.', alerts: 'Cases with alerts appear here.', people: 'Scan a portrait to identify people.' };
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.id = 'cases-empty';
      emptyEl.style.cssText = 'padding:48px 24px;text-align:center;color:var(--text-dim);font-size:13px;';
      var emptyTitle = document.createElement('div');
      emptyTitle.id = 'cases-empty-title';
      emptyTitle.style.cssText = 'font-size:20px;color:var(--text);margin-bottom:8px;';
      var emptySub = document.createElement('div');
      emptySub.id = 'cases-empty-sub';
      emptyEl.appendChild(emptyTitle);
      emptyEl.appendChild(emptySub);
      document.getElementById('cases-list').appendChild(emptyEl);
    }
    var titleEl = document.getElementById('cases-empty-title');
    var subEl = document.getElementById('cases-empty-sub');
    if (titleEl) titleEl.textContent = filterLabels[filter] || ('No ' + filter + ' cases');
    if (subEl) subEl.textContent = filterSubs[filter] || 'Scan an artwork to add it here.';
    emptyEl.style.display = 'block';
  } else if (emptyEl) {
    emptyEl.style.display = 'none';
  }
};

console.log('[TRACE Tiers] Loaded');
