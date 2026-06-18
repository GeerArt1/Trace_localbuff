// ══════════════════════════════════════════════
// TRACE — Scan & Analysis
// ══════════════════════════════════════════════

var img64 = null, imgType = null;
var _scanning = false;
var _scanAbortController = null;

var STEPS_ALL = {
  discover: ['Identifying subject…', 'Researching the story…', 'Finding fascinating details…', 'Writing your story…'],
  collector: ['Initializing visual analysis…', 'Examining brushwork and technique…', 'Consulting art historical records…', 'Building provenance timeline…', 'Compiling investigation report…'],
  professional: ['Cross-referencing 12M archive records…', 'Checking INTERPOL stolen works database…', 'Consulting Art Loss Register…', 'Analysing attribution markers…', 'Building provenance chain…', 'Generating professional report…'],
};

/**
 * Set the active scan tab
 * @param {HTMLElement} btn
 * @param {string} label
 */
window.setTab = function setTab(btn, label) {
  var parent = btn.closest('.mode-tabs');
  if (parent) {
    parent.querySelectorAll('.mtab').forEach(function(b) { b.classList.remove('active'); });
  }
  btn.classList.add('active');
  var hints = {
    'Front': 'Photograph the front face of the artwork',
    'Back / Label': 'Photograph back, labels, stamps or inscriptions',
    'Signature': 'Close-up of the artist signature or monogram',
    'Detail': 'Photograph a specific detail — brushwork, texture, craquelure',
    'UV Detail': 'UV fluorescence photograph for restoration mapping',
    'X-Ray Ref': 'X-ray or infrared reflectography image'
  };
  var preview = document.getElementById('main-preview');
  var empty = document.getElementById('main-empty');
  var hintEl = document.getElementById('scan-zone-hint');
  if (preview) { preview.style.display = 'none'; preview.src = ''; }
  if (empty) { empty.style.display = 'flex'; }
  if (hintEl && hints[label]) hintEl.textContent = hints[label];
  var mr = document.getElementById('main-result');
  if (mr) mr.classList.remove('on');
  var spk = document.getElementById('source-picker');
  if (spk) spk.style.display = 'flex';
  document.querySelectorAll('#source-picker .btn-up').forEach(function(b) { b.classList.remove('lit', 'pulse-active'); });
  if (typeof window.startPickerPulse === 'function') window.startPickerPulse();
  var rtw = document.getElementById('result-tl-wrap');
  if (rtw) rtw.style.display = 'none';
  var ba = document.getElementById('btn-add');
  if (ba) ba.classList.remove('on');
  var me = document.getElementById('main-err');
  if (me) me.classList.remove('on');
  var er = document.getElementById('export-row');
  if (er) er.classList.remove('on');
  var bg = document.getElementById('btn-go');
  if (bg) bg.disabled = true;
  var fi = document.getElementById('main-file');
  if (fi) fi.value = '';
  var fc = document.getElementById('main-file-cam');
  if (fc) fc.value = '';
};

/**
 * Handle file selection
 * @param {Event} e
 */
window.onFile = function onFile(e) {
  if (typeof window.stopPickerPulse === 'function') window.stopPickerPulse();
  var f = e.target.files[0];
  if (!f) return;
  var r = new FileReader();
  r.onload = function(ev) {
    var d = ev.target.result;
    // Save previous scan image + title before overwriting
    if (window._scanImageData && window._scanImageData.data) {
      window._lastScanImageData = window._scanImageData;
      if (window._lastResult && window._lastResult.title) {
        window._previousResultTitle = window._lastResult.title;
      }
    }
    img64 = d.split(',')[1];
    imgType = f.type || 'image/jpeg';
    // Expose to other screens (geometry, viewer)
    window._scanImageData = { data: img64, type: imgType };
    var p = document.getElementById('main-preview');
    if (p) { p.src = d; p.style.display = 'block'; }
    var me = document.getElementById('main-empty');
    if (me) me.style.display = 'none';
    var bg = document.getElementById('btn-go');
    if (bg) bg.disabled = false;
    var mr = document.getElementById('main-result');
    if (mr) mr.classList.remove('on');
    var rtw = document.getElementById('result-tl-wrap');
    if (rtw) rtw.style.display = 'none';
    var merr = document.getElementById('main-err');
    if (merr) merr.classList.remove('on');
    var er = document.getElementById('export-row');
    if (er) er.classList.remove('on');
    var ba = document.getElementById('btn-add');
    if (ba) ba.classList.remove('on');
    var mz = document.getElementById('main-zone');
    if (mz) mz.classList.remove('scanning');
  };
  r.readAsDataURL(f);
};

