// ══════════════════════════════════════════════
// TRACE — Cross-Domain Correlation Engine
// Connects dots across AI analysis, provenance DBs,
// stolen-art databases, and timeline data to surface
// discoveries no single source could reveal.
// ══════════════════════════════════════════════

(function() {
  'use strict';

  // ── Correlation Rule Registry ──
  // Each rule receives (result, provenanceData) and returns
  // an array of findings. Empty array = no finding.

  var RULES = [];

  // ── Finding Severity Levels ──
  var SEVERITY = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' };

  // ── Helper: extract events from result ──
  function getTimeline(result) {
    return (result && result.timeline) || [];
  }

  // ── Helper: check if timeline has a gap in a range ──
  function hasGapInRange(timeline, start, end) {
    if (!timeline || timeline.length < 2) return false;
    var years = [];
    timeline.forEach(function(ev) {
      var y = parseInt(ev.year, 10);
      if (!isNaN(y)) years.push(y);
    });
    if (years.length < 2) return false;
    years.sort(function(a, b) { return a - b; });
    for (var i = 1; i < years.length; i++) {
      // Check for gap >= 5 years within the range
      if (years[i] - years[i - 1] >= 5) {
        // Check if the gap overlaps the range
        if (years[i - 1] <= end && years[i] >= start) return true;
      }
    }
    // Also check if the range is before the first or after the last event
    if (start < years[0] && years[0] - start >= 5) return true;
    if (end > years[years.length - 1] && end - years[years.length - 1] >= 5) return true;
    return false;
  }

  // ── Helper: get artist nationality from ULAN results ──
  function getArtistNationality(provenanceData) {
    if (!provenanceData || !provenanceData.databases) return null;
    var artists = provenanceData.databases.getty && provenanceData.databases.getty.artist;
    if (!artists || artists.length === 0) return null;
    var nationalities = {};
    artists.forEach(function(a) {
      if (a.nationality) {
        nationalities[a.nationality] = (nationalities[a.nationality] || 0) + 1;
      }
    });
    var best = null, bestCount = 0;
    Object.keys(nationalities).forEach(function(n) {
      if (nationalities[n] > bestCount) {
        best = n;
        bestCount = nationalities[n];
      }
    });
    return best;
  }

  // ── Helper: get all database check results ──
  function getDB(provenanceData, key) {
    if (!provenanceData || !provenanceData.databases) return null;
    return provenanceData.databases[key] || null;
  }

  // ── Helper: check if any database found alerts ──
  function hasAnyAlert(provenanceData) {
    if (!provenanceData) return false;
    return !!(provenanceData.hasAlerts || (provenanceData.summary && provenanceData.summary.alerts > 0));
  }

  // ── Helper: get real/total API count ──
  function getRealApiCount(provenanceData) {
    if (!provenanceData || !provenanceData.apis) return { real: 0, total: 0 };
    var apis = provenanceData.apis;
    var keys = Object.keys(apis);
    var real = keys.filter(function(k) { return apis[k] && apis[k].real; }).length;
    return { real: real, total: keys.length };
  }

  // ── RULE 1: WWII Provenance Gap ──
  // If the artwork is European pre-1945 and timeline has a gap during 1933-1945
  RULES.push({
    id: 'wwii-gap',
    name: 'WWII Provenance Gap',
    description: 'Checks for ownership gaps during the Nazi era (1933-1945) that may require further investigation',
    run: function(result, provenanceData) {
      var timeline = getTimeline(result);
      if (timeline.length < 2) return [];

      var period = (result && result.period || '').toLowerCase();
      // Check if artwork is likely European and pre-1945
      var isEuropean = /europ|dutch|french|italian|german|spanish|british|flemish|austrian/.test(period);
      if (!isEuropean) return [];

      var hasGap = hasGapInRange(timeline, 1933, 1945);
      if (!hasGap) return [];

      // Check if AAMD already flagged it
      var aamd = getDB(provenanceData, 'aamd');
      if (aamd && aamd.flagged) return []; // Already flagged by AAMD

      return [{
        id: 'wwii-gap',
        severity: SEVERITY.WARNING,
        category: 'provenance',
        title: 'Potential WWII-era provenance gap',
        description: 'The timeline has a gap during the 1933-1945 period. This artwork may have changed ownership during the Nazi era.',
        recommendation: 'Cross-reference with AAMD Nazi-Era Provenance Project and consult Washington Conference Principles.',
        sources: ['AAMD Nazi-Era Project', 'Washington Conference Principles'],
        actionable: true,
        icon: '⚔️'
      }];
    }
  });

  // ── RULE 2: Stolen Database Match + Style Overlap ──
  // INTERPOL or ALR match AND the artwork style/period matches the stolen work
  RULES.push({
    id: 'stolen-style-match',
    name: 'Stolen Database Match with Style Overlap',
    description: 'Detects when a stolen database match has stylistic or period overlap with the analysed artwork',
    run: function(result, provenanceData) {
      var interpol = getDB(provenanceData, 'interpol');
      var alr = getDB(provenanceData, 'alr');

      var matchedDBs = [];
      var details = [];

      if (interpol && interpol.matched) {
        matchedDBs.push('INTERPOL');
        details.push(interpol.detail || '');
      }
      if (alr && alr.matched) {
        matchedDBs.push('Art Loss Register');
        details.push(alr.detail || '');
      }

      if (matchedDBs.length === 0) return [];

      var period = (result && result.period || '').toLowerCase();
      var artist = (result && result.artist || '').toLowerCase();

      // Check if the matched database detail mentions similar period/artist
      var periodOverlap = false;
      var artistOverlap = false;
      details.forEach(function(d) {
        var dl = (d || '').toLowerCase();
        if (period && dl.indexOf(period) >= 0) periodOverlap = true;
        if (artist && artist.length > 3 && dl.indexOf(artist) >= 0) artistOverlap = true;
      });

      var severity = (artistOverlap || periodOverlap) ? SEVERITY.CRITICAL : SEVERITY.WARNING;
      var confidenceLabel = (artistOverlap || periodOverlap) ? 'high overlap' : 'general match';

      return [{
        id: 'stolen-style-match',
        severity: severity,
        category: 'cross-reference',
        title: 'Stolen database match — ' + matchedDBs.join(' + '),
        description: 'This artwork matches ' + matchedDBs.length + ' stolen art database' +
          (matchedDBs.length > 1 ? 's' : '') + ' (' + matchedDBs.join(', ') + '). ' +
          (artistOverlap ? 'The artist name overlaps with the stolen record. ' : '') +
          (periodOverlap ? 'The period matches the stolen record. ' : '') +
          'Further verification is strongly recommended.',
        recommendation: 'Contact the relevant authorities with the reference numbers. Request provenance documentation from the seller.',
        sources: matchedDBs,
        actionable: true,
        icon: '🚨'
      }];
    }
  });

  // ── RULE 3: High Confidence + No Provenance Records ──
  // AI is very confident but GPI returns zero results
  RULES.push({
    id: 'high-conf-no-provenance',
    name: 'High Confidence with No Provenance Records',
    description: 'Flags when AI analysis is highly confident but no provenance records exist in the Getty Provenance Index',
    run: function(result, provenanceData) {
      if (!result || !provenanceData) return [];
      var conf = result.provenance_confidence || 0;
      if (conf < 70) return [];

      var gpi = provenanceData.databases && provenanceData.databases.getty &&
        provenanceData.databases.getty.provenance;
      if (gpi && gpi.length > 0) return [];

      return [{
        id: 'high-conf-no-provenance',
        severity: SEVERITY.WARNING,
        category: 'attribution',
        title: 'High attribution confidence but no provenance records',
        description: 'The AI analysis is ' + conf + '% confident in the attribution, but the Getty Provenance Index returned no matching records. This could indicate a newly discovered work or a potential attribution issue.',
        recommendation: 'Search auction house archives and museum catalogs. Consider consulting a specialist in ' + (result.period || 'this period') + '.',
        sources: ['Getty Provenance Index', 'AI Analysis'],
        actionable: true,
        icon: '🔍'
      }];
    }
  });

  // ── RULE 4: Multiple Database Alerts ──
  // Flagged in 2+ databases simultaneously
  RULES.push({
    id: 'multiple-alerts',
    name: 'Multiple Database Alerts',
    description: 'Triggers when the artwork is flagged in more than one stolen-art or provenance database',
    run: function(result, provenanceData) {
      var alerts = [];
      var interpol = getDB(provenanceData, 'interpol');
      var alr = getDB(provenanceData, 'alr');
      var aamd = getDB(provenanceData, 'aamd');

      if (interpol && interpol.matched) alerts.push('INTERPOL');
      if (alr && alr.matched) alerts.push('Art Loss Register');
      if (aamd && aamd.flagged) alerts.push('AAMD Nazi-Era Project');

      if (alerts.length < 2) return [];

      return [{
        id: 'multiple-alerts',
        severity: alerts.length >= 3 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        category: 'cross-reference',
        title: 'Flagged in ' + alerts.length + ' databases',
        description: 'This artwork is flagged in multiple independent databases: ' + alerts.join(', ') +
          '. Multiple independent flags significantly increase the risk profile.',
        recommendation: 'Priority investigation recommended. Contact a provenance research specialist and consult legal counsel before any transaction.',
        sources: alerts,
        actionable: true,
        icon: '⚠️'
      }];
    }
  });

  // ── RULE 5: Timeline Gap Clusters ──
  // Multiple timeline gaps within a short period suggesting turbulent ownership
  RULES.push({
    id: 'gap-clusters',
    name: 'Provenance Gap Cluster',
    description: 'Detects clusters of ownership gaps that may indicate periods of instability or undocumented transfers',
    run: function(result, provenanceData) {
      var timeline = getTimeline(result);
      if (timeline.length < 3) return [];

      var gaps = [];
      var prevYear = null;
      timeline.forEach(function(ev) {
        var y = parseInt(ev.year, 10);
        if (!isNaN(y)) {
          if (prevYear !== null && y - prevYear >= 10) {
            gaps.push({ from: prevYear, to: y, years: y - prevYear });
          }
          prevYear = y;
        }
      });

      if (gaps.length < 2) return [];

      // Check if gaps cluster within 50 years
      var clustered = false;
      for (var i = 0; i < gaps.length - 1; i++) {
        if (gaps[i + 1].from - gaps[i].to <= 50) {
          clustered = true;
          break;
        }
      }

      if (!clustered) return [];

      return [{
        id: 'gap-clusters',
        severity: SEVERITY.WARNING,
        category: 'provenance',
        title: gaps.length + ' provenance gaps detected',
        description: 'The timeline has ' + gaps.length + ' gaps of 10+ years. Multiple gaps in the ownership record may indicate undocumented transfers or lost records.',
        recommendation: 'Focus research on the gap periods. Check local registry offices, notarial archives, and family records for the missing years.',
        sources: ['Timeline Analysis'],
        actionable: true,
        icon: '📋'
      }];
    }
  });

  // ── RULE 6: Nationality vs Period Mismatch ──
  // ULAN shows artist from one region but the period/style suggest different origin
  RULES.push({
    id: 'nationality-mismatch',
    name: 'Artist Nationality vs Period Mismatch',
    description: 'Detects when the artwork\'s period or style suggests a region different from the artist\'s known nationality',
    run: function(result, provenanceData) {
      if (!result || !provenanceData) return [];

      var nationality = getArtistNationality(provenanceData);
      if (!nationality) return [];

      var period = (result.period || '').toLowerCase();
      var artist = (result.artist || '').toLowerCase();
      var nl = nationality.toLowerCase();

      // If artist is known from a specific school, check for contradictions
      var regionClues = [];
      if (/dutch|netherland|flemish/.test(nl)) regionClues.push('Dutch/Flemish');
      if (/french/.test(nl)) regionClues.push('French');
      if (/italian/.test(nl)) regionClues.push('Italian');
      if (/spanish/.test(nl)) regionClues.push('Spanish');
      if (/german|austrian/.test(nl)) regionClues.push('Germanic');
      if (/british|english|scottish/.test(nl)) regionClues.push('British');
      if (/american/.test(nl)) regionClues.push('American');
      if (/japanese|chinese|korean|asian/.test(nl)) regionClues.push('East Asian');

      // Check if period mentions a different school
      var mismatch = false;
      var suggestion = '';
      if (/flemish/.test(period) && !/flemish|dutch|netherland/.test(nl)) {
        mismatch = true;
        suggestion = 'The artwork period suggests Flemish school, but ULAN lists the artist as ' + nationality + '.';
      }
      if (/italian/.test(period) && !/italian/.test(nl)) {
        mismatch = true;
        suggestion = 'The artwork period suggests Italian school, but ULAN lists the artist as ' + nationality + '.';
      }
      if (/spanish/.test(period) && !/spanish/.test(nl)) {
        mismatch = true;
        suggestion = 'The artwork period suggests Spanish school, but ULAN lists the artist as ' + nationality + '.';
      }

      if (!mismatch) return [];

      return [{
        id: 'nationality-mismatch',
        severity: SEVERITY.WARNING,
        category: 'attribution',
        title: 'Artist nationality vs period suggestion',
        description: suggestion + ' This may indicate the artwork is from a different artistic tradition than the artist\'s known nationality.',
        recommendation: 'Compare with known works from the suggested school. Consider cross-referencing with local museum collections.',
        sources: ['Getty ULAN', 'AI Analysis'],
        actionable: true,
        icon: '🎨'
      }];
    }
  });

  // ── RULE 7: Low Provenance Confidence + No External Matches ──
  // AI is uncertain and no databases confirm the attribution
  RULES.push({
    id: 'low-conf-no-matches',
    name: 'Uncertain Attribution with No External Confirmation',
    description: 'Flags when AI confidence is low and no external database corroborates the attribution',
    run: function(result, provenanceData) {
      if (!result) return [];
      var conf = result.provenance_confidence || 50;
      if (conf >= 50) return [];

      var ulan = provenanceData && provenanceData.databases && provenanceData.databases.getty &&
        provenanceData.databases.getty.artist;
      var hasUlan = ulan && ulan.length > 0;

      var gpi = provenanceData && provenanceData.databases && provenanceData.databases.getty &&
        provenanceData.databases.getty.provenance;
      var hasGpi = gpi && gpi.length > 0;

      if (hasUlan || hasGpi) return [];

      return [{
        id: 'low-conf-no-matches',
        severity: SEVERITY.WARNING,
        category: 'attribution',
        title: 'Uncertain attribution — no external corroboration',
        description: 'The AI analysis has low confidence (' + conf + '%) and no matching records were found in Getty ULAN or the Getty Provenance Index.',
        recommendation: 'Consider a second opinion from a specialist. Upload additional images (details, back, signature) for re-analysis.',
        sources: ['AI Analysis', 'Getty ULAN', 'Getty Provenance Index'],
        actionable: true,
        icon: '❓'
      }];
    }
  });

  // ── RULE 8: Valuation Anomaly ──
  // High-value period estimate but low confidence, or vice versa
  RULES.push({
    id: 'valuation-anomaly',
    name: 'Valuation vs Confidence Anomaly',
    description: 'Detects when the estimated value range seems inconsistent with the provenance confidence level',
    run: function(result, provenanceData) {
      if (!result) return [];
      var conf = result.provenance_confidence || 50;
      var period = (result.period || '').toLowerCase();

      // Estimate a rough value expectation based on period
      var expectedValue = 0;
      var highValuePeriod = false;
      if (/14|15|16/.test(period)) { expectedValue = 100000; highValuePeriod = true; }
      else if (/17/.test(period)) { expectedValue = 50000; highValuePeriod = true; }
      else if (/18/.test(period)) { expectedValue = 20000; }
      else if (/19/.test(period)) { expectedValue = 5000; }

      if (!highValuePeriod) return [];

      // If high-value period but low confidence
      if (expectedValue >= 50000 && conf < 40) {
        return [{
          id: 'valuation-anomaly',
          severity: SEVERITY.WARNING,
          category: 'valuation',
          title: 'High-value period with low attribution confidence',
          description: 'The artwork appears to be from a high-value period (' + result.period + '), but the provenance confidence is only ' + conf + '%. This discrepancy warrants careful due diligence before any valuation.',
          recommendation: 'Obtain a formal appraisal from an accredited specialist. Request provenance documentation and exhibition history.',
          sources: ['AI Analysis', 'Valuation Engine'],
          actionable: true,
          icon: '💰'
        }];
      }

      return [];
    }
  });

  // ── RULE 9: AI Provider Detected Style vs Period ──
  // AI mentions specific artistic movement but period seems misaligned
  RULES.push({
    id: 'movement-period-mismatch',
    name: 'Art Movement vs Period Alignment',
    description: 'Checks whether the detected artistic movement aligns with the stated period',
    run: function(result, provenanceData) {
      if (!result) return [];
      var movement = (result.movement || '').toLowerCase();
      var period = (result.period || '').toLowerCase();

      if (!movement || !period) return [];

      var mismatches = {
        'impressionism': ['18', '19'],
        'post-impressionism': ['19', '20'],
        'cubism': ['20'],
        'surrealism': ['20'],
        'expressionism': ['19', '20'],
        'abstract expressionism': ['20', '21'],
        'baroque': ['16', '17', '18'],
        'renaissance': ['14', '15', '16'],
        'rococo': ['18'],
        'romanticism': ['18', '19'],
        'neoclassical': ['18', '19'],
        'gothic': ['12', '13', '14', '15'],
        'modernism': ['19', '20', '21'],
        'contemporary': ['20', '21'],
        'minimalism': ['20', '21'],
        'pop art': ['20'],
        'art deco': ['20'],
        'art nouveau': ['19', '20']
      };

      var expectedPeriods = mismatches[movement];
      if (!expectedPeriods) return [];

      var matchesPeriod = expectedPeriods.some(function(ep) {
        return period.indexOf(ep) >= 0;
      });

      if (matchesPeriod) return [];

      return [{
        id: 'movement-period-mismatch',
        severity: SEVERITY.INFO,
        category: 'attribution',
        title: 'Art movement and period may not align',
        description: 'The identified movement "' + (result.movement || '') + '" typically aligns with ' +
          expectedPeriods.map(function(p) { return p + 'th century'; }).join(', ') +
          ', but the artwork period is listed as ' + result.period + '.',
        recommendation: 'This may be correct for later/earlier works within the movement, but verify with movement-specific reference materials.',
        sources: ['AI Analysis'],
        actionable: false,
        icon: '🖼️'
      }];
    }
  });

  // ── RULE 10: MOCK API Dependency ──
  // Most databases are running in mock mode
  // Only fires once per session to avoid repeated annoyance
  var _mockFindingShown = false;
  RULES.push({
    id: 'mock-dependency',
    name: 'Simulated Database Results',
    description: 'Notifies when many database checks are using simulated data rather than live APIs',
    run: function(result, provenanceData) {
      if (_mockFindingShown) return [];
      if (!provenanceData) return [];

      var apiInfo = getRealApiCount(provenanceData);
      var mockCount = apiInfo.total - apiInfo.real;

      if (mockCount === 0) return []; // All real, no finding needed

      if (mockCount >= 3) {
        _mockFindingShown = true;
        return [{
          id: 'mock-dependency',
          severity: SEVERITY.INFO,
          category: 'system',
          title: mockCount + ' of ' + apiInfo.total + ' databases using simulated data',
          description: 'The provenance check used simulated data for ' + mockCount + ' of ' + apiInfo.total +
            ' databases. Results should be treated as indicative only until real API access is configured.',
          recommendation: 'Set up INTERPOL API key and Art Loss Register subscription for live data.',
          sources: ['System'],
          actionable: true,
          icon: '🔧'
        }];
      }

      return [];
    }
  });

  // ── Main Correlation Function ──
  // Runs all rules against the result + provenance data
  // Returns findings sorted by severity (critical first)

  window.CorrelationEngine = {
    findings: [],

    /**
     * Run correlation analysis
     * @param {Object} result - AI analysis result (window._lastResult)
     * @param {Object} provenanceData - Cross-reference API response
     * @returns {Array} Sorted findings
     */
    run: function(result, provenanceData) {
      if (!result) return [];

      var allFindings = [];
      var seenIds = {};

      RULES.forEach(function(rule) {
        try {
          var findings = rule.run(result, provenanceData) || [];
          findings.forEach(function(f) {
            // Deduplicate by ID
            if (!seenIds[f.id]) {
              seenIds[f.id] = true;
              allFindings.push(f);
            }
          });
        } catch (e) {
          console.warn('[Correlation] Rule "' + rule.id + '" failed:', e);
        }
      });

      // Sort: critical first, then warning, then info
      var severityOrder = { critical: 0, warning: 1, info: 2 };
      allFindings.sort(function(a, b) {
        return (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9);
      });

      this.findings = allFindings;

      // Emit correlation:complete event
      if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
        TRACE_REGISTRY.emit('correlation:complete', {
          findings: allFindings,
          count: allFindings.length,
          criticalCount: allFindings.filter(function(f) { return f.severity === 'critical'; }).length,
          warningCount: allFindings.filter(function(f) { return f.severity === 'warning'; }).length
        });
      }

      // Also store on the provenanceData for integration with investigation workspace
      if (provenanceData) {
        provenanceData._correlationFindings = allFindings;
      }

      return allFindings;
    },

    /**
     * Render correlation findings to a container element
     * @param {HTMLElement} container - DOM element to render into
     * @param {Array} findings - Array of finding objects
     */
    render: function(container, findings) {
      if (!container) return;

      if (!findings || findings.length === 0) {
        container.innerHTML = '' +
          '<div class="correlation-empty">' +
          '<div class="correlation-empty-icon">✓</div>' +
          '<div class="correlation-empty-text">No cross-domain correlations detected. All databases are in agreement.</div>' +
          '</div>';
        container.style.display = 'block';
        return;
      }

      var criticalCount = findings.filter(function(f) { return f.severity === 'critical'; }).length;
      var warningCount = findings.filter(function(f) { return f.severity === 'warning'; }).length;
      var infoCount = findings.filter(function(f) { return f.severity === 'info'; }).length;

      var severityLabel = criticalCount > 0 ? 'Critical' : (warningCount > 0 ? 'Warnings' : 'Info');
      var severityColor = criticalCount > 0 ? '#C44848' : (warningCount > 0 ? '#E8A020' : 'var(--text-dim)');

      var html = '' +
        '<div class="correlation-header">' +
        '<div class="correlation-title-row">' +
        '<span class="correlation-icon">⚡</span>' +
        '<span class="correlation-title">TRACE Cross-Domain Findings</span>' +
        '<span class="correlation-count" style="color:' + severityColor + ';">' + findings.length + '</span>' +
        '</div>' +
        '<div class="correlation-summary" style="color:' + severityColor + ';">' +
        severityLabel + ' — ' +
        (criticalCount > 0 ? criticalCount + ' critical, ' : '') +
        (warningCount > 0 ? warningCount + ' warning, ' : '') +
        infoCount + ' informational' +
        '</div>' +
        '</div>' +
        '<div class="correlation-list">';

      findings.forEach(function(f, i) {
        var colorMap = { critical: '#C44848', warning: '#E8A020', info: 'var(--text-dim)' };
        var bgMap = { critical: 'rgba(196,72,72,0.08)', warning: 'rgba(232,160,32,0.08)', info: 'transparent' };
        var borderMap = { critical: 'rgba(196,72,72,0.3)', warning: 'rgba(232,160,32,0.25)', info: 'var(--border)' };

        html += '' +
          '<div class="correlation-finding" style="border-left:2px solid ' + (colorMap[f.severity] || 'var(--text-dim)') + ';background:' + (bgMap[f.severity] || 'transparent') + ';border-bottom:1px solid ' + (borderMap[f.severity] || 'var(--border)') + ';">' +
          '<div class="finding-row">' +
          '<span class="finding-icon">' + (f.icon || '•') + '</span>' +
          '<div class="finding-body">' +
          '<div class="finding-title">' + window.esc(f.title) + '</div>' +
          '<div class="finding-desc">' + window.esc(f.description) + '</div>' +
          (f.recommendation ? '<div class="finding-recommendation"><span class="finding-rec-label">Recommendation:</span> ' + window.esc(f.recommendation) + '</div>' : '') +
          '<div class="finding-sources">' + f.sources.map(function(s) {
            return '<span class="finding-source">' + window.esc(s) + '</span>';
          }).join('') + '</div>' +
          (f.actionable ? '<button class="finding-action" data-finding-id="' + f.id + '" data-finding-severity="' + f.severity + '" title="Add to investigation notes">+ Add to case notes</button>' : '') +
          '</div>' +
          '</div>' +
          '</div>';
      });

      html += '</div>';
      container.innerHTML = html;
      container.style.display = 'block';
    },

    /**
     * Get findings summary as text for investigation notes
     */
    summaryText: function(findings) {
      if (!findings || !findings.length) return 'No cross-domain findings.';
      return findings.map(function(f, i) {
        return (i + 1) + '. [' + f.severity.toUpperCase() + '] ' + f.title + '\n   ' + f.description + (f.recommendation ? '\n   → ' + f.recommendation : '');
      }).join('\n\n');
    }
  };

  // ── Wire up actions via delegation ──
  document.addEventListener('click', function(e) {
    var actionBtn = e.target.closest('.finding-action');
    if (!actionBtn) return;

    var findingId = actionBtn.dataset.findingId;
    var severity = actionBtn.dataset.findingSeverity;
    var findings = window.CorrelationEngine.findings || [];
    var finding = findings.filter(function(f) { return f.id === findingId; })[0];

    if (!finding) return;

    // Add finding text to investigation notes if the detail view is open
    var notesEl = document.getElementById('inv-detail-notes');
    if (notesEl && window._currentInvestigationIdx !== undefined && window._currentInvestigationIdx !== null) {
      var prefix = '\n\n--- Cross-Domain Finding [' + finding.severity.toUpperCase() + '] ---\n' +
        finding.title + '\n' +
        finding.description + '\n' +
        (finding.recommendation ? '→ ' + finding.recommendation + '\n' : '') +
        'Sources: ' + (finding.sources || []).join(', ') + '\n';
      notesEl.value += prefix;
      if (typeof window.saveInvestigationNotes === 'function') {
        window.saveInvestigationNotes();
      }
      window.toast('Finding added to investigation notes ✓');
    } else {
      window.toast('Open an investigation case to save findings to notes');
    }
  });

  // ── Auto-run + auto-render after provenance check completes ──
  document.addEventListener('provenance:complete', function(e) {
    if (e.detail && e.detail.data) {
      var result = window._lastResult;
      if (result) {
        var findings = window.CorrelationEngine.run(result, e.detail.data);
        // Auto-render into the findings container
        var findingsContainer = document.getElementById('correlation-findings');
        if (findingsContainer) {
          window.CorrelationEngine.render(findingsContainer, findings);
        }
      }
    }
  });

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('correlation', {
      version: '1.0.0',
      dependsOn: ['utils', 'vision']
    });
  }

  console.log('[TRACE Correlation] Loaded (' + RULES.length + ' rules)');
})();
