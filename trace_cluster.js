#!/usr/bin/env node
// ══════════════════════════════════════════════
// TRACE Cluster Manager v2.0 — Self-Healing Server
// ══════════════════════════════════════════════
// Usage:
//   node trace_cluster.js              — Single worker with auto-restart
//   node trace_cluster.js --watch      — File watcher + auto-restart on changes
//   WORKERS=4 node trace_cluster.js    — 4 workers (rolling restart)
//   node trace_cluster.js --no-graceful   — Disable graceful connection draining (enabled by default)
//
// The master process forks workers and auto-restarts them on crash.
// Health monitoring: master pings workers every 10s, restarts unresponsive ones.
// Restart-loop prevention: max 5 restarts per worker within 60s window.
// In --watch mode, it monitors the trace/ directory for changes and
// performs a rolling restart of all workers with connection draining.

var cluster = require('cluster');
var fs = require('fs');
var path = require('path');
var os = require('os');

var WORKER_COUNT = Math.min(
  parseInt(process.env.WORKERS || '1', 10),
  os.cpus().length || 4
);
var WATCH_DIR = __dirname;
var isWatchMode = process.argv.indexOf('--watch') >= 0;
var isGraceful = process.argv.indexOf('--no-graceful') < 0; // graceful draining on by default
var shuttingDown = false;

// ── Health monitoring ──
var HEALTH_CHECK_INTERVAL = 10000; // 10s between pings
var HEALTH_TIMEOUT = 8000;         // 8s to respond
var MAX_RESTART_WINDOW = 60000;    // 60s window for restart counting
var MAX_RESTARTS_IN_WINDOW = 5;    // max 5 restarts per worker in window

// ── Restart tracking ──
var workerRestartCounts = {}; // { workerId: [{ts: number}] }

// ── Ignored file patterns for watch mode ──
var IGNORED_PATTERNS = [
  'node_modules',
  '.sqlite',
  '.sqlite.bak',
  '.subscriptions.json',
  '.subscriptions.json.bak',
  '.timelines.json',
  '.timelines.json.bak',
  '.last_optimize.json',
  'trace_events.log',
  '.DS_Store',
  'Casks',
  'Formulae',
  'Searching'
];

function shouldIgnore(filename) {
  if (!filename) return true;
  for (var i = 0; i < IGNORED_PATTERNS.length; i++) {
    if (filename.indexOf(IGNORED_PATTERNS[i]) >= 0) return true;
  }
  return false;
}

function pruneRestartCounts(workerId) {
  var now = Date.now();
  var counts = workerRestartCounts[workerId] || [];
  workerRestartCounts[workerId] = counts.filter(function(c) {
    return now - c.ts < MAX_RESTART_WINDOW;
  });
}

function isRestartLoop(workerId) {
  pruneRestartCounts(workerId);
  return (workerRestartCounts[workerId] || []).length >= MAX_RESTARTS_IN_WINDOW;
}

function recordRestart(workerId) {
  if (!workerRestartCounts[workerId]) workerRestartCounts[workerId] = [];
  workerRestartCounts[workerId].push({ ts: Date.now() });
  pruneRestartCounts(workerId);
}