/**
 * Create floating particle background in scan zone
 */
window.createScanParticles = function createScanParticles() {
  var zone = document.getElementById('main-zone');
  if (!zone) return;
  var existing = zone.querySelector('.scan-particles');
  if (existing) return;
  var container = document.createElement('div');
  container.className = 'scan-particles';
  for (let i = 0; i < 20; i++) {
    var p = document.createElement('div');
    p.className = 'scan-particle';
    p.style.left = (Math.random() * 100) + '%';
    p.style.animationDelay = (Math.random() * 6) + 's';
    p.style.animationDuration = (4 + Math.random() * 4) + 's';
    p.style.width = (1 + Math.random() * 2) + 'px';
    p.style.height = p.style.width;
    container.appendChild(p);
  }
  zone.appendChild(container);
};

/**
 * Show skeleton loader in result panel
 */
window.showResultSkeleton = function showResultSkeleton() {
  var skel = document.getElementById('result-skeleton');
  if (skel) skel.style.display = 'block';
  var rb = document.getElementById('result-body');
  if (rb) {
    // Hide any previous real content
    var children = rb.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].id !== 'result-skeleton') {
        children[i].style.display = 'none';
      }
    }
  }
};

/**
 * Hide skeleton loader
 */
window.hideResultSkeleton = function hideResultSkeleton() {
  var skel = document.getElementById('result-skeleton');
  if (skel) skel.style.display = 'none';
  var rb = document.getElementById('result-body');
  if (rb) {
    var children = rb.children;
    for (let i = 0; i < children.length; i++) {
      if (children[i].id !== 'result-skeleton') {
        children[i].style.display = '';
      }
    }
  }
};

/**
 * Update scan progress percentage
 * @param {number} pct
 */
window.updateScanProgress = function updateScanProgress(pct) {
  var fill = document.getElementById('scan-progress-fill');
  var label = document.getElementById('scan-progress-pct');
  var container = document.getElementById('scan-progress');
  if (fill) fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  if (label) label.textContent = Math.round(pct) + '%';
  if (container && !container.classList.contains('on')) {
    container.classList.add('on');
  }
};

/**
 * Run AI analysis on the loaded image
 */
