// ══════════════════════════════════════════════
// TRACE — Vision Analysis Suite
// Gap Severity · Valuation · Multi-Spectral · Research
// Digital Fingerprinting · Forensic Analysis · Database Queries
// ══════════════════════════════════════════════

// ── GAP SEVERITY ENGINE ─────────────────────
window.GAP_SEVERITY = {
  calculate(events) {
    if (!events || !events.length) return [];
    const gaps = [];
    let prevYear = null;
    events.forEach((ev, i) => {
      const isGap = ev.event && (ev.event.toLowerCase().includes('gap') || ev.event.includes('\u26a0'));
      if (!isGap) {
        const yearNum = parseInt(ev.year);
        if (!isNaN(yearNum)) prevYear = yearNum;
        ev._severity = null;
        return;
      }
      let severity = 'minor';
      if (prevYear !== null) {
        const nextIdx = events.slice(i + 1).findIndex(function(e) {
          return !isNaN(parseInt(e.year));
        });
        const nextEvent = nextIdx >= 0 ? events[i + 1 + nextIdx] : null;
        const nextYear = nextEvent ? parseInt(nextEvent.year) : new Date().getFullYear();
        const gapYears = (isNaN(nextYear) ? 50 : nextYear) - prevYear;
        if (gapYears > 100) severity = 'critical';
        else if (gapYears > 40) severity = 'moderate';
      }
      ev._severity = severity;
      gaps.push({ index: i, severity: severity, year: ev.year, event: ev.event });
    });
    return gaps;
  },

  badgeHTML(severity) {
    if (!severity) return '';
    var labels = { minor: 'Minor Gap', moderate: 'Moderate', critical: 'Critical Gap' };
    return '<span class="severity-badge severity-' + severity + '">' + (labels[severity] || severity) + '</span>';
  },

  suggestion(severity, year) {
    var suggestions = {
      minor: 'Gap of ' + (year || 'unknown period') + ' is minor. Check local auction records and exhibition catalogs for this period.',
      moderate: 'Gap of ' + (year || 'unknown period') + ' is significant. Search Getty Provenance Index and auction house archives.',
      critical: '\u26a0 Critical gap of ' + (year || 'unknown period') + '. Cross-reference INTERPOL stolen works database and Art Loss Register.'
    };
    return suggestions[severity] || '';
  }
};

// ── DYNAMIC VALUATION ENGINE ─────────────────
window.ValuationEngine = {
  estimate(result) {
    if (!result) return null;
    var period = (result.period || '').toLowerCase();
    var conf = result.provenance_confidence || 50;
    var medium = (result.medium || '').toLowerCase();
    var type = (result.subject_type || '').toLowerCase();

    var baseLow = 500, baseHigh = 5000;
    if (period.includes('14') || period.includes('15')) { baseLow = 50000; baseHigh = 500000; }
    else if (period.includes('16')) { baseLow = 20000; baseHigh = 300000; }
    else if (period.includes('17')) { baseLow = 10000; baseHigh = 200000; }
    else if (period.includes('18')) { baseLow = 5000; baseHigh = 100000; }
    else if (period.includes('19')) { baseLow = 2000; baseHigh = 50000; }
    else if (period.includes('20') || period.includes('21') || period.includes('contemporary')) { baseLow = 1000; baseHigh = 25000; }

    if (medium.includes('oil')) baseHigh *= 1.5;
    if (medium.includes('fresco')) baseHigh *= 2;
    if (medium.includes('photograph') || medium.includes('print')) { baseLow *= 0.3; baseHigh *= 0.3; }
    if (type === 'sculpture') baseHigh *= 1.8;

    var confFactor = 0.5 + (conf / 100) * 0.8;
    baseLow = Math.round(baseLow * confFactor);
    baseHigh = Math.round(baseHigh * confFactor);

    return {
      low: baseLow, high: baseHigh, confidence: conf,
      range_label: '\u20ac' + baseLow.toLocaleString() + ' \u2013 \u20ac' + baseHigh.toLocaleString(),
      factors: [
        { label: 'Period', value: result.period || 'Unknown' },
        { label: 'Medium', value: result.medium || 'Unknown' },
        { label: 'Provenance Confidence', value: conf + '%' },
        { label: 'Subject Type', value: type || 'artwork' }
      ],
      disclaimer: 'Estimate based on stylistic and period analysis. Professional appraisal recommended for insurance or sale.'
    };
  },

  render(result) {
    var wrap = document.getElementById('valuation-results');
    if (!wrap) return;
    var v = this.estimate(result);
    if (!v) { wrap.style.display = 'none'; return; }

    var html = '<div class="val-header" style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-left:2px solid var(--gold);margin-bottom:8px;">' +
      '<div class="gold-label">Dynamic Valuation Estimate</div>' +
      '<div class="val-amount">' + window.esc(v.range_label) + '</div>' +
      '<div class="val-desc">Based on period, medium, and provenance analysis</div></div>' +
      '<div class="px-14">';
    v.factors.forEach(function(f) {
      html += '<div class="val-factors-row">' +
        '<span class="text-dim-sm">' + window.esc(f.label) + '</span>' +
        '<span class="val-factor-value">' + window.esc(f.value) + '</span></div>';
    });
    html += '</div>' +
      '<div class="val-disclaimer">' + window.esc(v.disclaimer) + '</div>';
    wrap.innerHTML = html;
    wrap.style.display = 'block';
  }
};

