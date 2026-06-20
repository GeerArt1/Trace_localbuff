# Add investigation icon + nav entries to tiers.js, trace.html screen, delegation, CSS, and script tag

import os, re

BASE = '/Users/gdv/paul-hilse-voice'

# ─── Step 1: Add investigation icon to ICONS in tiers.js ───
tiers_path = os.path.join(BASE, 'src', 'tiers.js')
with open(tiers_path, 'r') as f:
    t = f.read()

# Add investigation icon before research icon
old_icons = "  knowledge: '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"><circle cx=\"5\" cy=\"12\" r=\"2\"/><circle cx=\"19\" cy=\"12\" r=\"2\"/><circle cx=\"12\" cy=\"5\" r=\"2\"/><circle cx=\"12\" cy=\"19\" r=\"2\"/><line x1=\"7\" y1=\"12\" x2=\"10\" y2=\"12\"/><line x1=\"14\" y1=\"12\" x2=\"17\" y2=\"12\"/><line x1=\"12\" y1=\"7\" x2=\"12\" y2=\"10\"/><line x1=\"12\" y1=\"14\" x2=\"12\" y2=\"17\"/></svg>',\n  research:"
new_icons = "  knowledge: '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\"><circle cx=\"5\" cy=\"12\" r=\"2\"/><circle cx=\"19\" cy=\"12\" r=\"2\"/><circle cx=\"12\" cy=\"5\" r=\"2\"/><circle cx=\"12\" cy=\"19\" r=\"2\"/><line x1=\"7\" y1=\"12\" x2=\"10\" y2=\"12\"/><line x1=\"14\" y1=\"12\" x2=\"17\" y2=\"12\"/><line x1=\"12\" y1=\"7\" x2=\"12\" y2=\"10\"/><line x1=\"12\" y1=\"14\" x2=\"12\" y2=\"17\"/></svg>',\n  investigation: '<svg width=\"22\" height=\"22\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"9\" cy=\"9\" r=\"3\"/><path d=\"M9 1v2M9 15v2M1 9h2M15 9h2M3.5 3.5l1.5 1.5M14.5 14.5l1.5 1.5M3.5 14.5l1.5-1.5M14.5 3.5l-1.5 1.5\"/><line x1=\"17\" y1=\"17\" x2=\"20\" y2=\"20\"/></svg>',\n  research:"

if old_icons in t:
    t = t.replace(old_icons, new_icons, 1)
    print('Added investigation icon to ICONS')
else:
    print('WARN: Could not find icons insertion point')

# Add investigation nav entries to Collector and Professional tiers
# Collector nav
old_c_nav = "      { id: 'cases', label: 'Cases', icon: 'cases' },\n      { id: 'timeline', label: 'Timeline', icon: 'timeline' },\n      { id: 'geometry', label: 'Geometry', icon: 'geometry' },\n      { id: 'knowledge', label: 'Graph', icon: 'knowledge' },\n      { id: 'profile', label: 'Profile', icon: 'profile' },"
new_c_nav = "      { id: 'cases', label: 'Cases', icon: 'cases' },\n      { id: 'investigation', label: 'Investigate', icon: 'investigation' },\n      { id: 'timeline', label: 'Timeline', icon: 'timeline' },\n      { id: 'geometry', label: 'Geometry', icon: 'geometry' },\n      { id: 'knowledge', label: 'Graph', icon: 'knowledge' },\n      { id: 'profile', label: 'Profile', icon: 'profile' },"

if old_c_nav in t:
    t = t.replace(old_c_nav, new_c_nav, 1)
    print('Added investigation to Collector nav')
else:
    print('WARN: Could not find Collector nav insertion point')

# Professional nav: add after cases
old_p_nav = "      { id: 'cases', label: 'Cases', icon: 'cases' },\n      { id: 'timeline', label: 'Timeline', icon: 'timeline' },\n      { id: 'research', label: 'Research', icon: 'research' },"
new_p_nav = "      { id: 'cases', label: 'Cases', icon: 'cases' },\n      { id: 'investigation', label: 'Investigate', icon: 'investigation' },\n      { id: 'timeline', label: 'Timeline', icon: 'timeline' },\n      { id: 'research', label: 'Research', icon: 'research' },"

if old_p_nav in t:
    t = t.replace(old_p_nav, new_p_nav, 1)
    print('Added investigation to Professional nav')
else:
    print('WARN: Could not find Professional nav insertion point')

with open(tiers_path, 'w') as f:
    f.write(t)

# ─── Step 2: Add investigation screen HTML to trace.html ───
html_path = os.path.join(BASE, 'trace.html')
with open(html_path, 'r') as f:
    h = f.read()

# Insert investigation screen HTML between s-viewer end and s-ops start
old_insert = "    </div>\n\n    <!-- ══ OPS DASHBOARD (System Health) ══ -->\n    <div class=\"screen\" id=\"s-ops\" role=\"main\" aria-label=\"Ops Dashboard\">"

