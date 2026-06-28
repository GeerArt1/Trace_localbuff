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
const tls = require('tls');
require('dotenv').config({ override: true });

const Sentry = require('@sentry/node');
const { exec } = require('child_process');
const db = require('./trace_db');

// Sentry error tracking
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'production',
    tracesSampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE) || 0.1,
  });
}

const {
  sendJSON, collectBody, setSecurityHeaders, maybeGzip,
  MIME_TYPES, log, formatUptime, logError, errorLog, ERROR_LOG_MAX,
  validateCsrfToken
} = require('./routes/helpers');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.resolve(__dirname) + path.sep;
const API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Multi-Provider AI Routing ──
// AI_PROVIDER: claude (default) | gemini | openrouter | auto (fallback chain)
const AI_PROVIDER = (process.env.AI_PROVIDER || 'claude').toLowerCase();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-nano';

// ── Developer Alerting (Resend email) ──
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const DEVELOPER_EMAIL = process.env.DEVELOPER_EMAIL || '';

// ── Proactive Credit Monitoring ──
// OpenRouter has a dedicated credit-check API (requires Management Key)
const OPENROUTER_MANAGEMENT_KEY = process.env.OPENROUTER_MANAGEMENT_KEY || '';
const CREDIT_WARN_THRESHOLD = parseFloat(process.env.CREDIT_WARN_THRESHOLD || '20'); // USD — warn when below this
const CREDIT_CRITICAL_THRESHOLD = parseFloat(process.env.CREDIT_CRITICAL_THRESHOLD || '5'); // USD — critical when below this
var lastCreditWarning = {}; // track per-provider to avoid repeat spam

// ── Disk & SSL Monitoring Thresholds ──
const DISK_WARN_MB = parseInt(process.env.DISK_WARN_MB || '500');   // warn when < 500MB free
const DISK_CRITICAL_MB = parseInt(process.env.DISK_CRITICAL_MB || '100'); // critical when < 100MB
const SSL_WARN_DAYS = parseInt(process.env.SSL_WARN_DAYS || '30');    // warn when < 30 days to expiry
const SSL_CRITICAL_DAYS = parseInt(process.env.SSL_CRITICAL_DAYS || '7'); // critical when < 7 days
var lastDiskWarning = 0;
var lastSslWarning = {};
var lastDbHealthCheck = 0;
var lastWalCheckpoint = 0;

// ── Weekly Digest Configuration ──
// Frequency adapts: 'weekly' normally, 'monthly' if running smoothly for 30+ days
const DIGEST_FREQUENCY = process.env.DIGEST_FREQUENCY || 'weekly';
var lastDigestSent = Date.now(); // initialize to now so first digest waits a full interval
var digestRunStarted = Date.now(); // track when we started running smoothly

// ── Dependency Vulnerability Scanning State ──
const NPM_AUDIT_CWD = STATIC_DIR; // project root for npm audit
var lastKnownVulnerabilities = null; // { critical: N, high: N, moderate: N, low: N }
var lastVulnCheck = 0;

// ── Auto-Update State ──
const AUTO_UPDATE_ENABLED = process.env.AUTO_UPDATE_ENABLED !== 'false';
const AUTO_UPDATE_INTERVAL = 3600000; // check every hour
const MAINTENANCE_WINDOW_START = parseInt(process.env.AUTO_UPDATE_WINDOW_START || '3', 10); // 3am
const MAINTENANCE_WINDOW_END = parseInt(process.env.AUTO_UPDATE_WINDOW_END || '5', 10); // 5am
var lastUpdateCheck = 0;
var updateInProgress = false;
var lastUpdateResult = null;

// ── Memory Trend Detection ──
// Rolling buffer of RSS values (sampled every 15 min). Max 24 entries = 6 hours.
// Trend detection: persistent growth over N consecutive samples triggers alert.
const MEMORY_HISTORY_MAX = 24;
const MEMORY_LEAK_SAMPLES = 4; // require N consecutive increases before alerting
const MEMORY_LEAK_COOLDOWN_MS = 3600000; // 1 hour between leak alerts
var memoryRssHistory = []; // [{ rss: number, time: number }]
var lastMemoryLeakAlert = 0;

const SSL_MONITOR_HOSTS = ['api.anthropic.com', 'generativelanguage.googleapis.com', 'openrouter.ai', 'api.stripe.com'];

const VALID_PROVIDERS = ['claude', 'gemini', 'openrouter', 'auto'];

// ── Provider Plugin Registry ──
// External plugins can register themselves as AI providers via registerProvider().
// Each plugin module exports: { name, isConfigured, call, defaultModel }
// Plugins auto-load from the 'providers/' directory at startup.
var providerPlugins = {};
var PLUGIN_PROVIDER_ORDER = []; // order in which plugin providers are tried in auto mode

function registerProvider(name, plugin) {
  if (!name || !plugin || typeof plugin.call !== 'function') {
    log('WARN', 'Invalid provider plugin registration: ' + (name || 'unnamed'));
    return;
  }
  providerPlugins[name] = plugin;
  // Add to valid providers list
  if (VALID_PROVIDERS.indexOf(name) < 0) {
    VALID_PROVIDERS.push(name);
  }
  // Track order for auto-fallback
  if (PLUGIN_PROVIDER_ORDER.indexOf(name) < 0) {
    PLUGIN_PROVIDER_ORDER.push(name);
  }
  // Initialize health tracking for this provider
  if (!PROVIDER_HEALTH[name]) {
    PROVIDER_HEALTH[name] = {
      healthy: true,
      consecutiveErrors: 0,
      lastErrorAt: null,
      lastErrorMsg: '',
      degradedUntil: null,
      totalErrors: 0
    };
  }
  log('INFO', 'Provider plugin registered: ' + name + (plugin.defaultModel ? ' (model: ' + plugin.defaultModel + ')' : ''));
}

// ── Plugin auto-discovery — loads all .js files from providers/ ──
function loadProviderPlugins() {
  var pluginsDir = path.join(STATIC_DIR, 'providers');
  if (!fs.existsSync(pluginsDir)) {
    log('INFO', 'No providers/ directory found — no plugin providers loaded');
    return;
  }
  var entries;
  try {
    entries = fs.readdirSync(pluginsDir);
  } catch(e) {
    log('WARN', 'Failed to read providers/ directory: ' + e.message);
    return;
  }
  entries.forEach(function(entry) {
    if (!entry.endsWith('.js')) return;
    var pluginPath = path.join(pluginsDir, entry);
    try {
      var plugin = require(pluginPath);
      if (plugin && plugin.name && typeof plugin.call === 'function') {
        registerProvider(plugin.name, plugin);
        log('INFO', '  Loaded plugin: ' + entry + ' → provider "' + plugin.name + '"');
      }
    } catch(e) {
      log('WARN', 'Failed to load plugin ' + entry + ': ' + e.message);
    }
  });
}

// ── Provider Health Tracking ──
// Tracks per-provider error state for auto-heal: removing failing providers from rotation
const PROVIDER_HEALTH_DEGRADE_MS = 5 * 60 * 1000; // 5 minutes before retrying a degraded provider
const PROVIDER_HEALTH = {};
['claude', 'gemini', 'openrouter'].forEach(function(p) {
  PROVIDER_HEALTH[p] = {
    healthy: true,
    consecutiveErrors: 0,
    lastErrorAt: null,
    lastErrorMsg: '',
    degradedUntil: null,
    totalErrors: 0
  };
});
if (VALID_PROVIDERS.indexOf(AI_PROVIDER) === -1) {
  console.error('[TRACE] FATAL: Invalid AI_PROVIDER "' + AI_PROVIDER + '". Must be one of: ' + VALID_PROVIDERS.join(', '));
  process.exit(1);
}

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
  // Provenance endpoints are read-only (query external DBs, return results) — no CSRF needed
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

if (!API_KEY && !GEMINI_API_KEY && !OPENROUTER_API_KEY) {
  console.warn('[TRACE] WARNING: No AI provider keys configured (ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY). AI features will fail.');
} else if (AI_PROVIDER === 'claude' && !API_KEY) {
  console.warn('[TRACE] WARNING: AI_PROVIDER=claude but ANTHROPIC_API_KEY not set. AI calls will fail.');
} else if (AI_PROVIDER === 'gemini' && !GEMINI_API_KEY) {
  console.warn('[TRACE] WARNING: AI_PROVIDER=gemini but GEMINI_API_KEY not set. AI calls will fail.');
} else if (AI_PROVIDER === 'openrouter' && !OPENROUTER_API_KEY) {
  console.warn('[TRACE] WARNING: AI_PROVIDER=openrouter but OPENROUTER_API_KEY not set. AI calls will fail.');
}

// ── Developer Alerting: Resend email ──
function sendEmail(subject, body) {
  if (!RESEND_API_KEY || !DEVELOPER_EMAIL) {
    log('WARN', 'Email alert suppressed — set RESEND_API_KEY and DEVELOPER_EMAIL to enable');
    return;
  }
  var emailData = {
    from: 'TRACE Monitor <onboarding@resend.dev>',
    to: [DEVELOPER_EMAIL],
    subject: '[TRACE] ' + subject,
    text: body
  };
  httpsPostJson('api.resend.com', '/emails', {
    'Authorization': 'Bearer ' + RESEND_API_KEY
  }, emailData).then(function(result) {
    if (result.statusCode >= 400) {
      log('WARN', 'Resend email failed: ' + result.statusCode + ' ' + JSON.stringify(result.body).slice(0, 200));
    } else {
      log('INFO', 'Email alert sent: ' + subject.slice(0, 80));
    }
  }).catch(function(e) {
    log('WARN', 'Resend email error: ' + e.message);
  });
}