window.analyse = async function analyse() {
  if (_scanning) { window.toast('Analysis already in progress'); return; }
  if (!img64) return;
  if (typeof window.requireOnline === 'function' && !window.requireOnline()) return;
  var cfg = window.TIERS[window.TIER];
  if (!cfg) return;
  var steps = STEPS_ALL[window.TIER];

  // Abort any previous in-flight request
  if (_scanAbortController) _scanAbortController.abort();
  _scanAbortController = new AbortController();
  _scanning = true;

  if (typeof window.stopPickerPulse === 'function') window.stopPickerPulse();
  var ml = document.getElementById('main-loading');
  if (ml) ml.classList.add('on');
  var spk2 = document.getElementById('source-picker');
  if (spk2) spk2.style.display = 'none';
  var scr2 = document.getElementById('scan-scroll');
  if (scr2) scr2.style.display = 'none';
  var mr = document.getElementById('main-result');
  if (mr) mr.classList.remove('on');
  var rtw = document.getElementById('result-tl-wrap');
  if (rtw) rtw.style.display = 'none';
  var merr = document.getElementById('main-err');
  if (merr) merr.classList.remove('on');
  var er = document.getElementById('export-row');
  if (er) er.classList.remove('on');
  var baR = document.getElementById('btn-add');
  if (baR) baR.classList.remove('on');
  var bgR = document.getElementById('btn-go');
  if (bgR) bgR.disabled = true;
  var mz = document.getElementById('main-zone');
  if (mz) mz.classList.add('scanning');

  // Show skeleton loader
  if (typeof window.showResultSkeleton === 'function') window.showResultSkeleton();

  // Show progress bar
  var progressContainer = document.getElementById('scan-progress');
  if (progressContainer) progressContainer.classList.add('on');
  var progressFill = document.getElementById('scan-progress-fill');
  var progressPct = document.getElementById('scan-progress-pct');
  if (progressFill) progressFill.style.width = '0%';
  if (progressPct) progressPct.textContent = '0%';

  // Animate progress through scan steps
  var progressTarget = 0;
  var progressCurrent = 0;

  var si = 0;
  var stepEl = document.getElementById('main-step');
  if (stepEl) stepEl.textContent = steps[0];
  var iv = setInterval(function() {
    si = (si + 1) % steps.length;
    if (stepEl) stepEl.textContent = steps[si];
    // Progress increases with each step
    progressTarget = Math.min(90, progressTarget + (80 / steps.length));
    // Animate progress bar towards target
    var pi = setInterval(function() {
      if (progressCurrent < progressTarget) {
        progressCurrent = Math.min(progressTarget, progressCurrent + 1.5);
        if (progressFill) progressFill.style.width = progressCurrent + '%';
        if (progressPct) progressPct.textContent = Math.round(progressCurrent) + '%';
      } else {
        clearInterval(pi);
      }
    }, 50);
  }, 2200);

  function _done() {
    clearInterval(iv);
    _scanning = false;
    // Don't abort the controller here — it may have been replaced by a newer analyse() call.
    // Only top of analyse() and navigation (nav.js) should abort.
    _scanAbortController = null;
    if (mz) mz.classList.remove('scanning');
    if (ml) ml.classList.remove('on');
    if (bgR) bgR.disabled = false;
    var _scrD = document.getElementById('scan-scroll');
    if (_scrD) _scrD.style.display = '';
    var _spkD = document.getElementById('source-picker');
    if (_spkD && _spkD.style.display === 'none') _spkD.style.display = 'flex';
    // Hide skeleton if still showing
    if (typeof window.hideResultSkeleton === 'function') window.hideResultSkeleton();
    // Complete progress bar
    if (progressFill) { progressFill.style.width = '100%'; progressCurrent = 100; }
    if (progressPct) progressPct.textContent = '100%';
    // Hide progress after delay
    setTimeout(function() {
      if (progressContainer) progressContainer.classList.remove('on');
    }, 600);
  }

  // Handle fetch abort (navigation or cancellation)
  if (_scanAbortController) {
    _scanAbortController.signal.addEventListener('abort', function() {
      _scanning = false;
      if (mz) mz.classList.remove('scanning');
      if (ml) ml.classList.remove('on');
      clearInterval(iv);
    });
  }

  // ── Fetch with retry (exponential backoff, max 3 attempts) ──
  async function fetchWithRetry(url, options, retries) {
    retries = retries || 3;
    var lastErr;
    for (var attempt = 0; attempt < retries; attempt++) {
      try {
        var resp = await fetch(url, options);
        if (resp.ok) return resp;
        // 429 (rate limit) or 5xx — retry
        if ((resp.status === 429 || resp.status >= 500) && attempt < retries - 1) {
          lastErr = new Error('HTTP ' + resp.status);
          var delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise(function(r) { setTimeout(r, delay); });
          continue;
        }
        return resp;
      } catch (e) {
        lastErr = e;
        if (attempt < retries - 1) {
          var delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          await new Promise(function(r) { setTimeout(r, delay); });
        }
      }
    }
    throw lastErr || new Error('Fetch failed after ' + retries + ' retries');
  }

  try {
    var apiBase = window.TRACE_API_PROXY || '';
    var apiUrl = apiBase ? apiBase + '/analyse' : 'https://api.anthropic.com/v1/messages';
    var apiHeaders = { 'Content-Type': 'application/json' };
    if (!apiBase) {
      apiHeaders['anthropic-version'] = '2023-06-01';
    }
    // Send analyse key if configured on server
    if (window.TRACE_ANALYSE_KEY) {
      apiHeaders['x-api-key'] = window.TRACE_ANALYSE_KEY;
    }
    // Send tier for per-tier rate limiting on server
    if (window.TIER) {
      apiHeaders['x-tier'] = window.TIER;
    }

    var isCamera = !!window._hwImageType;
    var userText = window.TIER === 'discover'
      ? 'Tell me the story of this artwork or subject.'
      : (isCamera
        ? 'Investigate this ' + window._hwImageType + ' image. This is a specialized capture: ' + window._hwImageType + '. Adjust analysis accordingly. Build full provenance from creation to present day.'
        : 'Investigate this image. Build full provenance from creation to present day.');

    var res = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: apiHeaders,
      signal: _scanAbortController.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1800,
        system: cfg.systemPrompt,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imgType, data: img64 } },
            { type: 'text', text: userText }
          ]
        }]
      })
    });

    if (!res.ok) {
      var eData;
      try { eData = await res.json(); } catch (e) { eData = {}; }
      throw new Error((eData.error && eData.error.message) || 'API error ' + res.status);
    }

    var data = await res.json();
    var raw = data.content.map(function(b) { return b.text || ''; }).join('');
    var result = null;

    try { result = JSON.parse(raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()); } catch(e) { TRACE_WATCHDOG?.warn('Scan', e); }
    if (!result) {
      try {
        var s = raw.indexOf('{'), e2 = raw.lastIndexOf('}');
        if (s >= 0 && e2 > s) result = JSON.parse(raw.slice(s, e2 + 1));
      } catch(e) { TRACE_WATCHDOG?.warn('Scan', e); }
    }
    if (!result) {
      try {
        var m = raw.match(/[{][\s\S]{20,}[}]/);
        if (m) result = JSON.parse(m[0]);
      } catch(e) { TRACE_WATCHDOG?.warn('Scan', e); }
    }
    if (!result) {
      var gf = function(k) {
        var m2 = raw.match(new RegExp('"' + k + '"\\s*:\\s*"([^"]{0,500})"'));
        return m2 ? m2[1] : '';
      };
      var gn = function(k) {
        var m2 = raw.match(new RegExp('"' + k + '"\\s*:\\s*(\\d+)'));
        return m2 ? parseInt(m2[1]) : 60;
      };
      var gt = function() {
        var tm = [];
        var re = new RegExp('"year"\\s*:\\s*"([^"]+)"[^}]*"event"\\s*:\\s*"([^"]+)"[^}]*"detail"\\s*:\\s*"([^"]+)"[^}]*"category"\\s*:\\s*"([^"]+)"', 'g');
        var m2;
        while ((m2 = re.exec(raw)) !== null) tm.push({ year: m2[1], event: m2[2], detail: m2[3], category: m2[4] });
        return tm;
      };
      result = {
        title: gf('title') || 'Subject Identified',
        artist: gf('artist'), period: gf('period'),
        medium: gf('medium'), movement: gf('movement'),
        subject_type: gf('subject_type') || 'artwork',
        provenance_confidence: gn('provenance_confidence'),
        value_estimate: gf('value_estimate'),
        style_analysis: gf('style_analysis'),
        historical_context: gf('historical_context'),
        investigation_notes: gf('investigation_notes'),
        professional_assessment: gf('professional_assessment'),
        provenance_chain: gf('provenance_chain'),
        risk_assessment: gf('risk_assessment'),
        recommended_actions: gf('recommended_actions'),
        the_story: gf('the_story'),
        fascinating_fact: gf('fascinating_fact'),
        what_to_look_for: gf('what_to_look_for'),
        keywords: [],
        timeline: gt()
      };
    }

    // Clear chat history from previous session — fresh scan, fresh context
    try {
      localStorage.removeItem('trace_chat_history');
      window._chatHistory = [];
    } catch(e) { TRACE_WATCHDOG?.warn('Scan', e); }

    // Cache result in IndexedDB for offline recovery
    // Handles DB not-yet-ready by queuing the write directly
    function cacheResultToIDB(res) {
      if (typeof window.IDB === 'undefined') return;
      var doCache = function() {
        window.IDB.put('results', {
          id: 'last_analysis',
          result: res,
          timestamp: Date.now(),
          tier: window.TIER
        }).catch(function() { /* non-critical */ });
      };
      if (window.IDB.ready && window.IDB.ready()) {
        doCache();
      } else {
        // DB not ready yet — wait for it, then cache
        var pollInterval = setInterval(function() {
          if (window.IDB.ready && window.IDB.ready()) {
            clearInterval(pollInterval);
            doCache();
          }
        }, 100);
        // Safety timeout after 10 seconds
        setTimeout(function() { clearInterval(pollInterval); }, 10000);
      }
    }
    if (result) cacheResultToIDB(result);

    // Store result
    if (result && result.title) {
      var _t2 = result.title;
      window._lastTimeline = {
        title: _t2,
        sub: (result.artist || '') + (result.period ? ', ' + result.period : ''),
        type: result.subject_type || 'artwork',
        events: Array.isArray(result.timeline) ? result.timeline : []
      };
      window._timelines = window._timelines || {};
      window._timelines[_t2] = window._lastTimeline;
      window._lastResult = result;
      if (typeof window.saveTimelineLocal === 'function') window.saveTimelineLocal(_t2, window._lastTimeline);
      setTimeout(function() {
        if (typeof window.syncTimelineToServer === 'function') window.syncTimelineToServer(_t2);
      }, 100);
    }
    _done();
    if (typeof window.showResult === 'function') window.showResult(result);

    // Emit scan:complete hook for registry modules
    if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
      TRACE_REGISTRY.emit('scan:complete', { result: result, tier: window.TIER });
    }

    // Increment scan counter for HQ analytics
    try {
      var sc = parseInt(localStorage.getItem('trace_scan_count') || '0', 10);
      localStorage.setItem('trace_scan_count', String(sc + 1));
    } catch(e) { TRACE_WATCHDOG?.warn('Scan', e); }

  } catch (err) {
    _done();
    var eb = document.getElementById('main-err');
    if (eb) {
      var msgEl = document.getElementById('main-err-msg');
      if (msgEl) msgEl.textContent = '\u26a0 ' + (err.message || 'Analysis failed. Please try again.');
      var retryBtn = document.getElementById('main-err-retry');
      if (retryBtn) {
        retryBtn.style.display = 'inline-block';
        retryBtn.addEventListener('click', function() {
          // Re-run analysis
          eb.classList.remove('on');
          retryBtn.style.display = 'none';
          setTimeout(function() { if (typeof window.analyse === 'function') window.analyse(); }, 100);
        });
      }
      eb.classList.add('on');
    }

    // Increment error counter for HQ analytics
    try {
      var ec = parseInt(localStorage.getItem('trace_error_count') || '0', 10);
      localStorage.setItem('trace_error_count', String(ec + 1));
    } catch(e) { TRACE_WATCHDOG?.warn('Scan', e); }

    // Emit scan:error hook
    if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
      TRACE_REGISTRY.emit('scan:error', { error: err.message });
    }
  }
};