# Build investigation screen HTML
investigation_screen = '''    </div>

    <!-- ══ INVESTIGATION WORKSPACE ══ -->
    <div class="screen" id="s-investigation" role="main" aria-label="Investigation Workspace">
      <div class="page-head">
        <div class="page-eye" data-i18n="investigation_eye">&#x25C8; Investigation Workspace</div>
        <div class="page-title" data-i18n="investigation_title">Board</div>
      </div>

      <div class="d-flex gap-12 mb-16" style="padding:0 20px;">
        <div class="inv-stat"><span class="inv-stat-val" id="inv-total">0</span><span class="inv-stat-lbl">Total</span></div>
        <div class="inv-stat"><span class="inv-stat-val" id="inv-active">0</span><span class="inv-stat-lbl">Active</span></div>
        <div class="inv-stat"><span class="inv-stat-val" id="inv-pinned">0</span><span class="inv-stat-lbl">Pinned</span></div>
        <div class="inv-stat"><span class="inv-stat-val" id="inv-annotations">0</span><span class="inv-stat-lbl">Pins</span></div>
      </div>

      <!-- Board View -->
      <div id="inv-board-panel">
        <div class="d-flex gap-8 mb-16" style="padding:0 20px;">
          <button class="btn-gold-sm" data-inv-action="pin-result" id="inv-pin-current">+ Pin Current Result</button>
          <button class="btn-outline-sm" data-inv-action="go-scan">New Scan</button>
        </div>
        <div class="scroll" id="inv-board-scroll">
          <div id="inv-board"></div>
        </div>
      </div>

      <!-- Detail View -->
      <div id="inv-detail" style="display:none;">
        <div class="d-flex gap-8 mb-16" style="padding:0 20px;">
          <button class="btn-outline-sm" data-inv-action="back">&larr; Back to Board</button>
          <button class="btn-gold-sm" data-inv-action="save-notes">Save Notes</button>
          <button class="btn-outline-sm" data-inv-action="export">Export</button>
        </div>
        <div class="scroll" id="inv-detail-scroll">
          <div id="inv-image-container" class="inv-image-container" style="width:100%;min-height:200px;position:relative;overflow:hidden;"></div>
          <div style="padding:16px 20px;">
            <div class="inv-detail-title" id="inv-detail-title"></div>
            <div class="inv-detail-artist" id="inv-detail-artist"></div>
            <div class="rdiv"></div>
            <div class="rsec">Investigation Notes</div>
            <textarea id="inv-detail-notes" class="inv-notes-input" placeholder="Enter your investigation notes, observations, and hypotheses..." rows="5"></textarea>
            <div class="rdiv"></div>
            <div class="rsec">Provenance Timeline</div>
            <div id="inv-detail-timeline" class="inv-timeline-list"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ OPS DASHBOARD (System Health) ══ -->
    <div class="screen" id="s-ops" role="main" aria-label="Ops Dashboard">'''

if old_insert in h:
    h = h.replace(old_insert, investigation_screen, 1)
    print('Added investigation screen HTML to trace.html')
else:
    print('WARN: Could not find insertion point in trace.html')

