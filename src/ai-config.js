// ══════════════════════════════════════════════
// TRACE — AI Model Configuration
// Allows users to select their preferred AI model
// from supported OpenRouter models.
// Persists to localStorage, applies to all AI calls.
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var STORAGE_KEY = 'trace_ai_model';
  var DEEP_STORAGE_KEY = 'trace_ai_deep_model';

  // Available models — documented for easy expansion
  var AVAILABLE_MODELS = {
    'openai/gpt-4.1-nano': {
      label: 'GPT-4.1 Nano',
      provider: 'OpenAI',
      cost: 'Low ($0.10/M)',
      description: 'Fast, cheapest vision-capable model — ideal for standard scans',
      speed: 'Fast',
      tier: 'standard'
    },
    'openai/gpt-4.1-mini': {
      label: 'GPT-4.1 Mini',
      provider: 'OpenAI',
      cost: 'Medium ($0.40/M)',
      description: 'Stronger reasoning — ideal for deep research investigations',
      speed: 'Fast',
      tier: 'deep'
    },
    'openai/gpt-4o-mini': {
      label: 'GPT-4o Mini',
      provider: 'OpenAI',
      cost: 'Low ($0.15/M)',
      description: 'Established, reliable vision model — good all-rounder',
      speed: 'Fast',
      tier: 'standard'
    },
    'openai/gpt-4o': {
      label: 'GPT-4o',
      provider: 'OpenAI',
      cost: 'Higher ($2.50/M)',
      description: 'Full GPT-4o quality — highest accuracy, higher cost',
      speed: 'Moderate',
      tier: 'premium'
    },
    'anthropic/claude-sonnet-4': {
      label: 'Claude Sonnet 4',
      provider: 'Anthropic',
      cost: 'Higher ($3.00/M)',
      description: 'Claude-level art analysis expertise',
      speed: 'Moderate',
      tier: 'premium'
    },
    'google/gemini-2.5-flash': {
      label: 'Gemini 2.5 Flash',
      provider: 'Google',
      cost: 'Low ($0.15/M)',
      description: 'Google\'s fast vision model — good free tier alternative',
      speed: 'Fast',
      tier: 'standard'
    },
    'deepseek/deepseek-v4-flash': {
      label: 'DeepSeek V4 Flash',
      provider: 'DeepSeek',
      cost: 'Cheapest ($0.14/M)',
      description: 'Most cost-effective vision model — ideal for high-volume art screening',
      speed: 'Fast',
      tier: 'standard'
    }
  };

  // Default model for standard scans
  var DEFAULT_MODEL = 'openai/gpt-4.1-nano';
  // Default model for deep research investigations
  var DEFAULT_DEEP_MODEL = 'openai/gpt-4.1-mini';

  /**
   * Get the configured model for standard scans
   */
  function getModel() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && AVAILABLE_MODELS[stored]) return stored;
    } catch(e) { /* localStorage unavailable */ }
    return DEFAULT_MODEL;
  }

  /**
   * Get the configured model for deep research investigations
   */
  function getDeepModel() {
    try {
      var stored = localStorage.getItem(DEEP_STORAGE_KEY);
      if (stored && AVAILABLE_MODELS[stored]) return stored;
    } catch(e) { /* localStorage unavailable */ }
    return DEFAULT_DEEP_MODEL;
  }

  /**
   * Set the standard scan model
   */
  function setModel(modelKey) {
    if (!AVAILABLE_MODELS[modelKey]) return false;
    try {
      localStorage.setItem(STORAGE_KEY, modelKey);
      return true;
    } catch(e) {
      return false;
    }
  }

  /**
   * Set the deep research model
   */
  function setDeepModel(modelKey) {
    if (!AVAILABLE_MODELS[modelKey]) return false;
    try {
      localStorage.setItem(DEEP_STORAGE_KEY, modelKey);
      return true;
    } catch(e) {
      return false;
    }
  }

  /**
   * Get info about a model
   */
  function getModelInfo(modelKey) {
    return AVAILABLE_MODELS[modelKey] || null;
  }

  /**
   * Get all available models
   */
  function getAvailableModels() {
    return AVAILABLE_MODELS;
  }

  /**
   * Render model selector UI into a container element
   * @param {HTMLElement} container - The container to render into
   */
  function renderSelector(container) {
    if (!container) return;

    var currentModel = getModel();
    var currentDeep = getDeepModel();

    var html = '' +
      '<div class="ai-model-section">' +
      '<div class="ai-model-info">' +
      'Selected model is sent with each AI request. The server routes through ' +
      '<strong>OpenRouter</strong> which must be configured with <code>AI_PROVIDER=openrouter</code> in .env.' +
      '</div>';

    // Standard scan model selector
    html += '' +
      '<div class="ai-model-group">' +
      '<div class="ai-model-group-label">Standard Analysis Model</div>' +
      '<div class="ai-model-group-desc">Used for artwork scans and provenance checks</div>' +
      '<select class="ai-model-select" id="ai-model-select">';

    Object.keys(AVAILABLE_MODELS).forEach(function(key) {
      var info = AVAILABLE_MODELS[key];
      var selected = key === currentModel ? 'selected' : '';
      html += '<option value="' + key + '" ' + selected + '>' +
        info.label + ' (' + info.cost + ') — ' + info.description +
        '</option>';
    });

    html += '</select>' +
      '<div class="ai-model-current" id="ai-model-current">' +
      'Current: ' + (AVAILABLE_MODELS[currentModel]?.label || currentModel) +
      '</div>' +
      '</div>';

    // Deep research model selector
    html += '' +
      '<div class="ai-model-group">' +
      '<div class="ai-model-group-label">Deep Research Model</div>' +
      '<div class="ai-model-group-desc">Used for AI Research Agent investigations (higher quality recommended)</div>' +
      '<select class="ai-model-select" id="ai-deep-model-select">';

    Object.keys(AVAILABLE_MODELS).forEach(function(key) {
      var info = AVAILABLE_MODELS[key];
      var selected = key === currentDeep ? 'selected' : '';
      html += '<option value="' + key + '" ' + selected + '>' +
        info.label + ' (' + info.cost + ') — ' + info.description +
        '</option>';
    });

    html += '</select>' +
      '<div class="ai-model-current" id="ai-deep-model-current">' +
      'Current: ' + (AVAILABLE_MODELS[currentDeep]?.label || currentDeep) +
      '</div>' +
      '</div>';

    // Quick comparison table
    html += '' +
      '<div class="ai-model-table-wrap">' +
      '<div class="ai-model-group-label" style="margin-bottom:6px;">Model Comparison</div>' +
      '<table class="ai-model-table">' +
      '<thead><tr><th>Model</th><th>Cost/1M input</th><th>Speed</th><th>Use Case</th></tr></thead>' +
      '<tbody>';

    Object.keys(AVAILABLE_MODELS).forEach(function(key) {
      var info = AVAILABLE_MODELS[key];
      var isCurrent = key === currentModel;
      var isDeepCurrent = key === currentDeep;
      var rowClass = (isCurrent || isDeepCurrent) ? 'ai-model-row-active' : '';
      var badge = isCurrent ? ' <span class="ai-model-badge">Scan</span>' : '';
      badge += isDeepCurrent ? ' <span class="ai-model-badge ai-model-badge-deep">Research</span>' : '';
      html += '<tr class="' + rowClass + '">' +
        '<td>' + info.label + badge + '</td>' +
        '<td>' + info.cost + '</td>' +
        '<td>' + info.speed + '</td>' +
        '<td class="text-dim-sm">' + info.description + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    html += '</div>';

    container.innerHTML = html;

    // Wire select change handlers
    var select = document.getElementById('ai-model-select');
    var deepSelect = document.getElementById('ai-deep-model-select');
    var currentLabel = document.getElementById('ai-model-current');
    var currentDeepLabel = document.getElementById('ai-deep-model-current');

    if (select) {
      select.addEventListener('change', function() {
        var val = this.value;
        if (setModel(val)) {
          if (currentLabel) {
            currentLabel.textContent = 'Current: ' + (AVAILABLE_MODELS[val]?.label || val);
          }
          window.toast('Scan model set to ' + (AVAILABLE_MODELS[val]?.label || val));
        }
      });
    }

    if (deepSelect) {
      deepSelect.addEventListener('change', function() {
        var val = this.value;
        if (setDeepModel(val)) {
          if (currentDeepLabel) {
            currentDeepLabel.textContent = 'Current: ' + (AVAILABLE_MODELS[val]?.label || val);
          }
          window.toast('Research model set to ' + (AVAILABLE_MODELS[val]?.label || val));
        }
      });
    }
  }

  // ── Expose globally ──
  window.TRACE_AI_CONFIG = {
    getModel: getModel,
    getDeepModel: getDeepModel,
    setModel: setModel,
    setDeepModel: setDeepModel,
    getModelInfo: getModelInfo,
    getAvailableModels: getAvailableModels,
    renderSelector: renderSelector,
    DEFAULT_MODEL: DEFAULT_MODEL,
    DEFAULT_DEEP_MODEL: DEFAULT_DEEP_MODEL
  };

  console.log('[AI Config] Loaded — default: ' + DEFAULT_MODEL + ', deep: ' + DEFAULT_DEEP_MODEL);
})();