// ── Source picker pulse animation ──
var _pulseTimer = null;
var _pulseIdx = 0;

window.startPickerPulse = function startPickerPulse() {
  window.stopPickerPulse();
  var btns = document.querySelectorAll('#source-picker .btn-up');
  if (!btns.length) return;
  _pulseIdx = 0;
  function tick() {
    btns.forEach(function(b) { b.classList.remove('pulse-active'); });
    _pulseTimer = setTimeout(function() {
      if (_pulseTimer === null) return;
      var btn = btns[_pulseIdx % btns.length];
      btn.style.animation = 'none';
      btn.offsetHeight; // reflow
      btn.style.animation = '';
      btn.classList.add('pulse-active');
      _pulseIdx++;
      _pulseTimer = setTimeout(tick, 2600);
    }, 700);
  }
  tick();
};

window.stopPickerPulse = function stopPickerPulse() {
  if (_pulseTimer) { clearTimeout(_pulseTimer); _pulseTimer = null; }
  document.querySelectorAll('#source-picker .btn-up').forEach(function(b) {
    b.classList.remove('pulse-active');
  });
};

function _selectBtn(btn) {
  window.stopPickerPulse();
  document.querySelectorAll('#source-picker .btn-up').forEach(function(b) { b.classList.remove('lit'); });
  if (btn) btn.classList.add('lit');
}

