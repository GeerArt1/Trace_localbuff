// ══════════════════════════════════════════════
// TRACE — Global Type Definitions (JSDoc)
// Provides editor autocompletion and contract docs
// for all window.* globals shared across modules.
// ══════════════════════════════════════════════

/**
 * @typedef {Object} TraceAnalysisResult
 * @property {string} title - Artwork or subject title
 * @property {string} artist - Artist name or species/breed for non-artwork
 * @property {string} period - Historical period or era
 * @property {string} medium - Material or medium
 * @property {string} movement - Art movement or style
 * @property {'artwork'|'painting'|'sculpture'|'photograph'|'person'|'animal'|'landmark'|'architecture'|'place'|'nature'|'object'|'antiquity'|'unknown'|'food'|'vehicle'|'fashion'|'decorative_art'} subject_type
 * @property {number} provenance_confidence - 0-100 confidence score
 * @property {string} value_estimate - Auction estimate or N/A
 * @property {string} [style_analysis] - 2-3 sentences on technique/composition
 * @property {string} [historical_context] - 2-3 sentences on period/significance
 * @property {string} [investigation_notes] - 1-2 sentences on further investigation
 * @property {string} [similar_works] - Similar artworks
 * @property {string[]} keywords - Array of 5 keywords
 * @property {TraceTimelineEvent[]} timeline - Provenance timeline array
 * @property {string} [the_story] - Engaging description (Discover tier)
 * @property {string} [fascinating_fact] - Surprising detail (Discover tier)
 * @property {string} [what_to_look_for] - Specific observation (Discover tier)
 * @property {string} [professional_assessment] - Authoritative assessment (Pro)
 * @property {string} [provenance_chain] - Ownership history narrative (Pro)
 * @property {string} [risk_assessment] - Restitution/theft risk (Pro)
 * @property {string} [recommended_actions] - Professional next steps (Pro)
 * @property {string} [exhibition_history] - Known exhibitions (Pro)
 */

/**
 * @typedef {Object} TraceTimelineEvent
 * @property {string} year - Year or date string
 * @property {string} event - Event name (max 8 words)
 * @property {string} detail - Event detail (max 25 words)
 * @property {'creation'|'ownership'|'exhibition'|'auction'|'life'|'historical'} category - Event category
 */

/**
 * @typedef {Object} ScanImageData
 * @property {string} data - Base64-encoded image data (without data: prefix)
 * @property {string} type - MIME type (e.g. 'image/jpeg')
 */

/**
 * @typedef {Object} TimelineObject
 * @property {string} title - Timeline/subject title
 * @property {string} [artist] - Artist name
 * @property {string} [sub] - Subtitle or attribution
 * @property {string} [subject_type] - Type of subject
 * @property {number} [confidence] - Confidence percentage
 * @property {string} [status] - Status (active/confirmed)
 * @property {TraceTimelineEvent[]} events - Timeline events
 */

/**
 * @typedef {Object} TierConfig
 * @property {string} label - Tier display name
 * @property {string} systemPrompt - AI system prompt for this tier
 * @property {Object[]} nav - Navigation items
 * @property {string} nav[].id - Screen ID
 * @property {string} nav[].label - Display label
 * @property {string} nav[].icon - Icon key
 * @property {boolean} [hasExport] - Has export features
 * @property {boolean} [hasTimeline] - Has full timeline
 * @property {boolean} [hasCases] - Has case management
 * @property {boolean} [hasGeometry] - Has sacred geometry
 * @property {boolean} [hasViewer] - Has IIIF viewer
 * @property {boolean} [hasResearch] - Has research agent
 * @property {boolean} [hasSpectral] - Has multi-spectral
 * @property {boolean} [hasKnowledge] - Has knowledge graph
 * @property {boolean} [hasGettyCSV] - Has Getty CSV import
 * @property {number} [chatLimit] - Daily chat limit for Discover
 * @property {string} [homeGreeting] - Home screen greeting text
 * @property {string} [scanCta] - Scan CTA text
 */