// ── DIGITAL FINGERPRINTING ──────────────────
window.DigitalFingerprint = {
  hash: null,

  generate(imgElement) {
    if (!imgElement || !imgElement.src) return null;
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var size = 16;
    canvas.width = size;
    canvas.height = size;

    try {
      ctx.drawImage(imgElement, 0, 0, size, size);
      var data = ctx.getImageData(0, 0, size, size).data;
      var blocks = [];
      for (let by = 0; by < 4; by++) {
        for (let bx = 0; bx < 4; bx++) {
          var sum = 0, count = 0;
          for (let py = 0; py < 4; py++) {
            for (let px = 0; px < 4; px++) {
              var idx = ((by * 4 + py) * size + (bx * 4 + px)) * 4;
              sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
              count++;
            }
          }
          blocks.push(sum / count);
        }
      }
      var avg = blocks.reduce(function(a, b) { return a + b; }, 0) / blocks.length;
      var hash = blocks.map(function(b) { return b > avg ? '1' : '0'; }).join('');
      this.hash = hash;
      return hash;
    } catch (e) {
      this.hash = null;
      return null;
    }
  },

  hammingDistance(otherHash) {
    if (!this.hash || !otherHash) return -1;
    var dist = 0;
    for (let i = 0; i < this.hash.length; i++) {
      if (this.hash[i] !== otherHash[i]) dist++;
    }
    return dist;
  },

  similarity(otherHash) {
    var dist = this.hammingDistance(otherHash);
    if (dist < 0) return 0;
    return Math.round((1 - dist / this.hash.length) * 100);
  },

  render(result) {
    var wrap = document.getElementById('fingerprint-results');
    if (!wrap) return;
    var preview = document.getElementById('main-preview');
    var hash = preview ? this.generate(preview) : null;

    if (!hash) {
      wrap.innerHTML = '<div class="text-dim-11 p-12-14">Fingerprint generation requires the artwork image. Upload an image first.</div>';
      wrap.style.display = 'block';
      return;
    }

    var gridHtml = '<div class="fp-grid">';
    for (let i = 0; i < 16; i++) {
      var brightness = hash[i] === '1' ? 'var(--gold)' : 'var(--surface3)';
      gridHtml += '<div style="width:100%;aspect-ratio:1;background:' + brightness + ';border-radius:1px;"></div>';
    }
    gridHtml += '</div>';

    var html = '<div style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);margin-bottom:8px;">' +
      '<div class="gold-label">Digital Fingerprint</div>' +
      '<div style="display:flex;align-items:flex-start;gap:14px;">' + gridHtml +
      '<div class="flex-1">' +
      '<div class="fp-hash">' + window.esc(hash) + '</div>' +
      '<div class="fp-meta">16-bit perceptual hash \u00b7 ' + hash.length + ' bits</div>' +
      '</div></div></div>';

    wrap.innerHTML = html;
    wrap.style.display = 'block';
  }
};

// ── FORENSIC ANALYSIS ENGINE ────────────────
window.ForensicAnalysis = {
  analyse(result) {
    if (!result) return null;
    return {
      pigments: this._inferPigments(result),
      materials: this._inferMaterials(result),
      condition: this._assessCondition(result),
      dating: this._estimateDating(result)
    };
  },

  _inferPigments(result) {
    var pigments = [];
    var period = (result.period || '').toLowerCase();
    var medium = (result.medium || '').toLowerCase();

    if (medium.includes('oil') || period.includes('17') || period.includes('18') || period.includes('16')) {
      pigments.push({ name: 'Lead White (Basic Lead Carbonate)', era: 'Pre-1978', swatch: '#F5F0E8', confidence: 'high' });
      pigments.push({ name: 'Yellow Ochre (Iron Oxide)', era: 'Pre-1850', swatch: '#C8A830', confidence: 'medium' });
      pigments.push({ name: 'Prussian Blue (Iron Ferrocyanide)', era: 'Post-1704', swatch: '#1A3A6A', confidence: 'medium' });
    }
    if (medium.includes('tempera') || period.includes('14') || period.includes('15')) {
      pigments.push({ name: 'Vermilion (Mercuric Sulfide)', era: 'Pre-1920', swatch: '#CC3333', confidence: 'high' });
      pigments.push({ name: 'Ultramarine (Lapis Lazuli)', era: 'Pre-1826 synthetic', swatch: '#2040A0', confidence: 'medium' });
    }
    if (!pigments.length) {
      pigments.push({ name: 'Titanium White', era: 'Post-1921', swatch: '#FFFFFF', confidence: 'low' });
    }
    return pigments;
  },

  _inferMaterials(result) {
    var materials = [];
    var medium = (result.medium || '').toLowerCase();
    if (medium.includes('canvas') || medium.includes('oil')) materials.push('Linen canvas');
    if (medium.includes('panel') || medium.includes('wood')) materials.push('Oak/Poplar panel');
    if (medium.includes('paper')) materials.push('Rag paper');
    if (medium.includes('marble') || medium.includes('stone')) materials.push('Marble');
    if (!materials.length) materials.push('Canvas (likely)');
    return materials;
  },

  _assessCondition(result) {
    var conf = result.provenance_confidence || 50;
    var score = Math.min(100, Math.max(20, conf + 10));
    return {
      overall: score,
      surface: Math.min(100, score + Math.random() * 20 - 10),
      structure: Math.min(100, score + Math.random() * 15 - 8),
      authenticity: conf
    };
  },

  _estimateDating(result) {
    var period = result.period || '';
    return {
      stated: period,
      technique: 'Stylistic analysis suggests ' + period,
      material: 'Material composition consistent with ' + period,
      confidence: result.provenance_confidence || 50
    };
  }
};