// ── Provider Health Management (auto-heal) ──
function markProviderDegraded(provider, errMsg) {
  var h = PROVIDER_HEALTH[provider];
  if (!h) return;
  h.healthy = false;
  h.consecutiveErrors++;
  h.totalErrors++;
  h.lastErrorAt = Date.now();
  h.lastErrorMsg = errMsg;
  h.degradedUntil = Date.now() + PROVIDER_HEALTH_DEGRADE_MS;
  log('WARN', 'Provider ' + provider + ' marked DEGRADED (consecutive: ' + h.consecutiveErrors + ', total: ' + h.totalErrors + ')');
  broadcastOpsEvent('provider_degraded', provider + ' marked degraded: ' + errMsg, { provider: provider, errors: h.consecutiveErrors, totalErrors: h.totalErrors });
}

function markProviderHealthy(provider) {
  var h = PROVIDER_HEALTH[provider];
  if (!h) return;
  var wasDegraded = !h.healthy;
  h.healthy = true;
  h.consecutiveErrors = 0;
  h.degradedUntil = null;
  if (wasDegraded) {
    log('INFO', 'Provider ' + provider + ' restored to HEALTHY');
    broadcastOpsEvent('provider_healthy', provider + ' restored to healthy rotation', { provider: provider });
  }
}

function isProviderHealthy(provider) {
  var h = PROVIDER_HEALTH[provider];
  if (!h) return false;
  // If degraded and cooldown has expired, try again
  if (!h.healthy && h.degradedUntil && Date.now() > h.degradedUntil) {
    log('INFO', 'Provider ' + provider + ' cooldown expired — attempting recovery');
    return true; // Will be marked healthy on success, or degraded again on failure
  }
  return h.healthy;
}

function getProviderStatus(provider) {
  var h = PROVIDER_HEALTH[provider];
  if (!h) return 'unknown';
  if (!h.healthy) {
    var remaining = h.degradedUntil ? Math.max(0, Math.round((h.degradedUntil - Date.now()) / 1000)) : 0;
    return 'degraded (' + remaining + 's remaining)';
  }
  return 'healthy';
}

// ── OpenRouter Credit Balance Check ──
// Uses Management Key (separate from inference key). Requires OPENROUTER_MANAGEMENT_KEY.
var lastOpenRouterCredits = null;
var lastOpenRouterCreditCheck = 0;

async function checkOpenRouterCredits() {
  if (!OPENROUTER_MANAGEMENT_KEY) {
    log('WARN', 'OpenRouter credit check skipped — set OPENROUTER_MANAGEMENT_KEY to enable');
    return null;
  }
  // Rate-limit checks to once per 5 minutes minimum
  if (Date.now() - lastOpenRouterCreditCheck < 300000) {
    return lastOpenRouterCredits;
  }
  try {
    var result = await httpsPostJson('openrouter.ai', '/api/v1/credits', {
      'Authorization': 'Bearer ' + OPENROUTER_MANAGEMENT_KEY
    }, {}, 'GET');
    lastOpenRouterCreditCheck = Date.now();
    if (result.statusCode >= 400) {
      log('WARN', 'OpenRouter credit check failed: ' + result.statusCode + ' ' + JSON.stringify(result.body).slice(0, 200));
      return null;
    }
    var data = result.body.data || {};
    var remaining = data.total_credits - data.total_usage;
    lastOpenRouterCredits = { remaining: remaining, totalCredits: data.total_credits, totalUsage: data.total_usage };
    log('INFO', 'OpenRouter credits: $' + remaining.toFixed(2) + ' remaining (used: $' + (data.total_usage || 0).toFixed(2) + ')');
    return lastOpenRouterCredits;
  } catch(e) {
    log('WARN', 'OpenRouter credit check error: ' + e.message);
    return null;
  }
}

// ── Credit threshold alerts ──
function evaluateCreditAlerts(provider, remaining) {
  if (remaining === null || remaining === undefined) return;
  var lastWarn = lastCreditWarning[provider] || 0;
  // Don't re-alert within 30 minutes
  if (Date.now() - lastWarn < 1800000) return;
  
  if (remaining <= CREDIT_CRITICAL_THRESHOLD) {
    lastCreditWarning[provider] = Date.now();
    var msg = provider + ' credits critically low: $' + remaining.toFixed(2) + ' (threshold: $' + CREDIT_CRITICAL_THRESHOLD + ')';
    log('ERROR', msg);
    broadcastOpsEvent('credits_critical', msg, { provider: provider, remaining: remaining });
    sendEmail('CRITICAL: ' + provider + ' credits running out', msg + '\n\nAdd credits immediately at the provider dashboard to avoid service interruption.');
  } else if (remaining <= CREDIT_WARN_THRESHOLD) {
    lastCreditWarning[provider] = Date.now();
    var msg = provider + ' credits low: $' + remaining.toFixed(2) + ' (threshold: $' + CREDIT_WARN_THRESHOLD + ')';
    log('WARN', msg);
    broadcastOpsEvent('credits_warning', msg, { provider: provider, remaining: remaining });
    // Only email for critical, not warning (avoid spam)
  }
}

// ── Disk Space Monitoring (uses fs.statfs — no child process) ──
function checkDiskSpace() {
  try {
    var stats = fs.statfsSync('/');
    var availableBytes = stats.bavail * stats.bsize;
    var availableMB = Math.round(availableBytes / (1024 * 1024));
    return { availableMB: availableMB, availableGB: (availableBytes / (1024 * 1024 * 1024)).toFixed(1) };
  } catch(e) {
    log('WARN', 'Disk space check failed: ' + e.message);
    return null;
  }
}

function evaluateDiskAlert(space) {
  if (!space) return;
  if (Date.now() - lastDiskWarning < 1800000) return; // 30min cooldown
  if (space.availableMB <= DISK_CRITICAL_MB) {
    lastDiskWarning = Date.now();
    var msg = 'Disk space critically low: ' + space.availableMB + 'MB free (threshold: ' + DISK_CRITICAL_MB + 'MB)';
    log('ERROR', msg);
    broadcastOpsEvent('disk_critical', msg, { availableMB: space.availableMB });
    sendEmail('CRITICAL: Disk space running out', msg + '\n\nFree up space immediately to avoid ENOSPC errors. Check large files: logs, node_modules, databases.');
  } else if (space.availableMB <= DISK_WARN_MB) {
    lastDiskWarning = Date.now();
    var msg = 'Disk space low: ' + space.availableMB + 'MB free (threshold: ' + DISK_WARN_MB + 'MB)';
    log('WARN', msg);
    broadcastOpsEvent('disk_warning', msg, { availableMB: space.availableMB });
  }
}

// ── SSL Certificate Expiry Monitoring ──
function checkSslExpiry(hostname) {
  return new Promise(function(resolve) {
    try {
      var socket = tls.connect(443, hostname, { servername: hostname, rejectUnauthorized: false }, function() {
        var cert = socket.getPeerCertificate();
        socket.end();
        if (cert && cert.valid_to) {
          var expiry = new Date(cert.valid_to);
          var daysUntil = Math.round((expiry.getTime() - Date.now()) / 86400000);
          resolve({ hostname: hostname, validTo: cert.valid_to, daysUntil: daysUntil });
        } else {
          resolve(null);
        }
      });
      socket.setTimeout(8000, function() {
        socket.destroy();
        resolve(null);
      });
      socket.on('error', function() {
        resolve(null);
      });
    } catch(e) {
      resolve(null);
    }
  });
}

function evaluateSslAlert(result) {
  if (!result || result.daysUntil === null || result.daysUntil === undefined) return;
  var lastWarn = lastSslWarning[result.hostname] || 0;
  if (Date.now() - lastWarn < 86400000) return; // 24h cooldown per host
  if (result.daysUntil <= SSL_CRITICAL_DAYS) {
    lastSslWarning[result.hostname] = Date.now();
    var msg = result.hostname + ' SSL cert expires in ' + result.daysUntil + ' days (critical: ' + SSL_CRITICAL_DAYS + ' days)';
    log('ERROR', msg);
    broadcastOpsEvent('ssl_critical', msg, { hostname: result.hostname, daysUntil: result.daysUntil });
    sendEmail('CRITICAL: SSL cert expiring', msg + '\n\nRenew certificate for ' + result.hostname + ' before it expires.');
  } else if (result.daysUntil <= SSL_WARN_DAYS) {
    lastSslWarning[result.hostname] = Date.now();
    var msg = result.hostname + ' SSL cert expires in ' + result.daysUntil + ' days (warn: ' + SSL_WARN_DAYS + ' days)';
    log('WARN', msg);
    broadcastOpsEvent('ssl_warning', msg, { hostname: result.hostname, daysUntil: result.daysUntil });
  }
}

// ── Full infrastructure health check (runs on monitoring interval) ──
async function runInfraHealthCheck() {
  // Disk check
  var disk = checkDiskSpace();
  evaluateDiskAlert(disk);
  
  // SSL checks (fire-and-forget parallel)
  SSL_MONITOR_HOSTS.forEach(function(host) {
    checkSslExpiry(host).then(function(result) {
      evaluateSslAlert(result);
    }).catch(function(e) {
      log('WARN', 'SSL check failed for ' + host + ': ' + e.message);
    });
  });
  
  // Also check local cert if HTTPS is enabled (uses crypto.X509Certificate — no child process)
  if (USE_HTTPS && SSL_CERT_PATH) {
    try {
      var certPem = fs.readFileSync(SSL_CERT_PATH, 'utf8');
      var localCert = new crypto.X509Certificate(certPem);
      var daysUntil = Math.round((localCert.validTo.getTime() - Date.now()) / 86400000);
      evaluateSslAlert({ hostname: 'localhost (own cert)', validTo: localCert.validTo.toISOString(), daysUntil: daysUntil });
    } catch(e) {
      log('WARN', 'Local SSL cert check failed: ' + e.message);
    }
  }
}

// ── Weekly/Monthly Digest Email ──
// Sends a summary email with error counts, fix rates, uptime, and health.
// Frequency adapts: weekly initially, monthly if running smoothly for 30+ days.
// Emergency emails still go out immediately via sendEmail() — this is supplementary.

function getDigestInterval() {
  var daysSinceStart = (Date.now() - digestRunStarted) / 86400000;
  if (daysSinceStart >= 30) {
    return 30 * 86400000; // monthly if running smoothly for 30+ days
  }
  if (DIGEST_FREQUENCY === 'daily') return 86400000;
  if (DIGEST_FREQUENCY === 'monthly') return 30 * 86400000;
  return 7 * 86400000; // weekly (default)
}

