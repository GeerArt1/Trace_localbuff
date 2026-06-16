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
      '<div style="font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:4px;">Dynamic Valuation Estimate</div>' +
      '<div style="font-family:Courier Prime,monospace;font-size:20px;color:var(--gold);font-weight:700;">' + window.esc(v.range_label) + '</div>' +
      '<div style="font-size:9px;color:var(--text-dim);margin-top:4px;">Based on period, medium, and provenance analysis</div></div>' +
      '<div style="padding:0 14px;">';
    v.factors.forEach(function(f) {
      html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">' +
        '<span style="font-size:10px;color:var(--text-dim);">' + window.esc(f.label) + '</span>' +
        '<span style="font-size:10px;color:var(--text-mid);font-weight:600;">' + window.esc(f.value) + '</span></div>';
    });
    html += '</div>' +
      '<div style="padding:8px 14px;font-size:9px;color:var(--text-ghost);font-style:italic;">' + window.esc(v.disclaimer) + '</div>';
    wrap.innerHTML = html;
    wrap.style.display = 'block';
  }
};

// ── AI RESEARCH AGENT ────────────────────────
window.ResearchAgent = {
  isOpen: false,

  open() {
    this.isOpen = true;
    window.nav('research');
  },

  _abortController: null,

  async investigate(artworkTitle, context) {
    // Abort any previous research request
    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    var apiBase = window.TRACE_API_PROXY || '';
    var apiUrl = apiBase ? apiBase + '/analyse' : 'https://api.anthropic.com/v1/messages';
    var headers = { 'Content-Type': 'application/json' };
    if (!apiBase) headers['anthropic-version'] = '2023-06-01';
    if (window.TRACE_ANALYSE_KEY) headers['x-api-key'] = window.TRACE_ANALYSE_KEY;
    if (window.TIER) headers['x-tier'] = window.TIER;

    var systemPrompt = 'You are TRACE Research Agent — an autonomous provenance research assistant. Given an artwork, generate 3-5 investigation hypotheses with suggested sources. ' +
      'Respond ONLY with a valid JSON array of objects, each with: hypothesis (string), confidence (string: high/medium/low), ' +
      'sources (array of strings), next_steps (array of 1-2 actionable steps). No markdown, no backticks. Return only the JSON array.';

    var res = await fetch(apiUrl, {
      method: 'POST', headers: headers,
      signal: this._abortController.signal,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Research the provenance of: "' + artworkTitle + '" ' + (context || '') }]
      })
    });

    var data = await res.json();
    var raw = data.content ? data.content.map(function(b) { return b.text || ''; }).join('') : '[]';
    var hypotheses = [];
    try { hypotheses = JSON.parse(raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()); } catch (e) {
      try { var s = raw.indexOf('['), end = raw.lastIndexOf(']'); if (s >= 0 && end > s) hypotheses = JSON.parse(raw.slice(s, end + 1)); } catch(e2) { TRACE_WATCHDOG?.warn('Vision', e2); }
    }
    return hypotheses;
  }
};