/**
 * Shoot a photo using the enhanced camera (full-screen viewfinder)
 * Falls back to basic capture if camera module not available
 * @param {HTMLElement} btn
 */
window.shootPhoto = function shootPhoto(btn) {
  _selectBtn(btn);

  // Use enhanced camera module if available
  if (typeof window.TRACE_CAMERA !== 'undefined' && typeof window.TRACE_CAMERA.open === 'function') {
    // Determine the active tab
    var activeTab = 'Front';
    var activeMtab = document.querySelector('#scan-tabs .mtab.active');
    if (activeMtab) activeTab = activeMtab.textContent.trim();
    window.TRACE_CAMERA.open(activeTab);
    return;
  }

  // Fallback: basic camera capture (legacy)
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 4096 }, height: { ideal: 3072 } }
    }).then(function(stream) {
      var video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', '');
      video.play();
      video.addEventListener('loadedmetadata', function() {
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        stream.getTracks().forEach(function(t) { t.stop(); });
        canvas.toBlob(function(blob) {
          if (blob) {
            var file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
            var dt = new DataTransfer();
            dt.items.add(file);
            var inp = document.getElementById('main-file-cam');
            inp.files = dt.files;
            window.onFile({ target: inp });
          } else {
            setTimeout(function() { document.getElementById('main-file-cam').click(); }, 160);
          }
        }, 'image/jpeg', 0.95);
      });
    }).catch(function() {
      setTimeout(function() { document.getElementById('main-file-cam').click(); }, 160);
    });
  } else {
    setTimeout(function() { document.getElementById('main-file-cam').click(); }, 160);
  }
};

