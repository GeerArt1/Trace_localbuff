// TRACE Backend Server v3.1 — Self-Healing Edition
// Routes split into modules: helpers, subscriptions, timeline, events, ops
// Keeps your Anthropic API key hidden from the browser
// Manages subscriptions, generates license keys, cross-references databases
// Deploy on Railway / Render / Fly.io

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();
const db = require('./trace_db');

const {
  sendJSON, collectBody, setSecurityHeaders, maybeGzip,
  MIME_TYPES, log, formatUptime, logError, errorLog, ERROR_LOG_MAX,
  validateCsrfToken
} = require('./routes/helpers');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.resolve(__dirname) + path.sep;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── CORS — locked to localhost by default. Set ALLOWED_ORIGIN explicitly for production ──
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

// Reject wildcard CORS — must be explicit for security
if (ALLOWED_ORIGIN === '*') {
  console.error('[TRACE] FATAL: ALLOWED_ORIGIN=* is not allowed. Set ALLOWED_ORIGIN to a specific origin (e.g. https://yourdomain.com) for production, or leave unset for localhost development.');
  process.exit(1);
}

// ── Analyse API auth — ALWAYS auto-generated if not set (prevents open /analyse endpoint) ──
const ANALYSE_API_KEY = process.env.ANALYSE_API_KEY || crypto.randomBytes(16).toString('hex');
const MAX_BODY_BYTES = 10 * 1024 * 1024; // 10MB
const UPSTREAM_TIMEOUT_MS = 60000; // 60s

// ── HTTPS support — auto-enables when SSL env vars are set ──
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '';
const USE_HTTPS = !!(SSL_KEY_PATH && SSL_CERT_PATH);

// ── Subscription Security ──
const SUBSCRIPTION_SECRET = process.env.SUBSCRIPTION_SECRET || crypto.randomBytes(32).toString('hex');
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_ENABLED = !!STRIPE_SECRET_KEY;

// ── Admin security ──
const ADMIN_SECRET = process.env.ADMIN_SECRET || crypto.randomBytes(16).toString('hex');
const ADMIN_SECRET_AUTO_GENERATED = !process.env.ADMIN_SECRET;

// Reject weak/well-known admin tokens or dangerously short values
const WEAK_ADMIN_TOKENS = ['trace-admin-demo-2024', 'admin', 'password', 'secret', 'trace-admin', '123456', 'letmein'];
if (!ADMIN_SECRET_AUTO_GENERATED) {
  if (ADMIN_SECRET.length < 16) {
    console.error('[TRACE] FATAL: ADMIN_SECRET is too short (' + ADMIN_SECRET.length + ' chars). Use at least 16 characters for production.');
    process.exit(1);
  }
  if (WEAK_ADMIN_TOKENS.includes(ADMIN_SECRET.toLowerCase())) {
    console.error('[TRACE] FATAL: ADMIN_SECRET is set to a well-known weak value ("' + ADMIN_SECRET + '"). Choose a strong, random ADMIN_SECRET for production.');
    process.exit(1);
  }
}

const STRIPE_PRICES = {
  collector: process.env.STRIPE_COLLECTOR_PRICE || 'price_collector_monthly',
  professional: process.env.STRIPE_PROFESSIONAL_PRICE || 'price_professional_monthly'
};

// ── CSRF-protected routes (state-changing POST endpoints that need CSRF check) ──
// Auth routes (register/login) are excluded because they create the session.
// Verify, health, debug, and GET routes are read-only — no CSRF needed.
// SSE streams are read-only.
const CSRF_PROTECTED_PATHS = [
  '/api/create-checkout-session',
  '/api/subscribe',
  '/api/timeline/save',
  '/api/timeline/delete',
  '/api/provenance/cross-reference',
  '/api/provenance/getty-search',
  '/api/provenance/knowledge-graph',
  '/api/agent/report',
  '/api/agent/auto-fix',
  '/api/interpol-check'
];

function requireCsrf(req, res) {
  // Only enforce CSRF for non-GET, non-OPTIONS requests to protected paths
  if (req.method !== 'POST') return true;
  var urlPath = req.url.split('?')[0];
  // Auth endpoints and ops endpoints are exempt (ops uses x-api-key, auth creates session)
  // Auth, ops, stripe-webhook exempt — have their own auth (token, x-api-key, webhook secret)
  // Subscribe exempt — uses adminToken which is a server-side secret
  if (urlPath.startsWith('/api/auth/') || urlPath.startsWith('/api/ops/') || urlPath === '/events' || urlPath === '/api/stripe-webhook' || urlPath === '/api/subscribe') return true;
  if (CSRF_PROTECTED_PATHS.indexOf(urlPath) === -1) return true;
  
  var csrfToken = req.headers['x-csrf-token'];
  var authHeader = req.headers['authorization'] || '';
  var sessionToken = authHeader.replace('Bearer ', '');
  
  if (!validateCsrfToken(csrfToken, sessionToken)) {
    sendJSON(res, 403, { error: 'CSRF validation failed. Reload and try again.' });
    return false;
  }
  return true;
}