// ── DATABASE QUERY (Getty/INTERPOL/ALR) ────
window.DatabaseQuery = {
  results: [],

  _abortController: null,

  async search(title, artist, period) {
    // Abort any previous DB query
    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    var apiBase = window.TRACE_API_PROXY || '';
    var apiUrl = apiBase ? apiBase + '/analyse' : 'https://api.anthropic.com/v1/messages';
    var headers = { 'Content-Type': 'application/json' };
    if (!apiBase) headers['anthropic-version'] = '2023-06-01';
    if (window.TRACE_ANALYSE_KEY) headers['x-api-key'] = window.TRACE_ANALYSE_KEY;
    if (window.TIER) headers['x-tier'] = window.TIER;

    var systemPrompt = 'You are TRACE Database Intelligence. Search Getty Provenance Index, INTERPOL stolen works, and Art Loss Register for this artwork. Respond ONLY with a valid JSON object: getty_matches (array of {title, artist, year, source, confidence}), interpol_match (boolean), alr_status (string: clear/flagged/unknown), risk_level (string: low/moderate/high/critical), risk_details (string). No markdown.';

    var res = await fetch(apiUrl, {
      method: 'POST', headers: headers,
      signal: this._abortController.signal,
      body: JSON.stringify({
        model: (window.TRACE_AI_CONFIG && window.TRACE_AI_CONFIG.getModel()) || 'claude-sonnet-4-20250514', max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Cross-reference: "' + (title || 'Unknown') + '" by ' + (artist || 'Unknown') + ' (' + (period || '') + '). Check Getty Provenance Index, INTERPOL stolen works database, and Art Loss Register.' }]
      })
    });

    var data = await res.json();
    var raw = data.content ? data.content.map(function(b) { return b.text || ''; }).join('') : '{}';
    var result = {};
    try { result = JSON.parse(raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()); } catch (e) {
      try { var s = raw.indexOf('{'), end = raw.lastIndexOf('}'); if (s >= 0 && end > s) result = JSON.parse(raw.slice(s, end + 1)); } catch(e2) { TRACE_WATCHDOG?.warn('Vision', e2); }
    }

    this.results = result;
    this.render(result);
    return result;
  },

  render(result) {
    var wrap = document.getElementById('db-query-results');
    if (!wrap) return;
    var riskColors = { low: 'var(--green-lt)', moderate: '#E8A020', high: 'var(--red-lt)', critical: '#C44848' };
    var risk = (result.risk_level || 'unknown').toLowerCase();

    // API status badges — show which databases are live vs mock
    var apis = result.apis || {};
    var apiBadges = '';
    if (Object.keys(apis).length) {
      apiBadges = '<div style="padding:6px 14px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface2);">' +
        Object.keys(apis).map(function(key) {
          var isReal = apis[key] && apis[key].real;
          var label = key.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); });
          var color = isReal ? 'var(--green-lt)' : 'var(--gold-dim)';
          var text = isReal ? 'LIVE' : 'SIMULATED';
          return '<span class="live-badge" style="border-color:' + color + ';color:' + color + '">' +
            '<span class="status-dot" style="background:' + color + '"></span>' +
            window.esc(label) + ' ' + text + '</span>';
        }).join('') + '</div>';
    } else {
      // AI-generated results — always show as simulated
      apiBadges = '<div style="padding:6px 14px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface2);">' +
        '<span style="font-size:7px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;border:1px solid var(--gold-dim);color:var(--gold-dim);border-radius:2px;">' +
        '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--gold-dim);margin-right:4px;vertical-align:middle;"></span>' +
        'AI-Generated (Simulated) \u00b7 Set up API proxy for live data' +
        '</span></div>';
    }

    var html = apiBadges + '<div class="db-risk-header" style="border-left:3px solid ' + (riskColors[risk] || 'var(--gold)') + ';padding:10px 14px;background:var(--surface);margin-bottom:10px;">' +
      '<div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-dim);">Risk Assessment</div>' +
      '<div style="font-family:var(--font-mono);font-size:16px;color:' + (riskColors[risk] || 'var(--gold)') + ';font-weight:700;margin-top:4px;">' + (risk || 'Unknown').toUpperCase() + '</div>' +
      '<div style="font-size:11px;color:var(--text-mid);margin-top:4px;">' + window.esc(result.risk_details || 'No risk details available.') + '</div></div>' +
      '<div style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);">' +
      '<div class="db-dot" style="background:' + (result.interpol_match ? 'var(--red-lt)' : 'var(--green-lt)') + '"></div>' +
      '<span class="text-mid text-sm">INTERPOL Stolen Works: <strong style="color:' + (result.interpol_match ? 'var(--red-lt)' : 'var(--green-lt)') + '">' + (result.interpol_match ? 'MATCH FOUND' : 'CLEAR') + '</strong></span></div>' +
      '<div style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);">' +
      '<div class="db-dot" style="background:' + ((result.alr_status || '').toLowerCase() === 'clear' ? 'var(--green-lt)' : 'var(--gold)') + '"></div>' +
      '<span class="text-mid text-sm">Art Loss Register: <strong style="color:var(--gold)">' + (result.alr_status || 'Unknown') + '</strong></span></div>';

    if (result.getty_matches && result.getty_matches.length) {
      html += '<div class="px-14 py-10"><div class="gold-label">Getty Provenance Index Matches</div>';
      result.getty_matches.forEach(function(m) {
        html += '<div class="gpi-match-item">' +
          '<div style="font-family:var(--font-display);font-size:13px;color:var(--text);">' + window.esc(m.title || '') + '</div>' +
          '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' + window.esc(m.artist || '') + (m.year ? ', ' + window.esc(m.year) : '') + '</div>' +
          '<div style="font-size:8px;color:var(--text-ghost);margin-top:3px;">Source: ' + window.esc(m.source || 'Getty') + ' \u00b7 Confidence: ' + window.esc(m.confidence || 'medium') + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="text-dim-11 p-12-14">No Getty Provenance Index matches found.</div>';
    }

    wrap.innerHTML = html;
    wrap.style.display = 'block';
  }
};

// ── RUN DB QUERY Button Handler ──────────────
window.runDBQuery = function() {
  var r = window._lastResult;
  if (!r) { window.toast('No analysis to cross-reference'); return; }
  var wrap = document.getElementById('db-query-results');
  if (wrap) {
    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="db-loading">Cross-referencing Getty \u00b7 INTERPOL \u00b7 Art Loss Register</div>';
  }
  // Show spinner on button
  var spinner = document.getElementById('db-query-spinner');
  if (spinner) spinner.style.display = 'inline-block';
  var btn = document.getElementById('db-query-btn');
  if (btn) btn.style.opacity = '0.7';
  window.DatabaseQuery.search(r.title, r.artist, r.period).then(function() {
    if (spinner) spinner.style.display = 'none';
    if (btn) btn.style.opacity = '1';
  }).catch(function() {
    if (spinner) spinner.style.display = 'none';
    if (btn) btn.style.opacity = '1';
  });
};

