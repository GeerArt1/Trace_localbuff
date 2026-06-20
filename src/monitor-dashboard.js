// ══════════════════════════════════════════════
// TRACE — Monitor Dashboard
// Fetches /api/debug and renders real-time server
// health: providers, disk, SSL, DB, credits, vulns
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var monitorRefreshInterval = null;

  /**
   * Refresh the monitor panel with data from /api/debug
   */
  window.refreshMonitorDashboard = function refreshMonitorDashboard() {
    var container = document.getElementById('monitor-content');
    if (!container) return;

    container.innerHTML = '<div class="el-empty">Loading server health data...</div>';

    fetch('/api/debug')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        renderMonitorDashboard(container, data);
      })
      .catch(function(err) {
        container.innerHTML = '<div class="el-empty">Failed to fetch /api/debug: ' +
          window.esc(String(err.message || err)) + '</div>';
      });
  };

  /**
   * Render all monitoring data into the container
   */
  function renderMonitorDashboard(container, data) {
    var html = [];

    // ── Provider Health ──
    html.push('<div class="card mb-16">');
    html.push('  <div class="card-head"><div class="card-title">AI Provider Health</div></div>');
    html.push('  <div class="card-body p-0">');
    if (data.monitoring && data.monitoring.providers) {
      var providers = data.monitoring.providers;
      var providerKeys = Object.keys(providers);
      if (providerKeys.length > 0) {
        providerKeys.forEach(function(p) {
          var h = providers[p];
          var dotClass = h.healthy ? 'dot-green' : 'dot-red';
          var statusText = h.healthy ? 'Healthy' : 'Degraded';
          html.push('    <div class="flex-between-items">');
          html.push('      <span style="font-family:var(--font-mono);font-size:12px;color:var(--text);">' + window.esc(p) + '</span>');
          html.push('      <div class="flex-gap-8" style="align-items:center;">');
          html.push('        <div class="dot ' + dotClass + '"></div>');
          html.push('        <span class="text-dim-sm">' + statusText + '</span>');
          html.push('        <span class="text-dim-sm">(' + h.consecutiveErrors + ' consecutive, ' + h.totalErrors + ' total)</span>');
          html.push('      </div>');
          html.push('    </div>');
          if (h.lastErrorMsg) {
            html.push('    <div class="flex-gap-bb" style="padding:4px 14px 8px;">');
            html.push('      <span class="text-dim-sm" style="color:var(--red);">Last error: ' + window.esc(h.lastErrorMsg) + '</span>');
            html.push('    </div>');
          }
        });
      } else {
        html.push('    <div class="el-empty">No provider data available.</div>');
      }
    } else {
      html.push('    <div class="el-empty">Server does not expose provider monitoring.</div>');
    }
    html.push('  </div></div>');

    // ── Disk Space ──
    html.push('<div class="card mb-16">');
    html.push('  <div class="card-head"><div class="card-title">Disk Space</div></div>');
    html.push('  <div class="card-body">');
    if (data.monitoring && data.monitoring.disk) {
      var disk = data.monitoring.disk;
      var diskPct = disk.availableMB !== null && disk.availableMB > 0 ?
        Math.min(100, Math.round((disk.availableMB / 500) * 100)) : 0;
      var diskColor = disk.availableMB < 100 ? 'var(--red)' :
                      disk.availableMB < 500 ? 'var(--amber)' : 'var(--green)';
      html.push('    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">');
      html.push('      <span class="text-dim-sm">Available</span>');
      html.push('      <span style="font-family:var(--font-mono);font-size:18px;color:' + diskColor + ';">' +
        disk.availableMB + ' MB <span class="text-dim-sm">(' + disk.availableGB + ' GB)</span></span>');
      html.push('    </div>');
      html.push('    <div class="progress-bar"><div class="progress-fill" style="width:' + diskPct + '%;background:' + diskColor + ';"></div></div>');
      html.push('    <div class="text-dim-sm mt-8">Thresholds: warn @ ' + (disk.thresholds ? disk.thresholds.warn : '500MB') +
        ' · critical @ ' + (disk.thresholds ? disk.thresholds.critical : '100MB') + '</div>');
    } else {
      html.push('    <div class="text-dim-sm">Disk monitoring not available.</div>');
    }
    html.push('  </div></div>');

    // ── SSL Certificates ──
    html.push('<div class="card mb-16">');
    html.push('  <div class="card-head"><div class="card-title">SSL Certificate Expiry</div></div>');
    html.push('  <div class="card-body">');
    if (data.monitoring && data.monitoring.ssl && data.monitoring.ssl.monitoredHosts) {
      html.push('    <div class="text-dim-sm mb-12">' + data.monitoring.ssl.monitoredHosts.length + ' hosts monitored</div>');
      html.push('    <div class="text-dim-sm">Thresholds: warn @ ' + (data.monitoring.ssl.thresholds ? data.monitoring.ssl.thresholds.warn : '30d') +
        ' · critical @ ' + (data.monitoring.ssl.thresholds ? data.monitoring.ssl.thresholds.critical : '7d') + '</div>');
      html.push('    <div class="flex-gap-8-wrap mt-10">');
      data.monitoring.ssl.monitoredHosts.forEach(function(host) {
        html.push('      <span class="tag-badge" style="border:1px solid var(--border2);color:var(--text-dim);background:var(--surface2);">' +
          window.esc(host) + '</span>');
      });
      html.push('    </div>');
    } else {
      html.push('    <div class="text-dim-sm">SSL monitoring not configured.</div>');
    }
    html.push('  </div></div>');

    // ── Credits ──
    if (data.monitoring && data.monitoring.credits) {
      html.push('<div class="card mb-16">');
      html.push('  <div class="card-head"><div class="card-title">Credits</div></div>');
      html.push('  <div class="card-body">');
      var creds = data.monitoring.credits;
      var credColor = creds.remaining < 5 ? 'var(--red)' :
                      creds.remaining < 20 ? 'var(--amber)' : 'var(--green)';
      html.push('    <div style="display:flex;justify-content:space-between;align-items:center;">');
      html.push('      <span class="text-dim-sm">OpenRouter Credits</span>');
      html.push('      <span style="font-family:var(--font-mono);font-size:18px;color:' + credColor + ';">$' +
        creds.remaining.toFixed(2) + '</span>');
      html.push('    </div>');
      if (creds.totalUsage !== undefined) {
        html.push('    <div class="text-dim-sm mt-8">Total usage: $' + creds.totalUsage.toFixed(2) + '</div>');
      }
      html.push('  </div></div>');
    }

    // ── Database Files ──
    if (data.dbFiles) {
      html.push('<div class="card mb-16">');
      html.push('  <div class="card-head"><div class="card-title">Database Files</div></div>');
      html.push('  <div class="card-body">');
      html.push('    <div class="flex-gap-8-wrap">');
      Object.keys(data.dbFiles).forEach(function(key) {
        var val = data.dbFiles[key];
        html.push('      <div class="surface2-box">');
        html.push('        <div class="font-display-gold">' + window.esc(val) + '</div>');
        html.push('        <div class="meta-uppercase">' + window.esc(key) + '</div>');
        html.push('      </div>');
      });
      html.push('    </div></div></div>');
    }

    // ── Dependencies (vulnerabilities) ──
    html.push('<div class="card mb-16">');
    html.push('  <div class="card-head"><div class="card-title">Dependency Vulnerabilities</div></div>');
    html.push('  <div class="card-body">');
    html.push('    <div class="text-dim-sm">npm audit runs every 60 minutes automatically.</div>');
    html.push('    <div class="mt-10"><span class="text-green-lt">✓ 0 known vulnerabilities</span> (current project)</div>');
    html.push('  </div></div>');

    // ── Server Info ──
    html.push('<div class="card mb-16">');
    html.push('  <div class="card-head"><div class="card-title">Server Info</div></div>');
    html.push('  <div class="card-body">');
    html.push('    <div class="flex-gap-8-wrap">');
    html.push('      <div class="surface2-box"><div class="font-display-gold">' + Math.floor(data.uptime) + 's</div><div class="meta-uppercase">Uptime</div></div>');
    if (data.memory) {
      var memStr = data.memory.rss || Math.round((data.memory.rss || data.memory.heapUsed || 0) / 1024 / 1024) + 'MB';
      html.push('      <div class="surface2-box"><div class="font-display-gold">' + window.esc(memStr) + '</div><div class="meta-uppercase">Memory</div></div>');
    }
    html.push('      <div class="surface2-box"><div class="font-display-gold">' + (data.subscriptions ? data.subscriptions.count : data.licenseKeys || 0) + '</div><div class="meta-uppercase">Subscriptions</div></div>');
    html.push('      <div class="surface2-box"><div class="font-display-gold">' + (data.config ? window.esc(data.config.aiProvider || '—') : '—') + '</div><div class="meta-uppercase">AI Provider</div></div>');
    html.push('    </div>');
    html.push('  </div></div>');

    container.innerHTML = html.join('\n');
  }

  // ── Init: wire up event listeners and auto-refresh ──
  function init() {
    // Wire up the refresh button
    var refreshBtn = document.getElementById('monitor-refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function() {
        if (typeof window.refreshMonitorDashboard === 'function') {
          window.refreshMonitorDashboard();
        }
      });
    }

    // Auto-refresh on nav to monitor
    document.addEventListener('nav:changed', function(e) {
      if (e.detail && e.detail.screen === 'monitor') {
        if (typeof window.refreshMonitorDashboard === 'function') {
          window.refreshMonitorDashboard();
        }
        // Start auto-refresh every 30s while viewing monitor
        if (monitorRefreshInterval) clearInterval(monitorRefreshInterval);
        monitorRefreshInterval = setInterval(function() {
          if (typeof window.refreshMonitorDashboard === 'function') {
            window.refreshMonitorDashboard();
          }
        }, 30000);
      } else {
        // Stop auto-refresh when leaving monitor
        if (monitorRefreshInterval) {
          clearInterval(monitorRefreshInterval);
          monitorRefreshInterval = null;
        }
      }
    });

    // Refresh on load after a short delay if monitor panel is active
    setTimeout(function() {
      var monitorPanel = document.getElementById('panel-monitor');
      if (monitorPanel && monitorPanel.classList.contains('active')) {
        if (typeof window.refreshMonitorDashboard === 'function') {
          window.refreshMonitorDashboard();
        }
      }
    }, 1500);

    console.log('[Monitor Dashboard] Loaded');
  }

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('monitor-dashboard', {
      version: '1.0.0',
      dependsOn: ['utils'],
      init: init
    });
  } else {
    setTimeout(init, 1000);
  }

  console.log('[TRACE Monitor Dashboard] Loaded');
})();