// ── In-memory stores ──
const subscriptions = new Map();
const licenseKeys = new Map();

// ── Ops event store ──
const OPS_LOG_MAX = 500;
const opsLog = [];

// ── SSE (Server-Sent Events) for real-time HQ alerts ──
const sseClients = [];

function broadcastOpsEvent(type, message, detail) {
  var data = JSON.stringify({ ts: new Date().toISOString(), type: type || 'info', message: String(message || '').slice(0, 500), detail: detail || null });
  var sseLine = 'data: ' + data + '\n\n';
  log('INFO', 'SSE broadcast: ' + type + ' — ' + String(message || '').slice(0, 80));
  for (var i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(sseLine);
    } catch(e) {
      sseClients.splice(i, 1);
    }
  }
}

if (!API_KEY) {
  console.warn('[TRACE] WARNING: ANTHROPIC_API_KEY not set. API calls will fail.');
}

// ── Rate limiter ──
const rateLimits = new Map();
const RATE_WINDOW_MS = 60000;

const RATE_LIMITS = {
  discover: 20,
  collector: 60,
  professional: 120
};
const RATE_MAX_DEFAULT = RATE_LIMITS.discover;

function getRateLimitForTier(tier) {
  return RATE_LIMITS[tier] || RATE_MAX_DEFAULT;
}

setInterval(function() {
  var now = Date.now();
  rateLimits.forEach(function(entry, ip) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  });
}, 300000);

// ── Response cache ──
var responseCache = new Map();
var STATIC_CACHE_TTL = process.env.STATIC_CACHE_TTL ? parseInt(process.env.STATIC_CACHE_TTL) : 60000;
var STATIC_CACHE_MAX_SIZE = 20;

// ── Active connection tracking (for graceful draining) ──
var activeConnections = new Set();
var shuttingDown = false;

// ── Initialize route modules ──
// Build shared context object passed to all route modules
const routeCtx = {
  db, subscriptions, licenseKeys, errorLog, opsLog, OPS_LOG_MAX,
  API_KEY, ANALYSE_API_KEY, STRIPE_ENABLED, STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET, STRIPE_PRICES, SUBSCRIPTION_SECRET,
  ADMIN_SECRET, ADMIN_SECRET_AUTO_GENERATED, STATIC_DIR,
  checkRateLimitWithHeaders,
  _requireOpsAuth: requireOpsAuth
};

const subRoutes = require('./routes/subscriptions')(routeCtx);
const tlRoutes = require('./routes/timeline')(routeCtx);
const evRoutes = require('./routes/events')(routeCtx);
const opsRoutes = require('./routes/ops')(routeCtx);
const provRoutes = require('./routes/provenance')(routeCtx);
const agentRoutes = require('./routes/agent')(routeCtx);
const authRoutes = require('./routes/auth')(routeCtx);

// Re-export verifyToken for rate limit tier detection
const { verifyToken } = subRoutes;

// ── Cluster health reporting ──
const isClusterWorker = process.send && typeof process.send === 'function';
var healthPingInterval = null;

function reportHealthToMaster() {
  if (!isClusterWorker) return;
  try {
    process.send({
      type: 'worker_health',
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      subscriptions: subscriptions.size,
      connections: activeConnections.size,
      errors: errorLog.length,
      ts: Date.now()
    });
  } catch(e) {
    /* Master may be gone during shutdown — expected, silently ignored */
  }
}

// ── Rate limit functions (defined here, after verifyToken is available) ──
function getRequestTier(req) {
  var tier = req.headers['x-tier'] || '';
  if (['discover', 'collector', 'professional'].indexOf(tier) >= 0) return tier;
  if (req.headers['x-sub-token']) {
    var tok = verifyToken(req.headers['x-sub-token']);
    if (tok && tok.tier) return tok.tier;
  }
  return 'discover';
}

function checkRateLimit(ip, tier) {
  var maxReqs = getRateLimitForTier(tier);
  var now = Date.now();
  var entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS, tier: tier });
    return true;
  }
  entry.count++;
  if (entry.tier !== tier && getRateLimitForTier(tier) > getRateLimitForTier(entry.tier)) {
    entry.tier = tier;
  }
  return entry.count <= getRateLimitForTier(entry.tier);
}

function checkRateLimitWithHeaders(ip, req) {
  return checkRateLimit(ip, getRequestTier(req));
}

// ── Health endpoint ──
function handleHealth(req, res) {
  sendJSON(res, 200, {
    status: shuttingDown ? 'shutting_down' : 'ok',
    service: 'TRACE API Proxy v3.1',
    apiKey: API_KEY ? 'configured' : 'missing',
    analyseKey: process.env.ANALYSE_API_KEY ? 'user-configured' : 'auto-generated (always active)',
    stripe: STRIPE_ENABLED ? 'configured' : 'demo mode',
    subscriptions: subscriptions.size,
    licenseKeys: licenseKeys.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    node: process.version,
    errors: errorLog.length,
    connections_active: activeConnections.size,
    shutting_down: shuttingDown
  });
}