// ── PROVENANCE CROSS-REFERENCE CHECK (uses structured API results) ────
window.ProvenanceCheck = {
  results: null,

  async search(title, artist, events, tier) {
    var apiBase = window.TRACE_API_PROXY || '';
    if (!apiBase) {
      window.toast('Server API not available — start the TRACE server');
      return Promise.resolve(null);
    }
    var wrap = document.getElementById('provenance-results');
    var stageTimeouts = [];
    if (wrap) {
      wrap.style.display = 'block';
      wrap.innerHTML = '<div class="provenance-stages" id="provenance-stages" style="padding:12px 14px;">' +
        '<div class="ps-stage" data-stage="getty-ulan"><span class="ps-dot"></span>Getty ULAN SPARQL</div>' +
        '<div class="ps-stage" data-stage="getty-gpi"><span class="ps-dot"></span>Getty Provenance Index</div>' +
        '<div class="ps-stage" data-stage="interpol"><span class="ps-dot"></span>INTERPOL Check</div>' +
        '<div class="ps-stage" data-stage="alr"><span class="ps-dot"></span>Art Loss Register</div>' +
        '<div class="ps-stage" data-stage="aamd"><span class="ps-dot"></span>AAMD Nazi-Era Check</div>' +
        '<div class="ps-stage" data-stage="unesco"><span class="ps-dot"></span>UNESCO 1970 Convention</div>' +
        '</div>';
      // Animate stages sequentially for visual progress feedback
      var stages = ['getty-ulan', 'getty-gpi', 'interpol', 'alr', 'aamd', 'unesco'];
      stages.forEach(function(id, i) {
        var delay = i < 2 ? 500 + i * 2000 : 3500 + (i - 2) * 800;
        var tid = setTimeout(function() {
          var el = wrap.querySelector('[data-stage="' + id + '"]');
          if (el) {
            if (i < 3) {
              el.className = 'ps-stage ps-active';
            } else {
              el.className = 'ps-stage ps-done';
            }
          }
        }, delay);
        stageTimeouts.push(tid);
      });
    }

    // ── Cancel stage timers when response arrives ──
    function cancelStages() {
      stageTimeouts.forEach(function(tid) { clearTimeout(tid); });
      stageTimeouts = [];
      var stagesEl = document.getElementById('provenance-stages');
      if (stagesEl) {
        Array.prototype.forEach.call(stagesEl.querySelectorAll('.ps-stage'), function(el) {
          el.className = 'ps-stage ps-done';
        });
      }
    }

    // Store cancel function on the promise for cleanup
    this._cancelStages = cancelStages;
    try {
      var res = await fetch(apiBase + '/api/provenance/cross-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworkTitle: title || '',
          artist: artist || '',
          period: '',
          timeline: events || [],
          tier: tier || window.TIER || 'collector'
        })
      });
      var data = await res.json();
      this.results = data;
      // Cancel progress stages and render results
      if (this._cancelStages) this._cancelStages();
      this.render(data);
      return data;
    } catch (e) {
      if (this._cancelStages) this._cancelStages();
      if (wrap) {
        wrap.innerHTML = '<div class="error-msg">Error: ' + window.esc(e.message) + '</div>';
      }
      return null;
    }
  },

  render(data) {
    var wrap = document.getElementById('provenance-results');
    if (!wrap) return;

    if (!data || !data.databases) {
      wrap.innerHTML = '<div class="text-dim-11" style="padding:14px;">No provenance data returned.</div>';
      return;
    }

    var dbs = data.databases;
    var apis = data.apis || {};
    var checkedAt = data.checkedAt || new Date().toISOString();
    var ts = new Date(checkedAt);
    var timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    var dateStr = ts.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

    // Database badge helper
    function badge(key, label) {
      var info = apis[key] || {};
      var isReal = info.real;
      var color = isReal ? 'var(--green-lt)' : 'var(--gold-dim)';
      var text = isReal ? 'LIVE' : 'SIMULATED';
      return '<span class="live-badge" style="border-color:' + color + ';color:' + color + '">' +
        '<span class="status-dot" style="background:' + color + '"></span>' +
        window.esc(label) + ' ' + text + '</span>';
    }

    // Build HTML
    var html = '';

    // API Badges header
    html += '<div class="provenance-panel" style="margin-top:8px;background:var(--surface);border:1px solid var(--border);">' +
      '<div style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);display:flex;justify-content:space-between;align-items:center;">' +
      '<span class="section-label-8">Provenance Check</span>' +
      '<span class="text-mono-ghost">' + dateStr + ' ' + timeStr + '</span></div>' +
      '<div class="flex-gap-wrap-bg">' +
      badge('gettyUlan', 'Getty ULAN') + badge('gettyProvenance', 'GPI') + badge('interpol', 'INTERPOL') + badge('alr', 'ALR') + badge('aamd', 'AAMD') + badge('unesco', 'UNESCO') +
      '</div>';

    // Summary bar
    var alerts = (data.summary && data.summary.alerts) || 0;
    var total = (data.summary && data.summary.totalChecks) || 5;
    html += '<div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">' +
      '<div><span class="text-uppercase">Status</span>' +
      '<div style="font-size:13px;font-weight:600;margin-top:2px;color:' + (alerts > 0 ? 'var(--red-lt)' : 'var(--green-lt)') + ';">' +
      (alerts > 0 ? '\u26a0 ' + alerts + ' Alert' + (alerts > 1 ? 's' : '') : '\u2713 Clear') + '</div></div>' +
      '<div style="text-align:right;"><span class="text-uppercase">Real APIs</span>' +
      '<div style="font-size:13px;font-weight:600;margin-top:2px;color:var(--text-mid);">' + Object.keys(apis).filter(function(k) { return apis[k].real; }).length + '/' + Object.keys(apis).length + '</div></div></div>';

    // Getty ULAN Artist Results
    var ulanArtists = dbs.getty && dbs.getty.artist ? dbs.getty.artist : [];
    html += '<div style="border-bottom:1px solid var(--border);">' +
      '<div class="kg-section-toggle" style="padding:8px 14px;font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);display:flex;justify-content:space-between;align-items:center;cursor:pointer;">' +
      'Getty ULAN Artist' +
      '<span class="text-ghost">' + ulanArtists.length + ' result' + (ulanArtists.length !== 1 ? 's' : '') + ' \u25be</span></div>' +
      '<div class="kg-section-content" style="display:' + (ulanArtists.length > 0 ? 'block' : 'none') + ';">';

    if (ulanArtists.length === 0) {
      html += '<div class="text-dim-10 p-4-0">No ULAN artist matches.</div>';
    } else {
      ulanArtists.slice(0, 5).forEach(function(a) {
        var lifespan = [a.birth, a.death].filter(Boolean).join('\u2013');
        var mockTag = a.isMock ? '<span class="text-gold-dim text-xs ml-4">(sim)</span>' : '<span class="text-green-lt text-xs ml-4">(live)</span>';
        html += '<div style="padding:6px 8px;margin-bottom:4px;background:var(--bg2);border:1px solid var(--border2);">' +
          '<div class="text-sm text-bold" style="color:var(--text);">' + window.esc(a.name || '') + mockTag + '</div>' +
          '<div style="font-size:8px;color:var(--text-dim);margin-top:2px;">' + (a.role || 'artist') + (lifespan ? ' \u00b7 ' + window.esc(lifespan) : '') + (a.nationality ? ' \u00b7 ' + window.esc(a.nationality) : '') + '</div></div>';
      });
      if (ulanArtists.length > 5) {
        html += '<div style="font-size:8px;color:var(--text-ghost);padding:4px 8px;">+' + (ulanArtists.length - 5) + ' more results</div>';
      }
    }
    html += '</div></div>';

    // Getty Provenance Index Results
    var gpiWorks = dbs.getty && dbs.getty.provenance ? dbs.getty.provenance : [];
    html += '<div style="border-bottom:1px solid var(--border);">' +
      '<div class="kg-section-toggle" style="padding:8px 14px;font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);display:flex;justify-content:space-between;align-items:center;cursor:pointer;">' +
      'Getty Provenance Index' +
      '<span class="text-ghost">' + gpiWorks.length + ' result' + (gpiWorks.length !== 1 ? 's' : '') + ' \u25be</span></div>' +
      '<div class="kg-section-content kg-section-content" style="display:' + (gpiWorks.length > 0 ? 'block' : 'none') + ';">';

    if (gpiWorks.length === 0) {
      html += '<div class="text-dim-10 p-4-0">No provenance records found.</div>';
    } else {
      gpiWorks.slice(0, 5).forEach(function(w) {
        var mockTag = w.isMock ? '<span class="text-gold-dim text-xs ml-4">(sim)</span>' : '<span class="text-green-lt text-xs ml-4">(live)</span>';
        html += '<div style="padding:6px 8px;margin-bottom:4px;background:var(--bg2);border:1px solid var(--border2);">' +
          '<div class="text-sm text-bold" style="color:var(--text);">' + window.esc(w.title || '') + mockTag + '</div>' +
          '<div style="font-size:9px;color:var(--text-dim);margin-top:2px;">' + window.esc(w.artist || '') + (w.year ? ', ' + w.year : '') + '</div>' +
          (w.currentLocation ? '<div style="font-size:8px;color:var(--text-ghost);margin-top:2px;">' + window.esc(w.currentLocation) + '</div>' : '') +
          (w.ref ? '<div class="text-mono-ghost-small">Ref: ' + window.esc(w.ref) + '</div>' : '') +
          '</div>';
      });
      if (gpiWorks.length > 5) {
        html += '<div style="font-size:8px;color:var(--text-ghost);padding:4px 8px;">+' + (gpiWorks.length - 5) + ' more results</div>';
      }
    }
    html += '</div></div>';

    // Wire collapsible sections via delegation — replace inline onclick
    (function() {
      var wrap = document.getElementById('provenance-results');
      if (wrap && !wrap._provenanceToggleBound) {
        wrap._provenanceToggleBound = true;
        wrap.addEventListener('click', function(e) {
          var toggle = e.target.closest('.kg-section-toggle');
          if (toggle) {
            var content = toggle.parentElement ? toggle.parentElement.querySelector('.kg-section-content') : null;
            if (content) {
              content.style.display = content.style.display === 'none' ? 'block' : 'none';
            }
          }
        });
      }
    })();

    // Database Checks: INTERPOL, ALR, AAMD, UNESCO
    var dbChecks = [
      { key: 'interpol', label: 'INTERPOL Stolen Works', data: dbs.interpol, color: function(d) { return d && d.matched ? 'var(--red-lt)' : 'var(--green-lt)'; }, status: function(d) { return d && d.matched ? 'MATCH' : 'CLEAR'; } },
      { key: 'alr', label: 'Art Loss Register', data: dbs.alr, color: function(d) { return d && d.matched ? 'var(--gold)' : 'var(--green-lt)'; }, status: function(d) { return d && d.matched ? 'FLAGGED' : 'CLEAR'; } },
      { key: 'aamd', label: 'AAMD Nazi-Era Project', data: dbs.aamd, color: function(d) { return d && d.flagged ? '#E8A020' : 'var(--green-lt)'; }, status: function(d) { return d && d.flagged ? 'NAZI-ERA FLAG' : 'CLEAR'; } },
      { key: 'unesco', label: 'UNESCO 1970 Convention', data: dbs.unesco, color: function(d) { return d && d.flagged ? 'var(--red-lt)' : 'var(--green-lt)'; }, status: function(d) { return d && d.flagged ? 'FLAGGED' : 'CLEAR'; } }
    ];

    html += '<div class="px-14 py-10">';
    dbChecks.forEach(function(c) {
      var d = c.data || {};
      var clr = c.color(d);
      var st = c.status(d);
      var ref = d.reference && d.reference !== '\u2014' ? d.reference : null;
      var det = d.detail || '';
      var mockTag = d && d.isMock ? '<span style="font-size:7px;color:var(--gold-dim);margin-left:6px;">(simulated)</span>' : '';
      html += '<div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--border2);">' +
        '<div class="db-dot-sm" style="background:' + clr + '"></div>' +
        '<div class="flex-1">' +
        '<div style="font-size:9px;color:var(--text);font-weight:500;">' + window.esc(c.label) + mockTag + '</div>' +
        '<div style="font-size:10px;color:' + clr + ';font-weight:600;font-family:var(--font-mono);margin-top:1px;">' + st + '</div>' +
        (det ? '<div style="font-size:9px;color:var(--text-dim);margin-top:2px;line-height:1.4;">' + window.esc(det) + '</div>' : '') +
        (ref ? '<div class="text-mono-ghost-small">Ref: ' + window.esc(ref) + '</div>' : '') +
        '</div></div>';
    });

    // AAMD flagged years — show timeline callout when Nazi-era gaps found
    var aamdData = dbs.aamd || {};
    if (aamdData.flagged && aamdData.flaggedYears && aamdData.flaggedYears.length > 0) {
      html += '<div style="margin:0 14px 10px;padding:8px 10px;background:rgba(232,160,32,0.08);border:1px solid rgba(232,160,32,0.25);border-radius:2px;">' +
        '<div style="font-size:7px;letter-spacing:.15em;text-transform:uppercase;color:#E8A020;margin-bottom:3px;">Nazi-Era Ownership Gaps</div>' +
        '<div style="font-size:9px;color:var(--text-dim);line-height:1.5;">Provenance gap' + (aamdData.flaggedYears.length > 1 ? 's' : '') + ' during 1933–1945 period: ' +
        aamdData.flaggedYears.map(function(y) { return '<span style="font-family:var(--font-mono);color:#E8A020;font-weight:600;">' + y + '</span>'; }).join(', ') +
        '. Further research recommended under Washington Conference Principles.</div></div>';
    }

    html += '</div>';

    // Footer with checked timestamp
    html += '<div class="provenance-footer">' +
      '<span>Checked: ' + dateStr + ' ' + timeStr + '</span>' +
      '<span>' + (data.realApisEnabled ? 'Live API mode' : 'Simulated mode') + '</span></div>';

    html += '</div>';

    wrap.innerHTML = html;
    wrap.style.display = 'block';

    // Emit provenance:complete event for correlation engine
    var evt = new CustomEvent('provenance:complete', { detail: { data: this.results } });
    document.dispatchEvent(evt);
  }
};