/**
 * @typedef {Object} WatchdogReport
 * @property {string} ts - ISO timestamp
 * @property {string} type - Event type (error|warning|info|auto_fix)
 * @property {string} source - Module name where event occurred
 * @property {string} message - Error or event message
 * @property {*} [detail] - Additional context
 * @property {Object} [browser] - Browser environment info
 * @property {string} [browser.userAgent] - Navigator user agent
 * @property {number} [browser.memoryMB] - Approximate memory usage
 * @property {number} [browser.moduleCount] - Loaded module count
 * @property {string} [browser.tier] - Current subscription tier
 */

/**
 * @typedef {Object} AgentAction
 * @property {string} action - Action type (restart|clear_cache|fix_config|alert)
 * @property {string} target - Target of the action
 * @property {string} reason - Why this action was taken
 * @property {string} [command] - Shell command to execute
 * @property {number} [timestamp] - When action was taken
 */

/**
 * @typedef {Object} WatchdogState
 * @property {number} errorCount - Total errors tracked
 * @property {number} warningCount - Total warnings tracked
 * @property {number} lastReportTs - Last report timestamp
 * @property {Object<string,number>} errorBySource - Error count per module
 * @property {WatchdogReport[]} recentReports - Recent reports (max 50)
 */


// ── Expose types for TypeScript / JSDoc tooling ──
// These declarations don't produce runtime code.
// They exist so editors understand the window.* contract.

/**
 * TRACE global namespace.
 * @namespace window
 */

/**
 * Current analysis result from the last scan.
 * Set by scan.js → results.js after AI analysis completes.
 * @type {TraceAnalysisResult|undefined}
 */
window._lastResult;

/**
 * Current scan image data (from camera or file upload).
 * Set by scan.js onFile(), camera.js accept(), upload.js.
 * @type {ScanImageData|undefined}
 */
window._scanImageData;

/**
 * Previous scan image data, saved before overwriting with a new scan.
 * Set by scan.js onFile() before updating _scanImageData.
 * Used by results.js openCompare() for COMP analysis.
 * @type {ScanImageData|undefined}
 */
window._lastScanImageData;

/**
 * Title of the previous scan result.
 * Set by scan.js onFile() when a previous result exists.
 * Used by results.js for comparison labels.
 * @type {string|undefined}
 */
window._previousResultTitle;

/**
 * Base64-encoded image data (without data: prefix).
 * Legacy global, still used by scan.js analyse() and geometry.js.
 * @type {string|undefined}
 */
window.img64;

/**
 * Image MIME type (e.g. 'image/jpeg').
 * Legacy global paired with img64.
 * @type {string|undefined}
 */
window.imgType;

/**
 * The most recently loaded/selected timeline object.
 * Set by scan.js, nav.js, timeline.js.
 * @type {TimelineObject|undefined}
 */
window._lastTimeline;

/**
 * All loaded timelines, keyed by title.
 * @type {Object<string, TimelineObject>|undefined}
 */
window._timelines;

/**
 * TRACE API proxy base URL (e.g. 'https://your-railway-url').
 * Empty string means direct Anthropic API calls.
 * @type {string}
 */
window.TRACE_API_PROXY;

/**
 * Current subscription tier.
 * Set by tiers.js setTier().
 * @type {'discover'|'collector'|'professional'}
 */
window.TRACE_TIER;

/**
 * Module registry — plugin system for modular architecture.
 * Defined in src/registry.js.
 * @type {Object}
 * @property {Function} register - Register a module
 * @property {Function} on - Register a hook handler
 * @property {Function} emit - Emit a hook event
 * @property {Function} init - Initialize all modules
 * @property {Function} get - Get a module by name
 * @property {Function} getScreens - Get all screens
 * @property {Function} diagnose - Get diagnostic report
 */
window.TRACE_REGISTRY;

/**
 * Watchdog — self-healing AI agent (client-side).
 * Defined in src/watchdog.js.
 * @type {Object}
 * @property {Function} report - Report an event to the server agent
 * @property {Function} warn - Log a warning through watchdog
 * @property {Function} error - Log an error through watchdog
 * @property {Function} getState - Get current watchdog state
 * @property {Function} flush - Force-flush pending reports to server
 */
window.TRACE_WATCHDOG;

/**
 * Sync engine for offline queue processing.
 * Defined in src/sync.js.
 * @type {Object}
 * @property {Function} queue - Queue an operation
 * @property {Function} process - Process the sync queue
 * @property {Function} start - Start periodic sync
 * @property {Function} stop - Stop periodic sync
 */