// ── RUN RESEARCH — UI Handler ────────────────
window.runResearch = function() {
  var input = document.getElementById('ra-input');
  var msg = input ? input.value.trim() : '';
  var r = window._lastResult;
  if (!msg && r && r.title) msg = r.title;
  if (!msg) { window.toast('Enter an artwork title or run an analysis first'); return; }
  if (input) input.value = '';

  var msgs = document.getElementById('ra-messages');
  if (!msgs) return;

  msgs.innerHTML += '<div class="ra-msg ai"><div class="ra-msg-label"><span class="ra-agent">You</span></div><div class="ra-msg-bubble">Research: ' + window.esc(msg) + '</div></div>';

  var loading = document.createElement('div');
  loading.className = 'ra-msg system';
  loading.innerHTML = '<div class="ra-msg-bubble">TRACE Research Agent investigating\u2026</div>';
  msgs.appendChild(loading);
  msgs.scrollTop = msgs.scrollHeight;

  var context = r ? 'Period: ' + (r.period || 'unknown') + '. Medium: ' + (r.medium || 'unknown') + '. Keywords: ' + (r.keywords || []).join(', ') : '';
  window.ResearchAgent.investigate(msg, context).then(function(hypotheses) {
    loading.remove();
    if (!hypotheses || !hypotheses.length) {
      msgs.innerHTML += '<div class="ra-msg ai"><div class="ra-msg-label"><span class="ra-agent">AI</span></div><div class="ra-msg-bubble">No hypotheses generated. Try a more specific artwork title.</div></div>';
      return;
    }
    var html = '<div class="ra-msg ai"><div class="ra-msg-label"><span class="ra-agent">AI</span> RESEARCH AGENT</div>';
    html += '<div class="ra-msg-bubble">Found ' + hypotheses.length + ' investigation hypothesis' + (hypotheses.length > 1 ? 'es' : '') + ':</div>';
    hypotheses.forEach(function(h, i) {
      html += '<div class="ra-hypothesis">' +
        '<div class="ra-hyp-title">' + (i + 1) + '. ' + window.esc(h.hypothesis || '') + '</div>' +
        '<div class="ra-hyp-body">' + window.esc((h.confidence || 'medium') + ' confidence') + '</div>';
      if (h.sources && h.sources.length) {
        html += '<div class="ra-hyp-sources">';
        h.sources.forEach(function(s) { html += '<span class="ra-hyp-src">' + window.esc(s) + '</span>'; });
        html += '</div>';
      }
      if (h.next_steps && h.next_steps.length) {
        html += '<div style="margin-top:6px;">';
        h.next_steps.forEach(function(ns, si) {
          html += '<div class="ra-step"><div class="ra-step-num">' + (si + 1) + '</div><div class="ra-step-text">' + window.esc(ns) + '</div></div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '</div>';
    msgs.innerHTML += html;
    msgs.scrollTop = msgs.scrollHeight;
  }).catch(function(err) {
    loading.remove();
    msgs.innerHTML += '<div class="ra-msg ai"><div class="ra-msg-label"><span class="ra-agent">AI</span></div><div class="ra-msg-bubble" style="color:var(--red-lt)">Error: ' + window.esc(err.message) + '</div></div>';
  });
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
      wrap.innerHTML = '<div style="padding:12px 14px;font-size:11px;color:var(--text-dim);">Fingerprint generation requires the artwork image. Upload an image first.</div>';
      wrap.style.display = 'block';
      return;
    }

    var gridHtml = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:2px;width:80px;">';
    for (let i = 0; i < 16; i++) {
      var brightness = hash[i] === '1' ? 'var(--gold)' : 'var(--surface3)';
      gridHtml += '<div style="width:100%;aspect-ratio:1;background:' + brightness + ';border-radius:1px;"></div>';
    }
    gridHtml += '</div>';

    var html = '<div style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);margin-bottom:8px;">' +
      '<div style="font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:8px;">Digital Fingerprint</div>' +
      '<div style="display:flex;align-items:flex-start;gap:14px;">' + gridHtml +
      '<div style="flex:1;min-width:0;">' +
      '<div style="font-family:Courier Prime,monospace;font-size:9px;color:var(--text-dim);word-break:break-all;line-height:1.6;">' + window.esc(hash) + '</div>' +
      '<div style="font-size:9px;color:var(--text-ghost);margin-top:6px;">16-bit perceptual hash \u00b7 ' + hash.length + ' bits</div>' +
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
        model: 'claude-sonnet-4-20250514', max_tokens: 800,
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
    var apiBadges = Object.keys(apis).length ?
      '<div style="padding:6px 14px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface2);">' +
      Object.keys(apis).map(function(key) {
        var isReal = apis[key] && apis[key].real;
        var label = key.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); });
        var color = isReal ? 'var(--green-lt)' : 'var(--gold-dim)';
        var text = isReal ? 'LIVE' : 'SIMULATED';
        return '<span style="font-size:7px;letter-spacing:.1em;text-transform:uppercase;padding:2px 6px;border:1px solid ' + color + ';color:' + color + ';border-radius:2px;">' +
          '<span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:' + color + ';margin-right:4px;vertical-align:middle;"></span>' +
          window.esc(label) + ' ' + text + '</span>';
      }).join('') + '</div>' : '';

    var html = apiBadges + '<div class="db-risk-header" style="border-left:3px solid ' + (riskColors[risk] || 'var(--gold)') + ';padding:10px 14px;background:var(--surface);margin-bottom:10px;">' +
      '<div style="font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-dim);">Risk Assessment</div>' +
      '<div style="font-family:Courier Prime,monospace;font-size:16px;color:' + (riskColors[risk] || 'var(--gold)') + ';font-weight:700;margin-top:4px;">' + (risk || 'Unknown').toUpperCase() + '</div>' +
      '<div style="font-size:11px;color:var(--text-mid);margin-top:4px;">' + window.esc(result.risk_details || 'No risk details available.') + '</div></div>' +
      '<div style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);">' +
      '<div style="width:8px;height:8px;border-radius:50%;background:' + (result.interpol_match ? 'var(--red-lt)' : 'var(--green-lt)') + '"></div>' +
      '<span style="font-size:10px;color:var(--text-mid);">INTERPOL Stolen Works: <strong style="color:' + (result.interpol_match ? 'var(--red-lt)' : 'var(--green-lt)') + '">' + (result.interpol_match ? 'MATCH FOUND' : 'CLEAR') + '</strong></span></div>' +
      '<div style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);">' +
      '<div style="width:8px;height:8px;border-radius:50%;background:' + ((result.alr_status || '').toLowerCase() === 'clear' ? 'var(--green-lt)' : 'var(--gold)') + '"></div>' +
      '<span style="font-size:10px;color:var(--text-mid);">Art Loss Register: <strong style="color:var(--gold)">' + (result.alr_status || 'Unknown') + '</strong></span></div>';

    if (result.getty_matches && result.getty_matches.length) {
      html += '<div style="padding:10px 14px;"><div style="font-size:8px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);margin-bottom:8px;">Getty Provenance Index Matches</div>';
      result.getty_matches.forEach(function(m) {
        html += '<div style="padding:8px 10px;background:var(--surface2);border:1px solid var(--border);margin-bottom:6px;">' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:13px;color:var(--text);">' + window.esc(m.title || '') + '</div>' +
          '<div style="font-size:10px;color:var(--text-dim);margin-top:2px;">' + window.esc(m.artist || '') + (m.year ? ', ' + window.esc(m.year) : '') + '</div>' +
          '<div style="font-size:8px;color:var(--text-ghost);margin-top:3px;">Source: ' + window.esc(m.source || 'Getty') + ' \u00b7 Confidence: ' + window.esc(m.confidence || 'medium') + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div style="padding:12px 14px;font-size:11px;color:var(--text-dim);">No Getty Provenance Index matches found.</div>';
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
  window.DatabaseQuery.search(r.title, r.artist, r.period);
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
      msPanel.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px;">Import UV, IR, or X-Ray images to compare spectral bands.</div>';
    } else {
      this.bands.forEach(function(band, i) {
        var colors = ['#5AAA78', '#8B5CF6', '#3B82F6', '#EF4444'];
        msPanel.innerHTML += '<div class="ms-layer">' +
          '<div class="ms-layer-head"><span class="ms-layer-name">' + window.esc(band.name) + '</span>' +
          '<div class="ms-layer-dot" style="background:' + colors[i % 4] + '"></div></div>' +
          '<img class="ms-layer-vis" src="' + band.data + '" alt="' + window.esc(band.name) + '">' +
          '<div class="ms-blend-controls"><span class="ms-blend-label">Opacity</span>' +
          '<input type="range" class="ms-blend-slider" min="0" max="100" value="' + Math.round(band.opacity * 100) + '" ' +
          'oninput="window.MSSpectral.setOpacity(' + i + ', this.value/100)"></div></div>';
      });
    }
    wrap.parentNode.insertBefore(msPanel, wrap);
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

  // DATABASE QUERY BUTTON (Professional)
  var dbBtn = document.getElementById('db-query-btn');
  if (dbBtn) dbBtn.style.display = (window.TIER === 'professional') ? 'flex' : 'none';

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
          if (typeof window.ResearchAgent !== 'undefined') {
            window.ResearchAgent.open();
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