window.runProvenanceCheck = function() {
  var r = window._lastResult;
  if (!r) { window.toast('No analysis to cross-reference'); return; }
  var btn = document.getElementById('provenance-btn');
  if (btn) btn.style.opacity = '0.5';
  var spinner = document.getElementById('provenance-btn-spinner');
  if (spinner) spinner.style.display = 'inline-block';
  window.ProvenanceCheck.search(r.title, r.artist, r.timeline, window.TIER).then(function() {
    if (btn) btn.style.opacity = '1';
    if (spinner) spinner.style.display = 'none';
  }).catch(function() {
    if (btn) btn.style.opacity = '1';
    if (spinner) spinner.style.display = 'none';
  });
};

// ── MULTI-SPECTRAL ANALYSIS ────────────────
window.MSSpectral = {
  bands: [],
  activeBand: 0,

  open() {
    window.nav('scan');
    window.buildTabs(['Visible', 'UV Fluorescence', 'IR Reflectography', 'X-Ray', 'Compare']);
    window.toast('Multi-spectral mode \u2014 import images for each band');
  },

  importBand(bandName) {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*,.tif,.tiff';
    inp.onchange = function(e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var existing = window.MSSpectral.bands.find(function(b) { return b.name === bandName; });
        var entry = { name: bandName, data: ev.target.result, opacity: 1 };
        if (existing) {
          existing.data = entry.data;
        } else {
          window.MSSpectral.bands.push(entry);
        }
        window.toast(bandName + ' imported');
        window.MSSpectral.renderLayers();
      };
      reader.readAsDataURL(file);
    };
    inp.click();
  },

  renderLayers() {
    var wrap = document.getElementById('result-tl-wrap');
    if (!wrap) return;
    var msPanel = document.getElementById('ms-layers-panel');
    if (msPanel) msPanel.remove();
    msPanel = document.createElement('div');
    msPanel.id = 'ms-layers-panel';
    msPanel.className = 'ms-layers';

    if (this.bands.length === 0) {
      msPanel.innerHTML = '<div class="empty-state-md" style="padding:20px;">Import UV, IR, or X-Ray images to compare spectral bands.</div>';
    } else {
      this.bands.forEach(function(band, i) {
        var colors = ['#5AAA78', '#8B5CF6', '#3B82F6', '#EF4444'];
        msPanel.innerHTML += '<div class="ms-layer">' +
          '<div class="ms-layer-head"><span class="ms-layer-name">' + window.esc(band.name) + '</span>' +
          '<div class="ms-layer-dot" style="background:' + colors[i % 4] + '"></div></div>' +
          '<img class="ms-layer-vis" src="' + band.data + '" alt="' + window.esc(band.name) + '">' +
          '<div class="ms-blend-controls"><span class="ms-blend-label">Opacity</span>' +
          '<input type="range" class="ms-blend-slider" min="0" max="100" value="' + Math.round(band.opacity * 100) + '" ' +
          'data-ms-opacity="' + i + '"></div></div>';
      });
    }
    wrap.parentNode.insertBefore(msPanel, wrap);
    // Wire opacity slider changes via delegation
    if (!msPanel._msSliderBound) {
      msPanel._msSliderBound = true;
      msPanel.addEventListener('input', function(e) {
        var slider = e.target.closest('[data-ms-opacity]');
        if (slider && typeof window.MSSpectral !== 'undefined') {
          var idx = parseInt(slider.dataset.msOpacity, 10);
          window.MSSpectral.setOpacity(idx, slider.value / 100);
        }
      });
    }
  },

  setOpacity(idx, val) {
    if (this.bands[idx]) {
      this.bands[idx].opacity = val;
      var imgs = document.querySelectorAll('#ms-layers-panel .ms-layer-vis');
      if (imgs[idx]) imgs[idx].style.opacity = val;
    }
  }
};

