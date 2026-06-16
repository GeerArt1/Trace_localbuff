// ══════════════════════════════════════════════
// TRACE — AI Agent: Self-Healing Engine
// Receives watchdog reports from the client,
// matches errors against fix patterns,
// executes auto-fixes, and generates developer
// reports with summaries of what happened and
// what was fixed.
// ══════════════════════════════════════════════

const { exec } = require('child_process');
const { sendJSON, log, logError } = require('./helpers');
const { loadErrorPatterns, logEvent } = require('./patterns');

module.exports = function(ctx) {
  const { db, subscriptions, errorLog, STATIC_DIR, opsLog, OPS_LOG_MAX } = ctx;

  // ── Load error patterns (delegates to shared module) ──
  function loadPatterns() {
    return loadErrorPatterns(STATIC_DIR, logError);
  }

  // ── Log agent event ──
  function logAgent(type, message, detail) {
    return logEvent(opsLog, OPS_LOG_MAX, type, message, detail);
  }

  // ── Match an error message against patterns ──
  function matchPattern(errorMessage) {
    if (!errorMessage) return null;
    var patterns = loadPatterns();
    var msg = errorMessage.toLowerCase();

    for (let i = 0; i < patterns.patterns.length; i++) {
      var p = patterns.patterns[i];
      var pattern = (p.error_pattern || '').toLowerCase();
      if (msg.indexOf(pattern) >= 0) {
        return p;
      }
    }
    return null;
  }

  // ── Execute an auto-fix command ──
  function executeFix(pattern) {
    return new Promise(function(resolve) {
      var cmd = pattern.auto_fix_command;
      if (!cmd) {
        return resolve({ executed: false, reason: 'No fix command defined', output: '' });
      }

      logAgent('auto_fix', 'Executing: ' + cmd, {
        pattern: pattern.error_pattern,
        severity: pattern.severity,
        requires_sudo: !!pattern.requires_sudo
      });

      var opts = { timeout: 30000, maxBuffer: 1024 * 64 };
      if (pattern.requires_sudo) {
        // Log the attempt but don't execute — needs manual intervention
        return resolve({
          executed: false,
          reason: 'Requires sudo — manual intervention needed',
          command: cmd,
          output: ''
        });
      }

      exec(cmd, opts, function(err, stdout, stderr) {
        if (err) {
          logAgent('auto_fix_failed', 'Fix failed: ' + cmd, {
            error: err.message.slice(0, 200),
            stderr: (stderr || '').slice(0, 300)
          });
          return resolve({
            executed: true,
            success: false,
            reason: err.message.slice(0, 200),
            command: cmd,
            output: (stderr || stdout || '').slice(0, 500)
          });
        }

        logAgent('auto_fix_success', 'Fix succeeded: ' + cmd, {
          output: (stdout || '').slice(0, 300)
        });
        return resolve({
          executed: true,
          success: true,
          reason: 'Fix applied successfully',
          command: cmd,
          output: (stdout || '').slice(0, 500)
        });
      });
    });
  }

  // ── Build a developer report ──
  function buildReport() {
    var now = new Date();
    var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // Filter today's events
    var todayOps = opsLog.filter(function(e) {
      return new Date(e.ts).getTime() >= dayStart;
    });
    var todayErrors = todayOps.filter(function(e) {
      return e.type === 'error' || e.type.indexOf('fail') >= 0;
    });
    var todayFixes = todayOps.filter(function(e) {
      return e.type === 'auto_fix_success';
    });
    var todayFixAttempts = todayOps.filter(function(e) {
      return e.type.indexOf('auto_fix') >= 0;
    });

    // Summarize errors by source
    var errorsBySource = {};
    todayOps.forEach(function(e) {
      var src = (e.detail && e.detail.pattern) || e.type;
      errorsBySource[src] = (errorsBySource[src] || 0) + 1;
    });

    return {
      report_date: now.toISOString().slice(0, 10),
      report_time: now.toISOString(),
      period_hours: Math.round(process.uptime() / 3600 * 10) / 10,
      summary: {
        events_today: todayOps.length,
        errors_today: todayErrors.length,
        fixes_applied: todayFixes.length,
        fix_attempts: todayFixAttempts.length,
        fix_success_rate: todayFixAttempts.length > 0
          ? Math.round((todayFixes.length / todayFixAttempts.length) * 100) + '%'
          : 'N/A',
        active_subscriptions: subscriptions.size,
        total_ops_events: opsLog.length,
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024)
      },
      health: {
        api_key: !!process.env.ANTHROPIC_API_KEY,
        stripe: !!process.env.STRIPE_SECRET_KEY,
        admin_auto_generated: !process.env.ADMIN_SECRET,
        uptime_hours: Math.round(process.uptime() / 36) / 100,
        error_count: errorLog.length
      },
      recent_issues: errorLog.slice(-5).map(function(e) {
        return { ts: e.ts, message: e.message.slice(0, 200), context: e.context };
      }),
      activity: {
        top_error_sources: Object.keys(errorsBySource)
          .sort(function(a, b) { return errorsBySource[b] - errorsBySource[a]; })
          .slice(0, 10)
          .map(function(k) { return { source: k, count: errorsBySource[k] }; }),
        recent_ops: opsLog.slice(-20).reverse()
      },
      recommendations: [
        !process.env.ANTHROPIC_API_KEY
          ? { priority: 'critical', action: 'Set ANTHROPIC_API_KEY environment variable' }
          : null,
        !process.env.ADMIN_SECRET
          ? { priority: 'high', action: 'Set ADMIN_SECRET explicitly for production' }
          : null,
        !process.env.STRIPE_SECRET_KEY
          ? { priority: 'medium', action: 'Configure Stripe for production payments' }
          : null,
        errorLog.length > 10
          ? { priority: 'medium', action: errorLog.length + ' errors in log — investigate top sources' }
          : null,
        subscriptions.size === 0
          ? { priority: 'low', action: 'No active subscriptions — create a test subscription' }
          : null,
        process.memoryUsage && process.memoryUsage().rss > 300 * 1024 * 1024
          ? { priority: 'medium', action: 'Memory usage above 300MB — consider increasing RAM' }
          : null
      ].filter(Boolean),
      patterns_loaded: loadPatterns().patterns.length
    };
  }


  // ── Route handlers ──

  function handleWatchdogReport(req, res, body) {
    try {
      var data = JSON.parse(body);

      // Log the watchdog batch
      var detail = data.detail || {};
      var batch = detail.batch || [];
      var errors = batch.filter(function(b) { return b.type === 'error' || b.type === 'warning'; });

      logAgent('watchdog', 'Watchdog report: ' + batch.length + ' events, ' + errors.length + ' issues', {
        batchSize: batch.length,
        errorCount: errors.length,
        sources: batch.reduce(function(acc, b) {
          var src = b.source || 'unknown';
          acc[src] = (acc[src] || 0) + 1;
          return acc;
        }, {}),
        sampleErrors: errors.slice(0, 3).map(function(e) {
          return { source: e.source, message: (e.message || '').slice(0, 150) };
        })
      });

      // Try to auto-fix each error
      var fixResults = [];
      errors.forEach(function(err) {
        var matched = matchPattern(err.message || '');
        if (matched) {
          fixResults.push({
            error: err.message,
            matched: true,
            pattern: matched.error_pattern,
            severity: matched.severity,
            description: matched.description,
            fix_command: matched.auto_fix_command || null
          });
        }
      });

      sendJSON(res, 200, {
        ok: true,
        received: batch.length,
        errors_found: errors.length,
        patterns_matched: fixResults.length,
        auto_fixes: fixResults,
        processed_at: new Date().toISOString()
      });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid watchdog report: ' + e.message });
    }
  }

  function handleAgentAutoFix(req, res, body) {
    try {
      var data = JSON.parse(body);
      var errorMessage = data.error || '';
      var matched = matchPattern(errorMessage);

      if (!matched) {
        return sendJSON(res, 200, {
          matched: false,
          message: 'No matching auto-fix pattern found',
          actionable: false
        });
      }

      // Execute the fix
      executeFix(matched).then(function(result) {
        sendJSON(res, 200, {
          matched: true,
          pattern: matched.error_pattern,
          severity: matched.severity,
          description: matched.description,
          fix: result,
          actionable: true
        });
      });

    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid auto-fix request: ' + e.message });
    }
  }

  function handleAgentReport(req, res) {
    var report = buildReport();
    sendJSON(res, 200, report);
    logAgent('report', 'Developer report generated', {
      events_today: report.summary.events_today,
      fixes_applied: report.summary.fixes_applied
    });
  }

  // ── Public API ──
  return {
    handleWatchdogReport: handleWatchdogReport,
    handleAgentAutoFix: handleAgentAutoFix,
    handleAgentReport: handleAgentReport,
    buildReport: buildReport,
    logAgent: logAgent
  };
};
