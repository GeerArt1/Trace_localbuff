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
 * Display analysis results
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
    artwork: '\u25C8 Art Analysis Complete', painting: '\u25C8 Painting Identified',
    sculpture: '\u25C8 Sculpture Identified', photograph: '\u25C8 Photo Analysed',
    person: '\u25C8 Person Identified', animal: '\u25C8 Species Identified',
    landmark: '\u25C8 Landmark Identified', architecture: '\u25C8 Architecture Analysed',
    place: '\u25C8 Location Identified', nature: '\u25C8 Nature Identified',
    object: '\u25C8 Object Identified', food: '\u25C8 Dish Identified',
    vehicle: '\u25C8 Vehicle Identified', fashion: '\u25C8 Style Identified',
    unknown: '\u25C8 Analysis Complete'
  };
  var rpl = document.getElementById('rp-label');
  if (rpl) rpl.textContent = subjectLabels[r.subject_type] || '\u25C8 Analysis Complete';

  var conf = r.provenance_confidence || 55;
  var tags = (r.keywords || []).map(function(k) {
    return '<span class="rtag">' + window.esc(k) + '</span>';
  }).join('');

  var bodyHTML = '<div class="r-title">' + window.esc(r.title || 'Unknown Subject') + '</div>' +
    '<div class="r-attr">' + window.esc(r.artist || '') +
    (r.period ? ', ' + window.esc(r.period) : '') +
    (r.medium ? ' \u00B7 ' + window.esc(r.medium) : '') + '</div>' +
    '<div class="rdiv"></div>';

  if (window.TIER === 'discover') {
    bodyHTML +=
      '<div class="rsec">The Story</div><div class="rtext">' + window.esc(r.the_story || r.style_analysis || r.professional_assessment || '') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">\u2726 Fascinating Fact</div><div class="rtext" style="color:var(--text)">' + window.esc(r.fascinating_fact || '') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">What to Look For</div><div class="rtext">' + window.esc(r.what_to_look_for || '') + '</div>';
  } else {
    bodyHTML +=
      '<div class="rsec">Stylistic Analysis</div><div class="rtext">' + window.esc(r.style_analysis || 'Analysis pending.') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">Historical Context</div><div class="rtext">' + window.esc(r.historical_context || 'Context pending.') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">Investigation Notes</div><div class="rtext">' + window.esc(r.investigation_notes || 'No specific flags.') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">Professional Assessment</div><div class="rtext">' + window.esc(r.professional_assessment || '') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">Provenance Chain</div><div class="rtext">' + window.esc(r.provenance_chain || '') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">Risk Assessment</div><div class="rtext" style="color:' + (conf < 50 ? 'var(--red-lt)' : 'var(--text-mid)') + '">' + window.esc(r.risk_assessment || '') + '</div>' +
      '<div class="rdiv"></div>' +
      '<div class="rsec">Recommended Actions</div><div class="rtext">' + window.esc(r.recommended_actions || '') + '</div>';
  }

  bodyHTML +=
    '<div class="rdiv"></div>' +
    '<div class="conf-mrow"><span class="conf-ml">' + (window.TIER === 'discover' ? 'Story Confidence' : 'Provenance Confidence') + '</span><span class="conf-mv">' + conf + '%</span></div>' +
    '<div class="cbar2"><div class="cfill2" style="width:' + conf + '%"></div></div>' +
    '<div class="rsec">Keywords</div><div class="rtags">' + tags + '</div>';

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
        yr.style.cssText = 'font-family:\'Courier Prime\',monospace;font-size:9px;color:' + (isGap ? '#E8A020' : 'var(--gold)') + ';';
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

  // Show quick actions
  // Show/hide compare button
  var cmpBtn = document.getElementById('compare-btn');
  if (cmpBtn) {
    cmpBtn.style.display = window._lastScanImageData && window._scanImageData ? 'flex' : 'none';
  }

  var qa = document.getElementById('quick-actions');
  if (qa) qa.style.display = 'flex';

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