// ── CASE ANNOTATIONS ────────────────────────
window.CaseAnnotations = {
  annotations: {},

  add(caseTitle, text, author) {
    if (!this.annotations[caseTitle]) this.annotations[caseTitle] = [];
    this.annotations[caseTitle].push({
      text: text, author: author || 'Investigator',
      timestamp: new Date().toISOString(), id: Date.now()
    });
    try { localStorage.setItem('trace_annotations', JSON.stringify(this.annotations)); } catch(e) { TRACE_WATCHDOG?.warn('Vision', e); }
    window.toast('Annotation added');
  },

  get(caseTitle) {
    return this.annotations[caseTitle] || [];
  },

  remove(caseTitle, id) {
    if (!this.annotations[caseTitle]) return;
    this.annotations[caseTitle] = this.annotations[caseTitle].filter(function(a) { return a.id !== id; });
    try { localStorage.setItem('trace_annotations', JSON.stringify(this.annotations)); } catch(e) { TRACE_WATCHDOG?.warn('Vision', e); }
  },

  restore() {
    try {
      var stored = localStorage.getItem('trace_annotations');
      if (stored) this.annotations = JSON.parse(stored);
    } catch(e) { TRACE_WATCHDOG?.warn('Vision', e); }
  }
};
window.CaseAnnotations.restore();

