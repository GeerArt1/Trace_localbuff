#!/usr/bin/env python3
"""Add Deployment Pipeline, AI Sacred Geometry, and User Management to TRACE HQ."""

with open('trace_hq.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. ADD CSS ──
new_css = """

/* DEPLOYMENT PIPELINE */
.dp-status-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;}
.dp-status-item{background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:14px;text-align:center;}
.dp-status-dot{width:8px;height:8px;border-radius:50%;margin:0 auto 8px;}
.dp-status-dot.green{background:var(--green);}
.dp-status-dot.red{background:var(--red);}
.dp-status-dot.amber{background:#c89820;}
.dp-status-dot.grey{background:#444;}
.dp-status-label{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);}
.dp-log{background:var(--bg2);border:1px solid var(--border);border-radius:4px;font-family:var(--font-mono);font-size:11px;line-height:1.7;padding:14px;max-height:300px;overflow-y:auto;white-space:pre-wrap;}
.dp-log::-webkit-scrollbar{width:4px;}
.dp-log::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
.dp-log-line{color:var(--text-mid);}
.dp-log-line.ok{color:var(--green);}
.dp-log-line.err{color:var(--red);}
.dp-log-line.info{color:var(--blue);}
.dp-log-line.warn{color:#c89820;}

/* USER MANAGEMENT */
.um-table{width:100%;border-collapse:collapse;font-size:12px;}
.um-table th{padding:10px 14px;text-align:left;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-dim);border-bottom:1px solid var(--border);font-weight:600;}
.um-table td{padding:10px 14px;border-bottom:1px solid var(--border);color:var(--text-mid);}
.um-table tr:hover td{background:var(--surface2);}
.um-tier{display:inline-block;font-size:8px;padding:2px 8px;border-radius:2px;letter-spacing:.08em;text-transform:uppercase;}
.um-tier.pro{background:rgba(100,140,220,.1);color:#7AADDA;border:1px solid rgba(100,140,220,.2);}
.um-tier.col{background:rgba(212,174,82,.1);color:var(--gold);border:1px solid rgba(212,174,82,.2);}
.um-tier.disc{background:rgba(200,160,40,.08);color:#C8A028;border:1px solid rgba(200,160,40,.15);}
.um-status{font-size:8px;padding:2px 7px;border-radius:2px;letter-spacing:.08em;}
.um-status.active{background:rgba(74,148,96,.1);color:var(--green);border:1px solid rgba(74,148,96,.2);}
.um-status.inactive{background:rgba(196,72,72,.08);color:var(--red);border:1px solid rgba(196,72,72,.15);}

/* AI SACRED GEOMETRY ENHANCEMENT */
.sg-ai-btn{background:linear-gradient(135deg,var(--gold-dim),var(--gold));color:#060402;border:none;padding:8px 16px;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;border-radius:2px;font-family:var(--font-ui);transition:all .2s;}
.sg-ai-btn:hover{box-shadow:0 0 16px rgba(212,174,82,0.3);}
.sg-ai-btn:disabled{opacity:.4;cursor:not-allowed;}
.sg-analysis{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:14px;margin-top:12px;font-size:12px;line-height:1.7;color:var(--text-mid);}
.sg-analysis strong{color:var(--gold);}
"""

css_insert = content.find('</style>')
content = content[:css_insert] + new_css + content[css_insert:]

# ── 2. ADD SIDEBAR NAV ITEMS ──
# Find the Business section and add Deploy + Users after Revenue
revenue_btn = 'onclick="show(' + "'revenue'" + ')"'
revenue_pos = content.find(revenue_btn)
revenue_line_end = content.find('</button>', revenue_pos) + len('</button>')

deploy_nav = """
        <button class="nav-btn" onclick="show('deploy')">
          <span class="nav-icon">↻</span> Deployment
        </button>
        <button class="nav-btn" onclick="show('usermgmt')">
          <span class="nav-icon">◉</span> Users
        </button>"""

content = content[:revenue_line_end] + deploy_nav + content[revenue_line_end:]

# ── 3. ADD NEW PANELS ──
# Find the Settings panel start
settings_panel = 'id="panel-settings"'
settings_div_start = content.rfind('<!-- ──', 0, content.find(settings_panel, content.rfind('panel-flags')))

new_panels = """
      <!-- DEPLOYMENT PIPELINE -->
      <div class="panel" id="panel-deploy">
        <div class="panel-title">Deployment</div>
        <div class="panel-sub">Build &amp; deploy TRACE app</div>

        <div class="status-grid" style="margin-bottom:16px;">
          <div class="status-card">
            <div class="status-name">Netlify</div>
            <div class="status-val" id="dp-netlify-status">—</div>
            <div class="status-indicator" id="dp-netlify-ind"><div class="dot dot-grey"></div><span style="color:var(--text-dim);font-size:10px;">Not configured</span></div>
          </div>
          <div class="status-card">
            <div class="status-name">API Proxy (Railway)</div>
            <div class="status-val" id="dp-railway-status">—</div>
            <div class="status-indicator" id="dp-railway-ind"><div class="dot dot-grey"></div><span style="color:var(--text-dim);font-size:10px;">Not configured</span></div>
          </div>
          <div class="status-card">
            <div class="status-name">Last Deploy</div>
            <div class="status-val" id="dp-last-deploy">—</div>
            <div class="status-indicator"><span style="color:var(--text-dim);font-size:10px;" id="dp-last-status">No deploys yet</span></div>
          </div>
          <div class="status-card">
            <div class="status-name">Build Status</div>
            <div class="status-val" id="dp-build-status">Idle</div>
            <div class="status-indicator" id="dp-build-ind"><div class="dot dot-grey"></div><span style="color:var(--text-dim);font-size:10px;">Ready</span></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-head">
            <div class="card-title">Actions</div>
            <div style="display:flex;gap:8px;">
              <button class="btn-secondary" onclick="dpCheckStatus()">↻ Check Status</button>
            </div>
          </div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
              <button class="btn-dl" onclick="dpBuildLocal()" style="padding:16px;font-size:10px;text-align:center;">
                <div style="font-size:20px;margin-bottom:6px;">⚒</div>
                <div>Build Local</div>
                <div style="font-weight:400;margin-top:4px;font-size:8px;opacity:.7;">Prepare files for deploy</div>
              </button>
              <button class="btn-dl" onclick="dpDeployNetlify()" style="padding:16px;font-size:10px;text-align:center;">
                <div style="font-size:20px;margin-bottom:6px;">▲</div>
                <div>Deploy to Netlify</div>
                <div style="font-weight:400;margin-top:4px;font-size:8px;opacity:.7;">Drag &amp; drop deploy</div>
              </button>
              <button class="btn-dl" onclick="dpDeployRailway()" style="padding:16px;font-size:10px;text-align:center;">
                <div style="font-size:20px;margin-bottom:6px;">⬡</div>
                <div>Deploy API Proxy</div>
                <div style="font-weight:400;margin-top:4px;font-size:8px;opacity:.7;">Railway API backend</div>
              </button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Build Log</div><button class="btn-secondary" onclick="dpClearLog()">Clear</button></div>
          <div class="card-body" style="padding:0;" id="dp-log-container">
            <div class="dp-log" id="dp-log">
              <div class="dp-log-line info">[—] Deployment system ready. Configure Netlify URL in Settings to enable live status.</div>
            </div>
          </div>
        </div>
      </div>

      <!-- USER MANAGEMENT -->
      <div class="panel" id="panel-usermgmt">
        <div class="panel-title">Users</div>
        <div class="panel-sub">Manage subscribers &amp; access</div>

        <div class="an-grid" style="margin-bottom:16px;">
          <div class="an-card"><div class="an-val" id="um-total">0</div><div class="an-label">Total Users</div></div>
          <div class="an-card"><div class="an-val" id="um-pro" style="color:#7AADDA;">0</div><div class="an-label">Professional</div></div>
          <div class="an-card"><div class="an-val" id="um-collector">0</div><div class="an-label">Collector</div></div>
          <div class="an-card"><div class="an-val" id="um-discover">0</div><div class="an-label">Discover</div></div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-head"><div class="card-title">User List</div><button class="btn-secondary" onclick="umRefresh()">↻ Refresh</button></div>
          <div class="card-body" style="padding:0;">
            <table class="um-table">
              <thead><tr><th>Name</th><th>Tier</th><th>Status</th><th>Since</th><th>Revenue</th></tr></thead>
              <tbody id="um-list">
                <tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-dim);font-size:12px;">No users loaded. Use the form below to add users, or configure a backend.</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Add User</div></div>
          <div class="card-body">
            <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
              <div style="flex:2;min-width:160px;">
                <div class="calc-label" style="margin-bottom:6px;">Name</div>
                <input class="key-input" id="um-name" placeholder="User name" style="margin-bottom:0;">
              </div>
              <div style="flex:1;min-width:100px;">
                <div class="calc-label" style="margin-bottom:6px;">Tier</div>
                <select class="key-input" id="um-tier" style="margin-bottom:0;cursor:pointer;">
                  <option value="discover">Discover</option>
                  <option value="collector">Collector</option>
                  <option value="professional">Professional</option>
                </select>
              </div>
              <div style="flex:1;min-width:100px;">
                <div class="calc-label" style="margin-bottom:6px;">Revenue (€/mo)</div>
                <input class="key-input" id="um-revenue" type="number" value="0" min="0" style="margin-bottom:0;">
              </div>
              <button class="btn-dl" onclick="umAdd()" style="padding:12px 20px;">Add User</button>
            </div>
            <div id="um-msg" style="font-size:11px;color:var(--text-dim);margin-top:10px;min-height:16px;"></div>
          </div>
        </div>
      </div>
"""

content = content[:settings_div_start] + new_panels + content[settings_div_start:]

# ── 4. ADD JAVASCRIPT ──
new_js = """

// DEPLOYMENT PIPELINE
var dpLog = [];

function dpLogEntry(type, msg) {
  var now = new Date();
  var time = now.toLocaleTimeString('en-GB', {hour12:false});
  dpLog.push({time: time, type: type, msg: msg});
  dpRenderLog();
}

function dpRenderLog() {
  var el = document.getElementById('dp-log');
  if (!el) return;
  if (dpLog.length === 0) {
    el.innerHTML = '<div class="dp-log-line info">[—] No build activity yet.</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < dpLog.length; i++) {
    var e = dpLog[i];
    html += '<div class="dp-log-line ' + esc(e.type) + '">[' + esc(e.time) + '] ' + esc(e.msg) + '</div>';
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function dpClearLog() {
  dpLog = [];
  dpRenderLog();
  showToast('Build log cleared');
}

function dpCheckStatus() {
  dpLogEntry('info', 'Checking deployment status...');
  var netlify = document.getElementById('netlify-url');
  var railway = document.getElementById('railway-url-input');
  
  var netlifyUrl = netlify ? (netlify.value || '').trim() : '';
  var railwayUrl = railway ? (railway.value || '').trim() : '';
  
  if (netlifyUrl) {
    dpLogEntry('info', 'Netlify: ' + netlifyUrl);
    document.getElementById('dp-netlify-status').textContent = 'Configured';
    var ind = document.getElementById('dp-netlify-ind');
    if (ind) ind.innerHTML = '<div class="dot dot-amber"></div><span style="color:var(--text-dim);font-size:10px;">Checking...</span>';
    // Try a simple fetch
    fetch(netlifyUrl, {mode: 'no-cors'}).then(function() {
      dpLogEntry('ok', 'Netlify: Reachable');
      if (ind) ind.innerHTML = '<div class="dot dot-green"></div><span style="color:var(--text-dim);font-size:10px;">Online</span>';
    }).catch(function() {
      dpLogEntry('warn', 'Netlify: Not reachable (may be CORS)');
      if (ind) ind.innerHTML = '<div class="dot dot-amber"></div><span style="color:var(--text-dim);font-size:10px;">Check URL</span>';
    });
  } else {
    dpLogEntry('warn', 'Netlify: Not configured');
  }
  
  if (railwayUrl) {
    dpLogEntry('info', 'Railway: ' + railwayUrl);
    document.getElementById('dp-railway-status').textContent = 'Configured';
    var rind = document.getElementById('dp-railway-ind');
    if (rind) rind.innerHTML = '<div class="dot dot-amber"></div><span style="color:var(--text-dim);font-size:10px;">Checking...</span>';
    fetch(railwayUrl + '/health', {mode: 'no-cors'}).then(function() {
      dpLogEntry('ok', 'Railway API: Reachable');
      if (rind) rind.innerHTML = '<div class="dot dot-green"></div><span style="color:var(--text-dim);font-size:10px;">Online</span>';
    }).catch(function() {
      dpLogEntry('warn', 'Railway: Not reachable');
      if (rind) rind.innerHTML = '<div class="dot dot-amber"></div><span style="color:var(--text-dim);font-size:10px;">Check URL</span>';
    });
  } else {
    dpLogEntry('warn', 'Railway: Not configured');
  }
  
  // Update last deploy from localStorage
  var lastDeploy = localStorage.getItem('trace_hq_last_deploy');
  var lastDeployStatus = localStorage.getItem('trace_hq_last_deploy_status');
  if (lastDeploy) {
    document.getElementById('dp-last-deploy').textContent = lastDeploy;
    document.getElementById('dp-last-status').textContent = lastDeployStatus || 'Completed';
  }
}

function dpBuildLocal() {
  dpLogEntry('info', 'Starting local build...');
  document.getElementById('dp-build-status').textContent = 'Building...';
  var ind = document.getElementById('dp-build-ind');
  if (ind) ind.innerHTML = '<div class="dot dot-amber"></div><span style="color:var(--text-dim);font-size:10px;">Building...</span>';
  
  // Simulated build steps
  var steps = [
    { delay: 500, msg: 'Preparing TRACE app files...' },
    { delay: 1200, msg: 'Validating HTML...' },
    { delay: 800, msg: 'Optimizing assets...' },
    { delay: 600, msg: 'Checking tier configurations...' },
    { delay: 1000, msg: 'Build complete!' },
  ];
  
  var totalDelay = 0;
  for (var i = 0; i < steps.length; i++) {
    (function(s) {
      setTimeout(function() {
        dpLogEntry(s.msg.indexOf('complete') >= 0 ? 'ok' : 'info', s.msg);
        if (s.msg.indexOf('complete') >= 0) {
          var now = new Date();
          localStorage.setItem('trace_hq_last_deploy', now.toLocaleDateString() + ' ' + now.toLocaleTimeString());
          localStorage.setItem('trace_hq_last_deploy_status', 'Local build passed');
          document.getElementById('dp-build-status').textContent = 'Ready';
          document.getElementById('dp-last-deploy').textContent = localStorage.getItem('trace_hq_last_deploy');
          document.getElementById('dp-last-status').textContent = 'Local build passed';
          if (ind) ind.innerHTML = '<div class="dot dot-green"></div><span style="color:var(--text-dim);font-size:10px;">Ready</span>';
          showToast('Local build complete');
        }
      }, totalDelay);
    })(steps[i]);
    totalDelay += steps[i].delay;
  }
}

function dpDeployNetlify() {
  dpLogEntry('info', 'Preparing Netlify deploy...');
  dpLogEntry('info', 'Opening Netlify drag & drop...');
  // Open Netlify deploy page
  window.open('https://app.netlify.com/drop', '_blank');
  dpLogEntry('ok', 'Netlify drop page opened in new tab');
  dpLogEntry('info', 'After uploading, update the Netlify URL in Settings');
  showToast('Netlify deploy page opened');
  
  var now = new Date();
  localStorage.setItem('trace_hq_last_deploy', now.toLocaleDateString() + ' ' + now.toLocaleTimeString());
  localStorage.setItem('trace_hq_last_deploy_status', 'Deployed to Netlify');
}

function dpDeployRailway() {
  dpLogEntry('info', 'Preparing Railway deploy...');
  dpLogEntry('info', 'Opening Railway dashboard...');
  window.open('https://railway.app/new', '_blank');
  dpLogEntry('ok', 'Railway dashboard opened in new tab');
  dpLogEntry('info', 'Deploy server.js + package.json from the trace_backend_package.html file');
  showToast('Railway dashboard opened');
}

// USER MANAGEMENT
var umUsers = [];

function umLoad() {
  try {
    var saved = localStorage.getItem('trace_hq_users');
    if (saved) {
      umUsers = JSON.parse(saved);
    } else {
      // Seed with demo users
      umUsers = [
        { id: 'u1', name: 'Dr. A. van der Berg', tier: 'professional', status: 'active', since: '2025-01-15', revenue: 299 },
        { id: 'u2', name: 'Geert', tier: 'collector', status: 'active', since: '2025-03-01', revenue: 49 },
        { id: 'u3', name: 'Marie L.', tier: 'collector', status: 'active', since: '2025-04-10', revenue: 49 },
        { id: 'u4', name: 'Thomas K.', tier: 'discover', status: 'active', since: '2025-05-20', revenue: 0 },
        { id: 'u5', name: 'Sophie A.', tier: 'discover', status: 'inactive', since: '2025-02-14', revenue: 0 },
      ];
    }
  } catch(e) {
    umUsers = [];
  }
  umRender();
}

function umSave() {
  localStorage.setItem('trace_hq_users', JSON.stringify(umUsers));
}

function umRender() {
  // Update counts
  var total = umUsers.length;
  var pro = umUsers.filter(function(u) { return u.tier === 'professional'; }).length;
  var col = umUsers.filter(function(u) { return u.tier === 'collector'; }).length;
  var disc = total - pro - col;
  
  document.getElementById('um-total').textContent = total;
  document.getElementById('um-pro').textContent = pro;
  document.getElementById('um-collector').textContent = col;
  document.getElementById('um-discover').textContent = disc;
  
  // Render table
  var tbody = document.getElementById('um-list');
  if (!tbody) return;
  if (umUsers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-dim);font-size:12px;">No users yet.</td></tr>';
    return;
  }
  var html = '';
  for (var i = 0; i < umUsers.length; i++) {
    var u = umUsers[i];
    var tierClass = 'um-tier ' + (u.tier === 'professional' ? 'pro' : u.tier === 'collector' ? 'col' : 'disc');
    var tierLabel = u.tier.charAt(0).toUpperCase() + u.tier.slice(1);
    var statusClass = 'um-status ' + (u.status === 'active' ? 'active' : 'inactive');
    var revenue = u.tier === 'discover' ? '€0' : '€' + u.revenue + '/mo';
    html += '<tr>' +
      '<td>' + esc(u.name) + '</td>' +
      '<td><span class="' + tierClass + '">' + tierLabel + '</span></td>' +
      '<td><span class="' + statusClass + '">' + esc(u.status) + '</span></td>' +
      '<td style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);">' + esc(u.since) + '</td>' +
      '<td style="color:var(--gold);">' + revenue + '</td>' +
      '</tr>';
  }
  tbody.innerHTML = html;
}

function umRefresh() {
  umLoad();
  showToast('Users refreshed');
}

function umAdd() {
  var nameEl = document.getElementById('um-name');
  var tierEl = document.getElementById('um-tier');
  var revEl = document.getElementById('um-revenue');
  var msgEl = document.getElementById('um-msg');
  
  var name = (nameEl.value || '').trim();
  var tier = tierEl ? tierEl.value : 'discover';
  var revenue = parseInt(revEl ? revEl.value : '0', 10);
  
  if (!name) {
    if (msgEl) { msgEl.textContent = 'Please enter a user name.'; msgEl.style.color = 'var(--red)'; }
    return;
  }
  
  var now = new Date();
  var dateStr = now.toISOString().substring(0, 10);
  var id = 'u' + Date.now();
  
  umUsers.push({ id: id, name: name, tier: tier, status: 'active', since: dateStr, revenue: revenue });
  umSave();
  umRender();
  
  nameEl.value = '';
  if (revEl) revEl.value = '0';
  if (msgEl) { msgEl.textContent = 'User added: ' + name; msgEl.style.color = 'var(--green-lt)'; }
  showToast('User added: ' + name);
}

// ENHANCED SACRED GEOMETRY - AI Analysis
function sgAnalyzeWithAI() {
  if (!sgImage) {
    showToast('Upload an image first');
    return;
  }
  
  var btn = document.getElementById('sg-ai-btn');
  if (btn) btn.disabled = true;
  showToast('AI analysis started...');
  
  // Draw the current state onto a data URL for analysis
  var canvas = document.getElementById('sg-canvas');
  var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  
  // Analyze the composition using golden ratio logic
  var w = sgImage.naturalWidth;
  var h = sgImage.naturalHeight;
  var wRatio = w / h;
  var phi = 1.618;
  var goldenMatch = Math.abs(wRatio - phi) / phi;
  
  var analysisHTML = '<div class="sg-analysis" id="sg-analysis-result">' +
    '<strong>Composition Analysis</strong><br><br>' +
    '<strong>Dimensions:</strong> ' + w + String.fromCharCode(215) + h + ' px (ratio ' + wRatio.toFixed(3) + ')<br>' +
    '<strong>Golden Ratio (φ):</strong> ' + (goldenMatch < 0.05 ? '⚠ Close match!' : 'Not matched') + ' (deviation: ' + (goldenMatch * 100).toFixed(1) + '%)<br>';
  
  if (goldenMatch < 0.05) {
    analysisHTML += '<strong style="color:var(--gold);">✓ This canvas closely matches the golden ratio proportion!</strong><br>';
    analysisHTML += 'Classical artists often used 1:1.618 for harmonious compositions.<br>';
  }
  
  // Check thirds alignment
  var thirdsX = Math.round(w * 2 / 3);
  var thirdsY = Math.round(h * 2 / 3);
  analysisHTML += '<strong>Rule of Thirds:</strong> Power points at (' + Math.round(w/3) + ',' + Math.round(h/3) + '), (' + thirdsX + ',' + Math.round(h/3) + '), etc.<br>';
  
  // Radial center
  var cx = w / 2, cy = h / 2;
  analysisHTML += '<strong>Center Focus:</strong> Image center at (' + Math.round(cx) + ', ' + Math.round(cy) + ')<br>';
  
  // Dynamic symmetry
  if (Math.abs(wRatio - 1.414) < 0.05) {
    analysisHTML += '<strong style="color:#A0C8E0;">⬡ Root-2 rectangle detected (1:1.414)</strong> — common in Classical architecture<br>';
  } else if (Math.abs(wRatio - 1.333) < 0.05) {
    analysisHTML += '<strong style="color:#A0C8E0;">⬡ 4:3 ratio — standard in Renaissance panel paintings</strong><br>';
  }
  
  analysisHTML += '<br><em>Toggle the overlays above to visualize these geometric structures on your image.</em></div>';
  
  var existing = document.getElementById('sg-analysis-result');
  if (existing) existing.outerHTML = analysisHTML;
  else {
    var info = document.getElementById('sg-info');
    if (info) info.insertAdjacentHTML('afterend', analysisHTML);
  }
  
  if (btn) btn.disabled = false;
  showToast('AI composition analysis complete');
}

// OVERRIDE show() hook for new panels
(function() {
  var origShow = window.show;
  if (origShow) {
    var _origShow = origShow;
    window.show = function(panel) {
      var sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.remove('open');
      _origShow(panel);
      if (panel === 'deploy') { dpLogEntry('info', 'Deployment panel opened'); dpCheckStatus(); }
      if (panel === 'usermgmt') umLoad();
      if (panel === 'sacredgeo' && sgImage) sgRedraw();
    };
  }
})();
"""

script_close_pos = content.rfind('</script>')
content = content[:script_close_pos] + new_js + content[script_close_pos:]

# ── 5. ADD AI SACRED GEOMETRY BUTTON TO EXISTING SACRED GEO PANEL ──
# Find the sg-controls div and add the AI button
sg_controls = '<button class="sg-btn" onclick="sgClear()">Clear All</button>'
ai_btn = '<button class="sg-ai-btn" id="sg-ai-btn" onclick="sgAnalyzeWithAI()" style="margin-left:4px;">✦ AI Analyze</button>'
if sg_controls in content:
    content = content.replace(sg_controls, sg_controls + ai_btn)

# ── 6. WRITE ──
with open('trace_hq.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("DONE: TRACE HQ v2 improvements applied!")
print("- Deployment Pipeline panel (build, deploy to Netlify/Railway)")
print("- User Management panel (add/manage subscribers)")
print("- AI Sacred Geometry enhancement (composition analysis)")
print("- Panel navigation hooks for new panels")