window.TRACE_SYNC;

/**
 * Subscription verification module.
 * Defined in trace_subscription.js.
 * @type {Object|undefined}
 */
window.TRACE_SUB;

/**
 * Hardware connection framework (Professional tier).
 * Defined in src/hw.js.
 * @type {Object|undefined}
 */
window.TRACE_HW;

/**
 * Camera module (enhanced viewfinder).
 * Defined in src/camera.js.
 * @type {Object|undefined}
 */
window.TRACE_CAMERA;

/**
 * Image comparison module.
 * Defined in src/compare.js.
 * @type {Object|undefined}
 */
window.TRACE_COMPARE;

/**
 * Knowledge graph module.
 * Defined in src/knowledge.js.
 * @type {Object|undefined}
 */
window.KNOWLEDGE;

/**
 * Multi-spectral analysis module.
 * Defined in src/vision.js.
 * @type {Object|undefined}
 */
window.MSSpectral;

/**
 * Getty CSV import results cache.
 * Set by src/csv_import.js.
 * @type {Array|undefined}
 */
window._gettyCSVRecords;

/**
 * Translation dictionaries for i18n.
 * Set by src/i18n.js.
 * @type {Object<string, Object<string, string>>|undefined}
 */
window.TRANSLATIONS;

/**
 * Current language code.
 * Set by src/i18n.js setLanguage().
 * @type {string}
 */
window._lang;

/**
 * i18n lookup function.
 * @param {string} key - Translation key
 * @param {Object<string,string>} [vars] - Template variables
 * @returns {string} Translated string
 */
window.__;

/**
 * Set the app language and trigger DOM re-translation.
 * @param {string} lang - Language code (en|de|fr|es|it)
 */
window.setLanguage;

/**
 * Translate all DOM elements with data-i18n attributes.
 */
window.translateDOM;

/**
 * Initialize i18n module.
 */
window.initI18n;

/**
 * Initialize language picker UI in profile screen.
 */
window.initLangPicker;

/**
 * Get available languages.
 * @returns {Array<{code:string, label:string}>}
 */
window.getLanguages;

/**
 * Navigate to a screen by ID.
 * @param {string} id - Screen ID (e.g. 'scan', 'home', 'timeline')
 * @param {Object} [options] - Navigation options
 * @param {boolean} [options.pushState] - Whether to push to history
 */
window.nav;

/**
 * Set the subscription tier and apply all tier-specific UI changes.
 * @param {'discover'|'collector'|'professional'} tier - Target tier
 */
window.setTier;

/**
 * Show a toast notification.
 * @param {string} msg - Message to display
 * @param {number} [durationMs] - Display duration
 */
window.toast;

/**
 * Show the subscription upgrade overlay.
 */
window.showUpgrade;

/**
 * Go to the scan screen (used by home CTA).
 */
window._goScan;

/**
 * Register a timeline event for offline syncing.
 * @param {string} title - Timeline title
 */
window.syncTimelineToServer;

/**
 * HTML-escape a string.
 * @param {*} s - Value to escape
 * @returns {string} Escaped HTML
 */
window.esc;

/**
 * HTML-escape an attribute value.
 * @param {*} s - Value to escape
 * @returns {string} Escaped attribute
 */
window.escAttr;

/**
 * Save a timeline to local storage.
 * @param {string} title - Timeline title
 * @param {TimelineObject} timeline - Timeline data
 */
window.saveTimelineLocal;

/**
 * List all saved timelines from storage.
 * @returns {TimelineObject[]}
 */
window.listSavedTimelines;

/**
 * Load timelines from localStorage into memory.
 */
window.loadTimelinesFromStorage;

/**
 * Load timelines from the server.
 * @returns {Promise<TimelineObject[]>}
 */
window.loadTimelinesFromServer;

/**
 * Load saved cases from storage.
 */
window.loadCasesFromStorage;

/**
 * Queue an operation for offline sync.
 * @param {string} url - API endpoint
 * @param {string} method - HTTP method
 * @param {Object} body - Request body
 * @param {string} opType - Human-readable operation type
 */
window.queueOfflineOp;
