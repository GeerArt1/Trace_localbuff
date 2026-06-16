import re

with open('trace_v29.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ═══════════════════════════════════════════════
# 1. ADD SACRED GEOMETRY CSS (before </style>)
# ═══════════════════════════════════════════════
sg_css = '''
/* ── SACRED GEOMETRY ── */
.sg-canvas-wrap{position:relative;background:var(--bg2);border:1px solid var(--border);border-radius:4px;overflow:hidden;min-height:400px;margin:0 14px;flex-shrink:0;}
.sg-canvas-wrap canvas{display:block;width:100%;height:100%;object-fit:contain;cursor:crosshair;}
.sg-controls{display:flex;flex-wrap:wrap;gap:6px;padding:12px 14px;flex-shrink:0;}
.sg-btn{padding:6px 12px;border:1px solid var(--border);background:var(--surface);color:var(--text-dim);font-family:'Montserrat',sans-serif;font-size:8px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .18s;border-radius:3px;}
.sg-btn:hover{border-color:var(--border-mid);color:var(--text-mid);}
.sg-btn.active{border-color:var(--gold);color:var(--gold);background:rgba(212,174,82,.08);}
body.tier-professional .sg-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(100,140,220,.08);}
body.tier-discover .sg-btn.active{border-color:var(--accent);color:var(--accent);background:rgba(200,138,42,.08);}
.sg-upload-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:14px;border:2px dashed var(--border-mid);border-radius:4px;color:var(--text-dim);font-size:10px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:all .22s;background:none;margin:0 14px;flex-shrink:0;font-family:'Montserrat',sans-serif;}
.sg-upload-btn:hover{border-color:var(--gold);color:var(--gold);background:rgba(212,174,82,.04);}
.sg-info{padding:14px;font-size:11px;line-height:1.7;color:var(--text-mid);flex-shrink:0;}
.sg-info strong{color:var(--gold);}
body.tier-professional .sg-info strong{color:var(--accent);}
body.tier-discover .sg-info strong{color:var(--accent);}
.sg-analysis{display:none;margin:0 14px 14px;padding:12px;background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--gold);}
body.tier-professional .sg-analysis{border-left-color:var(--accent);}
body.tier-discover .sg-analysis{border-left-color:var(--accent);}
.sg-analysis.on{display:block;}
.sg-analysis-title{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:6px;}
.sg-analysis-body{font-size:11px;line-height:1.7;color:var(--text-mid);}
#s-geometry{display:flex;flex-direction:column;overflow:hidden;}
#s-geometry .scroll{display:flex;flex-direction:column;}

/* ── DARK MODE REFINEMENTS ── */
/* Smoother screen transitions */
.screen{transition:opacity .28s cubic-bezier(.25,.1,.25,1);}
/* Subtle hover glow on interactive elements */
.case-card:hover{border-color:var(--border-mid);}
.ni{transition:color .22s,transform .15s;}
.ni:active{transform:scale(.94);}
.ni svg{transition:transform .2s;}
.ni.active svg{transform:scale(1.06);}
/* Refined gold shimmer */
.scan-line{background:linear-gradient(90deg,transparent 0%,rgba(212,174,82,0.15) 5%,var(--gold) 25%,rgba(255,248,180,0.95) 50%,var(--gold) 75%,rgba(212,174,82,0.15) 95%,transparent 100%);}
/* Card micro-interactions */
.qcard{transition:all .22s cubic-bezier(.25,.1,.25,1);}
.qcard:hover{border-color:var(--border-mid);transform:translateY(-1px);}
.learn-card{transition:all .22s cubic-bezier(.25,.1,.25,1);}
.learn-card:hover{border-color:var(--border-mid);}
.hw-btn{transition:all .22s;}
.mtab{transition:color .22s,border-color .22s;}
/* Toast refinement */
.toast{backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);}
'''

style_end = content.find('</style>')
if style_end > 0:
    content = content[:style_end] + sg_css + content[style_end:]
    print("1. Added SG CSS + dark mode refinements")
else:
    print("ERROR: Could not find </style>")

# ═══════════════════════════════════════════════
# 2. ADD SACRED GEOMETRY SCREEN HTML
#    Insert before s-profile
# ═══════════════════════════════════════════════
sg_html = '''
    <!-- ══ SACRED GEOMETRY ══ -->
    <div class="screen" id="s-geometry" role="main" aria-label="Sacred Geometry">
      <div class="page-head">
        <div class="page-eye">Composition Analysis</div>
        <div class="page-title">Sacred Geometry</div>
      </div>
      <div class="scroll" id="sg-scroll">
        <div style="padding:12px 14px 8px;flex-shrink:0;">
          <div style="font-size:10px;line-height:1.6;color:var(--text-dim);">Upload an artwork to overlay golden ratio, rule of thirds, dynamic symmetry, and radial harmony grids.</div>
        </div>
        <button class="sg-upload-btn" id="sg-upload-btn" onclick="sgLoadImage()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Upload artwork for composition analysis
        </button>
        <div class="sg-canvas-wrap" id="sg-canvas-wrap" style="display:none;">
          <canvas id="sg-canvas"></canvas>
        </div>
        <input type="file" id="sg-file-input" accept="image/*" style="display:none" onchange="sgOnFile(event)">
        <div class="sg-controls" id="sg-controls" style="display:none;">
          <button class="sg-btn" onclick="sgToggle('golden')" id="sg-btn-golden">Golden Ratio φ</button>
          <button class="sg-btn" onclick="sgToggle('thirds')" id="sg-btn-thirds">Rule of Thirds</button>
          <button class="sg-btn" onclick="sgToggle('spiral')" id="sg-btn-spiral">Golden Spiral</button>
          <button class="sg-btn" onclick="sgToggle('symmetry')" id="sg-btn-symmetry">Dynamic Symmetry</button>
          <button class="sg-btn" onclick="sgToggle('radial')" id="sg-btn-radial">Radial</button>
          <button class="sg-btn" onclick="sgClear()" id="sg-btn-clear" style="margin-left:auto;border-color:var(--border-strong);">Clear</button>
        </div>
        <div class="sg-analysis" id="sg-analysis">
          <div class="sg-analysis-title">◈ Composition Analysis</div>
          <div class="sg-analysis-body" id="sg-analysis-body">Toggle overlays above to analyse the compositional structure. The golden ratio (φ≈1.618) appears throughout classical and Renaissance art.</div>
        </div>
        <div class="sg-info">
          <strong>Sacred Geometry</strong> — The golden ratio (φ = 1.618…), rule of thirds, dynamic symmetry rectangles (√2, √3, √4, √5), and radial harmony are compositional frameworks used by artists from antiquity through the Renaissance and beyond. Toggle overlays to reveal underlying structure.
        </div>
      </div>
    </div>

'''

# Insert before s-profile
s_profile_marker = 'id="s-profile"'
# Find the start of the s-profile screen
profile_start = content.find('<!-- ══ PROFILE ══ -->')
if profile_start < 0:
    profile_start = content.find('<div class="screen" id="s-profile"')

if profile_start > 0:
    content = content[:profile_start] + sg_html + content[profile_start:]
    print("2. Added Sacred Geometry screen HTML before s-profile")
else:
    print("ERROR: Could not find profile screen anchor")
    # Try finding by the comment
    profile_comment = content.find('<!-- ══ PROFILE ══ -->')
    print(f"  Profile comment at: {profile_comment}")
    profile_div = content.find('<div class="screen" id="s-profile">')
    print(f"  Profile div at: {profile_div}")

# ═══════════════════════════════════════════════
# 3. ADD 'geometry' TO ALL_SCREENS
# ═══════════════════════════════════════════════
old_all_screens = "const ALL_SCREENS = ['intro','home','scan','chat','cases','timeline','learn','profile','research','spectral'];"
new_all_screens = "const ALL_SCREENS = ['intro','home','scan','chat','cases','timeline','learn','profile','research','spectral','geometry'];"
if old_all_screens in content:
    content = content.replace(old_all_screens, new_all_screens)
    print("3. Added 'geometry' to ALL_SCREENS")
else:
    print("ERROR: Could not find ALL_SCREENS")
    print(f"  Looking for: {old_all_screens[:50]}...")

# ═══════════════════════════════════════════════
# 4. ADD GEOMETRY ICON TO ICONS
# ═══════════════════════════════════════════════
# Find the ICONS object and add geometry icon
geometry_icon = "  geometry:`<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 2a10 10 0 1010 10\"/><path d=\"M12 2a10 10 0 0110 10\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2v20M2 12h20\"/></svg>`,\n"
# Insert after the ICONS object's last entry (chat icon)
chat_icon_line = "  chat:"
chat_idx = content.find(chat_icon_line)
if chat_idx > 0:
    # Find the end of the ICONS object (the closing })
    icons_end = content.find("};", chat_idx)
    if icons_end > 0:
        # Insert geometry icon before the closing };
        content = content[:icons_end] + geometry_icon + content[icons_end:]
        print("4. Added geometry icon to ICONS")
    else:
        print("ERROR: Could not find ICONS closing")
else:
    print("ERROR: Could not find chat icon")

# ═══════════════════════════════════════════════
# 5. ADD geometry TO COLLECTOR AND PROFESSIONAL NAV
# ═══════════════════════════════════════════════
# Collector nav: add before profile
old_collector_nav = "{id:'profile',  label:'Profile',  icon:'profile'},\n    ],\n    chatIntro:'Ask me about this artwork"
new_collector_nav = "{id:'profile',  label:'Profile',  icon:'profile'},\n      {id:'geometry',label:'Geometry',icon:'geometry'},\n    ],\n    chatIntro:'Ask me about this artwork"
if old_collector_nav in content:
    content = content.replace(old_collector_nav, new_collector_nav)
    print("5a. Added geometry to Collector nav")
else:
    print("ERROR: Could not find Collector nav target")
    # Try alternate matching
    coll_nav = content.find("label:'Profile',  icon:'profile'},", content.find("collector:"))
    print(f"  Collector profile nav at: {coll_nav}")

# Professional nav: add before profile
old_pro_nav = "{id:'profile',  label:'Profile',   icon:'profile'},\n    ],\n    chatIntro:'Institutional analysis ready"
new_pro_nav = "{id:'profile',  label:'Profile',   icon:'profile'},\n      {id:'geometry',label:'Geometry', icon:'geometry'},\n    ],\n    chatIntro:'Institutional analysis ready"
if old_pro_nav in content:
    content = content.replace(old_pro_nav, new_pro_nav)
    print("5b. Added geometry to Professional nav")
else:
    print("ERROR: Could not find Professional nav target")
    pro_nav = content.find("label:'Profile',   icon:'profile'},", content.find("professional:"))
    print(f"  Professional profile nav at: {pro_nav}")

# ═══════════════════════════════════════════════
# 6. ADD SACRED GEOMETRY JAVASCRIPT FUNCTIONS
#    Insert before the TELEMETRY section
# ═══════════════════════════════════════════════
sg_js = '''
// ══ SACRED GEOMETRY COMPOSITION ANALYSIS ══
var SG = {
  image: null,
  overlays: {},
  active: []
};

function sgLoadImage() {
  var inp = document.getElementById('sg-file-input');
  inp.click();
}

function sgOnFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      SG.image = img;
      var wrap = document.getElementById('sg-canvas-wrap');
      wrap.style.display = 'block';
      var canvas = document.getElementById('sg-canvas');
      // Fit within viewport while maintaining aspect ratio
      var maxW = wrap.clientWidth || 400;
      var maxH = Math.min(window.innerHeight * 0.55, 600);
      var scale = Math.min(maxW / img.width, maxH / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      SG.scale = scale;
      document.getElementById('sg-controls').style.display = 'flex';
      document.getElementById('sg-upload-btn').style.display = 'none';
      sgRedraw();
      // Show analysis hint
      var analysis = document.getElementById('sg-analysis');
      analysis.classList.add('on');
      document.getElementById('sg-analysis-body').textContent =
        'Image loaded: ' + Math.round(img.width) + '×' + Math.round(img.height) +
        'px. Toggle overlays above to analyse composition.';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function sgRedraw() {
  var canvas = document.getElementById('sg-canvas');
  if (!canvas || !SG.image) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width, h = canvas.height;
  
  // Draw image
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(SG.image, 0, 0, w, h);
  
  // Draw each active overlay
  SG.active.forEach(function(key) {
    var color = SG.overlays[key] || 'rgba(212,174,82,0.75)';
    sgDrawOverlay(ctx, w, h, key, color);
  });
}

function sgDrawOverlay(ctx, w, h, type, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([]);
  
  switch(type) {
    case 'golden':
      sgDrawGoldenRatio(ctx, w, h, color);
      break;
    case 'thirds':
      sgDrawRuleOfThirds(ctx, w, h, color);
      break;
    case 'spiral':
      sgDrawGoldenSpiral(ctx, w, h, color);
      break;
    case 'symmetry':
      sgDrawDynamicSymmetry(ctx, w, h, color);
      break;
    case 'radial':
      sgDrawRadial(ctx, w, h, color);
      break;
  }
}

function sgToggle(type) {
  var idx = SG.active.indexOf(type);
  if (idx >= 0) {
    SG.active.splice(idx, 1);
    document.getElementById('sg-btn-' + type).classList.remove('active');
  } else {
    SG.active.push(type);
    document.getElementById('sg-btn-' + type).classList.add('active');
  }
  sgRedraw();
  sgUpdateAnalysis();
}

function sgClear() {
  SG.active = [];
  document.querySelectorAll('#sg-controls .sg-btn').forEach(function(b) { b.classList.remove('active'); });
  sgRedraw();
  var analysis = document.getElementById('sg-analysis');
  if (analysis) analysis.classList.remove('on');
}

function sgUpdateAnalysis() {
  var analysis = document.getElementById('sg-analysis');
  if (!analysis) return;
  if (SG.active.length === 0) {
    analysis.classList.remove('on');
    return;
  }
  analysis.classList.add('on');
  var body = document.getElementById('sg-analysis-body');
  var parts = [];
  SG.active.forEach(function(key) {
    switch(key) {
      case 'golden': parts.push('Golden Ratio φ = 1.618 — divides the frame at the most visually harmonious proportion'); break;
      case 'thirds': parts.push('Rule of Thirds — power points at ⅓ intersections create balanced tension'); break;
      case 'spiral': parts.push('Golden Spiral — natural growth pattern found in shells, galaxies, and Renaissance compositions'); break;
      case 'symmetry': parts.push('Dynamic Symmetry — root rectangles (√2, √3, √4, √5) used in classical painting'); break;
      case 'radial': parts.push('Radial Harmony — concentric circles centered on focal point for balanced composition'); break;
    }
  });
  body.textContent = 'Active overlays: ' + parts.join(' · ');
}

function sgDrawGoldenRatio(ctx, w, h, color) {
  var phi = 1.618;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  
  // Vertical golden ratio line (left)
  ctx.beginPath();
  ctx.moveTo(w / phi, 0);
  ctx.lineTo(w / phi, h);
  ctx.stroke();
  
  // Vertical golden ratio line (right)
  ctx.beginPath();
  ctx.moveTo(w - w / phi, 0);
  ctx.lineTo(w - w / phi, h);
  ctx.stroke();
  
  // Horizontal golden ratio line (top)
  ctx.beginPath();
  ctx.moveTo(0, h / phi);
  ctx.lineTo(w, h / phi);
  ctx.stroke();
  
  // Horizontal golden ratio line (bottom)
  ctx.beginPath();
  ctx.moveTo(0, h - h / phi);
  ctx.lineTo(w, h - h / phi);
  ctx.stroke();
  
  // Draw intersection circles (φ points)
  ctx.fillStyle = color;
  var points = [
    [w / phi, h / phi],
    [w / phi, h - h / phi],
    [w - w / phi, h / phi],
    [w - w / phi, h - h / phi]
  ];
  points.forEach(function(p) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function sgDrawRuleOfThirds(ctx, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 4]);
  
  // Vertical lines
  ctx.beginPath();
  ctx.moveTo(w / 3, 0);
  ctx.lineTo(w / 3, h);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(2 * w / 3, 0);
  ctx.lineTo(2 * w / 3, h);
  ctx.stroke();
  
  // Horizontal lines
  ctx.beginPath();
  ctx.moveTo(0, h / 3);
  ctx.lineTo(w, h / 3);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(0, 2 * h / 3);
  ctx.lineTo(w, 2 * h / 3);
  ctx.stroke();
  
  // Power points
  ctx.fillStyle = color;
  var points = [
    [w / 3, h / 3],
    [w / 3, 2 * h / 3],
    [2 * w / 3, h / 3],
    [2 * w / 3, 2 * h / 3]
  ];
  points.forEach(function(p) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.setLineDash([]);
}

function sgDrawGoldenSpiral(ctx, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([]);
  
  // Draw a golden spiral approximation using quarter-circles
  var phi = 1.618;
  var cx = w - w / phi;
  var cy = h - h / phi;
  var r = Math.min(w, h) * 0.85;
  
  ctx.beginPath();
  var segments = 8;
  var x = cx, y = cy;
  var dirs = [[1,0],[0,-1],[-1,0],[0,1]];
  var size = r / Math.pow(phi, segments);
  for (var i = 0; i < segments; i++) {
    var dir = dirs[i % 4];
    var px = x + dir[0] * size;
    var py = y + dir[1] * size;
    ctx.arcTo(px, py, px + dir[0] * size * 0.5, py + dir[1] * size * 0.5, size);
    x = px;
    y = py;
    size *= phi;
  }
  ctx.stroke();
  
  // Draw φ rectangle
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.strokeRect(0, 0, w, h);
  ctx.globalAlpha = 1;
}

function sgDrawDynamicSymmetry(ctx, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([3, 4]);
  
  // Root rectangles: diagonals from center
  var cx = w / 2, cy = h / 2;
  
  // Main diagonals
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();
  
  // Root-2 rectangles (based on √2)
  var sqrt2 = Math.sqrt(2);
  var r2w = w / sqrt2;
  ctx.beginPath();
  ctx.moveTo((w - r2w) / 2, 0);
  ctx.lineTo((w - r2w) / 2, h);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo((w + r2w) / 2, 0);
  ctx.lineTo((w + r2w) / 2, h);
  ctx.stroke();
  
  // Barocco (armature) lines
  ctx.setLineDash([1, 5]);
  ctx.lineWidth = 0.5;
  
  // Reciprocal diagonals
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(cx, 0);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(w, h);
  ctx.lineTo(cx, 0);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();
  
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(cx, h);
  ctx.stroke();
  
  ctx.setLineDash([]);
  ctx.lineWidth = 1;
}

function sgDrawRadial(ctx, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2, 3]);
  
  var cx = w / 2, cy = h / 2;
  var maxR = Math.sqrt(w * w + h * h) / 2;
  
  // Concentric circles
  var rings = [0.15, 0.3, 0.5, 0.7, 0.85, 1.0];
  rings.forEach(function(ratio) {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * ratio, 0, Math.PI * 2);
    ctx.stroke();
  });
  
  // Radial lines every 30 degrees
  for (var a = 0; a < 360; a += 30) {
    var rad = a * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * maxR, cy + Math.sin(rad) * maxR);
    ctx.stroke();
  }
  
  // Center marker
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.setLineDash([]);
}

// ── SG: Autoscroll to canvas on upload ──
setTimeout(function() {
  var orig = sgOnFile;
  sgOnFile = function(e) {
    orig(e);
    setTimeout(function() {
      var wrap = document.getElementById('sg-canvas-wrap');
      if (wrap && wrap.style.display !== 'none') {
        wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  };
}, 0);
'''

# Insert before telemetry section (or near end of script)
telemetry_marker = '// TELEMETRY & FEATURE FLAGS'
telemetry_idx = content.find(telemetry_marker)
if telemetry_idx > 0:
    content = content[:telemetry_idx] + sg_js + content[telemetry_idx:]
    print("6. Added Sacred Geometry JS before telemetry section")
else:
    # Try inserting before the last script closing
    print("WARN: Telemetry marker not found, trying end of main script")
    last_script = content.rfind('</script>')
    if last_script > 0:
        content = content[:last_script] + sg_js + content[last_script:]
        print("6. Added Sacred Geometry JS before last </script>")

# ═══════════════════════════════════════════════
# WRITE OUTPUT
# ═══════════════════════════════════════════════
with open('trace_v29.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n✅ Done! All changes applied.")