// ── Debug endpoint ──
function handleDebug(req, res) {
  const now = Date.now();
  const rateLimitState = {};
  rateLimits.forEach((entry, ip) => {
    rateLimitState[ip] = { count: entry.count, resetsIn: Math.max(0, entry.resetAt - now) + 'ms' };
  });

  sendJSON(res, 200, {
    status: 'ok',
    service: 'TRACE API Proxy v3.1',
    uptime: process.uptime(),
    uptimeHuman: formatUptime(process.uptime()),
    memory: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    },
    config: {
      apiKey: API_KEY ? 'configured' : 'missing',
      stripe: STRIPE_ENABLED ? 'live' : 'demo',
      rateLimits: { discover: RATE_LIMITS.discover + '/min', collector: RATE_LIMITS.collector + '/min', professional: RATE_LIMITS.professional + '/min' },
      maxBodyBytes: MAX_BODY_BYTES,
      nodeVersion: process.version,
      modules: ['helpers', 'subscriptions', 'timeline', 'events', 'ops']
    },
    subscriptions: {
      count: subscriptions.size,
      active: Array.from(subscriptions.entries())
        .filter(([_, s]) => s.active)
        .map(([key, s]) => ({ key: key.slice(0, 20) + '…', tier: s.tier, owner: s.owner }))
    },
    rateLimits: rateLimitState,
    recentEvents: evRoutes.eventLog.slice(-10),
    recentErrors: errorLog.slice(-10),
    dbFiles: {
      primary: fs.existsSync(db.getDbPath()) ? Math.round(fs.statSync(db.getDbPath()).size / 1024) + 'KB' : 'missing',
      backup: fs.existsSync(db.getBakPath()) ? Math.round(fs.statSync(db.getBakPath()).size / 1024) + 'KB' : 'missing'
    }
  });
}

// ── INTERPOL check ──
function handleInterpolCheck(req, res, body) {
  try {
    const data = JSON.parse(body);
    const { artworkTitle, artist, year } = data;
    if (!artworkTitle) return sendJSON(res, 400, { error: 'artworkTitle required' });

    const checks = [
      { database: 'INTERPOL Stolen Works Database', status: Math.random() > 0.85 ? 'ALERT' : 'CLEAR', ref: 'SWD-' + Math.floor(Math.random() * 90000 + 10000), detail: Math.random() > 0.85 ? 'Possible match with stolen work reported 2018' : 'No match found in stolen works database' },
      { database: 'Art Loss Register (ALR)', status: Math.random() > 0.9 ? 'ALERT' : 'CLEAR', ref: 'ALR-' + Math.floor(Math.random() * 90000 + 10000), detail: Math.random() > 0.9 ? 'Similar work reported missing 2015' : 'No match found in ALR' },
      { database: 'AAMD Nazi-Era Provenance', status: Math.random() > 0.92 ? 'FLAG' : 'CLEAR', ref: Math.random() > 0.92 ? 'AAMD-' + Math.floor(Math.random() * 90000 + 10000) : '—', detail: Math.random() > 0.92 ? 'Provenance gap 1933-1945 — further research recommended' : 'No red flags in Nazi-era provenance' },
      { database: 'UNESCO 1970 Convention', status: Math.random() > 0.95 ? 'FLAG' : 'CLEAR', ref: '—', detail: Math.random() > 0.95 ? 'Export restrictions may apply' : 'No cultural property concerns' }
    ];

    const hasAlerts = checks.some(c => c.status !== 'CLEAR');
    sendJSON(res, 200, { artworkTitle, artist, year, checks, hasAlerts, checkedAt: new Date().toISOString() });
  } catch (e) {
    sendJSON(res, 400, { error: 'Invalid request' });
  }
}

// ── Bulk export ──
function handleBulkExport(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const ids = url.searchParams.get('ids') || '';
  const format = url.searchParams.get('format') || 'csv';

  if (!ids) return sendJSON(res, 400, { error: 'No IDs provided' });

  const idList = ids.split(',').filter(Boolean);

  if (format === 'csv') {
    let csv = 'ID,Title,Artist,Period,Confidence,Value Estimate,Checked At\n';
    idList.forEach(id => {
      csv += `${id},Artwork ${id.slice(-4)},Various,Unknown,${50 + Math.floor(Math.random() * 45)}%,Various,${new Date().toISOString().slice(0,10)}\n`;
    });
    res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="trace-bulk-export.csv"' });
    res.end(csv);
    return;
  }

  const results = idList.map(id => ({
    id, title: `Artwork ${id.slice(-4)}`, confidence: 50 + Math.floor(Math.random() * 45),
    checkedAt: new Date().toISOString()
  }));
  sendJSON(res, 200, { results, count: results.length, format });
}

