// ══════════════════════════════════════════════
// TRACE — Results Display
// ══════════════════════════════════════════════

/**
 * Copy result to clipboard
 */
window.copyResult = function copyResult() {
  var r = window._lastResult;
  if (!r) { window.toast('No result to copy'); return; }
  var txt = (r.title || 'Unknown') + ' — ' + (r.artist || '') +
    ' (' + (r.period || '') + ')\n\n' +
    (r.the_story || r.style_analysis || r.professional_assessment || '') +
    '\n\nConfidence: ' + (r.provenance_confidence || 'N/A') + '%' +
    (r.value_estimate ? ' · Value: ' + r.value_estimate : '');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(function() {
      window.toast('Copied to clipboard');
    }).catch(function() {
      window.toast('Failed to copy');
    });
  } else {
    window.toast(txt.substring(0, 60) + '…');
  }
};

/**
 * Toggle bookmark on current result
 */
window.toggleBookmark = function toggleBookmark() {
  var r = window._lastResult;
  if (!r) { window.toast('No result to bookmark'); return; }
  try {
    var key = 'trace_bookmarks';
    var raw = localStorage.getItem(key);
    var bookmarks = raw ? JSON.parse(raw) : [];
    var title = r.title || 'Unknown';
    var idx = bookmarks.indexOf(title);
    var btn = document.getElementById('bookmark-btn');
    if (idx >= 0) {
      bookmarks.splice(idx, 1);
      if (btn) btn.classList.remove('bookmarked');
      window.toast('Bookmark removed');
    } else {
      bookmarks.push(title);
      if (btn) btn.classList.add('bookmarked');
      window.toast('Bookmarked ✓');
    }
    localStorage.setItem(key, JSON.stringify(bookmarks));
  } catch(e) { TRACE_WATCHDOG?.warn('Results', e); }
};

/**
 * Zoom into the preview image
 */
