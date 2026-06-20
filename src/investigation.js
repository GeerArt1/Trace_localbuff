// ══════════════════════════════════════════════
// TRACE — Investigation Workspace
// Board, annotation pins, case file management
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var INVESTIGATION_KEY = 'trace_investigation';
  var ANNOTATION_KEY = 'trace_annotations';

  // ── Investigation Board ──

  /**
   * Render the investigation board
   */
  window.renderInvestigationBoard = function renderInvestigationBoard() {
    var board = document.getElementById('inv-board');
    if (!board) return;

    var cases = loadInvestigationCases();
    board.innerHTML = '';

    if (cases.length === 0) {
      board.innerHTML = '<div class="inv-empty">' +
        '<div class="inv-empty-icon">\u25C8</div>' +
        '<div class="inv-empty-title">No Investigations Yet</div>' +
        '<div class="inv-empty-text">Scan an artwork and pin it here to start an investigation. Add annotations to specific areas of the image.</div>' +
        '<button class="inv-empty-btn" data-inv-action="go-scan">GO SCAN</button>' +
        '</div>';
      return;
    }

    cases.forEach(function(c, idx) {
      var card = document.createElement('div');
      card.className = 'inv-case-card';
      card.dataset.invIdx = idx;

      var pinCount = (c.annotations || []).length;

      // Generate mini timeline dots
      var tlDots = '';
      if (c.events && c.events.length > 0) {
        var dots = c.events.slice(0, 5).map(function(e) {
          return '<span class="inv-tl-dot" title="' + window.esc(e.year + ': ' + (e.event || '')) + '"></span>';
        }).join('');
        tlDots = '<div class="inv-card-tl">' + dots + (c.events.length > 5 ? '<span class="inv-tl-more">+' + (c.events.length - 5) + '</span>' : '') + '</div>';
      }

      var statusLabel = c.status || 'active';
      var statusClass = statusLabel === 'active' ? 'inv-status-active' : statusLabel === 'annotated' ? 'inv-status-annotated' : 'inv-status-closed';

      card.innerHTML =
        '<div class="inv-card-head">' +
        '<div class="inv-card-title">' + window.esc(c.title || 'Untitled') + '</div>' +
        '<div class="inv-card-status ' + statusClass + '">' + window.esc(statusLabel) + '</div>' +
        '</div>' +          '<div class="inv-card-artist">' + window.esc(c.artist || 'Unknown artist') + '</div>' +
        // Correlation severity indicator
        (c.correlationFindings && c.correlationFindings.length > 0 ?
          (function() {
            var crit = c.correlationFindings.filter(function(f) { return f.severity === 'critical'; }).length;
            var warn = c.correlationFindings.filter(function(f) { return f.severity === 'warning'; }).length;
            if (crit > 0) return '<div class="inv-card-badges"><span class="inv-badge inv-badge-critical">' + crit + ' critical</span></div>';
            if (warn > 0) return '<div class="inv-card-badges"><span class="inv-badge inv-badge-warning">' + warn + ' warning' + (warn > 1 ? 's' : '') + '</span></div>';
            return '<div class="inv-card-badges"><span class="inv-badge inv-badge-info">' + c.correlationFindings.length + ' finding' + (c.correlationFindings.length > 1 ? 's' : '') + '</span></div>';
          })()
        : '') +
        // Research status indicator
        (c.researchResults && c.researchResults.hypotheses && c.researchResults.hypotheses.length > 0 ?
          '<div class="inv-card-badges"><span class="inv-badge inv-badge-research">🔬 ' + c.researchResults.hypotheses.length + ' hypothesis' + (c.researchResults.hypotheses.length > 1 ? 'es' : '') + '</span></div>'
        : '') +
        tlDots +
        '<div class="inv-card-footer">' +
        '<span class="inv-card-meta">' + (c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '') + '</span>' +
        '<span class="inv-card-meta">' + pinCount + ' pin' + (pinCount !== 1 ? 's' : '') + '</span>' +
        '<div class="inv-card-actions">' +
        '<button class="inv-card-btn" data-inv-action="open" data-inv-idx="' + idx + '" title="Open investigation">\u25B6</button>' +
        '<button class="inv-card-btn" data-inv-action="annotate" data-inv-idx="' + idx + '" title="Add annotation">\u270E</button>' +
        '<button class="inv-card-btn" data-inv-action="delete" data-inv-idx="' + idx + '" title="Delete">\u2715</button>' +
        '</div>' +
        '</div>';

      board.appendChild(card);
    });

    updateInvestigationStats();
  };

  /**
   * Load investigation cases from storage
   */
  function loadInvestigationCases() {
    try {
      var raw = localStorage.getItem(INVESTIGATION_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  /**
   * Save investigation cases to storage
   */
  function saveInvestigationCases(cases) {
    try {
      localStorage.setItem(INVESTIGATION_KEY, JSON.stringify(cases));
    } catch (e) {
      window.toast('Failed to save investigation data');
    }
    renderInvestigationBoard();
  }

  /**
   * Pin the current scan result to the investigation board
   */
  window.pinToInvestigation = function pinToInvestigation() {
    var r = window._lastResult;
    if (!r) {
      window.toast('No result to pin');
      return;
    }

    var cases = loadInvestigationCases();

    // Check if already pinned
    var existing = cases.findIndex(function(c) { return c.title === r.title; });
    if (existing >= 0) {
      window.toast('Already in investigation board');
      return;
    }

    var newCase = {
      title: r.title || 'Untitled',
      artist: r.artist || '',
      period: r.period || '',
      subjectType: r.subject_type || 'artwork',
      confidence: r.provenance_confidence || 0,
      events: Array.isArray(r.timeline) ? r.timeline : [],
      annotations: [],
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      notes: '',
      correlationFindings: null,
      researchResults: null
    };

    // Capture correlation findings from current session
    if (window.CorrelationEngine && window.CorrelationEngine.findings && window.CorrelationEngine.findings.length > 0) {
      newCase.correlationFindings = JSON.parse(JSON.stringify(window.CorrelationEngine.findings));
    }

    // Capture research results from current session
    if (window.TRACE_ResearchAgent && window.TRACE_ResearchAgent.lastResults) {
      newCase.researchResults = JSON.parse(JSON.stringify(window.TRACE_ResearchAgent.lastResults));
    }

    cases.unshift(newCase);
    saveInvestigationCases(cases);

    // Also add to existing trace_cases index for consistency
    if (typeof window.addCaseToIndex === 'function') {
      window.addCaseToIndex(r.title || 'Untitled', r.subject_type || 'artwork');
    }

    window.toast('Pinned to investigation board \u2713');
    renderInvestigationBoard();

    // Emit event
    if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
      TRACE_REGISTRY.emit('investigation:pinned', { title: r.title });
    }
  };

  /**
   * Open an investigation case detail view
   */
  window.openInvestigation = function openInvestigation(idx) {
    var cases = loadInvestigationCases();
    var c = cases[idx];
    if (!c) {
      window.toast('Case not found');
      return;
    }

    var detailPanel = document.getElementById('inv-detail');
    var boardPanel = document.getElementById('inv-board-panel');
    if (!detailPanel || !boardPanel) return;

    boardPanel.style.display = 'none';
    detailPanel.style.display = 'block';

    // Store case data for panel rendering
    window._currentInvestigationData = c;

    // Render annotation pins on the image
    var imageContainer = document.getElementById('inv-image-container');
    if (imageContainer) {
      imageContainer.innerHTML = '';
      if (window._lastResult && window._scanImageData) {
        var imgUrl = window._scanImageData.type === 'url' ? window._scanImageData.data :
          'data:' + (window._scanImageData.type || 'image/jpeg') + ';base64,' + window._scanImageData.data;
        var img = document.createElement('img');
        img.className = 'inv-detail-image';
        img.src = imgUrl;
        img.alt = c.title;
        imageContainer.appendChild(img);

        // Render existing annotation pins
        (c.annotations || []).forEach(function(ann) {
          addAnnotationPin(imageContainer, ann.x, ann.y, ann.label, ann.note, idx, ann.id);
        });
      } else {
        imageContainer.innerHTML = '<div class="inv-no-image">No image available</div>';
      }
    }

    // Fill detail fields
    var detailTitle = document.getElementById('inv-detail-title');
    var detailArtist = document.getElementById('inv-detail-artist');
    var detailNotes = document.getElementById('inv-detail-notes');
    var detailTimeline = document.getElementById('inv-detail-timeline');

    if (detailTitle) detailTitle.textContent = c.title;
    if (detailArtist) detailArtist.textContent = c.artist + (c.period ? ', ' + c.period : '');
    if (detailNotes) detailNotes.value = c.notes || '';

    if (detailTimeline && c.events) {
      detailTimeline.innerHTML = c.events.map(function(e) {
        return '<div class="inv-tl-event"><span class="inv-tl-year">' + window.esc(e.year) + '</span><span class="inv-tl-text">' + window.esc(e.event || '') + '</span></div>';
      }).join('');
    }

    // Render correlation findings panel
    renderCorrelationFindings(c);
    // Render research results panel
    renderResearchResults(c);
    // Render quick actions bar
    renderQuickActions(c);

    // Store current case index for save operations
    window._currentInvestigationIdx = idx;
  };

  /**
   * Add an annotation pin to the image
   */
  function addAnnotationPin(container, x, y, label, note, caseIdx, pinId) {
    var pin = document.createElement('div');
    pin.className = 'inv-pin';
    pin.style.left = x + '%';
    pin.style.top = y + '%';
    pin.dataset.pinId = pinId || 'pin-' + Date.now();
    pin.dataset.caseIdx = caseIdx;
    pin.title = label || 'Annotation';

    var dot = document.createElement('div');
    dot.className = 'inv-pin-dot';
    pin.appendChild(dot);

    var tooltip = document.createElement('div');
    tooltip.className = 'inv-pin-tooltip';
    tooltip.innerHTML = '<div class="inv-pin-label">' + window.esc(label || 'Annotation') + '</div>' +
      '<div class="inv-pin-note">' + window.esc(note || '') + '</div>' +
      '<button class="inv-pin-remove" data-pin-id="' + pin.dataset.pinId + '" data-case-idx="' + caseIdx + '">Remove</button>';
    pin.appendChild(tooltip);

    pin.addEventListener('click', function(e) {
      e.stopPropagation();
      var wasOpen = pin.classList.contains('inv-pin-open');
      document.querySelectorAll('.inv-pin-open').forEach(function(p) { p.classList.remove('inv-pin-open'); });
      if (!wasOpen) pin.classList.add('inv-pin-open');
    });

    container.appendChild(pin);
  }

  /**
   * Place an annotation pin at click position on the detail image
   */
  window.placeAnnotationPin = function placeAnnotationPin(e) {
    var container = document.getElementById('inv-image-container');
    var img = container ? container.querySelector('.inv-detail-image') : null;
    if (!img || !container) return;

    var caseIdx = window._currentInvestigationIdx;
    if (caseIdx === undefined || caseIdx === null) return;

    var rect = img.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 100;
    var y = ((e.clientY - rect.top) / rect.height) * 100;

    // Prompt for annotation label
    var label = prompt('Annotation label:', 'Point of interest');
    if (!label) return;

    var note = prompt('Annotation note (optional):', '');
    var pinId = 'pin-' + Date.now();

    // Add pin to UI
    addAnnotationPin(container, x, y, label, note || '', caseIdx, pinId);

    // Save annotation to case data
    var cases = loadInvestigationCases();
    var c = cases[caseIdx];
    if (c) {
      c.annotations = c.annotations || [];
      c.annotations.push({ id: pinId, x: x, y: y, label: label, note: note || '', createdAt: Date.now() });
      c.status = 'annotated';
      c.updatedAt = Date.now();
      saveInvestigationCases(cases);
      window.toast('Annotation added');
    }
  };

  /**
   * Remove an annotation pin
   */
  window.removeAnnotationPin = function removeAnnotationPin(pinId, caseIdx) {
    // Remove from UI
    var pin = document.querySelector('.inv-pin[data-pin-id="' + pinId + '"]');
    if (pin) pin.remove();

    // Remove from data
    var cases = loadInvestigationCases();
    var c = cases[caseIdx];
    if (c && c.annotations) {
      c.annotations = c.annotations.filter(function(a) { return a.id !== pinId; });
      c.updatedAt = Date.now();
      saveInvestigationCases(cases);
    }
  };

  /**
   * Save notes for the current investigation
   */
  window.saveInvestigationNotes = function saveInvestigationNotes() {
    var idx = window._currentInvestigationIdx;
    if (idx === undefined || idx === null) return;

    var notesEl = document.getElementById('inv-detail-notes');
    if (!notesEl) return;

    var cases = loadInvestigationCases();
    var c = cases[idx];
    if (c) {
      c.notes = notesEl.value;
      c.updatedAt = Date.now();
      saveInvestigationCases(cases);
      window.toast('Notes saved');
    }
  };

  /**
   * Close the investigation detail view
   */
  window.closeInvestigationDetail = function closeInvestigationDetail() {
    var detailPanel = document.getElementById('inv-detail');
    var boardPanel = document.getElementById('inv-board-panel');
    if (detailPanel) detailPanel.style.display = 'none';
    if (boardPanel) boardPanel.style.display = 'block';
    window._currentInvestigationIdx = null;
    window._currentInvestigationData = null;
    renderInvestigationBoard();
  };

  /**
   * Render correlation findings panel in detail view
   */
  function renderCorrelationFindings(c) {
    var container = document.getElementById('inv-correlation-panel');
    if (!container) return;

    if (!c.correlationFindings || c.correlationFindings.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    var findings = c.correlationFindings;
    var critical = findings.filter(function(f) { return f.severity === 'critical'; }).length;
    var warnings = findings.filter(function(f) { return f.severity === 'warning'; }).length;

    var html = '<div class="rdiv"></div><div class="rsec" style="display:flex;justify-content:space-between;align-items:center;">' +
      'Cross-Domain Findings' +
      '<span style="font-size:9px;color:var(--text-dim);">' + findings.length + ' finding' + (findings.length !== 1 ? 's' : '') + '</span></div>';

    findings.forEach(function(f) {
      var colorMap = { critical: '#C44848', warning: '#E8A020', info: 'var(--text-dim)' };
      var bgMap = { critical: 'rgba(196,72,72,0.06)', warning: 'rgba(232,160,32,0.06)', info: 'transparent' };
      var severityLabel = f.severity.toUpperCase();

      html += '<div class="inv-finding-item" style="border-left:2px solid ' + (colorMap[f.severity] || 'var(--text-dim)') + ';background:' + (bgMap[f.severity] || 'transparent') + ';padding:8px 10px;margin-bottom:6px;border-bottom:1px solid var(--border);">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;">' +
        '<span style="font-size:14px;flex-shrink:0;">' + (f.icon || '•') + '</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:10px;font-weight:600;color:' + (colorMap[f.severity] || 'var(--text)') + ';margin-bottom:2px;">' +
        '<span style="font-size:7px;letter-spacing:.1em;padding:1px 4px;border:1px solid ' + (colorMap[f.severity] || 'var(--text-dim)') + ';border-radius:2px;margin-right:6px;">' + window.esc(severityLabel) + '</span>' +
        window.esc(f.title) + '</div>' +
        '<div style="font-size:10px;color:var(--text-dim);line-height:1.5;">' + window.esc(f.description) + '</div>' +
        (f.recommendation ? '<div style="font-size:9px;color:var(--text-ghost);margin-top:3px;font-style:italic;">→ ' + window.esc(f.recommendation) + '</div>' : '') +
        '</div></div></div>';
    });

    container.innerHTML = html;
  }

  /**
   * Render research results panel in detail view
   */
  function renderResearchResults(c) {
    var container = document.getElementById('inv-research-panel');
    if (!container) return;

    if (!c.researchResults || !c.researchResults.hypotheses || c.researchResults.hypotheses.length === 0) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    var results = c.researchResults;
    var hypotheses = results.hypotheses || [];

    var html = '<div class="rdiv"></div><div class="rsec" style="display:flex;justify-content:space-between;align-items:center;">' +
      'AI Research Hypotheses' +
      '<span style="font-size:9px;color:var(--text-dim);">' + hypotheses.length + ' · Score: ' + (results.summary ? results.summary.averageConfidence : '?') + '%</span></div>';

    hypotheses.forEach(function(h, i) {
      var confColors = { high: 'var(--green-lt)', medium: '#E8A020', low: 'var(--text-dim)' };
      html += '<div class="inv-hypothesis-item" style="padding:8px 10px;margin-bottom:6px;border:1px solid var(--border);background:var(--surface);">' +
        '<div style="display:flex;align-items:flex-start;gap:8px;">' +
        '<span style="width:18px;height:18px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:9px;color:var(--gold);flex-shrink:0;font-weight:600;">' + (i + 1) + '</span>' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:10px;font-weight:600;color:var(--text);margin-bottom:2px;">' + window.esc(h.hypothesis) + '</div>' +
        '<div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap;">' +
        '<span style="font-size:7px;padding:1px 5px;border:1px solid ' + (confColors[h.confidence] || 'var(--text-dim)') + ';color:' + (confColors[h.confidence] || 'var(--text-dim)') + ';border-radius:2px;">' + (h.confidence || 'medium').toUpperCase() + '</span>' +
        (h.estimated_effort ? '<span style="font-size:7px;color:var(--text-ghost);padding:1px 5px;">' + window.esc(h.estimated_effort) + '</span>' : '') +
        '</div>' +
        (h.rationale ? '<div style="font-size:9px;color:var(--text-dim);line-height:1.5;">' + window.esc(h.rationale) + '</div>' : '') +
        (h.next_steps && h.next_steps.length > 0 ? '<div style="font-size:8px;color:var(--text-ghost);margin-top:4px;">Next: ' + h.next_steps.slice(0, 2).map(function(ns) { return window.esc(ns); }).join(' · ') + '</div>' : '') +
        '</div></div></div>';
    });

    container.innerHTML = html;
  }

  /**
   * Render quick actions bar in detail view
   */
  function renderQuickActions(c) {
    var container = document.getElementById('inv-quick-actions');
    if (!container) return;

    var html = '<div class="rdiv"></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;padding:4px 0;">' +
      '<button class="btn-outline-xxs" data-inv-action="rerun-correlation" title="Re-run cross-domain correlation using current analysis">⚡ Re-check Correlation</button>' +
      '<button class="btn-outline-xxs" data-inv-action="rerun-research" title="Run AI research agent on this case">🔬 Run AI Research</button>' +
      '<button class="btn-outline-xxs" data-inv-action="open-kg" title="Open knowledge graph for this case">◈ Knowledge Graph</button>' +
      '<button class="btn-outline-xxs" data-inv-action="export-trace" title="Export as .trace investigation file">📄 Export .trace</button>' +
      '</div>';

    container.innerHTML = html;
  }

  /**
   * Attach current session's correlation findings and research results to an open case
   */
  window.attachCurrentFindings = function attachCurrentFindings() {
    var idx = window._currentInvestigationIdx;
    if (idx === undefined || idx === null) {
      window.toast('Open an investigation case first');
      return;
    }

    var cases = loadInvestigationCases();
    var c = cases[idx];
    if (!c) { window.toast('Case not found'); return; }

    var attached = false;

    // Attach correlation findings
    if (window.CorrelationEngine && window.CorrelationEngine.findings && window.CorrelationEngine.findings.length > 0) {
      c.correlationFindings = JSON.parse(JSON.stringify(window.CorrelationEngine.findings));
      attached = true;
    }

    // Attach research results
    if (window.TRACE_ResearchAgent && window.TRACE_ResearchAgent.lastResults) {
      c.researchResults = JSON.parse(JSON.stringify(window.TRACE_ResearchAgent.lastResults));
      attached = true;
    }

    if (attached) {
      c.updatedAt = Date.now();
      saveInvestigationCases(cases);
      // Re-render detail panels
      renderCorrelationFindings(c);
      renderResearchResults(c);
      window.toast('Current findings attached to case ✓');
    } else {
      window.toast('No correlation findings or research results in current session to attach');
    }
  };

  /**
   * Delete an investigation case
   */
  window.deleteInvestigation = function deleteInvestigation(idx) {
    if (!confirm('Delete this investigation case?')) return;
    var cases = loadInvestigationCases();
    cases.splice(idx, 1);
    saveInvestigationCases(cases);
    window.toast('Investigation deleted');
  };

  /**
   * Update stats on the investigation screen
   */
  function updateInvestigationStats() {
    var cases = loadInvestigationCases();
    var totalEl = document.getElementById('inv-total');
    var activeEl = document.getElementById('inv-active');
    var pinnedEl = document.getElementById('inv-pinned');
    var annotationEl = document.getElementById('inv-annotations');

    if (totalEl) totalEl.textContent = cases.length;
    if (activeEl) activeEl.textContent = cases.filter(function(c) { return c.status === 'active'; }).length;
    if (pinnedEl) pinnedEl.textContent = cases.filter(function(c) { return c.annotations && c.annotations.length > 0; }).length;
    if (annotationEl) {
      var totalPins = cases.reduce(function(acc, c) { return acc + (c.annotations ? c.annotations.length : 0); }, 0);
      annotationEl.textContent = totalPins;
    }
  }

  /**
   * Import existing cases from the trace_cases index on first load
   */
  function importExistingCases() {
    try {
      var raw = localStorage.getItem(INVESTIGATION_KEY);
      if (raw) return; // Already has data, don't re-import

      // Import from existing trace_cases
      if (typeof window.getSavedCases === 'function') {
        var existing = window.getSavedCases();
        if (existing && existing.length > 0) {
          var imported = existing.map(function(c) {
            var tl = (window._timelines && window._timelines[c.title]) || {};
            return {
              title: c.title || 'Untitled',
              artist: tl.artist || '',
              period: tl.period || '',
              subjectType: c.type || 'artwork',
              confidence: tl.confidence || 50,
              events: Array.isArray(tl.events) ? tl.events : [],
              annotations: [],
              status: 'active',
              createdAt: c.addedAt || Date.now(),
              updatedAt: Date.now(),
              notes: ''
            };
          });
          if (imported.length > 0) {
            localStorage.setItem(INVESTIGATION_KEY, JSON.stringify(imported));
            console.log('[TRACE Investigation] Imported ' + imported.length + ' existing cases');
          }
        }
      }
    } catch(e) {
      window.TRACE_WATCHDOG && window.TRACE_WATCHDOG.warn('[Investigation] Import failed:', e);
    }
  }

  /**
   * Export investigation data as JSON
   */
  window.exportInvestigation = function exportInvestigation() {
    var idx = window._currentInvestigationIdx;
    if (idx === undefined || idx === null) {
      // Export all
      var cases = loadInvestigationCases();
      if (cases.length === 0) {
        window.toast('No investigations to export');
        return;
      }
      var blob = new Blob([JSON.stringify(cases, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'trace-investigations-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      window.toast('Exported ' + cases.length + ' investigations');
      return;
    }

    // Export single case
    var cases = loadInvestigationCases();
    var c = cases[idx];
    if (!c) { window.toast('Case not found'); return; }

    // Build enriched .trace format with metadata
    var traceExport = {
      format: 'trace-investigation-v1',
      generatedAt: new Date().toISOString(),
      generatedBy: 'TRACE Art Intelligence',
      case: {
        title: c.title,
        artist: c.artist,
        period: c.period,
        subjectType: c.subjectType,
        confidence: c.confidence,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        notes: c.notes || '',
        events: Array.isArray(c.events) ? c.events : [],
        annotations: c.annotations || []
      },
      evidence: {
        correlationFindings: c.correlationFindings || null,
        researchResults: c.researchResults || null
      },
      _metadata: {
        formatVersion: '1.0',
        description: 'TRACE investigation case file — includes analysis, provenance, correlation findings, and AI research results'
      }
    };

    var blob = new Blob([JSON.stringify(traceExport, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (c.title || 'case').replace(/[^a-zA-Z0-9]/g, '_') + '.trace.json';
    a.click();
    URL.revokeObjectURL(url);
    window.toast('Exported: ' + c.title + ' (.trace)');
  };

  // ── Wire up delegation for investigation screen events ──
  function wireDelegation() {
    var screen = document.getElementById('s-investigation');
    if (!screen || screen._invBound) return;
    screen._invBound = true;

    // Board actions
    screen.addEventListener('click', function(e) {
      var actionBtn = e.target.closest('[data-inv-action]');
      if (!actionBtn) return;

      var action = actionBtn.dataset.invAction;
      var idx = parseInt(actionBtn.dataset.invIdx, 10);

      switch (action) {
        case 'go-scan':
          window.nav('scan');
          break;
        case 'open':
          window.openInvestigation(idx);
          break;
        case 'annotate':
          window.openInvestigation(idx);
          setTimeout(function() {
            var container = document.getElementById('inv-image-container');
            if (container) {
              container.style.cursor = 'crosshair';
              container.addEventListener('click', function handler(ev) {
                container.style.cursor = '';
                container.removeEventListener('click', handler);
                window.placeAnnotationPin(ev);
              }, { once: true });
            }
          }, 300);
          break;
        case 'delete':
          window.deleteInvestigation(idx);
          break;
        case 'pin-result':
          window.pinToInvestigation();
          break;
        case 'save-notes':
          window.saveInvestigationNotes();
          break;
        case 'back':
          window.closeInvestigationDetail();
          break;
        case 'export':
          window.exportInvestigation();
          break;
        case 'rerun-correlation':
          var r = window._lastResult;
          if (r && typeof window.runProvenanceCheck === 'function') {
            window.nav('scan');
            window.runProvenanceCheck();
            window.toast('Run provenance check, then use Attach Current to link findings');
          } else {
            window.toast('Scan an artwork first to re-run correlation');
          }
          break;
        case 'rerun-research':
          if (typeof window.TRACE_ResearchAgent !== 'undefined') {
            window.toast('Opening research agent — investigate, then use Attach Current to link');
            window.TRACE_ResearchAgent.autoInvestigate();
          } else {
            window.toast('Research agent not available');
          }
          break;
        case 'open-kg':
          var c = window._currentInvestigationData;
          if (c && typeof window.KNOWLEDGE !== 'undefined') {
            window.KNOWLEDGE.loadFromServer(c.title, c.artist, c.events || []);
            window.nav('knowledge');
          } else {
            window.toast('No case data for knowledge graph');
          }
          break;
        case 'export-trace':
          window.exportInvestigation();
          break;
        case 'attach-findings':
          window.attachCurrentFindings();
          break;
      }
    });

    // Annotation pin removal delegation
    screen.addEventListener('click', function(e) {
      var removeBtn = e.target.closest('.inv-pin-remove');
      if (!removeBtn) return;
      e.stopPropagation();
      var pinId = removeBtn.dataset.pinId;
      var caseIdx = parseInt(removeBtn.dataset.caseIdx, 10);
      window.removeAnnotationPin(pinId, caseIdx);
    });
  }

  // ── Initialize on nav to investigation screen ──
  document.addEventListener('nav:changed', function(e) {
    if (e.detail && e.detail.screen === 'investigation') {
      window.renderInvestigationBoard();
      // Reset to board view
      var detailPanel = document.getElementById('inv-detail');
      var boardPanel = document.getElementById('inv-board-panel');
      if (detailPanel) detailPanel.style.display = 'none';
      if (boardPanel) boardPanel.style.display = 'block';
    }
  });

  // ── Auto-init when the module loads ──
    function init() {
    importExistingCases();
    wireDelegation();
    console.log('[TRACE Investigation] Loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('investigation', {
      version: '2.0.0',
      dependsOn: ['utils', 'persistence', 'nav']
    });
  }

  // Expose for testing
  window.TRACE_INVESTIGATION = {
    loadCases: loadInvestigationCases,
    saveCases: saveInvestigationCases,
  };

})();