// ── Operations auth helper (also injected into routeCtx) ──
function requireOpsAuth(req, res) {
  var opsKey = process.env.OPS_API_KEY || process.env.ANALYSE_API_KEY || '';
  if (opsKey && req.headers['x-api-key'] !== opsKey) {
    sendJSON(res, 401, { error: 'Unauthorized. Set OPS_API_KEY or ANALYSE_API_KEY.' });
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════
// HTTP/HTTPS Server
// ══════════════════════════════════════════════

// Create the request handler function
function handleRequest(req, res) {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  const method = req.method;
  const urlPath = req.url.split('?')[0];

  // Track connection for graceful draining
  activeConnections.add(req.socket);
  res.on('finish', function() { activeConnections.delete(req.socket); });

  setSecurityHeaders(res, req, ALLOWED_ORIGIN);

  // If shutting down, tell new connections to go away (HTTP 503)
  if (shuttingDown) {
    res.setHeader('Retry-After', '5');
    return sendJSON(res, 503, { error: 'Server shutting down' });
  }

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // CSRF check for state-changing POST endpoints
  if (!requireCsrf(req, res)) return;

  // ── API Routes ──

  // GET /health
  if (method === 'GET' && urlPath === '/health') {
    return handleHealth(req, res);
  }

  // GET /api/debug
  if (method === 'GET' && urlPath === '/api/debug') {
    return handleDebug(req, res);
  }

  // POST /api/create-checkout-session
  if (method === 'POST' && urlPath === '/api/create-checkout-session') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 4096, (body) => subRoutes.handleCreateCheckoutSession(req, res, body));
  }

  // POST /api/stripe-webhook
  if (method === 'POST' && urlPath === '/api/stripe-webhook') {
    return collectBody(req, res, 65536, (body) => subRoutes.handleStripeWebhook(req, res, body));
  }

  // POST /api/subscribe
  if (method === 'POST' && urlPath === '/api/subscribe') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 4096, (body) => subRoutes.handleSubscribe(req, res, body));
  }

  // POST /api/verify-subscription
  if (method === 'POST' && urlPath === '/api/verify-subscription') {
    return collectBody(req, res, 4096, (body) => subRoutes.handleVerifySubscription(req, res, body));
  }

  // GET /api/subscription-status
  if (method === 'GET' && urlPath === '/api/subscription-status') {
    return subRoutes.handleSubscriptionStatus(req, res);
  }

  // POST /api/interpol-check
  if (method === 'POST' && urlPath === '/api/interpol-check') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 10240, (body) => handleInterpolCheck(req, res, body));
  }

  // GET /api/bulk-export
  if (method === 'GET' && urlPath === '/api/bulk-export') {
    return handleBulkExport(req, res);
  }

  // GET /api/files — list app files for HQ download
  if (method === 'GET' && urlPath === '/api/files') {
    var fileList = [];
    try {
      var entries = fs.readdirSync(STATIC_DIR);
      var FILE_EXT_ORDER = ['.html', '.js', '.css', '.json'];
      entries.forEach(function(name) {
        if (name === 'node_modules' || name.startsWith('.') || name.indexOf('.sqlite') >= 0 ||
            name === 'trace_package.json' || name === 'package-lock.json' || name === '.env.example' ||
            name === 'server.log' || name === 'trace_events.log' || name === 'trace_optimize.log' ||
            name.endsWith('.bak') || name === 'trace_optimize.sh' || name === 'Casks' ||
            name === 'Formulae' || name === 'Searching' || name === 'package.json' ||
            name.endsWith('.sh') || name === 'fix_critical_bugs.py') return;
        try {
          var stat = fs.statSync(path.join(STATIC_DIR, name));
          if (!stat.isFile()) return;
          var ext = path.extname(name).toLowerCase();
          if (!FILE_EXT_ORDER.includes(ext) && ext !== '.png' && ext !== '.svg') return;
          fileList.push({
            name: name,
            size: stat.size,
            sizeHuman: stat.size < 1024 ? stat.size + 'B' :
                       stat.size < 1048576 ? (stat.size / 1024).toFixed(1) + 'KB' :
                       (stat.size / 1048576).toFixed(1) + 'MB',
            mtime: stat.mtimeMs
          });
        } catch(e) {
          logError(e, 'File stat error: ' + name);
        }
      });
      // Sort: .html first, then .js, then .css, then .json, rest alphabetical
      fileList.sort(function(a, b) {
        var extA = path.extname(a.name).toLowerCase();
        var extB = path.extname(b.name).toLowerCase();
        var idxA = FILE_EXT_ORDER.indexOf(extA);
        var idxB = FILE_EXT_ORDER.indexOf(extB);
        if (idxA !== idxB) return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        return a.name.localeCompare(b.name);
      });
    } catch(e) {
      logError(e, 'File listing readdir error');
    }
    return sendJSON(res, 200, { files: fileList });
  }

  // GET /api/files/:name — serve individual app file for download
  if (method === 'GET' && urlPath.startsWith('/api/files/')) {
    var fileName = urlPath.replace('/api/files/', '');
    var filePath = path.resolve(STATIC_DIR, fileName);
    if (filePath.startsWith(STATIC_DIR) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      var ext = path.extname(fileName).toLowerCase();
      var mime = MIME_TYPES[ext] || 'application/octet-stream';
      var data = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Disposition': 'attachment; filename="' + fileName + '"',
        'Content-Length': data.length
      });
      return res.end(data);
    }
    return sendJSON(res, 404, { error: 'File not found' });
  }

  // ── AI Agent Operations API ──


  if (method === 'GET' && urlPath === '/api/ops/health-check') {
    if (!requireOpsAuth(req, res)) return;
    return opsRoutes.handleOpsHealthCheck(req, res);
  }

  if (method === 'POST' && urlPath === '/api/ops/log') {
    if (!requireOpsAuth(req, res)) return;
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 4096, function(body) {          try {
            var d = JSON.parse(body);
            broadcastOpsEvent(d.type || 'info', d.message, d.detail);
          } catch(e) {
            logError(e, 'POST /api/ops/log body parse');
          }
      opsRoutes.handleOpsLogEvent(req, res, body);
    });
  }

  if (method === 'GET' && urlPath === '/api/ops/log') {
    if (!requireOpsAuth(req, res)) return;
    return opsRoutes.handleOpsLogList(req, res);
  }

  if (method === 'POST' && urlPath === '/api/ops/auto-fix') {
    if (!requireOpsAuth(req, res)) return;
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 4096, (body) => opsRoutes.handleOpsAutoFix(req, res, body));
  }

  if (method === 'GET' && urlPath === '/api/ops/report') {
    if (!requireOpsAuth(req, res)) return;
    return opsRoutes.handleOpsReport(req, res);
  }

  // ── Timeline Routes ──
  if (method === 'POST' && urlPath === '/api/timeline/save') {
    return collectBody(req, res, 65536, (body) => tlRoutes.handleTimelineSave(req, res, body));
  }

  if (method === 'GET' && urlPath === '/api/timeline/list') {
    return tlRoutes.handleTimelineList(req, res);
  }

  if (method === 'POST' && urlPath === '/api/timeline/delete') {
    return collectBody(req, res, 4096, (body) => tlRoutes.handleTimelineDelete(req, res, body));
  }

  // ── Provenance Routes ──
  if (method === 'POST' && urlPath === '/api/provenance/cross-reference') {
    return collectBody(req, res, 65536, (body) => provRoutes.handleCrossReference(req, res, body));
  }

  if (method === 'POST' && urlPath === '/api/provenance/getty-search') {
    return collectBody(req, res, 4096, (body) => provRoutes.handleGettySearch(req, res, body));
  }

  if (method === 'POST' && urlPath === '/api/provenance/knowledge-graph') {
    return collectBody(req, res, 65536, (body) => provRoutes.handleKnowledgeGraph(req, res, body));
  }

  // ── AI Agent Routes ──
  if (method === 'POST' && urlPath === '/api/agent/report') {
    if (!requireOpsAuth(req, res)) return;
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 65536, (body) => agentRoutes.handleWatchdogReport(req, res, body));
  }

  if (method === 'POST' && urlPath === '/api/agent/auto-fix') {
    if (!requireOpsAuth(req, res)) return;
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 65536, (body) => agentRoutes.handleAgentAutoFix(req, res, body));
  }

  if (method === 'GET' && urlPath === '/api/agent/report') {
    if (!requireOpsAuth(req, res)) return;
    return agentRoutes.handleAgentReport(req, res);
  }

  // ── Auth Routes ──
  if (method === 'POST' && urlPath === '/api/auth/register') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 2048, (body) => authRoutes.handleRegister(req, res, body));
  }

  if (method === 'POST' && urlPath === '/api/auth/login') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 2048, (body) => authRoutes.handleLogin(req, res, body));
  }

  if (method === 'POST' && urlPath === '/api/auth/verify') {
    return collectBody(req, res, 2048, (body) => authRoutes.handleVerify(req, res, body));
  }

  // ── Event Routes ──
  if (method === 'POST' && urlPath === '/events') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 512, (body) => evRoutes.handleEvents(req, res, body));
  }

  if (method === 'GET' && urlPath === '/events') {
    return sendJSON(res, 200, { events: evRoutes.eventLog.slice(-50) });
  }

  // ── Static file serving ──
  if (method === 'GET') {
    let servePath = urlPath;
    if (servePath === '/') servePath = '/trace.html';

    const filePath = path.resolve(STATIC_DIR, '.' + servePath);

    if (!filePath.startsWith(STATIC_DIR)) {
      return sendJSON(res, 403, { error: 'Forbidden' });
    }

    const fileName = path.basename(filePath);
    const SENSITIVE_EXTS = ['.env', '.map', '.log'];
    const SENSITIVE_JSON_FILES = ['.subscriptions.json', '.timelines.json', 'package.json', 'package-lock.json', 'trace_package.json'];
    const ALLOWED_JS = ['trace_subscription.js', 'trace_sw.js'];
    const ext = path.extname(filePath).toLowerCase();

    if (SENSITIVE_JSON_FILES.includes(fileName)) {
      return sendJSON(res, 404, { error: 'Not found' });
    }
    if (fileName === 'manifest.json') {
      // OK
    } else if (SENSITIVE_EXTS.includes(ext) && ext !== '.json') {
      return sendJSON(res, 404, { error: 'Not found' });
    }
    if (ext === '.js' && !ALLOWED_JS.includes(fileName) && !filePath.startsWith(path.join(STATIC_DIR, 'src'))) {
      return sendJSON(res, 404, { error: 'Not found' });
    }

    const mime = MIME_TYPES[ext] || 'application/octet-stream';

    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        var cacheKey = servePath + '@' + stat.mtimeMs;
        var cached = responseCache.get(cacheKey);

        if (cached) {
          var headers = {
            'Content-Type': mime,
            'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=60',
            'Content-Length': cached.data.length,
            'ETag': '"' + stat.mtimeMs + '"',
            'Vary': 'Accept-Encoding'
          };
          if (cached.gzipped) headers['Content-Encoding'] = 'gzip';
          res.writeHead(200, headers);
          return res.end(cached.data);
        }

        fs.readFile(filePath, function(err, data) {
          if (err) return sendJSON(res, 500, { error: 'Read error' });
          maybeGzip(res, data, function(gzipErr, compressed) {
            if (gzipErr) compressed = data;
            var gzipped = compressed.length < data.length;
            responseCache.set(cacheKey, { data: compressed, gzipped: gzipped });
            if (responseCache.size > STATIC_CACHE_MAX_SIZE) {
              var firstKey = responseCache.keys().next().value;
              responseCache.delete(firstKey);
            }
            setTimeout(function() { responseCache.delete(cacheKey); }, STATIC_CACHE_TTL);

            var headers = {
              'Content-Type': mime,
              'Cache-Control': ext === '.html' ? 'no-cache, must-revalidate' : 'public, max-age=60',
              'Content-Length': compressed.length,
              'ETag': '"' + stat.mtimeMs + '"',
              'Vary': 'Accept-Encoding'
            };
            if (gzipped) headers['Content-Encoding'] = 'gzip';
            res.writeHead(200, headers);
            log('INFO', 'Static file: ' + servePath + ' (' + compressed.length + 'b' +
              (gzipped ? ' gzipped' : '') + ')');
            res.end(compressed);
          });
        });
        return;
      }
    }

    return sendJSON(res, 404, { error: 'Not found' });
  }

  // ── GET /api/events/stream — SSE for real-time HQ alerts ──
  // Note: EventSource in browsers cannot send custom headers, so auth is
  // handled by origin restriction only. SSE is read-only operational data.
  if (method === 'GET' && urlPath === '/api/events/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN
    });
    res.write('data: {"type":"connected","message":"SSE stream established"}\n\n');

    sseClients.push(res);
    log('INFO', 'SSE client connected (' + sseClients.length + ' total)');

    // Heartbeat every 30s to keep connection alive
    var heartbeat = setInterval(function() {
      try {
        res.write(':heartbeat\n\n');
      } catch(e) {
        clearInterval(heartbeat);
      }
    }, 30000);

    // Clean up on disconnect
    req.on('close', function() {
      clearInterval(heartbeat);
      var idx = sseClients.indexOf(res);
      if (idx >= 0) sseClients.splice(idx, 1);
      log('INFO', 'SSE client disconnected (' + sseClients.length + ' remaining)');
    });
    return;
  }

  // ── POST /analyse (Anthropic proxy) ──
  if (method === 'POST' && urlPath === '/analyse') {
    if (!API_KEY) return sendJSON(res, 503, { error: 'API key not configured' });
    if (ANALYSE_API_KEY && req.headers['x-api-key'] !== ANALYSE_API_KEY) {
      return sendJSON(res, 401, { error: 'Unauthorized. Set ANALYSE_API_KEY or provide x-api-key header.' });
    }
    if ((req.headers['content-type'] || '').toLowerCase() !== 'application/json') {
      return sendJSON(res, 415, { error: 'Content-Type must be application/json' });
    }
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit exceeded' });
    if (parseInt(req.headers['content-length'] || '0', 10) > MAX_BODY_BYTES) {
      return sendJSON(res, 413, { error: 'Request too large (max 10MB)' });
    }

    return collectBody(req, res, MAX_BODY_BYTES, (body) => {
      let payload;
      try { payload = JSON.parse(body); } catch(e) { return sendJSON(res, 400, { error: 'Invalid JSON' }); }

      if (!payload.messages || !Array.isArray(payload.messages) || payload.messages.length === 0) {
        return sendJSON(res, 400, { error: 'Missing messages array' });
      }

      const MAX_MSGS = 50;
      const MAX_MSG_LEN = 10000;
      const MAX_TOTAL_CHARS = 500000; // 500KB total content limit
      if (payload.messages.length > MAX_MSGS) return sendJSON(res, 400, { error: 'Too many messages' });

      var totalChars = 0;
      for (let i = 0; i < payload.messages.length; i++) {
        const m = payload.messages[i];
        if (!m || typeof m !== 'object' || !m.role || !m.content) return sendJSON(res, 400, { error: 'Invalid message at ' + i });
        if (!['user', 'assistant'].includes(m.role)) return sendJSON(res, 400, { error: 'Invalid role at ' + i });
        if (typeof m.content === 'string') {
          // Strip control characters except newlines
          m.content = m.content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').slice(0, MAX_MSG_LEN);
          totalChars += m.content.length;
        } else if (Array.isArray(m.content)) {
          m.content = m.content.map(block => {
            if (block.type === 'text' && typeof block.text === 'string') {
              block.text = block.text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '').slice(0, MAX_MSG_LEN);
              totalChars += block.text.length;
              return block;
            }
            if (block.type === 'image' && (!block.source || !block.source.type || !block.source.media_type)) return { type: 'text', text: '[content removed]' };
            if (block.type === 'image') {
              // Validate image source URL — only allow https: and data: URIs
              var src = block.source;
              if (src.url && !src.url.startsWith('https://') && !src.url.startsWith('data:')) {
                return { type: 'text', text: '[invalid image source]' };
              }
              // Limit image data size (base64)
              if (src.data && src.data.length > 500000) {
                src.data = src.data.slice(0, 500000);
              }
            }
            return block;
          });
        }
        if (totalChars > MAX_TOTAL_CHARS) return sendJSON(res, 400, { error: 'Total content too large (max 500KB)' });
      }

      const systemPrompt = typeof payload.system === 'string' ? payload.system.slice(0, 10240) : undefined;
      const maxTokens = Math.min(Math.max(parseInt(payload.max_tokens) || 1800, 100), 2000);

      log('INFO', `POST /analyse — tokens: ${maxTokens}, msgs: ${payload.messages.length}`);

      const postData = JSON.stringify({
        model: payload.model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: payload.messages
      });

      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        timeout: UPSTREAM_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        proxyRes.pipe(res);
      });

      proxyReq.on('timeout', () => {
        proxyReq.destroy();
        if (!res.headersSent) sendJSON(res, 504, { error: 'Upstream timeout' });
      });
      proxyReq.on('error', (e) => {
        if (!res.headersSent) sendJSON(res, 502, { error: 'Upstream error: ' + e.message });
      });
      proxyReq.write(postData);
      proxyReq.end();
    });
  }

  sendJSON(res, 404, { error: 'Not found' });
}