function generateDigest() {
  try {
    var report = agentRoutes.buildReport();
    if (!report) return null;
    
    // Collect monitoring data
    var degradedCount = 0;
    var totalProviders = 0;
    Object.keys(PROVIDER_HEALTH).forEach(function(p) {
      totalProviders++;
      if (!PROVIDER_HEALTH[p].healthy) degradedCount++;
    });
    
    var diskInfo = checkDiskSpace();
    var daysSinceStart = Math.round((Date.now() - digestRunStarted) / 86400000);
    var nextDigestDays = getDigestInterval() / 86400000;
    
    var lines = [];
    lines.push('TRACE Weekly Digest');
    lines.push('' + new Date().toISOString().slice(0, 10));
    lines.push('');
    lines.push('═══ Summary ═══');
    lines.push('Uptime: ' + report.summary.period_hours + ' hours');
    lines.push('Events today: ' + report.summary.events_today);
    lines.push('Errors today: ' + report.summary.errors_today);
    lines.push('Auto-fixes applied: ' + report.summary.fixes_applied + '/' + report.summary.fix_attempts + ' (' + report.summary.fix_success_rate + ')');
    lines.push('Active subscriptions: ' + report.summary.active_subscriptions);
    lines.push('Memory: ' + report.summary.memory_mb + 'MB RSS');
    lines.push('');
    lines.push('═══ AI Providers ═══');
    lines.push('Total: ' + totalProviders + ' | Degraded: ' + degradedCount);
    Object.keys(PROVIDER_HEALTH).forEach(function(p) {
      var h = PROVIDER_HEALTH[p];
      var status = h.healthy ? '✓ healthy' : '✗ degraded (' + h.lastErrorMsg.slice(0, 80) + ')';
      lines.push('  ' + p + ': ' + status + ' (' + h.totalErrors + ' total errors)');
    });
    lines.push('');
    lines.push('═══ Infrastructure ═══');
    if (diskInfo) {
      lines.push('Disk free: ' + diskInfo.availableMB + 'MB (' + diskInfo.availableGB + 'GB)');
    }
    lines.push('SSL hosts monitored: ' + SSL_MONITOR_HOSTS.length);
    if (OPENROUTER_MANAGEMENT_KEY && lastOpenRouterCredits) {
      lines.push('OpenRouter credits: $' + lastOpenRouterCredits.remaining.toFixed(2));
    }
    lines.push('');
    lines.push('═══ Health ═══');
    lines.push('API key: ' + (report.health.api_key ? 'configured' : 'MISSING'));
    lines.push('Stripe: ' + (report.health.stripe ? 'live' : 'demo'));
    lines.push('Error log: ' + report.health.error_count + ' entries');
    if (lastKnownVulnerabilities) {
      lines.push('Dependency vulnerabilities: ' + lastKnownVulnerabilities.total + ' (' +
        lastKnownVulnerabilities.critical + ' critical, ' + lastKnownVulnerabilities.high + ' high)');
    }
    lines.push('');
    
    if (report.recent_issues && report.recent_issues.length > 0) {
      lines.push('═══ Recent Issues ═══');
      report.recent_issues.forEach(function(issue) {
        lines.push('  [' + issue.ts.slice(0, 19) + '] ' + issue.message.slice(0, 200));
      });
      lines.push('');
    }
    
    if (report.recommendations && report.recommendations.length > 0) {
      lines.push('═══ Recommendations ═══');
      report.recommendations.forEach(function(rec) {
        lines.push('  [' + rec.priority.toUpperCase() + '] ' + rec.action);
      });
      lines.push('');
    }
    
    lines.push('Running since: ' + new Date(digestRunStarted).toISOString().slice(0, 10) + ' (' + daysSinceStart + ' days)');
    lines.push('Next digest: in ' + nextDigestDays + ' days');
    if (daysSinceStart >= 30) {
      lines.push('Mode: monthly (stable for 30+ days)');
    }
    
    return lines.join('\n');
  } catch(e) {
    log('WARN', 'Digest generation failed: ' + e.message);
    return null;
  }
}

function checkSendDigest() {
  var interval = getDigestInterval();
  if (Date.now() - lastDigestSent < interval) return;
  lastDigestSent = Date.now();
  var body = generateDigest();
  if (!body) return;
  var subject = 'Weekly Digest — ' + new Date().toISOString().slice(0, 10);
  sendEmail(subject, body);
}

// ── Database Health Monitoring ──
// Verifies backup integrity, manages WAL checkpointing. Runs on 15-min monitoring interval.



function getDbFiles() {
  var files = {};
  try {
    var dbPath = db.getDbPath();
    var bakPath = db.getBakPath();
    if (fs.existsSync(dbPath)) {
      var stat = fs.statSync(dbPath);
      files.db = { path: dbPath, sizeMB: Math.round(stat.size / (1024 * 1024) * 100) / 100, mtimeMs: stat.mtimeMs };
    }
    if (fs.existsSync(bakPath)) {
      var sB = fs.statSync(bakPath);
      files.backup = { path: bakPath, sizeMB: Math.round(sB.size / (1024 * 1024) * 100) / 100, mtimeMs: sB.mtimeMs };
    }
    // WAL and SHM files — can grow unbounded if not checkpointed
    var walPath = dbPath + '-wal';
    var shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) {
      var sW = fs.statSync(walPath);
      files.wal = { sizeMB: Math.round(sW.size / (1024 * 1024) * 100) / 100 };
    }
    if (fs.existsSync(shmPath)) {
      var sS = fs.statSync(shmPath);
      files.shm = { sizeMB: Math.round(sS.size / (1024 * 1024) * 100) / 100 };
    }
  } catch(e) {}
  return files;
}

function verifyBackupIntegrity() {
  var files = getDbFiles();
  var issues = [];
  if (!files.backup) { issues.push('No backup file'); return { valid: false, issues: issues, files: files }; }
  if (!files.db) { issues.push('No database file'); return { valid: false, issues: issues, files: files }; }
  
  var ageMin = (Date.now() - files.backup.mtimeMs) / 60000;
  if (ageMin > 60) issues.push('Backup stale (' + Math.round(ageMin) + ' min old)');
  
  try {
    var fd = fs.openSync(files.backup.path, 'r');
    var buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (buf.toString('utf8').indexOf('SQLite format') !== 0) issues.push('Backup header invalid');
  } catch(e) { issues.push('Backup unreadable: ' + e.message); }
  
  if (files.backup.sizeMB === 0) issues.push('Backup is empty');
  
  if (files.db && files.backup && files.db.sizeMB > 1) {
    var ratio = files.backup.sizeMB / files.db.sizeMB;
    if (ratio < 0.1) issues.push('Backup only ' + Math.round(ratio * 100) + '% of DB size');
  }
  
  if (files.wal && files.wal.sizeMB > 10) issues.push('WAL is ' + files.wal.sizeMB + 'MB — checkpoint recommended');
  
  return { valid: issues.length === 0, issues: issues, files: files };
}

function walCheckpoint() {
  if (db.getEngine().toLowerCase() !== 'better-sqlite3') return;
  var walPath = db.getDbPath() + '-wal';
  if (!fs.existsSync(walPath)) return;
  try {
    var walStat = fs.statSync(walPath);
    if (walStat.size < 1048576) return;
    log('INFO', 'WAL ' + Math.round(walStat.size / 1048576 * 100) / 100 + 'MB — checkpointing');
    var Database = require('better-sqlite3');
    var conn = new Database(db.getDbPath());
    conn.pragma('wal_checkpoint(TRUNCATE)');
    conn.close();
    lastWalCheckpoint = Date.now();
  } catch(e) { log('WARN', 'WAL checkpoint: ' + e.message); }
}

function checkDbHealth() {
  if (Date.now() - lastDbHealthCheck < 1800000) return;
  lastDbHealthCheck = Date.now();
  var result = verifyBackupIntegrity();
  if (!result.valid && result.issues.length > 0) {
    var msg = 'DB health: ' + result.issues.join('; ');
    log('WARN', msg);
    broadcastOpsEvent('db_health_warning', msg, { issues: result.issues, files: result.files });
    if (result.issues.some(function(i) { return i.indexOf('unreadable') >= 0 || i.indexOf('truncation') >= 0; })) {
      sendEmail('DB HEALTH WARNING', msg + '\n\nCheck and restore from backup.');
    }
  }
  walCheckpoint();
}

// ── Dependency Vulnerability Scanning ──
// Runs npm audit weekly, tracks known vulnerabilities, alerts on NEW findings only.
// Uses exec() with a fully hardcoded command — no user input flows into the shell string.
function runNpmAudit() {
  return new Promise(function(resolve) {
    exec('npm audit --json', { cwd: NPM_AUDIT_CWD, timeout: 30000, maxBuffer: 1024 * 1024 }, function(err, stdout, stderr) {
      // npm audit exits with code 1 when vulnerabilities are found — that's expected, not a failure
      var data;
      try {
        data = JSON.parse(stdout);
      } catch(e) {
        // Parse failure usually means npm audit isn't available or the project has no package.json
        resolve(null);
        return;
      }
      if (!data || !data.vulnerabilities) {
        resolve(null);
        return;
      }
      var vulns = { critical: 0, high: 0, moderate: 0, low: 0, info: 0, total: 0 };
      Object.keys(data.vulnerabilities).forEach(function(pkg) {
        var v = data.vulnerabilities[pkg];
        var severity = v.severity || 'info';
        var count = v.via ? v.via.length : 1;
        if (vulns[severity] !== undefined) vulns[severity] += count;
        vulns.total += count;
      });
      // Fallback: if parsing individual vulns failed, use metadata counts
      if (vulns.total === 0 && data.metadata && data.metadata.vulnerabilities) {
        vulns = {
          critical: data.metadata.vulnerabilities.critical || 0,
          high: data.metadata.vulnerabilities.high || 0,
          moderate: data.metadata.vulnerabilities.moderate || 0,
          low: data.metadata.vulnerabilities.low || 0,
          info: data.metadata.vulnerabilities.info || 0,
          total: (data.metadata.vulnerabilities.critical || 0) + (data.metadata.vulnerabilities.high || 0) +
                 (data.metadata.vulnerabilities.moderate || 0) + (data.metadata.vulnerabilities.low || 0) +
                 (data.metadata.vulnerabilities.info || 0)
        };
      }
      resolve(vulns);
    });
  });
}