// ── VISION SHOW RESULT HOOK ─────────────────
// Called from showResult() in results.js
window._visionShowResultHook = function(r) {
  if (!r) return;

  // GAP SEVERITY
  if (r.timeline && r.timeline.length) {
    window.GAP_SEVERITY.calculate(r.timeline);
    var track = document.getElementById('result-tl-track');
    if (track) {
      r.timeline.forEach(function(ev, i) {
        if (ev._severity) {
          var dots = track.querySelectorAll('div');
          var yrEl = dots[i * 3 + 1];
          if (yrEl) yrEl.innerHTML = window.esc(ev.year) + window.GAP_SEVERITY.badgeHTML(ev._severity);
        }
      });
    }
  }

  // PROVENANCE TIMELINE VISUALIZATION
  if (r.timeline && r.timeline.length && window.ProvenanceTimeline) {
    window.ProvenanceTimeline.render(r.timeline);
  }

  // DATABASE QUERY BUTTON (Professional)
  var dbBtn = document.getElementById('db-query-btn');
  if (dbBtn) dbBtn.style.display = (window.TIER === 'professional') ? 'flex' : 'none';

  // PROVENANCE CHECK BUTTON (Collector + Professional)
  var provBtn = document.getElementById('provenance-btn');
  if (provBtn) provBtn.style.display = (window.TIER === 'collector' || window.TIER === 'professional') ? 'flex' : 'none';

  // VALUATION (Collector + Professional)
  if (window.TIER === 'collector' || window.TIER === 'professional') {
    window.ValuationEngine.render(r);
  }

  // DIGITAL FINGERPRINT
  setTimeout(function() { window.DigitalFingerprint.render(r); }, 300);

  // FORENSIC ANALYSIS (Professional)
  if (window.TIER === 'professional') {
    var fa = window.ForensicAnalysis.analyse(r);
    if (fa) {
      var faWrap = document.getElementById('fingerprint-results');
      if (faWrap) {
        var faHtml = '<div class="fa-panel" style="margin-top:8px;">' +
          '<div class="fa-panel-head"><span class="fa-panel-title">Forensic Analysis</span><span style="font-size:8px;color:var(--text-ghost);">AI-Inferred</span></div>' +
          '<div class="fa-body">';
        fa.pigments.forEach(function(p) {
          faHtml += '<div class="fa-pigment-row"><div class="fa-pigment-swatch" style="background:' + p.swatch + '"></div>' +
            '<div class="fa-pigment-name">' + window.esc(p.name) + '</div>' +
            '<div class="fa-pigment-era">' + window.esc(p.era) + '</div></div>';
        });
        faHtml += '<div class="fa-metric"><span class="fa-metric-label">Overall Condition</span>' +
          '<span class="fa-metric-value">' + Math.round(fa.condition.overall) + '%</span></div>' +
          '<div class="fa-metric"><span class="fa-metric-label">Authenticity Score</span>' +
          '<span class="fa-metric-value">' + Math.round(fa.condition.authenticity) + '%</span></div>' +
          '</div></div>';
        faWrap.innerHTML += faHtml;
        faWrap.style.display = 'block';
      }
    }
  }
};

// ══════════════════════════════════════════════
// TRACE — Register vision module with the Module Registry