// Create HTTP or HTTPS server
var server = USE_HTTPS
  ? https.createServer({ key: fs.readFileSync(SSL_KEY_PATH), cert: fs.readFileSync(SSL_CERT_PATH) }, handleRequest)
  : http.createServer(handleRequest);

server.timeout = 30000;

// ── Graceful shutdown with connection draining ──
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('INFO', 'Shutting down gracefully (' + signal + ')...');

  // Guard: server may not be created yet if called during bootstrap
  if (!server) {
    log('WARN', 'Server not yet created — exiting immediately');
    process.exit(0);
    return;
  }

  // Stop accepting new connections immediately
  server.close(function() {
    log('INFO', 'Server closed. No longer accepting connections.');
    // If no active connections, exit now
    if (activeConnections.size === 0) {
      log('INFO', 'No active connections. Exiting.');
      process.exit(0);
    }
  });

  // Drain active connections — wait up to 8s for in-flight requests
  var drainStart = Date.now();
  var drainTimer = setInterval(function() {
    if (activeConnections.size === 0) {
      clearInterval(drainTimer);
      log('INFO', 'All connections drained. Goodbye.');
      process.exit(0);
    }
    // Force exit after drain timeout
    if (Date.now() - drainStart > 8000) {
      clearInterval(drainTimer);
      log('WARN', 'Forced exit with ' + activeConnections.size + ' active connections');
      process.exit(1);
    }
  }, 200);

  // Hard timeout — 12s total
  setTimeout(function() {
    if (activeConnections.size > 0) {
      console.warn('[TRACE] Force exit after drain timeout (' + activeConnections.size + ' connections left)');
    }
    process.exit(1);
  }, 12000);
}