/**
 * Pick from photo library
 * @param {HTMLElement} btn
 */
window.pickFromLibrary = function pickFromLibrary(btn) {
  _selectBtn(btn);
  setTimeout(function() { document.getElementById('main-file').click(); }, 160);
};

// Auto-create particles on load
setTimeout(function() {
  if (typeof window.createScanParticles === 'function') window.createScanParticles();
}, 500);

// ── Bind event listeners for extracted inline handlers (called by registry init) ──
function bindEventHandlers() {
  // Scan tab buttons
  var tabs = ['scan-tab-front', 'scan-tab-back', 'scan-tab-sig', 'scan-tab-detail'];
  tabs.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', function() {
      window.setTab(this, this.textContent.trim());
    });
  });

  // Analyse button
  var analyseBtn = document.getElementById('btn-go');
  if (analyseBtn) analyseBtn.addEventListener('click', function() {
    if (typeof window.analyse === 'function') window.analyse();
  });

  // File inputs
  var mainFile = document.getElementById('main-file');
  if (mainFile) mainFile.addEventListener('change', function(e) {
    if (typeof window.onFile === 'function') window.onFile(e);
  });
  var mainFileCam = document.getElementById('main-file-cam');
  if (mainFileCam) mainFileCam.addEventListener('change', function(e) {
    if (typeof window.onFile === 'function') window.onFile(e);
  });

  // Source picker buttons
  var uploadBtn = document.getElementById('btn-upload');
  if (uploadBtn) uploadBtn.addEventListener('click', function() {
    if (typeof window.pickFromLibrary === 'function') window.pickFromLibrary(this);
  });
  var photoBtn = document.getElementById('btn-photograph');
  if (photoBtn) photoBtn.addEventListener('click', function() {
    if (typeof window.shootPhoto === 'function') window.shootPhoto(this);
  });

  // Quick action buttons
  var qaCopy = document.getElementById('qa-copy');
  if (qaCopy) qaCopy.addEventListener('click', function() {
    if (typeof window.copyResult === 'function') window.copyResult();
    else if (typeof copyResult === 'function') copyResult();
  });
  var qaShare = document.getElementById('qa-share');
  if (qaShare) qaShare.addEventListener('click', function() {
    if (typeof window.shareResult === 'function') window.shareResult();
  });
  var qaZoom = document.getElementById('qa-zoom');
  if (qaZoom) qaZoom.addEventListener('click', function() {
    if (typeof window.zoomPreview === 'function') window.zoomPreview();
  });
  var compareBtn = document.getElementById('compare-btn');
  if (compareBtn) compareBtn.addEventListener('click', function() {
    if (typeof window.openCompare === 'function') window.openCompare();
  });
  // Bookmark button
  var bookmarkBtn = document.getElementById('bookmark-btn');
  if (bookmarkBtn) bookmarkBtn.addEventListener('click', function() {
    if (typeof window.toggleBookmark === 'function') window.toggleBookmark();
  });

  // Export buttons
  var expPdf = document.getElementById('btn-export-pdf');
  if (expPdf) expPdf.addEventListener('click', function() {
    if (typeof window.exportPDF === 'function') window.exportPDF();
  });
  var expCase = document.getElementById('btn-export-case');
  if (expCase) expCase.addEventListener('click', function() {
    if (typeof window.exportCaseJSON === 'function') window.exportCaseJSON();
  });
  var expCidoc = document.getElementById('btn-export-cidoc');
  if (expCidoc) expCidoc.addEventListener('click', function() {
    if (typeof window.exportCIDOC === 'function') window.exportCIDOC();
  });

  // DB query button
  var dbBtn = document.getElementById('db-query-btn');
  if (dbBtn) dbBtn.addEventListener('click', function() {
    if (typeof runDBQuery === 'function') runDBQuery();
  });

  // Add to investigations
  var addBtn = document.getElementById('btn-add');
  if (addBtn) addBtn.addEventListener('click', function() {
    if (typeof window.addCase === 'function') window.addCase();
  });
}


/**
 * Share the current result
 */
window.shareResult = function shareResult() {
  var r = window._lastResult;
  if (!r) return;
  var txt = (r.title || 'Discovery') + ' — identified by TRACE\n\n' + (r.the_story || r.style_analysis || r.professional_assessment || '');
  if (navigator.share) {
    navigator.share({ title: r.title || 'TRACE', text: txt }).catch(function() { /* Web Share API may not be supported */ });
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(txt).then(function() { window.toast('Copied to clipboard'); });
  } else {
    window.toast('Share: ' + (r.title || 'this discovery'));
  }
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('scan', {
    version: '1.1.0',
    dependsOn: ['utils', 'tiers', 'results'],
    init: bindEventHandlers
  });
}

console.log('[TRACE Scan] Loaded');