// ── PROVENANCE TIMELINE VISUALIZATION ─────────
// Interactive horizontal timeline showing ownership with severity-coded gaps
window.ProvenanceTimeline = {
  render: function(events) {
    if (!events || !events.length) return;
    // Find or create the timeline container
    var container = document.getElementById('provenance-timeline');
    if (!container) {
      var alt = document.getElementById('provenance-results');
      if (alt) {
        container = document.createElement('div');
        container.id = 'provenance-timeline';
        alt.appendChild(container);
      } else {
        var rp = document.querySelector('.r-panel, .results-panel, .result-content');
        if (rp) {
          container = document.createElement('div');
          container.id = 'provenance-timeline';
          rp.appendChild(container);
        } else {
          return;
        }
      }
    }

    var gaps = window.GAP_SEVERITY.calculate(events);
    var gapMap = {};
    gaps.forEach(function(g) { gapMap[g.index] = g; });

    var years = [];
    events.forEach(function(e) {
      var y = parseInt(e.year);
      if (!isNaN(y)) years.push(y);
    });
    if (!years.length) return;

    var minYear = Math.min.apply(null, years);
    var maxYear = Math.max.apply(null, years);
    var yearSpan = maxYear - minYear || 1;
    var now = new Date().getFullYear();
    var totalSpan = Math.max(yearSpan, 50);
    var endYear = Math.max(maxYear, now);
    var startYear = Math.min(minYear, endYear - totalSpan);

    var html = '<div class="pt-container">';
    html += '<div class="pt-header">Provenance Timeline</div>';
    html += '<div class="pt-track-wrap">';
    html += '<div class="pt-track">';

    var prevEndYear = null;
    events.forEach(function(ev, i) {
      var yearStr = ev.year || '';
      var yearNum = parseInt(yearStr);
      var eventText = ev.event || '';
      var isGap = eventText.toLowerCase().indexOf('gap') !== -1 || eventText.indexOf('\u26a0') !== -1;

      if (isGap) {
        var gapInfo = gapMap[i];
        var severity = gapInfo ? gapInfo.severity : 'minor';
        var nextYear = endYear;
        for (var j = i + 1; j < events.length; j++) {
          var ny = parseInt(events[j].year);
          if (!isNaN(ny)) { nextYear = ny; break; }
        }
        var gapStart = prevEndYear !== null ? prevEndYear : (yearNum || startYear);
        var gapEnd = nextYear;
        var gapDuration = gapEnd - gapStart;

        var leftPct = ((gapStart - startYear) / (endYear - startYear)) * 100;
        var widthPct = Math.max(5, (gapDuration / (endYear - startYear)) * 100);

        html += '<div class="pt-gap pt-gap-' + severity + '"';
        html += ' style="left:' + leftPct + '%;width:' + widthPct + '%;"';
        html += ' data-severity="' + severity + '"';
        html += ' data-gap-start="' + gapStart + '"';
        html += ' data-gap-end="' + gapEnd + '"';
        html += ' title="' + window.esc(eventText) + ' (' + gapDuration + ' yrs)">';
        html += '<div class="pt-gap-pattern"></div>';
        html += '<div class="pt-gap-sev">' + severity.toUpperCase() + '</div>';
        html += '<div class="pt-gap-dur">' + gapDuration + 'yrs</div>';
        html += '</div>';
      } else if (!isNaN(yearNum)) {
        var leftPct2 = ((yearNum - startYear) / (endYear - startYear)) * 100;
        html += '<div class="pt-owner" style="left:' + leftPct2 + '%;"';
        html += ' title="' + window.esc(yearStr) + ': ' + window.esc(eventText) + '">';
        html += '<div class="pt-owner-marker"></div>';
        html += '<div class="pt-owner-year">' + window.esc(yearStr) + '</div>';
        html += '</div>';
        if (!isNaN(yearNum)) prevEndYear = yearNum;
      }
    });

    // End marker
    var nowPct = ((now - startYear) / (endYear - startYear)) * 100;
    html += '<div class="pt-now" style="left:' + Math.min(nowPct, 100) + '%;" title="Present Day">';
    html += '<div class="pt-now-marker"></div>';
    html += '<div class="pt-now-label">Now</div></div>';
    html += '</div></div>';

    // Century scale
    html += '<div class="pt-scale">';
    var scaleStep = Math.max(10, Math.ceil((endYear - startYear) / 8 / 10) * 10);
    for (var sy = Math.ceil(startYear / scaleStep) * scaleStep; sy <= endYear; sy += scaleStep) {
      var pct = ((sy - startYear) / (endYear - startYear)) * 100;
      html += '<div class="pt-scale-mark" style="left:' + pct + '%;">';
      html += '<span class="pt-scale-label">' + sy + '</span></div>';
    }
    html += '</div>';

    // Legend
    html += '<div class="pt-legend">';
    html += '<span class="pt-legend-item"><span class="pt-legend-swatch pt-swatch-owner"></span> Owner</span>';
    html += '<span class="pt-legend-item"><span class="pt-legend-swatch pt-swatch-gap-minor"></span> Minor Gap</span>';
    html += '<span class="pt-legend-item"><span class="pt-legend-swatch pt-swatch-gap-moderate"></span> Moderate</span>';
    html += '<span class="pt-legend-item"><span class="pt-legend-swatch pt-swatch-gap-critical"></span> Critical</span>';
    html += '<span class="pt-legend-item"><span class="pt-legend-swatch pt-swatch-now"></span> Present</span>';
    html += '</div>';

    // Detail panel
    html += '<div class="pt-detail" id="pt-detail" style="display:none;"></div>';
    html += '</div>';

    container.innerHTML = html;
    container.style.display = 'block';

    // Click handlers for gaps
    setTimeout(function() {
      var gapEls = container.querySelectorAll('.pt-gap');
      Array.prototype.forEach.call(gapEls, function(el) {
        el.addEventListener('click', function(e) {
          e.stopPropagation();
          var detailPanel = document.getElementById('pt-detail');
          if (!detailPanel) return;
          var severity = this.getAttribute('data-severity') || 'minor';
          var gapStart = parseInt(this.getAttribute('data-gap-start')) || 0;
          var gapEnd = parseInt(this.getAttribute('data-gap-end')) || 0;
          var duration = gapEnd - gapStart;
          var suggestion = window.GAP_SEVERITY.suggestion(severity, duration + ' years');
          detailPanel.innerHTML = '<div class="pt-detail-head pt-detail-' + severity + '">\u26a0 Provenance Gap: ' + gapStart + '\u2013' + gapEnd + '</div>' +
            '<div class="pt-detail-body">' + window.esc(suggestion) + '</div>' +
            '<div class="pt-detail-foot">Severity: ' + severity.toUpperCase() + ' | Duration: ' + duration + ' years</div>';
          detailPanel.style.display = 'block';
        });
      });
    }, 50);
  }
};
// ══════════════════════════════════════════════

(function() {
  'use strict';

  // Register vision module with the registry (if available)
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('vision', {
      name: 'Vision Analysis Suite',
      version: '1.0.0',
      tier: 'professional',

      // Register a hook handler for when results are displayed
      init: function() {
        // Subscribe to result:render hook
        TRACE_REGISTRY.on('result:render', function(data) {
          if (typeof window._visionShowResultHook === 'function') {
            window._visionShowResultHook(data.result);
          }
        });

        // Subscribe to scan:complete hook for gap analysis
        TRACE_REGISTRY.on('scan:complete', function(data) {
          if (data.result && data.result.timeline) {
            window.GAP_SEVERITY.calculate(data.result.timeline);
          }
        });

        console.log('[Vision] Registered with TRACE_REGISTRY');
      },

      commands: [
        { name: 'research', label: 'Open Research Agent', action: function() {
          if (typeof window.TRACE_ResearchAgent !== 'undefined') {
            window.TRACE_ResearchAgent.open();
          }
        }},
        { name: 'valuation', label: 'Show Valuation Estimate', action: function() {
          if (window._lastResult && typeof window.ValuationEngine !== 'undefined') {
            window.ValuationEngine.render(window._lastResult);
          }
        }},
        { name: 'fingerprint', label: 'Generate Digital Fingerprint', action: function() {
          if (typeof window.DigitalFingerprint !== 'undefined') {
            window.DigitalFingerprint.render(window._lastResult);
          }
        }}
      ]
    });
  } else {
    console.log('[Vision] Registry not available — running standalone');
  }
})();

console.log('[TRACE Vision] Loaded');