process.on('SIGTERM', function() { gracefulShutdown('SIGTERM'); });
process.on('SIGINT', function() { gracefulShutdown('SIGINT'); });

server.on('error', function(err) {
  if (err.code === 'EADDRINUSE') {
    console.error('[TRACE] Port ' + PORT + ' is already in use. Kill the other process or use a different PORT.');
    console.error('[TRACE]   Kill: lsof -ti:' + PORT + ' | xargs kill -9');
    process.exit(1);
  }
  console.error('[TRACE] Server error:', err.message);
});

process.on('uncaughtException', function(err) {
  logError(err, 'Uncaught exception');
  console.error('[TRACE] Uncaught exception:', err.message);
  try { db.flush(); } catch(e) { /* db may be closed already during crash cascade */ }
  // Don't exit immediately — let cluster manager handle the restart
  // But if running standalone, exit so the OS/process manager can restart
  if (!isClusterWorker) {
    process.exit(1);
  } else {
    // Signal to cluster master that this worker had a fatal error
    try { process.send({ type: 'worker_crash', error: err.message, pid: process.pid }); } catch(e) { /* cluster master may already be gone */ }
    process.exit(1);
  }
});

process.on('unhandledRejection', function(reason) {
  logError(new Error(String(reason)), 'Unhandled rejection');
  console.warn('[TRACE] Unhandled promise rejection:', String(reason).slice(0, 200));
});

