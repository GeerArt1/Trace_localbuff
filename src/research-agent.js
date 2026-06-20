// ══════════════════════════════════════════════
// TRACE — AI Research Agent
// Multi-step provenance investigation engine
// Chains AI calls with correlation findings for
// deep-dive artwork research.
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var AGENT_VERSION = '2.0.0';

  // ── Research Agent ──────────────────────────
  window.TRACE_ResearchAgent = {
    isRunning: false,
    lastResults: null,
    _abortController: null,

    /**
     * Full investigation pipeline
     * @param {string} title - Artwork title
     * @param {Object} context - Analysis context (period, artist, medium, keywords)
     * @param {Array} correlationFindings - From CorrelationEngine
     * @returns {Promise<Object>} Research results
     */
    investigate: async function(title, context, correlationFindings) {
      if (this.isRunning) {
        window.toast('Research already in progress');
        return null;
      }

      // Abort any previous request
      if (this._abortController) this._abortController.abort();
      this._abortController = new AbortController();
      this.isRunning = true;

      try {
        // Phase 1: Generate hypotheses
        this._updateStatus('Generating research hypotheses…');
        var hypotheses = await this._generateHypotheses(title, context, correlationFindings);
        if (!hypotheses || hypotheses.length === 0) {
          throw new Error('No hypotheses could be generated');
        }

        // Phase 2: Deep-dive on top hypotheses (limit to 3 for speed)
        var topHypotheses = hypotheses.slice(0, 3);
        var deepDives = [];
        for (var i = 0; i < topHypotheses.length; i++) {
          this._updateStatus('Deep-diving hypothesis ' + (i + 1) + ' of ' + topHypotheses.length + '…');
          var dive = await this._deepDive(topHypotheses[i], title, context);
          deepDives.push(dive);
        }

        // Phase 3: Aggregate results
        var results = this._aggregate(topHypotheses, deepDives, correlationFindings);

        this.lastResults = results;
        this._render(results);

        // Emit event
        if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
          TRACE_REGISTRY.emit('research:complete', { results: results });
        }

        return results;

      } catch (e) {
        this._showError(e.message || 'Research failed');
        return null;
      } finally {
        this.isRunning = false;
        this._hideLoading();
      }
    },

    /**
     * Auto-investigate using current result + correlation findings
     */
    autoInvestigate: function() {
      var result = window._lastResult;
      if (!result) {
        window.toast('No analysis to research');
        return;
      }

      var correlationFindings = window.CorrelationEngine && window.CorrelationEngine.findings;
      var title = result.title || 'Unknown artwork';
      var context = {
        artist: result.artist || '',
        period: result.period || '',
        medium: result.medium || '',
        movement: result.movement || '',
        keywords: result.keywords || [],
        the_story: result.the_story || '',
      };

      // Switch to research screen
      window.nav('research');
      this._showLoading('Initializing AI Research Agent…');

      // Short delay for UI to render
      var self = this;
      setTimeout(function() {
        self.investigate(title, context, correlationFindings);
      }, 300);
    },

    // ── Phase 1: Generate Hypotheses ──
    _generateHypotheses: async function(title, context, correlationFindings) {
      var findingsContext = '';
      if (correlationFindings && correlationFindings.length > 0) {
        var critical = correlationFindings.filter(function(f) { return f.severity === 'critical'; });
        var warnings = correlationFindings.filter(function(f) { return f.severity === 'warning'; });
        if (critical.length > 0 || warnings.length > 0) {
          findingsContext = '\nCross-domain findings to investigate:\n' +
            (critical.length > 0 ? 'CRITICAL: ' + critical.map(function(f) { return f.title; }).join('; ') + '\n' : '') +
            (warnings.length > 0 ? 'WARNINGS: ' + warnings.map(function(f) { return f.title; }).join('; ') + '\n' : '');
        }
      }

      var systemPrompt = 'You are TRACE AI Research Agent — an investigative provenance researcher. ' +
        'Given an artwork and optional cross-domain findings, generate 3-5 specific, actionable investigation hypotheses. ' +
        'Each hypothesis should be a concrete angle to investigate, not generic advice. ' +
        'Respond ONLY with a valid JSON array. Each item: { "hypothesis": string, "confidence": "high"|"medium"|"low", ' +
        '"rationale": string, "sources": [string], "next_steps": [string] }. ' +
        'No markdown, no backticks. Return only the JSON array.';

      var userPrompt = 'Investigate the provenance of: "' + title + '"' +
        (context.artist ? '\nArtist: ' + context.artist : '') +
        (context.period ? '\nPeriod: ' + context.period : '') +
        (context.medium ? '\nMedium: ' + context.medium : '') +
        (context.movement ? '\nMovement: ' + context.movement : '') +
        (context.keywords && context.keywords.length > 0 ? '\nKeywords: ' + context.keywords.join(', ') : '') +
        findingsContext;

      var data = await this._callAI(systemPrompt, userPrompt, 1500);
      var raw = data.content ? data.content.map(function(b) { return b.text || ''; }).join('') : '[]';
      return this._parseJSON(raw) || [];
    },

    // ── Phase 2: Deep Dive ──
    _deepDive: async function(hypothesis, title, context) {
      var systemPrompt = 'You are TRACE Research Agent — deep-dive specialist. ' +
        'Given a specific investigation hypothesis, expand it with detailed supporting evidence, ' +
        'specific records or collections to search, named experts or institutions to consult, ' +
        'and a realistic assessment of how long the investigation would take. ' +
        'Respond ONLY with valid JSON: { "depth_analysis": string, "records_to_search": [string], ' +
        '"experts_to_consult": [string], "estimated_effort": string, "success_probability": "high"|"medium"|"low", ' +
        '"key_questions": [string] }. No markdown, no backticks.';

      var userPrompt = 'Deep-dive investigation hypothesis: "' + (hypothesis.hypothesis || '') + '"\n' +
        'Confidence: ' + (hypothesis.confidence || 'medium') + '\n' +
        'Rationale: ' + (hypothesis.rationale || '') + '\n' +
        'Artwork: ' + title + (context.artist ? ' by ' + context.artist : '');

      var data = await this._callAI(systemPrompt, userPrompt, 1200);
      var raw = data.content ? data.content.map(function(b) { return b.text || ''; }).join('') : '{}';
      return this._parseJSON(raw) || { depth_analysis: 'Analysis unavailable', records_to_search: [], experts_to_consult: [], estimated_effort: 'Unknown', success_probability: 'medium', key_questions: [] };
    },

    // ── Phase 3: Aggregate ──
    _aggregate: function(hypotheses, deepDives, correlationFindings) {
      var highConf = hypotheses.filter(function(h) { return h.confidence === 'high'; }).length;
      var totalConf = hypotheses.reduce(function(acc, h) {
        return acc + (h.confidence === 'high' ? 3 : h.confidence === 'medium' ? 2 : 1);
      }, 0);
      var avgConf = hypotheses.length > 0 ? Math.round((totalConf / (hypotheses.length * 3)) * 100) : 0;

      return {
        title: 'Research Investigation Report',
        generatedAt: new Date().toISOString(),
        summary: {
          totalHypotheses: hypotheses.length,
          highConfidenceCount: highConf,
          averageConfidence: avgConf,
          criticalFindingsInput: (correlationFindings || []).filter(function(f) { return f.severity === 'critical'; }).length,
        },
        hypotheses: hypotheses.map(function(h, i) {
          var dive = deepDives[i] || {};
          return {
            hypothesis: h.hypothesis,
            confidence: h.confidence,
            rationale: h.rationale,
            sources: h.sources || [],
            next_steps: h.next_steps || [],
            depth_analysis: dive.depth_analysis || '',
            records_to_search: dive.records_to_search || [],
            experts_to_consult: dive.experts_to_consult || [],
            estimated_effort: dive.estimated_effort || 'Unknown',
            success_probability: dive.success_probability || 'medium',
            key_questions: dive.key_questions || [],
          };
        }),
      };
    },

    // ── AI API Call ──
    _callAI: async function(systemPrompt, userPrompt, maxTokens) {
      var apiBase = window.TRACE_API_PROXY || '';
      var apiUrl = apiBase ? apiBase + '/analyse' : 'https://api.anthropic.com/v1/messages';
      var headers = { 'Content-Type': 'application/json' };
      if (!apiBase) headers['anthropic-version'] = '2023-06-01';
      if (window.TRACE_ANALYSE_KEY) headers['x-api-key'] = window.TRACE_ANALYSE_KEY;
      if (window.TIER) headers['x-tier'] = window.TIER;

      var res = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        signal: this._abortController.signal,
        body: JSON.stringify({
          model: (window.TRACE_AI_CONFIG && window.TRACE_AI_CONFIG.getDeepModel()) || 'claude-sonnet-4-20250514',
          max_tokens: maxTokens || 1200,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

      if (!res.ok) {
        var errData;
        try { errData = await res.json(); } catch(e) { TRACE_WATCHDOG?.warn('ResearchAgent', e); }
        throw new Error((errData && errData.error && errData.error.message) || 'API error ' + res.status);
      }

      return await res.json();
    },

    // ── JSON Parser (robust against markdown fences) ──
    _parseJSON: function(raw) {
      if (!raw) return null;
      try { return JSON.parse(raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()); } catch(e) {
        try {
          var s = raw.indexOf('['), end = raw.lastIndexOf(']');
          if (s >= 0 && end > s) return JSON.parse(raw.slice(s, end + 1));
        } catch(e2) { TRACE_WATCHDOG?.warn('ResearchAgent parse', e2); }
        try {
          var s = raw.indexOf('{'), end = raw.lastIndexOf('}');
          if (s >= 0 && end > s) return JSON.parse(raw.slice(s, end + 1));
        } catch(e3) { TRACE_WATCHDOG?.warn('ResearchAgent parse', e3); }
      }
      return null;
    },

    // ── UI: Show loading ──
    _showLoading: function(message) {
      var loading = document.getElementById('ra-loading');
      var status = document.getElementById('ra-status');
      var empty = document.getElementById('ra-empty');
      var messages = document.getElementById('ra-messages');
      var error = document.getElementById('ra-error');

      if (loading) loading.style.display = 'block';
      if (status) status.textContent = message || 'Analyzing…';
      if (empty) empty.style.display = 'none';
      if (messages) messages.style.display = 'none';
      if (error) error.style.display = 'none';
    },

    _updateStatus: function(message) {
      var status = document.getElementById('ra-status');
      if (status) status.textContent = message;
    },

    _hideLoading: function() {
      var loading = document.getElementById('ra-loading');
      if (loading) loading.style.display = 'none';
    },

    _showError: function(message) {
      var error = document.getElementById('ra-error');
      var msgEl = document.getElementById('ra-error-msg');
      if (msgEl) msgEl.textContent = '⚠ ' + message;
      if (error) error.style.display = 'block';
      this._hideLoading();
    },

    // ── Render Results ──
    _render: function(results) {
      var messages = document.getElementById('ra-messages');
      var empty = document.getElementById('ra-empty');
      var loading = document.getElementById('ra-loading');

      if (!messages) return;
      if (empty) empty.style.display = 'none';
      if (loading) loading.style.display = 'none';
      messages.style.display = 'block';
      messages.innerHTML = '';

      if (!results || !results.hypotheses || results.hypotheses.length === 0) {
        this._showError('Research completed but no hypotheses were generated.');
        return;
      }

      // Summary header
      var summaryHtml = '' +
        '<div class="ra-report-header">' +
        '<div class="ra-report-title">AI Research Investigation</div>' +
        '<div class="ra-report-meta">' +
        results.hypotheses.length + ' hypotheses · ' +
        results.summary.highConfidenceCount + ' high confidence · ' +
        'Score: ' + results.summary.averageConfidence + '%' +
        '</div>' +
        (results.summary.criticalFindingsInput > 0 ?
          '<div class="ra-report-trigger">Triggered by ' + results.summary.criticalFindingsInput + ' critical finding' +
          (results.summary.criticalFindingsInput > 1 ? 's' : '') + ' from cross-domain correlation</div>' : '') +
        '</div>';

      messages.innerHTML = summaryHtml;

      // Each hypothesis
      results.hypotheses.forEach(function(h, i) {
        var confColors = { high: 'var(--green-lt)', medium: '#E8A020', low: 'var(--text-dim)' };
        var probColors = { high: 'var(--green-lt)', medium: '#E8A020', low: 'var(--red-lt)' };

        var hypHtml = '' +
          '<div class="ra-hypothesis-card" data-hyp-idx="' + i + '">' +
          '<div class="ra-hyp-header">' +
          '<span class="ra-hyp-number">' + (i + 1) + '</span>' +
          '<div class="ra-hyp-content">' +
          '<div class="ra-hypothesis-title">' + window.esc(h.hypothesis) + '</div>' +
          '<div class="ra-hyp-meta">' +
          '<span class="ra-hyp-badge" style="color:' + (confColors[h.confidence] || 'var(--text-dim)') + ';border-color:' + (confColors[h.confidence] || 'var(--text-dim)') + '">' +
          (h.confidence || 'medium').toUpperCase() + ' confidence</span>' +
          '<span class="ra-hyp-badge" style="color:' + (probColors[h.success_probability] || 'var(--text-dim)') + ';border-color:' + (probColors[h.success_probability] || 'var(--text-dim)') + '">' +
          'Success: ' + (h.success_probability || 'medium').toUpperCase() + '</span>' +
          '<span class="ra-hyp-effort">' + window.esc(h.estimated_effort || '') + '</span>' +
          '</div>' +
          (h.rationale ? '<div class="ra-hyp-rationale">' + window.esc(h.rationale) + '</div>' : '') +
          '</div>' +
          '</div>' +

          // Expandable deep-dive section
          '<div class="ra-hyp-deep-dive">' +
          (h.depth_analysis ? '<div class="ra-deep-section"><div class="ra-deep-label">Deep Analysis</div><div class="ra-deep-text">' + window.esc(h.depth_analysis) + '</div></div>' : '') +

          (h.records_to_search && h.records_to_search.length > 0 ?
            '<div class="ra-deep-section"><div class="ra-deep-label">Records to Search</div>' +
            h.records_to_search.map(function(r) { return '<div class="ra-deep-item">' + window.esc(r) + '</div>'; }).join('') + '</div>' : '') +

          (h.experts_to_consult && h.experts_to_consult.length > 0 ?
            '<div class="ra-deep-section"><div class="ra-deep-label">Experts / Institutions to Consult</div>' +
            h.experts_to_consult.map(function(e) { return '<div class="ra-deep-item">' + window.esc(e) + '</div>'; }).join('') + '</div>' : '') +

          (h.key_questions && h.key_questions.length > 0 ?
            '<div class="ra-deep-section"><div class="ra-deep-label">Key Questions</div>' +
            h.key_questions.map(function(q) { return '<div class="ra-deep-item ra-deep-question">' + window.esc(q) + '</div>'; }).join('') + '</div>' : '') +

          (h.sources && h.sources.length > 0 ?
            '<div class="ra-deep-section"><div class="ra-deep-label">Suggested Sources</div>' +
            h.sources.map(function(s) { return '<span class="ra-hyp-source-tag">' + window.esc(s) + '</span>'; }).join('') + '</div>' : '') +

          (h.next_steps && h.next_steps.length > 0 ?
            '<div class="ra-deep-section"><div class="ra-deep-label">Next Steps</div>' +
            h.next_steps.map(function(ns, si) {
              return '<div class="ra-step-row"><span class="ra-step-num">' + (si + 1) + '</span><span class="ra-step-text">' + window.esc(ns) + '</span></div>';
            }).join('') + '</div>' : '') +

          // Action: Add to investigation notes
          '<button class="ra-hyp-add-btn" data-hyp-index="' + i + '" title="Add this hypothesis to investigation notes">+ Add to case notes</button>' +
          '</div>' +
          '</div>';

        messages.innerHTML += hypHtml;
      });

      // Action buttons
      messages.innerHTML += '' +
        '<div class="ra-actions-bar">' +
        '<button class="ra-action-btn ra-action-new" data-ra-action="new">New Investigation</button>' +
        '<button class="ra-action-btn ra-action-export" data-ra-action="export">Export as JSON</button>' +
        '<button class="ra-action-btn ra-action-pin" data-ra-action="pin">Pin to Investigation Board</button>' +
        '</div>';

      messages.scrollTop = 0;
    }
  };

  // ── Wire action buttons via delegation ──
  document.addEventListener('click', function(e) {
    // Research action buttons
    var actionBtn = e.target.closest('[data-ra-action]');
    if (actionBtn) {
      var action = actionBtn.dataset.raAction;
      switch (action) {
        case 'new':
          var empty = document.getElementById('ra-empty');
          var messages = document.getElementById('ra-messages');
          if (empty) empty.style.display = 'block';
          if (messages) messages.style.display = 'none';
          break;
        case 'export':
          if (!window.TRACE_ResearchAgent.lastResults) return;
          var blob = new Blob([JSON.stringify(window.TRACE_ResearchAgent.lastResults, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'research-investigation-' + new Date().toISOString().slice(0, 10) + '.json';
          a.click();
          URL.revokeObjectURL(url);
          window.toast('Research exported');
          break;
        case 'pin':
          if (typeof window.pinToInvestigation === 'function') {
            window.pinToInvestigation();
          } else {
            window.toast('Investigation module not available');
          }
          break;
      }
      return;
    }

    // Add to case notes buttons
    var addBtn = e.target.closest('.ra-hyp-add-btn');
    if (!addBtn) return;

    var idx = parseInt(addBtn.dataset.hypIndex, 10);
    var results = window.TRACE_ResearchAgent.lastResults;
    if (!results || !results.hypotheses || !results.hypotheses[idx]) return;

    var h = results.hypotheses[idx];
    var notesEl = document.getElementById('inv-detail-notes');

    if (notesEl && window._currentInvestigationIdx !== undefined && window._currentInvestigationIdx !== null) {
      var text = '\n\n--- Research Hypothesis [' + (idx + 1) + '] ---\n' +
        h.hypothesis + '\n' +
        'Confidence: ' + h.confidence + '\n' +
        (h.rationale ? 'Rationale: ' + h.rationale + '\n' : '') +
        (h.estimated_effort ? 'Effort: ' + h.estimated_effort + '\n' : '') +
        (h.next_steps && h.next_steps.length > 0 ? '\nNext steps:\n' + h.next_steps.map(function(ns, si) { return '  ' + (si + 1) + '. ' + ns; }).join('\n') + '\n' : '') +
        'Sources: ' + (h.sources || []).join(', ') + '\n';
      notesEl.value += text;
      if (typeof window.saveInvestigationNotes === 'function') {
        window.saveInvestigationNotes();
      }
      window.toast('Hypothesis added to investigation notes ✓');
    } else {
      window.toast('Open an investigation case to add hypotheses to notes');
    }
  });

  // ── Wire the input field send button ──
  function wireInputHandler() {
    var sendBtn = document.getElementById('ra-send');
    var input = document.getElementById('ra-input');

    if (sendBtn) {
      sendBtn.addEventListener('click', function() {
        var msg = input ? input.value.trim() : '';
        if (!msg) { window.toast('Enter an artwork title or research question'); return; }
        if (input) input.value = '';

        // Use context from last result if available
        var r = window._lastResult;
        var context = r ? {
          artist: r.artist || '',
          period: r.period || '',
          medium: r.medium || '',
          movement: r.movement || '',
          keywords: r.keywords || [],
          the_story: r.the_story || '',
        } : {};

        var correlationFindings = window.CorrelationEngine && window.CorrelationEngine.findings;

        window.TRACE_ResearchAgent._showLoading('Initializing research on "' + msg + '"…');
        setTimeout(function() {
          window.TRACE_ResearchAgent.investigate(msg, context, correlationFindings);
        }, 300);
      });
    }

    // Enter key in input field
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && sendBtn) {
          sendBtn.click();
        }
      });
    }
  }

  // ── Auto-trigger on critical correlation findings ──
  document.addEventListener('correlation:complete', function(e) {
    if (e.detail && e.detail.criticalCount > 0) {
      // Show a subtle suggestion badge, don't auto-run
      var suggestionBar = document.getElementById('correlation-findings');
      if (suggestionBar) {
        // Add research suggestion button after findings
        var existing = suggestionBar.querySelector('.ra-trigger-btn');
        if (!existing) {
          var triggerBtn = document.createElement('button');
          triggerBtn.className = 'ra-trigger-btn';
          triggerBtn.innerHTML = '🔬 Deep Investigate with AI Research Agent';
          triggerBtn.addEventListener('click', function() {
            window.TRACE_ResearchAgent.autoInvestigate();
          });
          suggestionBar.appendChild(triggerBtn);
        }
      }
    }
  });

  // ── Wire up delegation for screen events ──
  function wireDelegation() {
    wireInputHandler();

    // Wire suggestion pills in empty state
    document.querySelectorAll('.ra-pill[data-ra-query]').forEach(function(pill) {
      pill.addEventListener('click', function() {
        var query = pill.dataset.raQuery;
        var input = document.getElementById('ra-input');
        if (input) {
          input.value = query;
          var sendBtn = document.getElementById('ra-send');
          if (sendBtn) sendBtn.click();
        }
      });
    });
  }

  // ── Init ──
  function init() {
    wireDelegation();
    console.log('[TRACE Research Agent] v' + AGENT_VERSION + ' loaded');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('research-agent', {
      version: AGENT_VERSION,
      dependsOn: ['utils', 'correlation', 'vision']
    });
  }
})();