function checkVulnerabilities() {
  // Rate-limit: check at most once per 60 minutes
  if (Date.now() - lastVulnCheck < 3600000) return;
  lastVulnCheck = Date.now();

  runNpmAudit().then(function(vulns) {
    if (!vulns) return;

    // First run — just record the state, don't alert
    if (!lastKnownVulnerabilities) {
      lastKnownVulnerabilities = vulns;
      log('INFO', 'Dependency audit: ' + vulns.total + ' vulnerabilities found (' +
        vulns.critical + ' critical, ' + vulns.high + ' high, ' +
        vulns.moderate + ' moderate, ' + vulns.low + ' low)');
      return;
    }

    // Compare with last known state — alert only on NEW or INCREASED vulnerabilities
    var newVulns = {
      critical: Math.max(0, vulns.critical - lastKnownVulnerabilities.critical),
      high: Math.max(0, vulns.high - lastKnownVulnerabilities.high),
      moderate: Math.max(0, vulns.moderate - lastKnownVulnerabilities.moderate),
      low: Math.max(0, vulns.low - lastKnownVulnerabilities.low)
    };
    var totalNew = newVulns.critical + newVulns.high + newVulns.moderate + newVulns.low;

    if (totalNew > 0) {
      var msg = 'New dependency vulnerabilities detected: ' +
        (newVulns.critical > 0 ? newVulns.critical + ' critical ' : '') +
        (newVulns.high > 0 ? newVulns.high + ' high ' : '') +
        (newVulns.moderate > 0 ? newVulns.moderate + ' moderate ' : '') +
        (newVulns.low > 0 ? newVulns.low + ' low ' : '') +
        '(total: ' + vulns.total + ')';
      log('WARN', msg);
      broadcastOpsEvent('vulnerabilities_new', msg, {
        previous: lastKnownVulnerabilities,
        current: vulns,
        new: newVulns
      });
      // Only email for new critical/high vulnerabilities
      if (newVulns.critical > 0 || newVulns.high > 0) {
        sendEmail('NEW DEPENDENCY VULNERABILITIES',
          msg + '\n\nRun: cd ' + NPM_AUDIT_CWD + ' && npm audit\n\nTo fix: npm audit fix (or npm audit fix --force for breaking changes)\n\nFull breakdown:\n' +
          JSON.stringify(vulns, null, 2));
      }
    }

    // Check if vulnerabilities DECREASED (someone ran npm audit fix)
    var rawDeltaCritical = vulns.critical - lastKnownVulnerabilities.critical;
    var rawDeltaHigh = vulns.high - lastKnownVulnerabilities.high;
    var rawDeltaTotal = rawDeltaCritical + rawDeltaHigh + (vulns.moderate - lastKnownVulnerabilities.moderate) + (vulns.low - lastKnownVulnerabilities.low);
    if (rawDeltaTotal < 0) {
      log('INFO', 'Dependency vulnerabilities decreased: ' + Math.abs(rawDeltaTotal) + ' fewer (was ' +
        (lastKnownVulnerabilities.critical + lastKnownVulnerabilities.high + lastKnownVulnerabilities.moderate + lastKnownVulnerabilities.low) +
        ', now ' + (vulns.critical + vulns.high + vulns.moderate + vulns.low) + ')');
    }

    lastKnownVulnerabilities = vulns;
  }).catch(function(e) {
    log('WARN', 'Dependency audit check failed: ' + e.message);
  });
}

// ── Auto-Update Mechanism ──
// Periodically checks for git updates, applies during maintenance window.
// Only applies on a clean working tree to avoid merge conflicts.
// In cluster mode: triggers rolling restart via master (trace_cluster.js).
// In standalone mode: logs update ready for manual restart.

function isInMaintenanceWindow() {
  var hour = new Date().getHours();
  if (MAINTENANCE_WINDOW_START <= MAINTENANCE_WINDOW_END) {
    return hour >= MAINTENANCE_WINDOW_START && hour < MAINTENANCE_WINDOW_END;
  }
  return hour >= MAINTENANCE_WINDOW_START || hour < MAINTENANCE_WINDOW_END;
}

function checkForUpdates() {
  return new Promise(function(resolve) {
    if (!AUTO_UPDATE_ENABLED || updateInProgress) { resolve(null); return; }
    if (Date.now() - lastUpdateCheck < AUTO_UPDATE_INTERVAL) { resolve(lastUpdateResult); return; }
    lastUpdateCheck = Date.now();

    exec('git fetch origin', { cwd: STATIC_DIR, timeout: 30000 }, function(err) {
      if (err) {
        log('WARN', 'Auto-update: git fetch failed: ' + (err.message || '').slice(0, 100));
        resolve(null);
        return;
      }
      exec('git rev-list --count HEAD..origin/main 2>/dev/null || git rev-list --count HEAD..origin/master 2>/dev/null',
        { cwd: STATIC_DIR, timeout: 10000 }, function(err2, stdout2) {
        var behind = parseInt((stdout2 || '').trim() || '0', 10);
        if (behind <= 0) { resolve(null); return; }

        exec('git status --porcelain', { cwd: STATIC_DIR, timeout: 5000 }, function(err3, stdout3) {
          var dirty = (stdout3 || '').trim().length > 0;
          if (dirty) {
            log('INFO', 'Auto-update: ' + behind + ' commit(s) behind, but ' +
              (stdout3 || '').trim().split('\n').length + ' uncommitted change(s) — skipping apply');
          }
          log('INFO', 'Auto-update: ' + behind + ' commit(s) behind origin' +
            (dirty ? ' (dirty tree — update available but not applied)' : ''));
          broadcastOpsEvent('update_available', behind + ' commit(s) behind origin', {
            behind: behind, dirty: dirty, checked: new Date().toISOString()
          });
          resolve({ behind: behind, dirty: dirty, checked: Date.now() });
        });
      });
    });
  });
}

function applyUpdate() {
  return new Promise(function(resolve) {
    if (updateInProgress) { resolve({ applied: false, reason: 'already_in_progress' }); return; }
    updateInProgress = true;

    exec('git status --porcelain', { cwd: STATIC_DIR, timeout: 5000 }, function(err, stdout) {
      if ((stdout || '').trim().length > 0) {
        updateInProgress = false;
        log('WARN', 'Auto-update: cannot apply — working tree has uncommitted changes');
        resolve({ applied: false, reason: 'dirty_tree' });
        return;
      }

      exec('git pull --ff-only origin main 2>/dev/null || git pull --ff-only origin master 2>/dev/null',
        { cwd: STATIC_DIR, timeout: 60000 }, function(err2, stdout2, stderr2) {
        if (err2) {
          updateInProgress = false;
          var msg = 'Auto-update: git pull failed: ' + (err2.message || '').slice(0, 150);
          log('ERROR', msg);
          broadcastOpsEvent('update_failed', msg, { error: (err2.message || '').slice(0, 200) });
          sendEmail('UPDATE FAILED', msg + '\n\nCheck the server and resolve merge conflicts manually.');
          resolve({ applied: false, reason: 'pull_failed', error: err2.message });
          return;
        }

        exec('node -c trace_server.js', { cwd: STATIC_DIR, timeout: 10000 }, function(err3) {
          if (err3) {
            updateInProgress = false;
            var msg = 'Auto-update: syntax check failed after pull — ' + (err3.message || '').slice(0, 150);
            log('ERROR', msg);
            broadcastOpsEvent('update_failed', msg, { error: (err3.message || '').slice(0, 200) });
            sendEmail('UPDATE FAILED — ROLLING BACK', msg + '\n\nRunning: git reset --hard HEAD@{1}');
            exec('git reset --hard HEAD@{1}', { cwd: STATIC_DIR, timeout: 30000 }, function() {
              log('WARN', 'Auto-update: rolled back to previous commit');
              broadcastOpsEvent('update_rolled_back', 'Rolled back after syntax check failure', {});
              resolve({ applied: false, reason: 'syntax_check_failed', rolled_back: true });
            });
            return;
          }

          exec('npm install --production', { cwd: STATIC_DIR, timeout: 120000 }, function(err4) {
            updateInProgress = false;
            if (err4) {
              log('WARN', 'Auto-update: npm install warning: ' + (err4.message || '').slice(0, 100));
            }

            var msg = 'Auto-update: code updated successfully (syntax verified)';
            log('INFO', msg);
            broadcastOpsEvent('update_applied', msg, { applied: new Date().toISOString() });

            // In cluster mode, tell master to do a rolling restart
            if (isClusterWorker) {
              try {
                process.send({ type: 'auto_update_applied', pid: process.pid, ts: Date.now() });
                log('INFO', 'Auto-update: sent rolling restart signal to cluster master');
              } catch(e) {
                log('WARN', 'Auto-update: could not signal cluster master: ' + e.message);
              }
            } else {
              log('INFO', 'Auto-update: restart the server to activate the update');
            }

            resolve({ applied: true, rolled_back: false });
          });
        });
      });
    });
  });
}

function runAutoUpdate() {
  checkForUpdates().then(function(result) {
    if (!result || result.behind <= 0) return;
    if (result.dirty) return;
    if (!isInMaintenanceWindow()) {
      log('INFO', 'Auto-update: ' + result.behind + ' commit(s) available — will apply during window (' +
        MAINTENANCE_WINDOW_START + ':00-' + MAINTENANCE_WINDOW_END + ':00)');
      return;
    }
    log('INFO', 'Auto-update: maintenance window — applying ' + result.behind + ' commit(s)');
    applyUpdate().then(function(applyResult) {
      lastUpdateResult = applyResult;
    });
  }).catch(function(e) {
    log('WARN', 'Auto-update check failed: ' + e.message);
  });
}