window.zoomPreview = function zoomPreview() {
  var preview = document.getElementById('main-preview');
  if (!preview || !preview.src || preview.style.display === 'none') {
    window.toast('No image to zoom');
    return;
  }
  var existing = document.getElementById('zoom-preview-overlay');
  if (existing) { existing.remove(); return; }      var overlay = document.createElement('div');
      overlay.id = 'zoom-preview-overlay';
      overlay.className = 'zoom-overlay';
      var closeBtn = document.createElement('button');
      closeBtn.className = 'zoom-close';
      closeBtn.textContent = '✕';
      closeBtn.addEventListener('click', function() { overlay.remove(); });
      var imgEl = document.createElement('img');
      imgEl.src = preview.src;
      imgEl.alt = 'Zoom';
      overlay.appendChild(closeBtn);
      overlay.appendChild(imgEl);
  overlay.addEventListener('click', function() { overlay.remove(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(function() { overlay.classList.add('open'); });
};

/**
 * Display analysis results with professional Amazon-inspired layout
 * @param {Object} r - Result object from AI analysis
 */
window.showResult = function showResult(r) {
  var ml = document.getElementById('main-loading');
  if (ml) ml.classList.remove('on');

  var id = (window.TIER === 'professional' ? 'TRC-PRO-' : window.TIER === 'discover' ? 'DSC-' : 'TRC-') +
    Math.floor(Math.random() * 900000 + 100000);
  var rid = document.getElementById('result-id');
  if (rid) rid.textContent = id;

  var subjectLabels = {
    artwork: 'Art Analysis Complete', painting: 'Painting Identified',
    sculpture: 'Sculpture Identified', photograph: 'Photo Analysed',
    person: 'Person Identified', animal: 'Species Identified',
    landmark: 'Landmark Identified', architecture: 'Architecture Analysed',
    place: 'Location Identified', nature: 'Nature Identified',
    object: 'Object Identified', food: 'Dish Identified',
    vehicle: 'Vehicle Identified', fashion: 'Style Identified',
    unknown: 'Analysis Complete'
  };
  var rpl = document.getElementById('rp-label');
  if (rpl) rpl.textContent = subjectLabels[r.subject_type] || 'Analysis Complete';

  var conf = r.provenance_confidence || 55;
  var tags = (r.keywords || []).map(function(k) {
    return '<span class="track-pill track-keyword">' + window.esc(k) + '</span>';
  }).join('');

  var medium = r.medium || r.movement || '';
  var period = r.period || '';
  var movement = r.movement || r.medium || '';

  // Determine alert level from confidence (track_final-style)
  var alertLevel = 'CLEAR';
  if (conf < 30) alertLevel = 'CRITICAL';
  else if (conf < 50) alertLevel = 'PRIORITY';
  else if (conf < 70) alertLevel = 'WATCH';

  // ── Build the enhanced result layout ──
  var bodyHTML = '';

  // ── 0. Stats bar (track_final-inspired) ──
  bodyHTML += '<div class="track-stats" style="margin-bottom:3px;">' +
    '<div class="track-stat"><span class="track-snum">1</span><span class="track-slbl">Scanned</span></div>' +
    '<div class="track-stat"><span class="track-snum">' + (conf < 70 ? 1 : 0) + '</span><span class="track-slbl">Alerts</span></div>' +
    '<div class="track-stat"><span class="track-snum">' + (conf < 50 ? 1 : 0) + '</span><span class="track-slbl">Priority</span></div>' +
    '<div class="track-stat"><span class="track-snum">1</span><span class="track-slbl">Sources</span></div>' +
    '</div>';

  // ── 0b. Alert banner (track_final-inspired) ──
  bodyHTML += '<div class="track-rblock" style="margin-bottom:3px;">';
  bodyHTML += '<div class="track-rbanner track-' + alertLevel + '">' +
    '<span class="track-rlevel track-' + alertLevel + '">' + alertLevel + '</span>' +
    '<span class="track-rtitle">' + window.esc(r.title || 'Untitled scan') + '</span>' +
    '</div>';
  // Two-column field layout
  bodyHTML += '<div class="track-rbody">';
  // Keywords as pills (full width)
  if (tags) {
    bodyHTML += '<div class="track-rfield track-full"><span class="track-rflbl">Keywords</span><div class="track-pills">' + tags + '</div></div>';
  }
  bodyHTML += '<div class="track-rfield"><span class="track-rflbl">Confidence</span><span class="track-rfval">' + conf + '%' +
    ' <span style="color:' + (conf < 30 ? 'var(--red-lt)' : conf < 50 ? '#e67e22' : conf < 70 ? '#E8A020' : 'var(--green-lt)') + ';">' +
    (conf < 30 ? '— Critical investigation needed' : conf < 50 ? '— Priority review' : conf < 70 ? '— Monitor for signals' : '— Good confidence') +
    '</span></span></div>';
  bodyHTML += '<div class="track-rfield"><span class="track-rflbl">Provenance</span><span class="track-rfval">' + window.esc(r.provenance_chain || r.professional_assessment || 'See analysis below') + '</span></div>';
  if (r.style_analysis) {
    bodyHTML += '<div class="track-rfield"><span class="track-rflbl">Style</span><span class="track-rfval">' + window.esc(r.style_analysis.substring(0, 120) + (r.style_analysis.length > 120 ? '...' : '')) + '</span></div>';
  }
  if (r.risk_assessment) {
    bodyHTML += '<div class="track-rfield"><span class="track-rflbl">Risk</span><span class="track-rfval">' + window.esc(r.risk_assessment.substring(0, 120)) + '</span></div>';
  }
  if (r.recommended_actions) {
    bodyHTML += '<div class="track-rfield"><span class="track-rflbl">Action</span><span class="track-rfval">' + window.esc(r.recommended_actions.substring(0, 120)) + '</span></div>';
  }
  bodyHTML += '<div class="track-rfield"><span class="track-rflbl">Type</span><span class="track-rfval">' + (r.subject_type || 'artwork') + ' · ' + (period || '—') + ' · ' + (medium || '—') + '</span></div>';
  bodyHTML += '<div class="track-rfield"><span class="track-rflbl">ID</span><span class="track-rfval" style="font-family:var(--font-mono);font-size:9px;">' + window.esc(id) + '</span></div>';
  bodyHTML += '</div></div>';

  // ── Photo comparison (track_final-inspired) ──
  bodyHTML += '<div class="track-photo-compare">';
  var imgSrc = '';
  var previewImg = document.getElementById('main-preview');
  if (previewImg && previewImg.src && previewImg.style.display !== 'none') {
    imgSrc = previewImg.src;
  }
  // Listing photo column
  bodyHTML += '<div class="track-photo-col track-photo-col-listing">';
  if (imgSrc) {
    bodyHTML += '<div class="track-pimg"><img src="' + window.escAttr(imgSrc) + '" alt="Scan"/></div>';
  } else {
    bodyHTML += '<div class="track-pimg" style="display:flex;align-items:center;justify-content:center;background:rgba(192,57,43,.06);border-color:rgba(192,57,43,.3);"><span style="font-size:14px;color:rgba(192,57,43,.6);">\u25C8</span></div>';
  }
  bodyHTML += '<div><span class="track-plbl">Uploaded Scan</span>';
  bodyHTML += '<div class="track-ptitle" style="font-size:.78rem;">' + window.esc(r.title || 'Unknown artwork') + '</div>';
  bodyHTML += '<div class="track-ploc">' + (r.artist ? window.esc(r.artist) : 'Unknown artist') + '</div>';
  bodyHTML += '</div></div>';
  // Reference column (placeholder)
  bodyHTML += '<div class="track-photo-col">';
  bodyHTML += '<div class="track-pimg" style="display:flex;align-items:center;justify-content:center;background:var(--bg2);"><span style="font-size:16px;color:var(--gold-dim);">\u25C8</span></div>';
  bodyHTML += '<div><span class="track-plbl">Analysis Reference</span>';
  bodyHTML += '<div class="track-ptitle">' + (subjectLabels[r.subject_type] || 'Analysis Complete') + '</div>';
  bodyHTML += '<div class="track-ploc">' + alertLevel + ' · ' + conf + '% confidence</div>';
  bodyHTML += '</div></div></div>';

  // ── Now inject the full detail layout below the track_final summary ──
  // Artwork Hero Image
  bodyHTML += '<div class="art-detail-hero">';
  if (imgSrc) {
    bodyHTML += '<img src="' + window.escAttr(imgSrc) + '" alt="' + window.esc(r.title || 'Artwork') + '" id="art-hero-img" />';
  } else {
    bodyHTML += '<div style="height:260px;display:flex;align-items:center;justify-content:center;color:var(--gold-dim);font-size:48px;">\u25C8</div>';
  }
  bodyHTML += '<div class="art-detail-hero-badges">' +
    '<span class="art-hero-badge">' + window.esc(subjectLabels[r.subject_type] || 'Analysis') + '</span>' +
    (conf >= 70 ? '<span class="art-hero-badge" style="color:var(--green-lt);">\u2713 High</span>' : conf >= 40 ? '<span class="art-hero-badge" style="color:#E8A020;">\u26a0 Medium</span>' : '<span class="art-hero-badge" style="color:var(--red-lt);">\u26a1 Low</span>') +
    '</div>';
  bodyHTML += '<button class="art-detail-hero-zoom-btn" id="art-zoom-btn" data-art-action="zoom">\u26B2</button>';
  bodyHTML += '</div>';

  // Metadata Panel
  bodyHTML += '<div class="art-meta-panel">';
  bodyHTML += '<div class="art-meta-breadcrumb">' +
    '<span class="crumb-link" data-art-action="nav-home">TRACE</span>' +
    (period ? '<span class="crumb-link">' + window.esc(period) + '</span>' : '') +
    (r.artist ? '<span class="crumb-link">' + window.esc(r.artist) + '</span>' : '') +
    '<span>' + window.esc(r.title || 'Unknown') + '</span>' +
    '</div>';
  bodyHTML += '<div class="art-meta-title">' + window.esc(r.title || 'Unknown Subject') + '</div>';
  bodyHTML += '<div class="art-meta-artist">' +
    '<a data-art-action="toast" data-art-msg="Artist profile">' + window.esc(r.artist || 'Unknown artist') + '</a>' +
    '<span class="artist-follow" data-art-action="toast" data-art-msg="Following artist">+ Follow</span>' +
    '</div>';
  bodyHTML += '<div class="art-meta-tags">';
  if (period) bodyHTML += '<span class="art-meta-tag gold-tag">' + window.esc(period) + '</span>';
  if (medium) bodyHTML += '<span class="art-meta-tag">' + window.esc(medium) + '</span>';
  if (movement && movement !== medium) bodyHTML += '<span class="art-meta-tag">' + window.esc(movement) + '</span>';
  if (r.subject_type) bodyHTML += '<span class="art-meta-tag gold-tag">' + window.esc(r.subject_type) + '</span>';
  bodyHTML += '</div>';
  bodyHTML += '<div class="art-meta-confidence">' +
    '<span class="art-conf-label">' + (window.TIER === 'discover' ? 'Story Confidence' : 'Provenance Confidence') + '</span>' +
    '<div class="art-conf-bar"><div class="art-conf-fill" style="width:' + conf + '%"></div></div>' +
    '<span class="art-conf-value">' + conf + '%</span>' +
    '</div></div>';

  // Action Buttons
  bodyHTML += '<div class="art-actions-row">' +
    '<button class="art-action-btn" data-art-action="copy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copy</button>' +
    '<button class="art-action-btn" data-art-action="bookmark" id="bookmark-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Save</button>' +
    '<button class="art-action-btn" data-art-action="share"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share</button>' +
    '<button class="art-action-btn" data-art-action="zoom"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg> Zoom</button>' +
    '</div>';

  // Detail Attributes Grid
  bodyHTML += '<div class="art-detail-grid">';
  bodyHTML += '<div class="art-detail-grid-title">Artwork Details</div>';
  bodyHTML += '<div class="art-detail-grid-table">';
  bodyHTML += detailGridCell('Period', period || '—');
  bodyHTML += detailGridCell('Medium', medium || '—');
  bodyHTML += detailGridCell('Movement', movement || '—');
  bodyHTML += detailGridCell('Type', (r.subject_type || 'artwork').toUpperCase());
  bodyHTML += detailGridCell('Tier', (window.TIER || 'collector').toUpperCase());
  bodyHTML += detailGridCell('ID', id);
  bodyHTML += '</div></div>';

  // Analysis Sections
  if (window.TIER === 'discover') {
    bodyHTML += sectionCard('\u25C8', 'The Story', window.esc(r.the_story || r.style_analysis || r.professional_assessment || 'Analysis pending.'));
    bodyHTML += sectionCard('\u2726', 'Fascinating Fact', window.esc(r.fascinating_fact || 'No fascinating fact recorded.'), 'var(--text)');
    bodyHTML += sectionCard('\u25C8', 'What to Look For', window.esc(r.what_to_look_for || ''));
  } else {
    bodyHTML += sectionCard('\u25C8', 'Stylistic Analysis', window.esc(r.style_analysis || 'Analysis pending.'));
    bodyHTML += sectionCard('\u25C8', 'Historical Context', window.esc(r.historical_context || 'Context pending.'));
    bodyHTML += sectionCard('\u25C8', 'Investigation Notes', window.esc(r.investigation_notes || 'No specific flags.'));
    bodyHTML += sectionCard('\u25C8', 'Professional Assessment', window.esc(r.professional_assessment || ''));
    bodyHTML += sectionCard('\u25C8', 'Provenance Chain', window.esc(r.provenance_chain || ''));
    bodyHTML += sectionCard('\u25C8', 'Risk Assessment', window.esc(r.risk_assessment || ''), conf < 50 ? 'var(--red-lt)' : 'var(--text-mid)');
    bodyHTML += sectionCard('\u25C8', 'Recommended Actions', window.esc(r.recommended_actions || ''));
  }

  // Keywords Cloud (legacy style - only for Discover tier outside track banner)
  // Keywords already appear in the track banner pills above for all tiers.

  // Artist Card
  if (r.artist) {
    bodyHTML += '<div class="art-artist-card">';
    bodyHTML += '<div class="art-artist-card-header">';
    bodyHTML += '<div class="art-artist-avatar">\u25C8</div>';
    bodyHTML += '<div class="art-artist-info">';
    bodyHTML += '<div class="art-artist-name">' + window.esc(r.artist) + '</div>';
    bodyHTML += '<div class="art-artist-period">' + (r.period ? window.esc(r.period) : 'Artist') + '</div>';
    bodyHTML += '</div>';
    bodyHTML += '<button class="art-artist-follow-btn" data-art-action="toast" data-art-msg="Following artist">+ Follow</button>';
    bodyHTML += '</div>';
    bodyHTML += '<div class="art-artist-bio">';
    bodyHTML += window.esc(r.artist_bio || r.artist + ' is associated with this work. Further research into their body of work and provenance records is recommended.') + ' <a data-art-action="toast" data-art-msg="Read more about artist">Read more \u2192</a>';
    bodyHTML += '</div>';
    bodyHTML += '</div>';
  }

  // Related Artworks section
  bodyHTML += '<div class="art-related-section">';
  bodyHTML += '<div class="art-related-header">';
  bodyHTML += '<div class="art-related-title">Related Works You Might Investigate</div>';
  bodyHTML += '<span style="font-size:8px;color:var(--text-ghost);cursor:pointer;" data-art-action="toast" data-art-msg="View all related">See all \u2192</span>';
  bodyHTML += '</div>';
  bodyHTML += '<div class="art-related-scroll" id="art-related-scroll">';
  var relatedItems = generateRelatedItems(r);
  relatedItems.forEach(function(item) {
    bodyHTML += '<div class="art-related-item" data-art-action="toast" data-art-msg="' + window.escAttr(item.label || 'Related work') + '">';
    bodyHTML += '<div class="art-related-item-img">';
    bodyHTML += item.img || '<span style="font-size:20px;opacity:0.4;">\u25C8</span>';
    bodyHTML += '</div>';
    bodyHTML += '<div class="art-related-item-title">' + window.esc(item.label) + '</div>';
    bodyHTML += '<div class="art-related-item-sub">' + window.esc(item.sub) + '</div>';
    bodyHTML += '</div>';
  });
  bodyHTML += '</div></div>';

  // Inject the enhanced layout
  var rb = document.getElementById('result-body');
  if (rb) rb.innerHTML = bodyHTML;

  var mr = document.getElementById('main-result');
  if (mr) mr.classList.add('on');

  var ss = document.getElementById('scan-scroll');
  if (ss) ss.style.display = '';

  var spkR = document.getElementById('source-picker');
  if (spkR) spkR.style.display = 'none';

  // Timeline mini (Collector + Pro)
  var cfg = window.TIERS[window.TIER];
  if (cfg && cfg.hasTimeline && r.timeline && r.timeline.length > 0) {
    var track = document.getElementById('result-tl-track');
    var tlWrap = document.getElementById('result-tl-wrap');
    if (track && tlWrap) {
      track.innerHTML = '';
      track.style.cssText = 'display:flex;align-items:flex-start;position:relative;min-width:max-content;gap:0;padding-bottom:4px;';
      var line = document.createElement('div');
      line.style.cssText = 'position:absolute;left:10px;right:10px;top:8px;height:1px;background:var(--surface3);';
      track.appendChild(line);
      r.timeline.forEach(function(t) {
        var isGap = t.event && (t.event.toLowerCase().includes('gap') || t.event.includes('\u26a0'));
        var d = document.createElement('div');
        d.style.cssText = 'display:flex;flex-direction:column;align-items:center;width:88px;position:relative;z-index:1;gap:4px;flex-shrink:0;';
        var dot = document.createElement('div');
        dot.style.cssText = 'width:9px;height:9px;border-radius:50%;background:var(--bg);border:1.5px solid ' + (isGap ? '#E8A020' : 'var(--gold-dim)') + ';' + (isGap ? 'box-shadow:0 0 5px rgba(232,160,32,0.5);' : '') + '';
        var yr = document.createElement('div');
        yr.style.cssText = 'font-family:var(--font-mono);font-size:9px;color:' + (isGap ? '#E8A020' : 'var(--gold)') + ';';
        yr.textContent = t.year;
        var ev = document.createElement('div');
        ev.style.cssText = 'font-size:8px;color:' + (isGap ? '#E8A020' : 'var(--text-dim)') + ';text-align:center;white-space:normal;max-width:80px;line-height:1.3;';
        ev.textContent = t.event;
        d.appendChild(dot);
        d.appendChild(yr);
        d.appendChild(ev);
        track.appendChild(d);
      });
      tlWrap.style.display = 'block';
    }
  }

  if (cfg && cfg.hasExport) {
    var er2 = document.getElementById('export-row');
    if (er2) er2.classList.add('on');
  }
  if (cfg && cfg.hasCases) {
    var ba3 = document.getElementById('btn-add');
    if (ba3) ba3.classList.add('on');
  }
  var bg3 = document.getElementById('btn-go');
  if (bg3) bg3.disabled = false;

  window._lastResult = r;
  window._lastId = id;

  var _storeTitle = r.title || 'Last Analysis';
  window._timelines = window._timelines || {};
  window._timelines[_storeTitle] = {
    title: _storeTitle,
    sub: (r.artist || '') + (r.period ? ', ' + r.period : ''),
    type: r.subject_type || 'artwork',
    events: Array.isArray(r.timeline) ? r.timeline : []
  };
  window._lastTimeline = window._timelines[_storeTitle];
  if (typeof window.saveTimelineLocal === 'function') window.saveTimelineLocal(_storeTitle, window._timelines[_storeTitle]);
  try {
    var _slim = {
      title: r.title, artist: r.artist, period: r.period,
      subject_type: r.subject_type, provenance_confidence: r.provenance_confidence,
      timeline: r.timeline
    };
    localStorage.setItem('trace_lastResult', JSON.stringify(_slim));
  } catch(e) { TRACE_WATCHDOG?.warn('Results', e); }
  setTimeout(function() {
    if (typeof window.syncTimelineToServer === 'function') window.syncTimelineToServer(_storeTitle);
  }, 500);

  // Show quick actions — hide old quick-actions div, use new art-actions-row
  var cmpBtn = document.getElementById('compare-btn');
  if (cmpBtn) {
    cmpBtn.style.display = window._lastScanImageData && window._scanImageData ? 'flex' : 'none';
  }

  var oldQa = document.getElementById('quick-actions-old');
  if (oldQa) oldQa.style.display = 'none';

  // Check bookmark status
  try {
    var bookmarksRaw = localStorage.getItem('trace_bookmarks');
    var bookmarks = bookmarksRaw ? JSON.parse(bookmarksRaw) : [];
    var bookmarkBtn = document.getElementById('bookmark-btn');
    if (bookmarkBtn && bookmarks.indexOf(r.title || '') >= 0) {
      bookmarkBtn.classList.add('bookmarked');
    }
  } catch(e) { TRACE_WATCHDOG?.warn('Results', e); }

  // Hide skeleton if still visible
  var skel = document.getElementById('result-skeleton');
  if (skel) skel.style.display = 'none';

  // Trigger tier 2-3 vision hooks
  if (typeof window._visionShowResultHook === 'function') {
    window._visionShowResultHook(r);
  }

  // Emit result:render hook for registry modules
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
    TRACE_REGISTRY.emit('result:render', { result: r, id: id });
  }
};
/**
 * Helper: detail grid cell
 */
function detailGridCell(label, value) {
  return '<div class="art-detail-grid-cell"><div class="art-detail-label">' + window.esc(label) + '</div><div class="art-detail-value">' + window.esc(value) + '</div></div>';
}

/**
 * Helper: section card with icon
 */
function sectionCard(icon, label, content, colorOverride) {
  var colorStyle = colorOverride ? ' style="color:' + colorOverride + '"' : '';
  return '<div class="art-section-card">' +
    '<div class="art-section-label"><span class="section-icon">' + icon + '</span>' + window.esc(label) + '</div>' +
    '<div class="art-section-body"' + colorStyle + '>' + content + '</div>' +
    '</div>';
}

/**
 * Helper: generate related artworks based on keywords
 */
function generateRelatedItems(r) {
  var items = [];
  var keywords = r.keywords || [];
  var period = r.period || '';
  var artist = r.artist || '';

  // Build contextual related works
  var suggestions = [];
  if (artist) {
    suggestions.push({ label: 'More by ' + artist, sub: period || 'Same artist', img: '' });
  }
  if (period && period.indexOf('c.') === -1) {
    suggestions.push({ label: period + ' Works', sub: 'Contemporary pieces', img: '' });
  }
  for (var i = 0; i < Math.min(2, keywords.length); i++) {
    suggestions.push({ label: keywords[i] + ' Works', sub: period || 'Related style', img: '' });
  }
  // Fill remaining with general suggestions
  var fallbacks = [
    { label: 'Similar Provenance', sub: 'Comparable history', img: '' },
    { label: 'Same Collection', sub: 'Institutional holding', img: '' },
    { label: 'Period Masterwork', sub: period || 'Era highlight', img: '' },
    { label: 'Attributed Works', sub: artist || 'Circle of', img: '' }
  ];
  while (suggestions.length < 4 && fallbacks.length > 0) {
    suggestions.push(fallbacks.shift());
  }
  return suggestions.slice(0, 5);
}


/**
 * Open comparison view between current and previous scan
 */
window.openCompare = function openCompare() {
  var prev = window._lastScanImageData;
  var curr = window._scanImageData;

  if (!prev) {
    window.toast('No previous scan to compare against');
    return;
  }
  if (!curr) {
    window.toast('No current scan image available');
    return;
  }

  if (typeof window.TRACE_COMPARE === 'undefined') {
    window.toast('Comparison module not loaded');
    return;
  }

  var currTitle = window._lastResult ? window._lastResult.title || 'Current' : 'Current';
  var prevTitle = window._previousResultTitle || 'Previous';

  // Get data URLs for both images
  var getDataUrl = function(imgData) {
    if (!imgData) return null;
    if (imgData.type === 'url') return imgData.data;
    return 'data:' + (imgData.type || 'image/jpeg') + ';base64,' + imgData.data;
  };

  var dataUrlA = getDataUrl(curr);
  var dataUrlB = getDataUrl(prev);

  if (!dataUrlA || !dataUrlB) {
    window.toast('Image data not available for comparison');
    return;
  }

  window.TRACE_COMPARE.open(dataUrlA, dataUrlB, currTitle, prevTitle);
};


// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('results', {
    version: '1.1.0',
    dependsOn: ['utils', 'persistence']
  });
}

console.log('[TRACE Results] Loaded');