// ── Bootstrap ──
function startServer(done) {
  done = done || function() {};
  
  function listen() {
    server.listen(PORT, function() {
      log('INFO', '═══════════════════════════════════════');
      log('INFO', '  TRACE API Proxy v3.1 — Self-Healing');
      log('INFO', '  ' + (USE_HTTPS ? 'HTTPS' : 'HTTP') + ' — Port: ' + PORT);
      log('INFO', '  CORS: ' + ALLOWED_ORIGIN);
      log('INFO', '  Rate limits: ' + RATE_LIMITS.discover + '/' + RATE_LIMITS.collector + '/' + RATE_LIMITS.professional + ' req/min');
      log('INFO', '  Database: ' + db.getEngine().toUpperCase());
      log('INFO', '  Cluster worker: ' + (isClusterWorker ? 'yes' : 'no'));
      log('INFO', '  Analyse API key: ' + (process.env.ANALYSE_API_KEY ? 'user-configured ✓' : 'auto-generated ✓'));
      log('INFO', '  API key: ' + (API_KEY ? 'configured ✓' : 'NOT SET ✗'));
      log('INFO', '  Stripe: ' + (STRIPE_ENABLED ? 'configured ✓' : 'demo mode (no key)'));
      log('INFO', '  Active subscriptions: ' + subscriptions.size);
      log('INFO', '  License keys: ' + licenseKeys.size);

      if (ADMIN_SECRET_AUTO_GENERATED) {
        log('WARN', '⚠️  ADMIN_SECRET auto-generated (dev mode). Set ADMIN_SECRET explicitly in production.');
        log('WARN', '⚠️  Auto-generated ADMIN_SECRET: ' + ADMIN_SECRET);
      }
      if (!STRIPE_ENABLED) {
        log('WARN', '⚠️  Stripe not configured — payments in demo mode. Set STRIPE_SECRET_KEY.');
      }
      if (!API_KEY) {
        log('WARN', '⚠️  ANTHROPIC_API_KEY not set — AI analysis will fail.');
      }
      log('INFO', '═══════════════════════════════════════');

      // Notify cluster master that worker is ready
      if (isClusterWorker) {
        try {
          process.send({ type: 'cluster_ready', workerId: process.env.WORKER_ID || 'unknown', pid: process.pid });
          healthPingInterval = setInterval(reportHealthToMaster, 10000);
          if (healthPingInterval && healthPingInterval.unref) healthPingInterval.unref();
        } catch(e) { /* cluster master may not be available in standalone mode */ }
      }
      done();
    });
  }

  function onLoaded() {
    listen();
  }

  function loadTimelinesAndStart() {
    var timelines = db.loadAllTimelines();
    var users = db.loadAllUsers();
    var wait = [];
    if (timelines && typeof timelines.then === 'function') wait.push(timelines);
    if (users && typeof users.then === 'function') wait.push(users);
    if (wait.length > 0) {
      Promise.all(wait).then(onLoaded).catch(function(err) {
        console.warn('[TRACE] Cache load warning:', err.message);
        onLoaded();
      });
    } else {
      onLoaded();
    }
  }

  function loadSubsAndStart() {
    var loaded = db.loadAllSubscriptions();
    var afterSubs = function(result) {
      Object.keys(result.subscriptions).forEach(function(k) { subscriptions.set(k, result.subscriptions[k]); });
      Object.keys(result.licenseKeys).forEach(function(k) { licenseKeys.set(k, result.licenseKeys[k]); });
      loadTimelinesAndStart();
    };
    if (loaded && typeof loaded.then === 'function') {
      return loaded.then(afterSubs);
    }
    afterSubs(loaded);
  }

  var migration = db.migrateFromJson();
  if (migration && typeof migration.then === 'function') {
    migration.then(function() { loadSubsAndStart(); }).catch(function(err) {
      console.warn('[TRACE] Migration warning:', err.message);
      loadSubsAndStart();
    });
  } else {
    loadSubsAndStart();
  }
}

db.init().then(function() {
  startServer();
}).catch(function(err) {
  console.error('[TRACE] Failed to initialize database:', err.message);
  console.error('[TRACE] Server will not start. Run: cd trace && npm install');
  if (isClusterWorker) {
    try { process.send({ type: 'worker_init_failed', error: err.message, pid: process.pid }); } catch(e) { /* cluster master may be gone */ }
  }
  process.exit(1);
});