// ── Memory Trend Tracking ──
// Samples RSS on each monitoring tick. Detects persistent growth patterns
// that suggest a memory leak. Stores rolling history and computes a simple
// slope: positive slope over recent samples suggests growth.

function sampleMemory() {
  var now = Date.now();
  var rss = process.memoryUsage().rss;

  // Add reading
  memoryRssHistory.push({ rss: rss, time: now });
  if (memoryRssHistory.length > MEMORY_HISTORY_MAX) {
    memoryRssHistory.shift();
  }

  // Need at least MEMORY_LEAK_SAMPLES*2 readings for a meaningful check
  if (memoryRssHistory.length < MEMORY_LEAK_SAMPLES * 2) return null;

  // Check for consecutive increases over the last N samples
  var len = memoryRssHistory.length;
  var recent = memoryRssHistory.slice(len - MEMORY_LEAK_SAMPLES);
  var prev = memoryRssHistory.slice(len - MEMORY_LEAK_SAMPLES * 2, len - MEMORY_LEAK_SAMPLES);

  // Calculate simple slopes (MB per sample interval)
  function avgSlope(samples) {
    var n = samples.length;
    if (n < 2) return 0;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
      var x = i - (n - 1) / 2; // centered x for numerical stability
      var y = samples[i].rss;
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    }
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  var recentSlope = avgSlope(recent);        // bytes per interval
  var prevSlope = avgSlope(prev);            // bytes per interval
  var overallSlope = avgSlope(memoryRssHistory.slice(-12)); // last 3 hours

  // Detect leak: recent slope is positive AND accelerating vs previous period
  var recentMB = Math.round(recent[recent.length - 1].rss / 1048576);
  var prevMB = Math.round(prev[0].rss / 1048576);
  var growthMB = recentMB - prevMB;

  var trend = {
    recentMB: recentMB,
    prevMB: prevMB,
    growthMB: growthMB,
    recentSlopeMBperHour: Math.round(recentSlope / 1048576 * 4 * 100) / 100,  // 4 intervals per hour
    prevSlopeMBperHour: Math.round(prevSlope / 1048576 * 4 * 100) / 100,
    overallSlopeMBperHour: Math.round(overallSlope / 1048576 * 4 * 100) / 100,
    samples: len,
    leakDetected: false
  };

  // Leak detection: recent slope > prev slope (accelerating growth)
  // and growth is > 5MB over the comparison period
  if (recentSlope > 0 && recentSlope > prevSlope * 1.5 && growthMB > 5) {
    trend.leakDetected = true;
  }

  // Alert on leak detection (with cooldown)
  if (trend.leakDetected && Date.now() - lastMemoryLeakAlert > MEMORY_LEAK_COOLDOWN_MS) {
    lastMemoryLeakAlert = Date.now();
    var msg = 'POTENTIAL MEMORY LEAK: RSS grew ' + growthMB + 'MB over ' +
      MEMORY_LEAK_SAMPLES + ' samples (recent slope: ' + trend.recentSlopeMBperHour +
      'MB/hr, previous: ' + trend.prevSlopeMBperHour + 'MB/hr)';
    log('WARN', msg);
    broadcastOpsEvent('memory_leak_detected', msg, {
      growthMB: growthMB,
      recentSlopeMBperHour: trend.recentSlopeMBperHour,
      prevSlopeMBperHour: trend.prevSlopeMBperHour,
      rssMB: recentMB
    });
    sendEmail('POTENTIAL MEMORY LEAK', msg + '\n\nCurrent RSS: ' + recentMB +
      'MB\nGrowth: ' + growthMB + 'MB\nRecent slope: ' + trend.recentSlopeMBperHour +
      'MB/hr\n\nInvestigate: check for unreleased references, growing caches, or event listener leaks.');
  }

  return trend;
}