# ─── Step 3: Add CSS styles for investigation workspace ───
old_css_marker = '</style>'
investigation_css = '''
/* ── Investigation Workspace ── */
.inv-stat { flex:1; text-align:center; background:var(--surface); border:1px solid var(--border); padding:10px 4px; }
.inv-stat-val { display:block; font-family:'Cormorant Garamond',serif; font-size:24px; color:var(--gold); }
.inv-stat-lbl { display:block; font-size:9px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.12em; margin-top:2px; }
.inv-empty { padding:60px 24px; text-align:center; }
.inv-empty-icon { font-size:40px; color:var(--gold-dim); margin-bottom:12px; }
.inv-empty-title { font-family:'Cormorant Garamond',serif; font-size:20px; color:var(--text); margin-bottom:8px; }
.inv-empty-text { font-size:12px; color:var(--text-mid); line-height:1.7; margin-bottom:20px; max-width:320px; margin-left:auto; margin-right:auto; }
.inv-empty-btn { background:var(--gold); color:#060402; border:none; padding:10px 28px; font-family:Montserrat,sans-serif; font-size:10px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; cursor:pointer; }
.inv-case-card { background:var(--surface); border:1px solid var(--border); margin:0 20px 12px 20px; padding:16px; cursor:pointer; transition:border-color .2s; }
.inv-case-card:hover { border-color:var(--gold-dim); }
.inv-card-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:4px; }
.inv-card-title { font-family:'Cormorant Garamond',serif; font-size:17px; color:var(--text); }
.inv-card-status { font-size:9px; letter-spacing:.1em; text-transform:uppercase; padding:2px 8px; border-radius:0; white-space:nowrap; }
.inv-status-active { background:rgba(212,175,95,0.15); color:var(--gold); }
.inv-status-annotated { background:rgba(100,200,100,0.15); color:#6c6; }
.inv-status-closed { background:rgba(150,150,150,0.15); color:var(--text-dim); }
.inv-card-artist { font-size:11px; color:var(--text-mid); margin-bottom:8px; }
.inv-card-tl { display:flex; align-items:center; gap:4px; margin-bottom:8px; }
.inv-tl-dot { width:6px; height:6px; border-radius:50%; background:var(--gold-dim); }
.inv-tl-more { font-size:8px; color:var(--text-dim); margin-left:2px; }
.inv-card-footer { display:flex; align-items:center; justify-content:space-between; font-size:10px; color:var(--text-dim); }
.inv-card-actions { display:flex; gap:4px; }
.inv-card-btn { background:none; border:1px solid var(--border); color:var(--text-mid); width:26px; height:26px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.inv-card-btn:hover { border-color:var(--gold-dim); color:var(--gold); }
.inv-image-container { position:relative; overflow:hidden; background:var(--surface3); min-height:200px; }
.inv-detail-image { width:100%; display:block; cursor:crosshair; }
.inv-no-image { padding:60px 20px; text-align:center; color:var(--text-dim); font-size:12px; }
.inv-pin { position:absolute; width:20px; height:20px; transform:translate(-50%,-50%); z-index:10; cursor:pointer; }
.inv-pin-dot { width:14px; height:14px; border-radius:50%; background:var(--gold); border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,0.4); transition:transform .15s; }
.inv-pin:hover .inv-pin-dot { transform:scale(1.3); }
.inv-pin-tooltip { display:none; position:absolute; bottom:24px; left:50%; transform:translateX(-50%); background:var(--surface); border:1px solid var(--border-strong); padding:10px 12px; min-width:180px; z-index:20; box-shadow:0 4px 12px rgba(0,0,0,0.3); }
.inv-pin-open .inv-pin-tooltip { display:block; }
.inv-pin-label { font-size:11px; font-weight:600; color:var(--text); margin-bottom:4px; }
.inv-pin-note { font-size:10px; color:var(--text-mid); margin-bottom:6px; line-height:1.5; }
.inv-pin-remove { background:none; border:1px solid var(--red); color:var(--red-lt); font-size:9px; padding:2px 8px; cursor:pointer; text-transform:uppercase; letter-spacing:.1em; }
.inv-detail-title { font-family:'Cormorant Garamond',serif; font-size:22px; color:var(--text); margin-bottom:2px; }
.inv-detail-artist { font-size:12px; color:var(--text-mid); margin-bottom:12px; }
.inv-notes-input { width:100%; background:var(--surface3); border:1px solid var(--border); color:var(--text); padding:12px; font-family:inherit; font-size:12px; line-height:1.7; resize:vertical; }
.inv-notes-input:focus { outline:none; border-color:var(--gold-dim); }
.inv-timeline-list { padding:0; }
.inv-tl-event { display:flex; align-items:baseline; gap:12px; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px; }
.inv-tl-year { font-family:'Courier Prime',monospace; font-size:11px; color:var(--gold); min-width:50px; }
.inv-tl-text { color:var(--text-mid); }
.btn-gold-sm { background:var(--gold); color:#060402; border:none; padding:8px 16px; font-family:Montserrat,sans-serif; font-size:9px; font-weight:700; letter-spacing:.15em; text-transform:uppercase; cursor:pointer; white-space:nowrap; }
.btn-outline-sm { background:none; border:1px solid var(--border-strong); color:var(--text-mid); padding:8px 16px; font-family:Montserrat,sans-serif; font-size:9px; letter-spacing:.1em; text-transform:uppercase; cursor:pointer; white-space:nowrap; }
.btn-outline-sm:hover { border-color:var(--gold-dim); color:var(--gold); }
'''

if old_css_marker in h:
    h = h.replace(old_css_marker, investigation_css + '\n' + old_css_marker, 1)
    print('Added investigation CSS styles')
else:
    print('WARN: Could not find </style> in trace.html')

# ─── Step 3: Add script tag and delegation for investigation screen ───
# Add script include before closing body tag
old_script = '<script src="src/app.js"></script>'
new_script = '<script src="src/investigation.js"></script>\n  <script src="src/app.js"></script>'

if old_script in h:
    h = h.replace(old_script, new_script, 1)
    print('Added investigation.js script include')
else:
    print('WARN: Could not find app.js script tag')

# Add delegation handler after existing case delegations
old_deleg = "  delegate('#s-cases', '.mtab', function() { window.setFilter(this); });\n  delegate('#s-cases', '.case-card[data-type=\"artwork\"]', function() { window.openCaseTimeline('', '', ''); });\n  delegate('#s-home', '[data-home-action]', function() {")
new_deleg = "  delegate('#s-cases', '.mtab', function() { window.setFilter(this); });\n  delegate('#s-cases', '.case-card[data-type=\"artwork\"]', function() { window.openCaseTimeline('', '', ''); });\n\n  // Investigation screen delegation handled in investigation.js module\n\n  delegate('#s-home', '[data-home-action]', function() {"

if old_deleg in h:
    h = h.replace(old_deleg, new_deleg, 1)
    print('Added delegation comment for investigation')
else:
    print('WARN: Could not find delegation insertion point')

with open(html_path, 'w') as f:
    f.write(h)

print('\nAll edits complete!')
