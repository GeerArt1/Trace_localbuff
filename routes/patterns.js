// TRACE Shared Error Patterns — loading, caching, and matching
// Extracted from routes/ops.js and routes/agent.js to eliminate duplication
const path = require('path');
const fs = require('fs');

const ERROR_PATTERNS_FILE = 'ops/error-patterns.json';

/**
 * Load error patterns from JSON file with mtime-based caching
 * @param {string} staticDir - STATIC_DIR from server context
 * @param {Function} logError - Error logging function
 * @returns {{ patterns: Array, scripts: Object }}
 */
function loadErrorPatterns(staticDir, logError) {
  var cache = loadErrorPatterns._cache;
  var mtime = loadErrorPatterns._mtime || 0;
  var patternsPath = path.join(staticDir, ERROR_PATTERNS_FILE);

  try {
    if (fs.existsSync(patternsPath)) {
      var stat = fs.statSync(patternsPath);
      if (cache && stat.mtimeMs === mtime) {
        return cache;
      }
      var data = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
      loadErrorPatterns._cache = data;
      loadErrorPatterns._mtime = stat.mtimeMs;
      return data;
    }
  } catch (e) {
    if (typeof logError === 'function') {
      logError(e, 'Loading error patterns');
    }
  }
  return { patterns: [], scripts: {} };
}

/**
 * Log an event to the ops log array
 * @param {Array} opsLog - The ops log array
 * @param {number} maxLog - Maximum log size
 * @param {string} type - Event type (info, warn, error, etc.)
 * @param {string} message - Event message
 * @param {*} detail - Optional detail object
 * @returns {Object} The log entry
 */
function logEvent(opsLog, maxLog, type, message, detail) {
  var entry = {
    ts: new Date().toISOString(),
    type: type || 'info',
    message: String(message || '').slice(0, 500),
    detail: detail || null
  };
  opsLog.push(entry);
  if (opsLog.length > maxLog) opsLog.shift();
  return entry;
}

module.exports = {
  loadErrorPatterns: loadErrorPatterns,
  logEvent: logEvent
};