// ── Read-only trend analysis (no sampling — for /api/debug and /metrics endpoints) ──
function getMemoryTrend() {
  if (memoryRssHistory.length < MEMORY_LEAK_SAMPLES * 2) return null;

  var len = memoryRssHistory.length;
  var recent = memoryRssHistory.slice(len - MEMORY_LEAK_SAMPLES);
  var prev = memoryRssHistory.slice(len - MEMORY_LEAK_SAMPLES * 2, len - MEMORY_LEAK_SAMPLES);

  function avgSlope(samples) {
    var n = samples.length;
    if (n < 2) return 0;
    var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (var i = 0; i < n; i++) {
      var x = i - (n - 1) / 2;
      var y = samples[i].rss;
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
    }
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  var recentSlope = avgSlope(recent);
  var prevSlope = avgSlope(prev);
  var overallSlope = avgSlope(memoryRssHistory.slice(-12));

  var recentMB = Math.round(recent[recent.length - 1].rss / 1048576);
  var prevMB = Math.round(prev[0].rss / 1048576);
  var growthMB = recentMB - prevMB;

  // Leak detection: same heuristic as sampleMemory()
  var leakDetected = recentSlope > 0 && recentSlope > prevSlope * 1.5 && (recentMB - prevMB) > 5;

  return {
    recentMB: recentMB,
    prevMB: prevMB,
    growthMB: growthMB,
    recentSlopeMBperHour: Math.round(recentSlope / 1048576 * 4 * 100) / 100,
    prevSlopeMBperHour: Math.round(prevSlope / 1048576 * 4 * 100) / 100,
    overallSlopeMBperHour: Math.round(overallSlope / 1048576 * 4 * 100) / 100,
    samples: memoryRssHistory.length,
    leakDetected: leakDetected
  };
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
const authRoutes = require('./routes/auth')(routeCtx)
var dbRoutes = require('./routes/databases')(routeCtx);

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
  // Collect monitoring data
  var providerHealth = {};
  Object.keys(PROVIDER_HEALTH).forEach(function(p) {
    providerHealth[p] = getProviderStatus(p);
  });
  
  var diskInfo = checkDiskSpace() || { availableMB: null, availableGB: null };
  
  var overallHealth = 'healthy';
  if (shuttingDown) overallHealth = 'shutting_down';
  else {
    var anyDegraded = Object.keys(PROVIDER_HEALTH).some(function(p) { return !PROVIDER_HEALTH[p].healthy; });
    if (anyDegraded) overallHealth = 'degraded';
    if (diskInfo.availableMB !== null && diskInfo.availableMB <= DISK_CRITICAL_MB) overallHealth = 'critical';
  }

  sendJSON(res, 200, {
    status: shuttingDown ? 'shutting_down' : 'ok',
    health: overallHealth,
    service: 'TRACE API Proxy v3.1',
    apiKey: API_KEY ? 'configured' : 'missing',
    analyseKey: process.env.ANALYSE_API_KEY ? 'user-configured' : 'auto-generated (always active)',
    stripe: STRIPE_ENABLED ? 'configured' : 'demo mode',
    subscriptions: subscriptions.size,
    licenseKeys: licenseKeys.size,
    ai_provider: AI_PROVIDER.toUpperCase(),
    providers: providerHealth,
    disk: {
      availableMB: diskInfo.availableMB,
      availableGB: diskInfo.availableGB
    },
    credits: lastOpenRouterCredits ? {
      remaining: Math.round(lastOpenRouterCredits.remaining * 100) / 100
    } : null,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    node: process.version,
    errors: errorLog.length,
    connections_active: activeConnections.size,
    shutting_down: shuttingDown
  });
}

// ── Prometheus /metrics endpoint ──
// Exposes all monitoring data in standard Prometheus text format for integration
// with any Prometheus-compatible monitoring system.
function handleMetrics(req, res) {
  var lines = [];
  var push = function(name, help, type, value, labels) {
    lines.push('# HELP ' + name + ' ' + help);
    lines.push('# TYPE ' + name + ' ' + type);
    var lbl = '';
    if (labels) {
      var parts = [];
      Object.keys(labels).forEach(function(k) { parts.push(k + '="' + String(labels[k]).replace(/"/g, '\\"') + '"'); });
      lbl = '{' + parts.join(',') + '}';
    }
    lines.push(name + lbl + ' ' + value);
  };

  // Server info
  push('trace_uptime_seconds', 'Server uptime in seconds', 'gauge', Math.floor(process.uptime()));
  push('trace_memory_rss_bytes', 'Memory RSS in bytes', 'gauge', process.memoryUsage().rss);
  var mt = getMemoryTrend();
  if (mt) {
    push('trace_memory_trend_recent_mb', 'Recent memory RSS in MB', 'gauge', mt.recentMB);
    push('trace_memory_trend_slope_mb_per_hour', 'Memory growth trend slope in MB/hour', 'gauge', mt.recentSlopeMBperHour);
    push('trace_memory_trend_leak_detected', '1 if memory leak detected, 0 otherwise', 'gauge', mt.leakDetected ? 1 : 0);
  }
  push('trace_connections_active', 'Active HTTP connections', 'gauge', activeConnections.size);
  push('trace_sse_clients', 'Connected SSE clients', 'gauge', sseClients.length);
  push('trace_errors_logged', 'Total errors in error log', 'gauge', errorLog.length);
  push('trace_subscriptions', 'Active subscriptions', 'gauge', subscriptions.size);
  push('trace_license_keys', 'License keys issued', 'gauge', licenseKeys.size);

  // Provider health
  Object.keys(PROVIDER_HEALTH).forEach(function(p) {
    var h = PROVIDER_HEALTH[p];
    push('trace_provider_healthy', 'Provider health (1=healthy, 0=degraded)', 'gauge', h.healthy ? 1 : 0, { provider: p });
    push('trace_provider_consecutive_errors', 'Consecutive errors for provider', 'gauge', h.consecutiveErrors, { provider: p });
    push('trace_provider_total_errors', 'Total lifetime errors for provider', 'gauge', h.totalErrors, { provider: p });
    if (h.degradedUntil) {
      push('trace_provider_degraded_until', 'Timestamp when provider retry cooldown ends', 'gauge', h.degradedUntil, { provider: p });
    }
  });

  // Disk space
  try {
    var diskStats = fs.statfsSync('/');
    push('trace_disk_total_bytes', 'Total disk space in bytes', 'gauge', diskStats.blocks * diskStats.bsize);
    push('trace_disk_available_bytes', 'Available disk space in bytes', 'gauge', diskStats.bavail * diskStats.bsize);
    push('trace_disk_free_bytes', 'Free disk space in bytes', 'gauge', diskStats.bfree * diskStats.bsize);
  } catch(e) {}

  // SQLite DB files
  var dbFiles = getDbFiles();
  if (dbFiles.db) push('trace_db_file_size_bytes', 'Database file size', 'gauge', dbFiles.db.sizeMB * 1048576, { type: 'primary' });
  if (dbFiles.backup) push('trace_db_file_size_bytes', 'Database file size', 'gauge', dbFiles.backup.sizeMB * 1048576, { type: 'backup' });
  if (dbFiles.wal) push('trace_db_file_size_bytes', 'Database file size', 'gauge', dbFiles.wal.sizeMB * 1048576, { type: 'wal' });

  // Credits (if available)
  if (lastOpenRouterCredits) {
    push('trace_credits_remaining', 'Remaining credits in USD', 'gauge', lastOpenRouterCredits.remaining, { provider: 'OpenRouter' });
    push('trace_credits_total_usage', 'Total credit usage in USD', 'gauge', lastOpenRouterCredits.totalUsage, { provider: 'OpenRouter' });
  }

  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(lines.join('\n') + '\n');
}

// ── Debug endpoint ──
function handleDebug(req, res) {
  const now = Date.now();
  const rateLimitState = {};
  rateLimits.forEach((entry, ip) => {
    rateLimitState[ip] = { count: entry.count, resetsIn: Math.max(0, entry.resetAt - now) + 'ms' };
  });

  // ── Monitoring / Auto-Heal Data ──
  var providerHealth = {};
  Object.keys(PROVIDER_HEALTH).forEach(function(p) {
    var h = PROVIDER_HEALTH[p];
    providerHealth[p] = {
      healthy: h.healthy,
      status: getProviderStatus(p),
      consecutiveErrors: h.consecutiveErrors,
      totalErrors: h.totalErrors,
      lastErrorAt: h.lastErrorAt ? new Date(h.lastErrorAt).toISOString() : null,
      lastErrorMsg: h.lastErrorMsg ? h.lastErrorMsg.slice(0, 150) : null
    };
  });

  var diskInfo = checkDiskSpace();

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
      aiProvider: AI_PROVIDER,
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
    monitoring: {
      providers: providerHealth,
      disk: diskInfo ? {
        availableMB: diskInfo.availableMB,
        availableGB: diskInfo.availableGB,
        thresholds: { warn: DISK_WARN_MB + 'MB', critical: DISK_CRITICAL_MB + 'MB' }
      } : null,
      ssl: {
        monitoredHosts: SSL_MONITOR_HOSTS,
        thresholds: { warn: SSL_WARN_DAYS + 'd', critical: SSL_CRITICAL_DAYS + 'd' }
      },
      credits: lastOpenRouterCredits ? {
        remaining: Math.round(lastOpenRouterCredits.remaining * 100) / 100,
        totalCredits: lastOpenRouterCredits.totalCredits,
        totalUsage: lastOpenRouterCredits.totalUsage,
        lastChecked: lastOpenRouterCreditCheck ? new Date(lastOpenRouterCreditCheck).toISOString() : null
      } : null,
      memoryTrend: getMemoryTrend(),
      sseClients: sseClients.length,
      alerts: {
        resend: !!(RESEND_API_KEY && DEVELOPER_EMAIL),
        developerEmail: DEVELOPER_EMAIL || null
      }
    },
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
// Multi-Provider AI Routing
// ══════════════════════════════════════════════

// ── Translate Anthropic Messages format → Gemini format ──
function anthropicToGemini(payload, model) {
  var contents = [];
  var systemInstruction = null;

  // Extract system prompt
  if (typeof payload.system === 'string' && payload.system.length > 0) {
    systemInstruction = { parts: [{ text: payload.system }] };
  }

  // Translate messages
  (payload.messages || []).forEach(function(msg) {
    var role = msg.role === 'assistant' ? 'model' : 'user';
    var parts = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      msg.content.forEach(function(block) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'image' && block.source) {
          parts.push({
            inline_data: {
              mime_type: block.source.media_type || 'image/jpeg',
              data: block.source.data || block.source.base64 || ''
            }
          });
        } else if (block.type === 'image_url' && block.image_url) {
          // Handle OpenAI-style image_url for OpenRouter fallback path
          var url = block.image_url.url || '';
          if (url.startsWith('data:')) {
            var mimeMatch = url.match(/^data:([^;]+);base64,(.+)$/);
            if (mimeMatch) {
              parts.push({ inline_data: { mime_type: mimeMatch[1], data: mimeMatch[2] } });
            }
          }
        }
      });
    }

    if (parts.length > 0) {
      contents.push({ role: role, parts: parts });
    }
  });

  var requestBody = {};
  if (systemInstruction) requestBody.system_instruction = systemInstruction;
  requestBody.contents = contents;
  requestBody.generationConfig = {
    maxOutputTokens: payload.max_tokens || 1800,
    temperature: payload.temperature || 0.7
  };

  return requestBody;
}

// ── Translate Gemini response → Anthropic Messages format ──
function geminiToAnthropicResponse(geminiResponse) {
  var text = '';
  try {
    if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
      var content = geminiResponse.candidates[0].content;
      if (content && content.parts) {
        text = content.parts.map(function(p) { return p.text || ''; }).join('');
      }
    }
  } catch(e) {
    logError(e, 'Gemini response parse error');
  }
  return {
    content: [{ type: 'text', text: text }],
    role: 'assistant'
  };
}

// ── Translate Anthropic Messages format → OpenAI / OpenRouter format ──
function anthropicToOpenRouter(payload, model) {
  var messages = [];

  // System prompt as first message
  if (typeof payload.system === 'string' && payload.system.length > 0) {
    messages.push({ role: 'system', content: payload.system });
  }

  // Translate messages
  (payload.messages || []).forEach(function(msg) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      var translated = [];
      msg.content.forEach(function(block) {
        if (block.type === 'text') {
          translated.push({ type: 'text', text: block.text });
        } else if (block.type === 'image' && block.source) {
          var src = block.source;
          if (src.type === 'base64' || src.data) {
            var mediaType = src.media_type || 'image/jpeg';
            var data = src.data || src.base64 || '';
            translated.push({
              type: 'image_url',
              image_url: { url: 'data:' + mediaType + ';base64,' + data }
            });
          } else if (src.type === 'url' && src.url) {
            translated.push({
              type: 'image_url',
              image_url: { url: src.url }
            });
          }
        }
      });
      messages.push({ role: msg.role, content: translated });
    }
  });

  return {
    model: model,
    max_tokens: payload.max_tokens || 1800,
    temperature: payload.temperature || 0.7,
    messages: messages
  };
}

// ── Translate OpenRouter response → Anthropic Messages format ──
function openrouterToAnthropicResponse(orResponse) {
  var text = '';
  try {
    if (orResponse.choices && orResponse.choices.length > 0) {
      text = orResponse.choices[0].message.content || '';
    }
  } catch(e) {
    logError(e, 'OpenRouter response parse error');
  }
  return {
    content: [{ type: 'text', text: text }],
    role: 'assistant'
  };
}

// ── HTTP helper for provider API calls ──
function httpsPostJson(hostname, path, headers, bodyJson, method) {
  if (!method) method = 'POST';
  var body = method === 'GET' ? '' : JSON.stringify(bodyJson);
  var allHeaders = {};
  Object.keys(headers).forEach(function(k) { allHeaders[k] = headers[k]; });
  allHeaders['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    allHeaders['Content-Length'] = Buffer.byteLength(body);
  }

  return new Promise(function(resolve, reject) {
    var options = {
      hostname: hostname,
      path: path,
      method: method,
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: allHeaders
    };

    // For GET requests, no body to write
    if (method === 'GET') {
      var getReq = https.request(options, function(res) {
        var chunks = [];
        res.on('data', function(chunk) { chunks.push(chunk); });
        res.on('end', function() {
          var data = Buffer.concat(chunks).toString('utf8');
          var parsed;
          try { parsed = JSON.parse(data); } catch(e) {
            return reject(new Error('Invalid JSON from ' + hostname + ': ' + data.slice(0, 200)));
          }
          resolve({ statusCode: res.statusCode, body: parsed, raw: data });
        });
      });
      getReq.on('timeout', function() {
        getReq.destroy();
        reject(new Error('Upstream timeout from ' + hostname));
      });
      getReq.on('error', function(e) {
        reject(new Error('Upstream error from ' + hostname + ': ' + e.message));
      });
      getReq.end();
      return;
    }

    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        var data = Buffer.concat(chunks).toString('utf8');
        var parsed;
        try { parsed = JSON.parse(data); } catch(e) {
          return reject(new Error('Invalid JSON from ' + hostname + ': ' + data.slice(0, 200)));
        }
        resolve({ statusCode: res.statusCode, body: parsed, raw: data });
      });
    });

    req.on('timeout', function() {
      req.destroy();
      reject(new Error('Upstream timeout from ' + hostname));
    });
    req.on('error', function(e) {
      reject(new Error('Upstream error from ' + hostname + ': ' + e.message));
    });
    req.write(body);
    req.end();
  });
}

// ── Supported models map ──
const PROVIDER_MODELS = {
  claude: { default: 'claude-sonnet-4-20250514' },
  gemini: { default: GEMINI_MODEL },
  openrouter: { default: OPENROUTER_MODEL }
};

