// TRACE Route Helpers — shared utilities for all route modules
const crypto = require('crypto');
const zlib = require('zlib');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.wav':  'audio/wav',
  '.mp3':  'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf'
};

// ── Error log for AI self-diagnosis ──
const errorLog = [];
const ERROR_LOG_MAX = 50;

function logError(err, context) {
  const entry = {
    ts: new Date().toISOString(),
    message: err.message || String(err),
    stack: (err.stack || '').split('\n').slice(0, 6).join('\n'),
    context: context || ''
  };
  errorLog.push(entry);
  if (errorLog.length > ERROR_LOG_MAX) errorLog.shift();
  return entry;
}

const GZIP_MIN_SIZE = 1024;

function maybeGzip(res, body, cb) {
  if (!body || body.length < GZIP_MIN_SIZE) return cb(null, body);
  zlib.gzip(body, function(err, compressed) {
    if (err || !compressed || compressed.length >= body.length) return cb(null, body);
    res.setHeader('Content-Encoding', 'gzip');
    cb(null, compressed);
  });
}

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function collectBody(req, res, maxBytes, callback) {
  let body = '';
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > maxBytes) {
      req.destroy();
      if (!res.headersSent) sendJSON(res, 413, { error: 'Payload too large' });
      return;
    }
    body += chunk.toString();
  });
  req.on('end', () => {
    if (res.headersSent) return;
    callback(body);
  });
}

function setSecurityHeaders(res, req, allowedOrigin) {
  // Defense-in-depth: never allow wildcard CORS even if caller passes *
  if (allowedOrigin === '*') {
    console.warn('[TRACE] WARNING: Wildcard CORS detected in setSecurityHeaders. Using request origin instead: ' + ((req.headers && req.headers['origin']) || 'http://localhost:3000'));
    allowedOrigin = (req.headers && req.headers['origin']) || 'http://localhost:3000';
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (req.headers['x-forwarded-proto'] === 'https' || req.connection.encrypted) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // CSP: 'unsafe-inline' required in script-src because trace.html uses inline
  // event handler attributes (onclick, onmouseenter, etc.) throughout.
  // frame-ancestors provides defense-in-depth against clickjacking alongside X-Frame-Options.
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://d3js.org https://fonts.googleapis.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' http://localhost:* http://127.0.0.1:* https://api.anthropic.com https://generativelanguage.googleapis.com; " +
    "media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; " +
    "frame-ancestors 'none';");
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-tier, x-sub-token, x-csrf-token');
  // Expose CSRF token header so client-side JS can read it
  res.setHeader('Access-Control-Expose-Headers', 'x-csrf-token');
}

// ── CSRF Protection ──
const csrfSecrets = new Map();

// Generate a CSRF token tied to a session token
function generateCsrfToken(sessionToken) {
  var csrfId = crypto.randomBytes(16).toString('hex');
  var expiresAt = Date.now() + 3600000; // 1 hour
  csrfSecrets.set(csrfId, { sessionToken: sessionToken, expiresAt: expiresAt });
  return csrfId;
}

// Validate a CSRF token. Removes expired entries on check.
function validateCsrfToken(csrfToken, sessionToken) {
  if (!csrfToken) return false;
  var entry = csrfSecrets.get(csrfToken);
  if (!entry) return false;
  csrfSecrets.delete(csrfToken); // One-time use
  if (Date.now() > entry.expiresAt) return false;
  // For auth endpoints, the session token is not available yet, so skip session check
  // For protected routes, verify the token matches the session
  if (sessionToken && entry.sessionToken && entry.sessionToken !== sessionToken) return false;
  return true;
}

// Clean up expired CSRF tokens every 15 minutes to prevent memory leaks
setInterval(function() {
  var now = Date.now();
  csrfSecrets.forEach(function(entry, id) {
    if (now > entry.expiresAt) csrfSecrets.delete(id);
  });
}, 900000);

// ── Log level control ──
// TRACE_LOGGING env var: 'silent' or '0' suppresses all output except errors.
// Any other value (or unset) enables full logging.
const TRACE_SILENT = process.env.TRACE_LOGGING === 'silent' || process.env.TRACE_LOGGING === '0';

function log(level, msg, extra) {
  if (TRACE_SILENT && level !== 'ERROR') return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  if (extra) console.log(line, extra);
  else console.log(line);
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + m + 'm';
}

module.exports = {
  MIME_TYPES, errorLog, ERROR_LOG_MAX,
  logError, maybeGzip, sendJSON, collectBody, setSecurityHeaders, log, formatUptime,
  generateCsrfToken, validateCsrfToken
};
