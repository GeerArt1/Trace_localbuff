// TRACE AI Agent Operations Routes — health checks, auto-fix, ops logging
const { sendJSON, log, logError } = require('./helpers');
const { loadErrorPatterns, logEvent } = require('./patterns');

module.exports = function(ctx) {
  const { API_KEY, ANALYSE_API_KEY, STRIPE_ENABLED, ADMIN_SECRET_AUTO_GENERATED, db, subscriptions, licenseKeys, errorLog, STATIC_DIR, opsLog, OPS_LOG_MAX, _requireOpsAuth, checkRateLimitWithHeaders } = ctx;

  function loadPatterns() {
    return loadErrorPatterns(STATIC_DIR, logError);
  }

  function logOpsEvent(type, message, detail) {
    return logEvent(opsLog, OPS_LOG_MAX, type, message, detail);
  }

  function handleOpsHealthCheck(req, res) {
    var patterns = loadPatterns();
    var checks = {
      api_key: !!API_KEY,
      stripe: STRIPE_ENABLED,
      analyse_key: !!ANALYSE_API_KEY,
      server_uptime: process.uptime(),
      memory: process.memoryUsage(),
      subscriptions: subscriptions.size,
      license_keys: licenseKeys.size,
      timelines: (db && db.isReady() ? Object.keys(db.getTlCache()).length : 0),
      error_log_count: errorLog.length,
      ops_log_count: opsLog.length
    };

    var issues = [];
    if (!API_KEY) {
      issues.push({ severity: 'critical', message: 'ANTHROPIC_API_KEY not set', auto_fixable: false });
    }
    if (!process.env.ANALYSE_API_KEY) {
      issues.push({ severity: 'info', message: 'ANALYSE_API_KEY auto-generated — /analyse is protected', auto_fixable: false });
    }
    if (!STRIPE_ENABLED) {
      issues.push({ severity: 'info', message: 'Stripe in demo mode', auto_fixable: false });
    }
    if (errorLog.length > 10) {
      issues.push({ severity: 'warning', message: errorLog.length + ' recent errors', auto_fixable: true });
    }

    var healthScore = 100;
    issues.forEach(function(issue) {
      if (issue.severity === 'critical') healthScore -= 30;
      else if (issue.severity === 'warning') healthScore -= 10;
      else healthScore -= 2;
    });
    healthScore = Math.max(0, healthScore);

    logOpsEvent('health_check', 'Health check complete — score: ' + healthScore + '%', { issues: issues.length });

    sendJSON(res, 200, {
      status: healthScore >= 70 ? 'healthy' : healthScore >= 40 ? 'degraded' : 'critical',
      score: healthScore,
      checks: checks,
      issues: issues,
      errors: errorLog.slice(-5),
      pattern_count: patterns.patterns.length,
      checked_at: new Date().toISOString()
    });
  }

  function handleOpsLogEvent(req, res, body) {
    try {
      var data = JSON.parse(body);
      var entry = logOpsEvent(data.type || 'info', data.message, data.detail);
      sendJSON(res, 200, { ok: true, entry: entry, log_count: opsLog.length });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid event: ' + e.message });
    }
  }

  function handleOpsLogList(req, res) {
    var url = new URL(req.url, 'http://' + req.headers.host);
    var limit = parseInt(url.searchParams.get('limit') || '50', 10);
    var type = url.searchParams.get('type') || '';

    var entries = opsLog;
    if (type) {
      entries = entries.filter(function(e) { return e.type === type; });
    }
    entries = entries.slice(-Math.min(limit, OPS_LOG_MAX));

    sendJSON(res, 200, { entries: entries, count: entries.length, total: opsLog.length });
  }

  function handleOpsAutoFix(req, res, body) {
    try {
      var data = JSON.parse(body);
      var errorMessage = (data.error || '').toLowerCase();
      var patterns = loadPatterns();

      var match = null;
      patterns.patterns.forEach(function(p) {
        var pattern = p.error_pattern.toLowerCase();
        var escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        try {
          var re = new RegExp('\\b' + escaped + '\\b', 'i');
          if (re.test(errorMessage)) {
            match = p;
          }
        } catch (e) {
          if (errorMessage.indexOf(pattern) >= 0) {
            match = p;
          }
        }
      });

      if (!match) {
        logOpsEvent('auto_fix', 'No matching auto-fix pattern for: ' + data.error, { attempted: false });
        return sendJSON(res, 200, {
          matched: false,
          message: 'No auto-fix pattern found for this error',
          actionable: false
        });
      }

      logOpsEvent('auto_fix', 'Attempting auto-fix: ' + match.description, {
        pattern: match.error_pattern,
        severity: match.severity,
        action: match.action || 'auto_fix'
      });

      sendJSON(res, 200, {
        matched: true,
        pattern: match.error_pattern,
        severity: match.severity,
        description: match.description,
        action: match.action || 'auto_fix',
        fix_command: match.auto_fix_command || null,
        fix_script: match.auto_fix_script || null,
        requires_sudo: match.requires_sudo || false,
        message: 'Pattern matched — ' + match.description
      });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid request: ' + e.message });
    }
  }

  function handleOpsReport(req, res) {
    var now = new Date();
    var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var todayOps = opsLog.filter(function(e) { return new Date(e.ts).getTime() >= dayStart; });
    var todayErrors = todayOps.filter(function(e) { return e.type === 'error' || e.type === 'auto_fix'; });

    sendJSON(res, 200, {
      report_date: now.toISOString().slice(0, 10),
      summary: {
        server_uptime: Math.round(process.uptime() / 3600 * 10) / 10 + 'h',
        active_subscriptions: subscriptions.size,
        stored_timelines: (db && db.isReady() ? Object.keys(db.getTlCache()).length : 0),
        total_ops_events: opsLog.length,
        today_events: todayOps.length,
        today_issues: todayErrors.length,
        memory_usage_mb: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      health: {
        api_key: !!API_KEY,
        stripe: STRIPE_ENABLED,
        admin_secret_auto_generated: ADMIN_SECRET_AUTO_GENERATED
      },
      top_issues: errorLog.slice(-5).map(function(e) {
        return { ts: e.ts, message: e.message, context: e.context };
      }),
      recommendations: [
        (!API_KEY) ? 'Set ANTHROPIC_API_KEY environment variable' : null,
        (ADMIN_SECRET_AUTO_GENERATED) ? 'Set ADMIN_SECRET explicitly for production' : null,
        (!STRIPE_ENABLED) ? 'Configure Stripe for production payments' : null,
        (subscriptions.size === 0) ? 'No active subscriptions — create a test subscription via HQ' : null,
        (process.memoryUsage() && process.memoryUsage().rss > 300 * 1024 * 1024) ? 'Memory usage above 300MB — consider increasing available RAM' : null
      ].filter(Boolean)
    });

    logOpsEvent('report', 'Daily report generated', { events_today: todayOps.length });
  }

  return {
    handleOpsHealthCheck, handleOpsLogEvent, handleOpsLogList,
    handleOpsAutoFix, handleOpsReport,
    logOpsEvent, opsLog, OPS_LOG_MAX
  };
};