if (cluster.isMaster) {
  // ════════════════════════════════════════════
  //  MASTER PROCESS
  // ════════════════════════════════════════════

  var activeWorkers = {};
  var workerHealth = {};      // { workerId: { lastPong: number, pid: number, memory: number, subscriptions: number, connections: number, errors: number } }
  var pendingHealthChecks = {}; // { workerId: setTimeout handle }

  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   TRACE Cluster Manager v2.0             ║');
  console.log('║   Self-healing with health monitoring     ║');
  console.log('╚═══════════════════════════════════════════╝');
  console.log('  Workers:    ' + WORKER_COUNT);
  console.log('  Watch mode: ' + (isWatchMode ? 'ON' : 'OFF'));
  console.log('  Graceful:   ' + (isGraceful ? 'ON (default)' : 'OFF'));
  console.log('  PID:        ' + process.pid);
  console.log('');

  // ── Fork a worker process ──
  function forkWorker() {
    var worker = cluster.fork();
    activeWorkers[worker.id] = worker;
    workerHealth[worker.id] = { lastPong: Date.now(), pid: worker.process.pid, status: 'starting' };

    console.log('[CLUSTER] Worker ' + worker.id + ' started (pid: ' + worker.process.pid + ')');

    worker.on('exit', function(code, signal) {
      delete activeWorkers[worker.id];
      delete workerHealth[worker.id];
      clearPendingHealthCheck(worker.id);

      if (shuttingDown) {
        console.log('[CLUSTER] Worker ' + worker.id + ' exited (shutdown)');
        if (Object.keys(activeWorkers).length === 0) {
          console.log('[CLUSTER] All workers exited. Goodbye.');
          process.exit(0);
        }
        return;
      }

      // Don't auto-restart if this was a planned kill (rolling restart)
      var isPlanned = worker._plannedRestart === true;

      var reason = signal ? 'signal ' + signal : 'code ' + code;
      if (isPlanned) {
        console.log('[CLUSTER] Worker ' + worker.id + ' exited (' + reason + ') — planned restart, no auto-replace');
        return;
      }

      console.log('[CLUSTER] Worker ' + worker.id + ' died (' + reason + ').');

      // Check for restart loop
      recordRestart(worker.id);
      if (isRestartLoop(worker.id)) {
        console.error('[CLUSTER] ⚠️  RESTART LOOP detected for worker ' + worker.id +
          ' (' + MAX_RESTARTS_IN_WINDOW + ' restarts in ' + (MAX_RESTART_WINDOW / 1000) + 's). Waiting 30s...');
        setTimeout(forkWorker, 30000);
        return;
      }

      // Auto-restart after brief delay (prevents crash cascading)
      var delay = code === 0 ? 500 : 1000;
      setTimeout(forkWorker, delay);
    });

    worker.on('listening', function(address) {
      console.log('[CLUSTER] Worker ' + worker.id + ' listening on port ' + address.port);
      if (workerHealth[worker.id]) {
        workerHealth[worker.id].status = 'listening';
      }
    });

    worker.on('error', function(err) {
      console.error('[CLUSTER] Worker ' + worker.id + ' error:', err.message);
    });

    worker.on('message', function(msg) {
      if (!msg || !msg.type) return;

      switch (msg.type) {
        
        case 'auto_update_applied':
          console.log('[CLUSTER] Rolling restart triggered by worker ' + worker.id + ' after auto-update');
          (function() {
            var awIds = Object.keys(activeWorkers);
            function ruRestartNext(idx) {
              if (idx >= awIds.length || shuttingDown) { console.log('[CLUSTER] Auto-update rolling restart complete'); return; }
              var wid = awIds[idx];
              var w = activeWorkers[wid];
              if (!w || !w.isConnected()) { ruRestartNext(idx + 1); return; }
              var newW = forkWorker();
              var rTimeout = setTimeout(function() {
                if (w && w.isConnected()) { w._plannedRestart = true; w.kill(isGraceful ? 'SIGTERM' : 'SIGKILL'); }
                ruRestartNext(idx + 1);
              }, isGraceful ? 10000 : 5000);
              newW.once('listening', function() {
                clearTimeout(rTimeout);
                if (w && w.isConnected()) { w._plannedRestart = true; w.kill(isGraceful ? 'SIGTERM' : 'SIGKILL'); }
                ruRestartNext(idx + 1);
              });
              newW.once('exit', function() { clearTimeout(rTimeout); ruRestartNext(idx + 1); });
            }
            ruRestartNext(0);
          })();
          break;

        case 'cluster_ready':
          console.log('[CLUSTER] Worker ' + worker.id + ' reported ready (pid: ' + msg.pid + ')');
          if (workerHealth[worker.id]) {
            workerHealth[worker.id].status = 'ready';
            workerHealth[worker.id].lastPong = Date.now();
          }
          break;

        case 'worker_health':
          if (workerHealth[worker.id]) {
            workerHealth[worker.id] = {
              lastPong: Date.now(),
              pid: msg.pid || worker.process.pid,
              status: 'healthy',
              uptime: msg.uptime || 0,
              memory: msg.memory || 0,
              subscriptions: msg.subscriptions || 0,
              connections: msg.connections || 0,
              errors: msg.errors || 0
            };
          }
          clearPendingHealthCheck(worker.id);
          break;

        case 'worker_crash':
          console.error('[CLUSTER] Worker ' + worker.id + ' reported crash: ' + (msg.error || 'unknown error'));
          break;

        case 'worker_init_failed':
          console.error('[CLUSTER] Worker ' + worker.id + ' init failed: ' + (msg.error || 'unknown error'));
          break;
      }
    });

    return worker;
  }

  // ── Health check pings ──
  function clearPendingHealthCheck(workerId) {
    if (pendingHealthChecks[workerId]) {
      clearTimeout(pendingHealthChecks[workerId]);
      delete pendingHealthChecks[workerId];
    }
  }

  function pingWorker(workerId) {
    var worker = activeWorkers[workerId];
    if (!worker || !worker.isConnected()) return;

    // If we haven't heard from this worker in HEALTH_TIMEOUT, it's unresponsive
    var health = workerHealth[workerId];
    if (health && Date.now() - health.lastPong > HEALTH_TIMEOUT) {
      console.warn('[CLUSTER] Worker ' + workerId + ' unresponsive (last ping: ' +
        Math.round((Date.now() - health.lastPong) / 1000) + 's ago). Restarting...');
      worker.kill('SIGTERM');
      // Worker's exit handler will restart it
      return;
    }

    // Send ping — worker should respond with worker_health
    try {
      worker.send({ type: 'health_ping', ts: Date.now() });
    } catch(e) {
      // Worker might be gone
    }

    // Set a timeout for this ping
    clearPendingHealthCheck(workerId);
    pendingHealthChecks[workerId] = setTimeout(function() {
      // If worker doesn't respond within HEALTH_TIMEOUT, restart it
      var h = workerHealth[workerId];
      if (h && Date.now() - h.lastPong > HEALTH_TIMEOUT) {
        console.warn('[CLUSTER] Worker ' + workerId + ' health check timeout. Restarting...');
        var w = activeWorkers[workerId];
        if (w && w.isConnected()) {
          w.kill('SIGTERM');
        }
      }
      delete pendingHealthChecks[workerId];
    }, HEALTH_TIMEOUT);
    if (pendingHealthChecks[workerId].unref) pendingHealthChecks[workerId].unref();
  }

  // ── Start periodic health checks ──
  var healthTimer = setInterval(function() {
    Object.keys(activeWorkers).forEach(pingWorker);
  }, HEALTH_CHECK_INTERVAL);
  if (healthTimer.unref) healthTimer.unref();

  // ── Fork initial workers ──
  for (var i = 0; i < WORKER_COUNT; i++) {
    forkWorker();
  }

  // ── Watch mode: rolling restart on file changes ──
  if (isWatchMode) {
    var watchTimer = null;

    try {
      var watcher = fs.watch(WATCH_DIR, { recursive: true }, function(eventType, filename) {
        if (shouldIgnore(filename)) return;

        // Debounce — batch rapid changes (e.g. editor saves) into one restart
        if (watchTimer) clearTimeout(watchTimer);
        watchTimer = setTimeout(function() {
          console.log('[CLUSTER] File change detected: ' + (filename || 'unknown'));
          console.log('[CLUSTER] Rolling restart...');

          // Graceful rolling restart
          var workerIds = Object.keys(activeWorkers);

          function restartNext(idx) {
            if (idx >= workerIds.length || shuttingDown) {
              console.log('[CLUSTER] Rolling restart complete');
              return;
            }
            var id = workerIds[idx];
            var w = activeWorkers[id];
            if (!w || !w.isConnected()) {
              restartNext(idx + 1);
              return;
            }

            // Fork a new worker first (to maintain capacity)
            var newWorker = forkWorker();

            // Wait for new worker to be ready, then kill the old one
            var readyTimeout = setTimeout(function() {
              console.log('[CLUSTER] New worker timed out, killing old worker ' + id + ' anyway');
              if (w && w.isConnected()) {
                w._plannedRestart = true;
                w.kill(isGraceful ? 'SIGTERM' : 'SIGKILL');
              }
              restartNext(idx + 1);
            }, isGraceful ? 10000 : 5000);

            newWorker.once('listening', function() {
              clearTimeout(readyTimeout);
              console.log('[CLUSTER] New worker ready. Killing old worker ' + id);
              if (w && w.isConnected()) {
                // Mark as planned restart so exit handler doesn't auto-replace
                w._plannedRestart = true;
                w.kill(isGraceful ? 'SIGTERM' : 'SIGKILL');
              }
              restartNext(idx + 1);
            });

            // If new worker exits without listening, skip to next old worker
            newWorker.once('exit', function() {
              clearTimeout(readyTimeout);
              console.log('[CLUSTER] New worker for ' + id + ' died during startup. Keeping old worker.');
              restartNext(idx + 1);
            });
          }

          restartNext(0);
        }, 300);
      });

      watcher.on('error', function(err) {
        console.warn('[CLUSTER] Watch error:', err.message);
      });

      console.log('[CLUSTER] Watching ' + WATCH_DIR + ' for changes...');
    } catch (e) {
      console.warn('[CLUSTER] Could not start file watcher:', e.message);
      console.warn('[CLUSTER]   --watch mode not available on this platform');
    }
  }

  // ── Graceful shutdown ──
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('[CLUSTER] ' + signal + ' received. Shutting down...');

    if (healthTimer) clearInterval(healthTimer);

    // Send SIGTERM to all workers (graceful)
    for (var id in activeWorkers) {
      var w = activeWorkers[id];
      if (w && w.isConnected()) {
        w.kill('SIGTERM');
      }
    }

    // Force exit after 8s
    setTimeout(function() {
      console.log('[CLUSTER] Forced exit after timeout');
      // Kill remaining workers
      for (var id2 in activeWorkers) {
        var w2 = activeWorkers[id2];
        if (w2 && w2.isConnected()) w2.kill('SIGKILL');
      }
      process.exit(1);
    }, 8000);
  }

  process.on('SIGTERM', function() { shutdown('SIGTERM'); });
  process.on('SIGINT', function() { shutdown('SIGINT'); });

  // Log cluster summary periodically
  var summaryTimer = setInterval(function() {
    var totalMemory = 0;
    var totalConnections = 0;
    var totalErrors = 0;
    var healthyCount = 0;
    var totalSubs = 0;

    Object.keys(workerHealth).forEach(function(id) {
      var h = workerHealth[id];
      if (h.status === 'healthy' || h.status === 'ready') healthyCount++;
      totalMemory += h.memory || 0;
      totalConnections += h.connections || 0;
      totalErrors += h.errors || 0;
      totalSubs += h.subscriptions || 0;
    });

    console.log('[CLUSTER] Status: ' + healthyCount + '/' + Object.keys(activeWorkers).length +
      ' workers healthy | ' + totalConnections + ' connections | ' +
      Math.round(totalMemory / 1024 / 1024) + 'MB RSS | ' +
      totalSubs + ' subscriptions | ' +
      totalErrors + ' errors');
  }, 60000);
  if (summaryTimer.unref) summaryTimer.unref();

} else {
  // ════════════════════════════════════════════
  //  WORKER PROCESS — runs the server
  // ════════════════════════════════════════════

  // Handle health pings from master
  process.on('message', function(msg) {
    if (msg && msg.type === 'health_ping') {
      try {
        process.send({
          type: 'worker_health',
          pid: process.pid,
          uptime: process.uptime(),
          memory: process.memoryUsage().rss,
          subscriptions: 0,
          connections: 0,
          errors: 0,
          ts: Date.now()
        });
      } catch(e) {
        // Master might be gone
      }
    }
  });

  // Notify master we're starting
  process.send({ type: 'cluster_ready', workerId: cluster.worker.id, pid: process.pid });

  // Run the server — trace_server.js handles its own init/bootstrap
  require('./trace_server');
}