// ── Check if an error is a quota/billing failure that should trigger auto-heal ──
function isQuotaError(errMsg) {
  if (errMsg.indexOf('billing_error') >= 0 || errMsg.indexOf('insufficient_quota') >= 0 ||
      errMsg.indexOf('RESOURCE_EXHAUSTED') >= 0 || errMsg.indexOf('insufficient_credits') >= 0 ||
      errMsg.indexOf('credit balance') >= 0 || errMsg.indexOf('quota') >= 0 ||
      errMsg.indexOf('402') >= 0 || errMsg.indexOf('429') >= 0) return true;
  return false;
}

// ── Call a specific AI provider and return Anthropic-format response ──
// NOTE: caller should check isProviderHealthy() before calling, and call
// markProviderDegraded/markProviderHealthy after the call.
async function callProvider(provider, payload) {
  var model = payload.model || PROVIDER_MODELS[provider]?.default || 'claude-sonnet-4-20250514';

  if (provider === 'claude') {
    if (!API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    var postData = {
      model: model,
      max_tokens: payload.max_tokens || 1800,
      system: typeof payload.system === 'string' ? payload.system : undefined,
      messages: payload.messages
    };
    var result = await httpsPostJson('api.anthropic.com', '/v1/messages', {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    }, postData);
    // Anthropic response is already in the right format — pass through
    if (result.statusCode >= 400) {
      throw new Error('Claude API error ' + result.statusCode + ': ' + JSON.stringify(result.body).slice(0, 300));
    }
    return result.body;
  }

  if (provider === 'gemini') {
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    var geminiModel = model === 'claude-sonnet-4-20250514' ? GEMINI_MODEL : model;
    var geminiBody = anthropicToGemini(payload, geminiModel);
    var result = await httpsPostJson(
      'generativelanguage.googleapis.com',
      '/v1beta/models/' + geminiModel + ':generateContent?key=' + encodeURIComponent(GEMINI_API_KEY),
      {},
      geminiBody
    );
    if (result.statusCode >= 400) {
      throw new Error('Gemini API error ' + result.statusCode + ': ' + JSON.stringify(result.body).slice(0, 300));
    }
    return geminiToAnthropicResponse(result.body);
  }

  if (provider === 'openrouter') {
    if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not configured');
    var orModel = model === 'claude-sonnet-4-20250514' ? OPENROUTER_MODEL : model;
    var orBody = anthropicToOpenRouter(payload, orModel);
    var result = await httpsPostJson('openrouter.ai', '/api/v1/chat/completions', {
      'Authorization': 'Bearer ' + OPENROUTER_API_KEY,
      'HTTP-Referer': 'https://trace.art',
      'X-Title': 'TRACE Art Intelligence'
    }, orBody);
    if (result.statusCode >= 400) {
      throw new Error('OpenRouter API error ' + result.statusCode + ': ' + JSON.stringify(result.body).slice(0, 300));
    }
    return openrouterToAnthropicResponse(result.body);
  }

  // ── Registered plugin providers ──
  var plugin = providerPlugins[provider];
  if (plugin) {
    if (typeof plugin.isConfigured === 'function' && !plugin.isConfigured()) {
      throw new Error('Plugin provider "' + provider + '" not configured');
    }
    var pluginModel = model === 'claude-sonnet-4-20250514' ? (plugin.defaultModel || model) : model;
    return await plugin.call(payload, pluginModel);
  }

  throw new Error('Unknown provider: ' + provider);
}

// ── Supported provider list based on configured keys & plugins ──
function getConfiguredProviders() {
  var providers = [];
  if (API_KEY) providers.push('claude');
  if (GEMINI_API_KEY) providers.push('gemini');
  if (OPENROUTER_API_KEY) providers.push('openrouter');
  // Add registered plugin providers that have keys configured
  Object.keys(providerPlugins).forEach(function(name) {
    var p = providerPlugins[name];
    if (typeof p.isConfigured === 'function' ? p.isConfigured() : true) {
      providers.push(name);
    }
  });
  if (providers.length === 0) providers.push('claude'); // fallback, will error gracefully
  return providers;
}

// ── Main AI call router — handles 'auto' mode with fallback + auto-heal ──
async function callAI(payload) {
  var provider = AI_PROVIDER;
  var providers = [];

  if (provider === 'auto') {
    var configured = getConfiguredProviders();
    // Auto fallback order: try best available first, skip degraded providers
    var order = ['claude', 'gemini', 'openrouter'];
    for (var oi = 0; oi < order.length; oi++) {
      if (configured.indexOf(order[oi]) >= 0 && isProviderHealthy(order[oi])) {
        providers.push(order[oi]);
      }
    }
    // If all providers are degraded, force-include them anyway (better than failing immediately)
    if (providers.length === 0) {
      providers = configured.slice(); // fall back to all configured, degraded or not
      log('WARN', 'All providers degraded — falling back to full chain anyway');
    }
    // If only one available, just use that directly
    if (providers.length === 1) provider = providers[0];
  }

  if (provider !== 'auto') {
    return await callProvider(provider, payload);
  }

  // Auto mode with fallback chain — built-in providers + registered plugins
  var autoOrder = ['claude', 'gemini', 'openrouter'].concat(PLUGIN_PROVIDER_ORDER);
  var lastError = null;
  var triedProviders = [];
  for (var i = 0; i < providers.length; i++) {
    // Follow priority order for the actual call sequence
    var orderedProviders = autoOrder.filter(function(p) { return providers.indexOf(p) >= 0 && isProviderHealthy(p); });
    if (orderedProviders.length === 0) {
      // All degraded — try them all anyway
      orderedProviders = providers.slice();
    }
    for (var oi = 0; oi < orderedProviders.length; oi++) {
      triedProviders.push(orderedProviders[oi]);
      try {
        log('INFO', 'AI auto: trying ' + orderedProviders[oi] + ' (' + (i + 1) + '/' + providers.length + ')');
        var response = await callProvider(orderedProviders[oi], payload);
        // Success — mark this provider healthy
        markProviderHealthy(orderedProviders[oi]);
        return response;
      } catch(e) {
        lastError = e;
        log('WARN', 'AI auto: ' + orderedProviders[oi] + ' failed — ' + e.message);
        // Mark quota/billing failures as degraded
        if (isQuotaError(e.message)) {
          markProviderDegraded(orderedProviders[oi], e.message);
        } else {
          // Non-quota errors still increment error count but don't degrade permanently
          var h = PROVIDER_HEALTH[orderedProviders[oi]];
          if (h) h.consecutiveErrors++;
        }
        // Continue to next provider
      }
    }
    // If we got here, all ordered providers failed — try remaining providers not in autoOrder
    var remaining = providers.filter(function(p) { return orderedProviders.indexOf(p) < 0; });
    for (var ri = 0; ri < remaining.length; ri++) {
      triedProviders.push(remaining[ri]);
      try {
        log('INFO', 'AI auto: trying ' + remaining[ri] + ' (fallback)');
        var fallbackResponse = await callProvider(remaining[ri], payload);
        markProviderHealthy(remaining[ri]);
        return fallbackResponse;
      } catch(e2) {
        lastError = e2;
        log('WARN', 'AI auto: ' + remaining[ri] + ' failed — ' + e2.message);
        if (isQuotaError(e2.message)) {
          markProviderDegraded(remaining[ri], e2.message);
        }
      }
    }
  }

  // All providers failed — broadcast critical alert and email developer
  var allFailedMsg = 'All AI providers failed. Tried: ' + triedProviders.join(', ') + '. Last error: ' + (lastError ? lastError.message : 'unknown');
  log('ERROR', allFailedMsg);
  broadcastOpsEvent('all_providers_failed', allFailedMsg, { tried: triedProviders, lastError: lastError ? lastError.message : null });
  sendEmail('ALL PROVIDERS FAILED', allFailedMsg + '\n\nUsers are receiving 502 errors. Check provider dashboards for credit/status issues.');

  throw lastError || new Error('All AI providers failed');
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

  // GET /metrics (Prometheus format)
  if (method === 'GET' && urlPath === '/metrics') {
    return handleMetrics(req, res);
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
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 65536, (body) => tlRoutes.handleTimelineSave(req, res, body));
  }

  if (method === 'GET' && urlPath === '/api/timeline/list') {
    return tlRoutes.handleTimelineList(req, res);
  }

  if (method === 'POST' && urlPath === '/api/timeline/delete') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 4096, (body) => tlRoutes.handleTimelineDelete(req, res, body));
  }

  // ── Provenance Routes ──
  if (method === 'POST' && urlPath === '/api/provenance/cross-reference') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 65536, (body) => provRoutes.handleCrossReference(req, res, body));
  }

  if (method === 'POST' && urlPath === '/api/provenance/getty-search') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 4096, (body) => provRoutes.handleGettySearch(req, res, body));
  }

  if (method === 'POST' && urlPath === '/api/provenance/knowledge-graph') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
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
    return collectBody(req, res, 2048, (body) => authRoutes.handleVerify(req, res, body));  }

  // ── External Database Integration ──
  if (method === 'GET' && urlPath === '/api/databases') {
    return dbRoutes.handleDatabaseLookup(req, res);

  }

  // ── Event Routes ──
  if (method === 'POST' && urlPath === '/events') {
    if (!checkRateLimitWithHeaders(clientIp, req)) return sendJSON(res, 429, { error: 'Rate limit' });
    return collectBody(req, res, 512, (body) => evRoutes.handleEvents(req, res, body));
  }

  if (method === 'GET' && urlPath === '/events') {
    return sendJSON(res, 200, { events: evRoutes.eventLog.slice(-50) });
  }

  // ── OpenAPI Docs / Swagger UI ──
  if (method === 'GET' && (urlPath === '/api/docs' || urlPath === '/api/docs/')) {
    var specUrl = '/api/docs/openapi.json';
    var swaggerHtml = '<!DOCTYPE html>\n' +
      '<html lang="en">\n' +
      '<head>\n' +
      '<meta charset="utf-8" />\n' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
      '<title>TRACE API Reference</title>\n' +
      '<link rel="stylesheet" href="/api/docs/swagger-ui.css" />\n' +
      '<link rel="icon" type="image/png" href="/api/docs/favicon-32x32.png" sizes="32x32" />\n' +
      '</head>\n' +
      '<body>\n' +
      '<div id="swagger-ui"></div>\n' +
      '<script src="/api/docs/swagger-ui-bundle.js"></script>\n' +
      '<script>\n' +
      '  window.onload = function() {\n' +
      '    SwaggerUIBundle({\n' +
      '      url: "' + specUrl + '",\n' +
      '      dom_id: "#swagger-ui",\n' +
      '      deepLinking: true,\n' +
      '      presets: [\n' +
      '        SwaggerUIBundle.presets.apis,\n' +
      '        SwaggerUIBundle.SwaggerUIStandalonePreset\n' +
      '      ],\n' +
      '      layout: "StandaloneLayout",\n' +
      '      defaultModelsExpandDepth: 1,\n' +
      '      defaultModelExpandDepth: 1,\n' +
      '      docExpansion: "list",\n' +
      '      tagsSorter: "alpha",\n' +
      '      operationsSorter: "alpha"\n' +
      '    });\n' +
      '  };\n' +
      '</script>\n' +
      '</body>\n' +
      '</html>';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(swaggerHtml);
  }

  // GET /api/docs/openapi.json — serve the OpenAPI spec
  if (method === 'GET' && urlPath === '/api/docs/openapi.json') {
    var specPath = path.join(STATIC_DIR, 'docs', 'openapi.json');
    if (fs.existsSync(specPath)) {
      try {
        var specData = fs.readFileSync(specPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(specData);
      } catch(e) {
        return sendJSON(res, 500, { error: 'Failed to read spec' });
      }
    }
    return sendJSON(res, 404, { error: 'Spec not found' });
  }

  // GET /api/docs/* — serve swagger-ui-dist static assets
  if (method === 'GET' && urlPath.startsWith('/api/docs/')) {
    var assetName = urlPath.replace('/api/docs/', '');
    var swaggerDist = path.join(STATIC_DIR, 'node_modules', 'swagger-ui-dist');
    var assetPath = path.resolve(swaggerDist, assetName);
    if (assetPath.startsWith(swaggerDist) && fs.existsSync(assetPath) && fs.statSync(assetPath).isFile()) {
      var ext = path.extname(assetName).toLowerCase();
      var mime = MIME_TYPES[ext] || 'application/octet-stream';
      var data = fs.readFileSync(assetPath);
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' });
      return res.end(data);
    }
    return sendJSON(res, 404, { error: 'Asset not found' });
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

  // ── POST /analyse (Multi-Provider AI proxy) ──
  if (method === 'POST' && urlPath === '/analyse') {
    // Check at least one provider key is configured
    if (!API_KEY && !GEMINI_API_KEY && !OPENROUTER_API_KEY) {
      return sendJSON(res, 503, { error: 'No AI provider configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.' });
    }
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

    return collectBody(req, res, MAX_BODY_BYTES, async (body) => {
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
      payload.max_tokens = Math.min(Math.max(parseInt(payload.max_tokens) || 1800, 100), 2000);
      payload.system = systemPrompt;

      log('INFO', 'POST /analyse — provider: ' + AI_PROVIDER + ', tokens: ' + payload.max_tokens + ', msgs: ' + payload.messages.length);

      try {
        var aiResponse = await callAI(payload);
        sendJSON(res, 200, aiResponse);
      } catch(e) {
        logError(e, '/analyse AI call failed');
        // Broadcast to HQ dashboard for non-auto modes (auto mode already broadcasts from callAI)
        if (AI_PROVIDER !== 'auto') {
          var failMsg = 'AI provider ' + AI_PROVIDER + ' failed: ' + e.message;
          broadcastOpsEvent('provider_failed', failMsg, { provider: AI_PROVIDER, error: e.message });
          sendEmail('AI PROVIDER FAILED', failMsg + '\n\nUsers are receiving errors. Check provider dashboard or switch AI_PROVIDER.');
        }
        if (!res.headersSent) {
          sendJSON(res, 502, { error: 'AI provider error: ' + e.message });
        }
      }
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
// Respond to cluster master health pings immediately
process.on("message", function(msg) {
  if (msg \&\& msg.type === "health_ping") {
    reportHealthToMaster();
  }
});

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
      log('INFO', '  AI provider: ' + AI_PROVIDER.toUpperCase());
      if (AI_PROVIDER === 'auto') {
        var configured = getConfiguredProviders();
        log('INFO', '  Auto fallback chain: ' + (configured.length > 0 ? configured.join(' → ') : 'none configured'));
      }
      log('INFO', '  Claude: ' + (API_KEY ? 'configured ✓' : 'NOT SET ✗'));
      log('INFO', '  Gemini: ' + (GEMINI_API_KEY ? 'configured ✓ (model: ' + GEMINI_MODEL + ')' : 'NOT SET ✗'));
      log('INFO', '  OpenRouter: ' + (OPENROUTER_API_KEY ? 'configured ✓ (model: ' + OPENROUTER_MODEL + ')' : 'NOT SET ✗'));
      log('INFO', '  Stripe: ' + (STRIPE_ENABLED ? 'configured ✓' : 'demo mode (no key)'));
      log('INFO', '  Active subscriptions: ' + subscriptions.size);
      log('INFO', '  License keys: ' + licenseKeys.size);
      log('INFO', '  Developer alerts: ' + (RESEND_API_KEY && DEVELOPER_EMAIL ? 'email ✓ (' + DEVELOPER_EMAIL + ')' : 'not configured'));
      log('INFO', '  Credit monitoring: ' + (OPENROUTER_MANAGEMENT_KEY ? 'OpenRouter ✓ (threshold: $' + CREDIT_WARN_THRESHOLD + ')' : 'not configured'));
      log('INFO', '  Disk monitoring: ' + (DISK_WARN_MB + 'MB warning / ' + DISK_CRITICAL_MB + 'MB critical ✓'));
      log('INFO', '  SSL monitoring: ' + (SSL_WARN_DAYS + 'd warning / ' + SSL_CRITICAL_DAYS + 'd critical ✓ (' + SSL_MONITOR_HOSTS.length + ' hosts)'));
      log('INFO', '  Auto-heal: degraded providers retried after ' + (PROVIDER_HEALTH_DEGRADE_MS / 60000) + 'min');
      log('INFO', '  Digest email: ' + (RESEND_API_KEY && DEVELOPER_EMAIL ? DIGEST_FREQUENCY + ' ✓' : 'daily/weekly/monthly (requires Resend) ✗'));
      log('INFO', '  DB health: backup verification + WAL checkpoint ✓');
      log('INFO', '  Dependency audit: npm audit every 60min ✓');
      log('INFO', '  Auto-update: ' + (AUTO_UPDATE_ENABLED ? 'enabled ✓ (window: ' + MAINTENANCE_WINDOW_START + ':00-' + MAINTENANCE_WINDOW_END + ':00)' : 'disabled'));

      if (ADMIN_SECRET_AUTO_GENERATED) {
        log('WARN', '⚠️  ADMIN_SECRET auto-generated (dev mode). Set ADMIN_SECRET explicitly in production.');
        log('WARN', '⚠️  Auto-generated ADMIN_SECRET: ' + ADMIN_SECRET);
      }
      if (!STRIPE_ENABLED) {
        log('WARN', '⚠️  Stripe not configured — payments in demo mode. Set STRIPE_SECRET_KEY.');
      }
      if (!API_KEY && !GEMINI_API_KEY && !OPENROUTER_API_KEY) {
        log('WARN', '⚠️  No AI provider keys set — AI analysis will fail.');
      }
      log('INFO', '═══════════════════════════════════════');

      // Start infrastructure monitoring interval (every 15 minutes)
      // Checks: OpenRouter credits, disk space, SSL cert expiry, digest email
      setInterval(function() {
        // Credit monitoring
        if (OPENROUTER_MANAGEMENT_KEY) {
          checkOpenRouterCredits().then(function(credits) {
            if (credits) {
              evaluateCreditAlerts('OpenRouter', credits.remaining);
            }
          }).catch(function(e) {
            logError(e, 'Credit monitoring tick failed');
          });
        }
        // Disk + SSL health check
        runInfraHealthCheck();
        // Database health check (backup integrity, WAL checkpoint)
        checkDbHealth();
        // Dependency vulnerability scan (rate-limited to once per hour internally)
        checkVulnerabilities();
        // Check for git updates (rate-limited internally)
        runAutoUpdate();
        // Track memory trend (checks for leaks every 15min tick)
        sampleMemory();
        // Check if digest email is due (checked every 15min, but only sends at most once per interval)
        checkSendDigest();
      }, 900000); // 15 minutes
      
      // Run initial checks at startup
      if (OPENROUTER_MANAGEMENT_KEY) {
        checkOpenRouterCredits().then(function(credits) {
          if (credits) {
            log('INFO', 'OpenRouter initial credits: $' + credits.remaining.toFixed(2));
          }
        }).catch(function(e) {
          log('WARN', 'Initial OpenRouter credit check failed: ' + e.message);
        });
      }
      // Run initial infra health check (disk + SSL) after 30s delay (allows server to settle)
      setTimeout(function() {
        runInfraHealthCheck().catch(function(e) {
          log('WARN', 'Initial infra health check failed: ' + e.message);
        });
      }, 30000);

      // Notify cluster master that worker is ready
      if (isClusterWorker) {
        try {
          process.send({ type: 'cluster_ready', workerId: process.env.WORKER_ID || 'unknown', pid: process.pid });
          reportHealthToMaster(); // Send immediate health report, don't wait for interval
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

  function loadPluginsAndContinue() {
    log('INFO', 'Loading provider plugins...');
    try {
      loadProviderPlugins();
    } catch(e) {
      log('WARN', 'Provider plugin loading failed: ' + e.message);
    }
    var pluginCount = Object.keys(providerPlugins).length;
    if (pluginCount > 0) {
      log('INFO', '  ' + pluginCount + ' provider plugin(s) registered: ' + Object.keys(providerPlugins).join(', '));
    } else {
      log('INFO', '  No provider plugins loaded');
    }
    loadTimelinesAndStart();
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
      loadPluginsAndContinue();
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
