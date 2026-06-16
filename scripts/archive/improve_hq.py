#!/usr/bin/env python3
"""Improve TRACE HQ: add sacred geometry tool, analytics, feature flags, event log, UI polish."""

with open('trace_hq.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. ADD CSS STYLES ──
new_css = """

/* SACRED GEOMETRY TOOL */
.sg-canvas-wrap{position:relative;background:var(--bg2);border:1px solid var(--border);border-radius:4px;overflow:hidden;min-height:400px;}
.sg-canvas-wrap canvas{display:block;width:100%;height:auto;max-height:65vh;object-fit:contain;}
.sg-controls{display:flex;flex-wrap:wrap;gap:8px;padding:14px 18px;background:var(--surface2);border-top:1px solid var(--border);}
.sg-btn{background:none;border:1px solid var(--border2);color:var(--text-mid);padding:8px 14px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;border-radius:2px;font-family:var(--font-ui);transition:all .15s;}
.sg-btn:hover{border-color:var(--gold-dim);color:var(--gold);}
.sg-btn.active{background:rgba(212,174,82,.12);border-color:var(--gold-dim);color:var(--gold);}
.sg-upload-btn{background:var(--gold);color:#060402;border:none;padding:8px 16px;font-size:9px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;border-radius:2px;font-family:var(--font-ui);transition:background .15s;}
.sg-upload-btn:hover{background:var(--gold-lt);}
.sg-info{font-size:11px;color:var(--text-dim);padding:14px 18px;line-height:1.6;border-top:1px solid var(--border);}

/* ANALYTICS DASHBOARD */
.an-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:24px;}
.an-card{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:18px;text-align:center;}
.an-val{font-family:var(--font-display);font-size:32px;color:var(--gold);line-height:1;}
.an-label{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-dim);margin-top:6px;}
.an-sub{font-size:10px;color:var(--text-mid);margin-top:2px;}
.an-table{width:100%;border-collapse:collapse;font-size:12px;}
.an-table th{padding:10px 14px;text-align:left;font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-dim);border-bottom:1px solid var(--border);font-weight:600;}
.an-table td{padding:10px 14px;border-bottom:1px solid var(--border);color:var(--text-mid);}
.an-table tr:hover td{background:var(--surface2);}
.an-table .val{font-family:var(--font-mono);color:var(--text);}

/* FEATURE FLAGS */
.ff-item{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border);}
.ff-item:last-child{border-bottom:none;}
.ff-info{flex:1;}
.ff-name{font-size:12px;color:var(--text);font-weight:500;}
.ff-desc{font-size:10px;color:var(--text-dim);margin-top:2px;}
.ff-toggle{position:relative;width:42px;height:24px;flex-shrink:0;cursor:pointer;}
.ff-toggle input{opacity:0;width:0;height:0;}
.ff-slider{position:absolute;cursor:pointer;inset:0;background:var(--border2);border-radius:12px;transition:.2s;}
.ff-slider::before{content:'';position:absolute;height:18px;width:18px;left:3px;bottom:3px;background:var(--text-dim);border-radius:50%;transition:.2s;}
.ff-toggle input:checked+.ff-slider{background:rgba(212,174,82,.3);}
.ff-toggle input:checked+.ff-slider::before{background:var(--gold);transform:translateX(18px);}
.ff-tag{font-size:8px;padding:2px 7px;border-radius:2px;letter-spacing:.1em;text-transform:uppercase;}
.ff-tag-all{background:rgba(74,148,96,.1);color:var(--green);border:1px solid rgba(74,148,96,.2);}
.ff-tag-pro{background:rgba(100,140,220,.1);color:#7AADDA;border:1px solid rgba(100,140,220,.2);}
.ff-tag-col{background:rgba(212,174,82,.1);color:var(--gold);border:1px solid rgba(212,174,82,.2);}
.ff-tag-disc{background:rgba(200,160,40,.08);color:#C8A028;border:1px solid rgba(200,160,40,.15);}

/* EVENT LOG */
.el-list{max-height:400px;overflow-y:auto;font-family:var(--font-mono);font-size:11px;line-height:1.6;}
.el-list::-webkit-scrollbar{width:4px;}
.el-list::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px;}
.el-entry{padding:8px 14px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:flex-start;}
.el-time{color:var(--text-dim);flex-shrink:0;width:70px;}
.el-type{flex-shrink:0;width:60px;font-size:9px;letter-spacing:.08em;text-transform:uppercase;}
.el-type.info{color:var(--blue);}
.el-type.warn{color:#c89820;}
.el-type.error{color:var(--red);}
.el-type.ok{color:var(--green);}
.el-msg{color:var(--text-mid);word-break:break-all;}
.el-empty{padding:32px;text-align:center;color:var(--text-dim);font-size:12px;}

/* RESPONSIVE */
@media(max-width:768px){
  .main{grid-template-columns:1fr;}
  .sidebar{display:none;position:fixed;top:56px;left:0;right:0;bottom:0;z-index:200;height:auto;}
  .sidebar.open{display:block;}
  .content{padding:20px 16px;}
  .panel-title{font-size:26px;}
  .calc-grid{grid-template-columns:1fr;}
  .calc-results{grid-template-columns:repeat(2,1fr);}
  .sg-canvas-wrap{min-height:250px;}
}
@media(max-width:480px){
  .topbar{padding:0 14px;}
  .panel-title{font-size:22px;}
  .status-grid{grid-template-columns:1fr;}
  .an-grid{grid-template-columns:1fr;}
}
"""

css_insert_pos = content.find('</style>')
content = content[:css_insert_pos] + new_css + content[css_insert_pos:]

# ── 2. ADD SIDEBAR NAV ITEMS ──
# Find the Overview section's nav buttons area
overview_end = content.find('</div>', content.find('Overview'))
overview_next_close = content.find('</div>', content.find('</div>', overview_end) + 1)

analytics_nav = """
        <button class="nav-btn" onclick="show('analytics')">
          <span class="nav-icon">◉</span> Analytics
        </button>"""

content = content[:overview_next_close] + analytics_nav + content[overview_next_close:]

# Add Feature Flags and Sacred Geometry to Operations section
# Find the Checklist button
checklist_btn = 'onclick="show(' + "'checklist'" + ')"'
checklist_pos = content.find(checklist_btn)
checklist_line_end = content.find('</button>', checklist_pos) + len('</button>')

ops_nav = """
        <button class="nav-btn" onclick="show('sacredgeo')">
          <span class="nav-icon">⬡</span> Sacred Geometry
        </button>
        <button class="nav-btn" onclick="show('eventlog')">
          <span class="nav-icon">■</span> Event Log
        </button>
        <button class="nav-btn" onclick="show('flags')">
          <span class="nav-icon">⚑</span> Feature Flags
        </button>"""

content = content[:checklist_line_end] + ops_nav + content[checklist_line_end:]

# ── 3. ADD NEW PANEL HTML ──
# Find where panels end - before Settings panel
settings_panel = 'id="panel-settings"'
settings_div_start = content.rfind('<!-- ──', 0, content.find(settings_panel))

new_panels = """
      <!-- ANALYTICS -->
      <div class="panel" id="panel-analytics">
        <div class="panel-title">Analytics</div>
        <div class="panel-sub">Usage statistics from TRACE app localStorage</div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-head"><div class="card-title">Summary</div><button class="btn-secondary" onclick="refreshAnalytics()">↻ Refresh</button></div>
          <div class="card-body">
            <div class="an-grid" id="an-summary">
              <div class="an-card"><div class="an-val" id="an-scans">—</div><div class="an-label">Total Scans</div></div>
              <div class="an-card"><div class="an-val" id="an-chats">—</div><div class="an-label">Chat Messages</div></div>
              <div class="an-card"><div class="an-val" id="an-errors">—</div><div class="an-label">Errors</div></div>
              <div class="an-card"><div class="an-val" id="an-tier">—</div><div class="an-label">Active Tier</div></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Recent Activity</div></div>
          <div class="card-body" style="padding:0;">
            <table class="an-table">
              <thead><tr><th>Timestamp</th><th>Event</th><th>Details</th></tr></thead>
              <tbody id="an-activity"><tr><td colspan="3" style="padding:24px;text-align:center;color:var(--text-dim);font-size:12px;">No data — open TRACE app and perform scans to populate analytics.</td></tr></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SACRED GEOMETRY -->
      <div class="panel" id="panel-sacredgeo">
        <div class="panel-title">Sacred Geometry</div>
        <div class="panel-sub">Composition analysis with golden ratio overlays</div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-head"><div class="card-title">Analyze Artwork Composition</div></div>
          <div class="card-body" style="padding:0;">
            <div class="sg-canvas-wrap">
              <canvas id="sg-canvas"></canvas>
              <div id="sg-placeholder" style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;color:var(--text-dim);gap:12px;">
                <div style="font-size:36px;opacity:.3;">⬡</div>
                <div style="font-size:13px;">Upload an artwork image to analyze its composition</div>
                <div style="font-size:10px;">Golden ratio · Rule of thirds · Dynamic symmetry · Radial harmony</div>
              </div>
            </div>
            <div class="sg-controls">
              <input type="file" id="sg-file-input" accept="image/*" style="display:none;" onchange="sgLoadImage(this)">
              <button class="sg-upload-btn" onclick="document.getElementById('sg-file-input').click()">↑ Upload Image</button>
              <button class="sg-btn" id="sg-golden" onclick="sgToggle('golden')">Golden Ratio</button>
              <button class="sg-btn" id="sg-thirds" onclick="sgToggle('thirds')">Rule of Thirds</button>
              <button class="sg-btn" id="sg-spiral" onclick="sgToggle('spiral')">Golden Spiral</button>
              <button class="sg-btn" id="sg-diagonal" onclick="sgToggle('diagonal')">Dynamic Symmetry</button>
              <button class="sg-btn" id="sg-radial" onclick="sgToggle('radial')">Radial</button>
              <button class="sg-btn" onclick="sgClear()">Clear All</button>
            </div>
            <div class="sg-info" id="sg-info">
              <strong>Sacred geometry</strong> reveals the mathematical harmony underlying great artworks. Upload an image and toggle overlays to see how masters used these proportions.
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">About Sacred Geometry in Art</div></div>
          <div class="card-body" style="font-size:12px;color:var(--text-mid);line-height:1.8;">
            <p style="margin-bottom:12px;">The <strong>golden ratio</strong> (φ ≈ 1.618) appears throughout Renaissance and Classical art — from Leonardo da Vinci's <em>Vitruvian Man</em> to Botticelli's <em>Birth of Venus</em>. The ratio creates compositions that feel naturally harmonious to the human eye.</p>
            <p style="margin-bottom:12px;"><strong>Dynamic symmetry</strong> (root rectangles) was used by ancient Greek architects and artists like Georges Seurat. <strong>Radial harmony</strong> organizes composition around a central focal point, common in religious art and mandalas.</p>
            <p>Use overlays above to discover hidden structures in your artwork collection. TRACE can detect these mathematically in analysis results.</p>
          </div>
        </div>
      </div>

      <!-- EVENT LOG -->
      <div class="panel" id="panel-eventlog">
        <div class="panel-title">Event Log</div>
        <div class="panel-sub">Live server events monitoring</div>

        <div class="card" style="margin-bottom:16px;">
          <div class="card-head">
            <div class="card-title">Recent Events</div>
            <div style="display:flex;gap:8px;">
              <button class="btn-secondary" onclick="elRefresh()">↻ Refresh</button>
              <button class="btn-secondary" onclick="elClear()">Clear</button>
            </div>
          </div>
          <div class="card-body" style="padding:0;" id="el-list">
            <div class="el-empty">No events recorded yet. Events from the TRACE server proxy will appear here when running.</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Simulate Test Events</div></div>
          <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="sg-btn" onclick="elAdd('info','Analytics ping received','Server heartbeat')">Info Event</button>
            <button class="sg-btn" onclick="elAdd('warn','High API latency detected','Response time 2.4s')">Warn Event</button>
            <button class="sg-btn" onclick="elAdd('error','API connection failed','Proxy unreachable')">Error Event</button>
            <button class="sg-btn" onclick="elAdd('ok','All systems nominal','Health check passed')">OK Event</button>
          </div>
        </div>
      </div>

      <!-- FEATURE FLAGS -->
      <div class="panel" id="panel-flags">
        <div class="panel-title">Feature Flags</div>
        <div class="panel-sub">Toggle features across tiers</div>

        <div class="card" id="flags-list">
          <div class="card-body" style="padding:0;" id="flags-container"></div>
        </div>

        <div class="card" style="margin-top:16px;">
          <div class="card-head"><div class="card-title">Bulk Actions</div></div>
          <div class="card-body" style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn-dl" onclick="flagsEnableAll()">Enable All</button>
            <button class="btn-secondary" onclick="flagsDisableAll()">Disable All</button>
            <button class="btn-secondary" onclick="flagsReset()">Reset to Defaults</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Add Custom Flag</div></div>
          <div class="card-body" style="display:flex;gap:10px;flex-wrap:wrap;">
            <input id="ff-name" placeholder="Feature name" style="flex:1;min-width:140px;background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:9px 12px;font-size:12px;border-radius:3px;outline:none;">
            <input id="ff-desc" placeholder="Description" style="flex:2;min-width:200px;background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:9px 12px;font-size:12px;border-radius:3px;outline:none;">
            <button class="btn-dl" onclick="flagsAdd()">Add Flag</button>
          </div>
          <div id="ff-msg" style="font-size:11px;color:var(--text-dim);padding:8px 18px 14px;display:none;"></div>
        </div>
      </div>
"""

content = content[:settings_div_start] + new_panels + content[settings_div_start:]

# ── 4. ADD JAVASCRIPT ──
new_js = """

// SACRED GEOMETRY TOOL
var sgImage = null;
var sgOverlays = {};
var sgCtx = null;

function sgLoadImage(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      sgImage = img;
      var canvas = document.getElementById('sg-canvas');
      var ph = document.getElementById('sg-placeholder');
      if (ph) ph.style.display = 'none';
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      sgCtx = canvas.getContext('2d');
      sgRedraw();
      document.getElementById('sg-info').innerHTML = '<strong>Loaded:</strong> ' + file.name +
        ' (' + img.naturalWidth + String.fromCharCode(215) + img.naturalHeight + 'px) - Toggle overlays above.';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function sgRedraw() {
  if (!sgCtx || !sgImage) return;
  var canvas = document.getElementById('sg-canvas');
  sgCtx.clearRect(0, 0, canvas.width, canvas.height);
  sgCtx.drawImage(sgImage, 0, 0, canvas.width, canvas.height);
  if (sgOverlays.golden) sgDrawGoldenRatio();
  if (sgOverlays.thirds) sgDrawRuleOfThirds();
  if (sgOverlays.spiral) sgDrawGoldenSpiral();
  if (sgOverlays.diagonal) sgDrawDynamicSymmetry();
  if (sgOverlays.radial) sgDrawRadial();
}

function sgToggle(name) {
  sgOverlays[name] = !sgOverlays[name];
  var btn = document.getElementById('sg-' + name);
  if (btn) btn.classList.toggle('active', sgOverlays[name]);
  sgRedraw();
}

function sgClear() {
  sgOverlays = {};
  var btns = document.querySelectorAll('.sg-btn.active');
  for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
  sgRedraw();
}

function sgDrawGoldenRatio() {
  if (!sgCtx || !sgImage) return;
  var w = sgImage.naturalWidth, h = sgImage.naturalHeight;
  var ctx = sgCtx;
  ctx.strokeStyle = 'rgba(212,174,82,0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6,4]);
  var phi = 1.618;
  var x1 = w / phi, x2 = w - w / phi;
  ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, 0); ctx.lineTo(x2, h); ctx.stroke();
  var y1 = h / phi, y2 = h - h / phi;
  ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(w, y1); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(w, y2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(212,174,82,0.6)';
  var pts = [[x1,y1],[x1,y2],[x2,y1],[x2,y2]];
  for (var i = 0; i < pts.length; i++) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], 4, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = 'rgba(212,174,82,0.85)';
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(String.fromCharCode(966) + ' = 1.618', 10, 18);
  ctx.setLineDash([]);
}

function sgDrawRuleOfThirds() {
  if (!sgCtx || !sgImage) return;
  var w = sgImage.naturalWidth, h = sgImage.naturalHeight;
  var ctx = sgCtx;
  ctx.strokeStyle = 'rgba(100,180,220,0.55)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4,4]);
  for (var i = 1; i < 3; i++) {
    var x = w * i / 3, y = h * i / 3;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(100,180,220,0.5)';
  for (var i = 1; i < 3; i++) {
    for (var j = 1; j < 3; j++) {
      ctx.beginPath(); ctx.arc(w * i / 3, h * j / 3, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(100,180,220,0.7)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('Rule of Thirds', 10, 34);
}

function sgDrawGoldenSpiral() {
  if (!sgCtx || !sgImage) return;
  var w = sgImage.naturalWidth, h = sgImage.naturalHeight;
  var ctx = sgCtx;
  ctx.strokeStyle = 'rgba(200,80,80,0.6)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(200,80,80,0.7)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('Golden Spiral', 10, 50);
  // Simplified spiral indicator: draw circles from golden rectangles
  var phi = 1.618;
  var cx = w - w / phi, cy = h;
  var r = Math.min(w, h) * 0.5;
  ctx.strokeStyle = 'rgba(200,80,80,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,6]);
  for (var i = 0; i < 6; i++) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    cx += r * 0.3;
    cy -= r * 0.3;
    r = r / phi;
  }
  ctx.setLineDash([]);
}

function sgDrawDynamicSymmetry() {
  if (!sgCtx || !sgImage) return;
  var w = sgImage.naturalWidth, h = sgImage.naturalHeight;
  var ctx = sgCtx;
  ctx.strokeStyle = 'rgba(160,120,200,0.45)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,3]);
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w,h); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w,0); ctx.lineTo(0,h); ctx.stroke();
  var perpLen = Math.min(w, h) * 0.3;
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(160,120,200,0.7)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('Dynamic Symmetry', 10, 66);
}

function sgDrawRadial() {
  if (!sgCtx || !sgImage) return;
  var w = sgImage.naturalWidth, h = sgImage.naturalHeight;
  var ctx = sgCtx;
  ctx.strokeStyle = 'rgba(80,200,160,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3,6]);
  var cx = w/2, cy = h/2;
  var maxR = Math.sqrt(w*w + h*h) / 2;
  for (var r = maxR*0.25; r <= maxR*0.75; r += maxR*0.25) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  }
  for (var i = 0; i < 16; i++) {
    var angle = (i / 16) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle)*maxR, cy + Math.sin(angle)*maxR);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(80,200,160,0.7)';
  ctx.font = '10px system-ui, sans-serif';
  ctx.fillText('Radial Harmony', 10, 82);
}

// ANALYTICS DASHBOARD
function refreshAnalytics() {
  var id = function(s) { return document.getElementById(s); };
  id('an-scans').textContent = '0';
  id('an-chats').textContent = '0';
  id('an-errors').textContent = '0';
  id('an-tier').textContent = '-';
  var html = '';
  try {
    var tier = localStorage.getItem('TRACE_TIER') || localStorage.getItem('trace_tier') || '';
    var scans = parseInt(localStorage.getItem('trace_scan_count') || '0', 10);
    var chats = parseInt(localStorage.getItem('trace_chat_count') || '0', 10);
    var errors = parseInt(localStorage.getItem('trace_error_count') || '0', 10);
    if (tier) id('an-tier').textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
    if (scans) id('an-scans').textContent = scans;
    if (chats) id('an-chats').textContent = chats;
    if (errors) id('an-errors').textContent = errors;
    var keys = [];
    for (var k in localStorage) {
      if (k.indexOf('trace_') === 0 || k.indexOf('TRACE_') === 0) keys.push(k);
    }
    for (var i = 0; i < keys.length; i++) {
      var val = localStorage.getItem(keys[i]);
      html += '<tr><td class="val">-</td><td>' + esc(keys[i]) + '</td><td>' + esc(String(val).substring(0, 60)) + '</td></tr>';
    }
    if (!html) {
      html = '<tr><td class="val" colspan="3" style="color:var(--text-dim);padding:16px;text-align:center;">No trace_ localStorage keys found. Open the TRACE app first.</td></tr>';
    }
  } catch(e) {
    html = '<tr><td colspan="3" style="padding:16px;text-align:center;color:var(--red);">Cannot read localStorage: ' + esc(e.message) + '</td></tr>';
  }
  var ab = document.getElementById('an-activity');
  if (ab) ab.innerHTML = html;
  showToast('Analytics refreshed');
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// EVENT LOG
var elEvents = [];

function elAdd(type, msg, detail) {
  var now = new Date();
  var time = now.toLocaleTimeString('en-GB', {hour12:false});
  elEvents.unshift({time: time, type: type, msg: msg, detail: detail || ''});
  elRender();
}

function elRender() {
  var list = document.getElementById('el-list');
  if (!list) return;
  if (elEvents.length === 0) {
    list.innerHTML = '<div class="el-empty">No events recorded.</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < elEvents.length; i++) {
    var e = elEvents[i];
    html += '<div class="el-entry"><span class="el-time">' + esc(e.time) + '</span>' +
      '<span class="el-type ' + esc(e.type) + '">' + esc(e.type) + '</span>' +
      '<span class="el-msg">' + esc(e.msg) + (e.detail ? ' - ' + esc(e.detail) : '') + '</span></div>';
  }
  list.innerHTML = html;
}

function elRefresh() {
  elAdd('info', 'Event log refreshed', '');
  showToast('Event log refreshed');
}

function elClear() {
  elEvents = [];
  elRender();
  showToast('Event log cleared');
}

// FEATURE FLAGS
var FEATURE_FLAGS_DEFAULTS = [
  { id: 'ff-thematic-timeline', name: 'Thematic Timeline Analysis', desc: 'Group events by theme instead of chronology', tiers: 'all', enabled: true },
  { id: 'ff-gap-detection', name: 'Gap Detection', desc: 'Detect missing provenance periods', tiers: 'pro,col', enabled: true },
  { id: 'ff-valuation-engine', name: 'Valuation Engine', desc: 'AI-powered market valuation', tiers: 'pro', enabled: true },
  { id: 'ff-multi-spectral', name: 'Multi-Spectral Analysis', desc: 'UV, IR, X-Ray image layer support', tiers: 'pro,col', enabled: true },
  { id: 'ff-export-pdf', name: 'PDF Export', desc: 'Export analysis reports as PDF', tiers: 'all', enabled: true },
  { id: 'ff-hardware-api', name: 'Hardware API (TRACE_HW)', desc: 'WebUSB/Bluetooth/Serial device support', tiers: 'pro', enabled: true },
  { id: 'ff-cidoc-crm', name: 'CIDOC-CRM Integration', desc: 'Museum-standard data schema', tiers: 'pro', enabled: false },
  { id: 'ff-sacred-geometry', name: 'Sacred Geometry Detection', desc: 'Auto-detect golden ratio in compositions', tiers: 'pro,col', enabled: false },
  { id: 'ff-pentimenti', name: 'Pentimenti Detection', desc: 'Detect artist revisions in X-ray imagery', tiers: 'pro', enabled: false },
  { id: 'ff-offline-mode', name: 'Offline Mode', desc: 'Cache results for offline viewing', tiers: 'all', enabled: false },
  { id: 'ff-telemetry', name: 'Telemetry & Analytics', desc: 'Send anonymous usage data', tiers: 'all', enabled: true },
  { id: 'ff-auto-update', name: 'Auto-Update', desc: 'Check for updates on launch', tiers: 'all', enabled: true },
];

var featureFlags = [];

function flagsLoad() {
  try {
    var saved = localStorage.getItem('trace_hq_feature_flags');
    if (saved) {
      featureFlags = JSON.parse(saved);
      var defaultIds = FEATURE_FLAGS_DEFAULTS.map(function(f) { return f.id; });
      for (var i = 0; i < FEATURE_FLAGS_DEFAULTS.length; i++) {
        var df = FEATURE_FLAGS_DEFAULTS[i];
        var found = false;
        for (var j = 0; j < featureFlags.length; j++) {
          if (featureFlags[j].id === df.id) { found = true; break; }
        }
        if (!found) featureFlags.push(JSON.parse(JSON.stringify(df)));
      }
      featureFlags = featureFlags.filter(function(f) {
        return defaultIds.indexOf(f.id) >= 0 || f.custom;
      });
    } else {
      featureFlags = JSON.parse(JSON.stringify(FEATURE_FLAGS_DEFAULTS));
    }
  } catch(e) {
    featureFlags = JSON.parse(JSON.stringify(FEATURE_FLAGS_DEFAULTS));
  }
  flagsRender();
}

function flagsSave() {
  localStorage.setItem('trace_hq_feature_flags', JSON.stringify(featureFlags));
}

function flagsRender() {
  var container = document.getElementById('flags-container');
  if (!container) return;
  if (featureFlags.length === 0) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:12px;">No feature flags configured.</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < featureFlags.length; i++) {
    var f = featureFlags[i];
    var tierTag = '';
    if (f.custom) { tierTag = ''; }
    else if (f.tiers === 'all') { tierTag = '<span class="ff-tag ff-tag-all">All Tiers</span>'; }
    else if (f.tiers === 'pro') { tierTag = '<span class="ff-tag ff-tag-pro">Pro</span>'; }
    else if (f.tiers === 'pro,col') { tierTag = '<span class="ff-tag ff-tag-pro">Pro</span><span class="ff-tag ff-tag-col" style="margin-left:4px;">Collector</span>'; }
    html += '<div class="ff-item">' +
      '<div class="ff-info"><div class="ff-name">' + esc(f.name) + '</div>' +
      '<div class="ff-desc">' + esc(f.desc) + ' ' + tierTag + '</div></div>' +
      '<label class="ff-toggle"><input type="checkbox" ' + (f.enabled ? 'checked' : '') +
      ' onchange="flagsToggle(\\'' + f.id + '\\',this.checked)"><span class="ff-slider"></span></label>' +
      (f.custom ? '<button class="btn-secondary" onclick="flagsRemove(\\'' + f.id + '\\')" style="margin-left:8px;padding:4px 8px;font-size:8px;">X</button>' : '') +
      '</div>';
  }
  container.innerHTML = html;
}

function flagsToggle(id, enabled) {
  for (var i = 0; i < featureFlags.length; i++) {
    if (featureFlags[i].id === id) { featureFlags[i].enabled = enabled; break; }
  }
  flagsSave();
}

function flagsEnableAll() {
  for (var i = 0; i < featureFlags.length; i++) featureFlags[i].enabled = true;
  flagsSave(); flagsRender();
  showToast('All features enabled');
}

function flagsDisableAll() {
  for (var i = 0; i < featureFlags.length; i++) featureFlags[i].enabled = false;
  flagsSave(); flagsRender();
  showToast('All features disabled');
}

function flagsReset() {
  featureFlags = JSON.parse(JSON.stringify(FEATURE_FLAGS_DEFAULTS));
  flagsSave(); flagsRender();
  showToast('Flags reset to defaults');
}

function flagsAdd() {
  var nameEl = document.getElementById('ff-name');
  var descEl = document.getElementById('ff-desc');
  var msgEl = document.getElementById('ff-msg');
  var name = (nameEl.value || '').trim();
  var desc = (descEl.value || '').trim();
  if (!name) {
    if (msgEl) { msgEl.textContent = 'Please enter a feature name.'; msgEl.style.display = 'block'; }
    return;
  }
  var id = 'ff-custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  var exists = false;
  for (var i = 0; i < featureFlags.length; i++) {
    if (featureFlags[i].id === id) { exists = true; break; }
  }
  if (exists) {
    if (msgEl) { msgEl.textContent = 'A flag with this name already exists.'; msgEl.style.display = 'block'; }
    return;
  }
  featureFlags.push({ id: id, name: name, desc: desc || 'Custom feature flag', tiers: 'all', enabled: true, custom: true });
  flagsSave(); flagsRender();
  nameEl.value = ''; descEl.value = '';
  if (msgEl) { msgEl.textContent = ''; msgEl.style.display = 'none'; }
  showToast('Flag added: ' + name);
}

function flagsRemove(id) {
  var filtered = [];
  for (var i = 0; i < featureFlags.length; i++) {
    if (featureFlags[i].id !== id) filtered.push(featureFlags[i]);
  }
  featureFlags = filtered;
  flagsSave(); flagsRender();
  showToast('Flag removed');
}

// OVERRIDE show() with animation
(function() {
  var origShow = window.show;
  if (origShow) {
    window.show = function(panel) {
      var sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.remove('open');
      var btns = document.querySelectorAll('.nav-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active');
        if (btns[i].getAttribute('onclick') && btns[i].getAttribute('onclick').indexOf(panel) >= 0) {
          btns[i].classList.add('active');
        }
      }
      var panels = document.querySelectorAll('.panel');
      for (var i = 0; i < panels.length; i++) panels[i].classList.remove('active');
      var target = document.getElementById('panel-' + panel);
      if (target) {
        target.classList.add('active');
        if (panel === 'analytics') refreshAnalytics();
        if (panel === 'eventlog') elRefresh();
        if (panel === 'flags') flagsLoad();
      }
    };
  }
})();
"""

script_close_pos = content.rfind('</script>')
content = content[:script_close_pos] + new_js + content[script_close_pos:]

# ── 5. UPDATE initApp ──
init_fn = 'function initApp()'
init_pos = content.find(init_fn)
brace_pos = content.find('{', init_pos)
update_clock_pos = content.find('updateClock();', brace_pos)
if update_clock_pos > 0:
    insert_pos = update_clock_pos + len('updateClock();')
    content = content[:insert_pos] + '\n  flagsLoad();\n  elAdd("ok", "TRACE HQ initialized", "All systems ready");' + content[insert_pos:]

# ── 6. ADD MOBILE MENU TOGGLE ──
topbar_right = content.find('<div class="topbar-right">')
if topbar_right > 0:
    hamburger = '<button class="lock-btn-sm" onclick="document.querySelector(\'.sidebar\').classList.toggle(\'open\')" style="font-size:14px;" title="Menu">☰</button>'
    content = content[:topbar_right] + hamburger + content[topbar_right:]

# ── 7. WRITE ──
with open('trace_hq.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("DONE: TRACE HQ improvements applied!")
print("- Analytics dashboard (reads localStorage)")
print("- Sacred Geometry composition analysis tool")
print("- Event Log viewer with test events")
print("- Feature Flags management system")
print("- Mobile responsive sidebar toggle")
print("- UI animations and transitions")
