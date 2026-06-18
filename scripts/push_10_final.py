#!/usr/bin/env python3
"""Push inline style migration to the max possible ceiling.

Strategy:
1. Add CSS classes to trace.css for vision.js static patterns (2x+)
2. Refactor dynamic color/bg patterns using CSS custom properties
3. Migrate trace.html and trace_hq.html remaining 2+ patterns
"""

import re

# ── Step 1: Add CSS classes to trace.css ──
with open('trace.css', 'r') as f:
    css = f.read()

new_classes = '''

/* ── VISION SECTION STYLES (migrated from inline) ── */
.section-toggle { font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);display:flex;justify-content:space-between;align-items:center;cursor:pointer; }
.section-toggle:hover { opacity:0.85; }
.section-row { padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border); }
.tags-row { padding:6px 14px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface2); }
.tag-item { padding:6px 8px;margin-bottom:4px;background:var(--bg2);border:1px solid var(--border2); }
.text-ghost-xs { font-size:8px;color:var(--text-ghost);padding:4px 8px; }
.text-default { color:var(--text); }
.border-b { border-bottom:1px solid var(--border); }

/* Dynamic theme color via CSS custom properties */
.inline-color { border-color:var(--tag-color, var(--gold)); color:var(--tag-color, var(--gold)); }
.inline-bg { background:var(--tag-color, var(--gold)); }
.brightness-block { width:100%;aspect-ratio:1;background:var(--brightness, #000);border-radius:1px; }

/* Miscellaneous utility classes */
.mono-input { width:80px;background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:9px 12px;font-family:var(--font-mono);font-size:13px;border-radius:3px;outline:none; }
.p-14-overflow-x { padding:14px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none; }
.full-width-300 { width:100%;flex:1;min-height:400px;display:none;background:var(--bg2); }
.btn-gold-full { width:100%;background:var(--surface);border:none;border-top:1px solid var(--border);padding:12px;font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);cursor:pointer; }
.btn-gold-full:hover { background:var(--surface2); }
.card-12 { padding:12px 14px;background:var(--surface);border:1px solid var(--border);margin-bottom:8px; }
.card-12-accent { padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-left:2px solid var(--gold);margin-bottom:8px; }
.row-flex-between { padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center; }
.row-flex-between-highlight { padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);display:flex;justify-content:space-between;align-items:center; }
.alert-warning-box { margin:0 14px 10px;padding:8px 10px;background:rgba(232,160,32,0.08);border:1px solid rgba(232,160,32,0.25);border-radius:2px; }
.section-margin { margin-top:8px;background:var(--surface);border:1px solid var(--border); }
.kb-row { display:flex;justify-content:space-between;padding:8px 0;font-size:10px;color:var(--text-dim);border-bottom:1px solid var(--border2); }
'''

# Find the end of the VISION MODULE STYLES section (before next section or EOF)
marker = '/* Miscellaneous utility classes */'
if marker not in css:
    # Insert before last closing comment or at end
    css += new_classes
else:
    css = css.replace(marker, new_classes.strip() + '\n\n' + marker)

with open('trace.css', 'w') as f:
    f.write(css)
print('✅ Added new CSS classes to trace.css')

# ── Step 2: Migrate vision.js patterns ──
with open('src/vision.js', 'r') as f:
    vis = f.read()

total = 0

# Static 2+ patterns → CSS classes
replacements = [
    # Section toggle - the common expand/collapse header
    ('''style="padding:8px 14px;font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);display:flex;justify-content:space-between;align-items:center;cursor:pointer;"''',
     'class="section-toggle"'),

    # Section row with border
    ('''style="padding:8px 14px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--border);"''',
     'class="section-row"'),

    # Tags row
    ('''style="padding:6px 14px;display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--border);background:var(--surface2);"''',
     'class="tags-row"'),

    # Tag item
    ('''style="padding:6px 8px;margin-bottom:4px;background:var(--bg2);border:1px solid var(--border2);"''',
     'class="tag-item"'),

    # Ghost text extra small
    ('''style="font-size:8px;color:var(--text-ghost);padding:4px 8px;"''',
     'class="text-ghost-xs"'),

    # Default text color
    ('''style="color:var(--text);"''', 'class="text-default"'),

    # Border bottom
    ('''style="border-bottom:1px solid var(--border);"''', 'class="border-b"'),

    # Dynamic color: border-color and color from JS variable
    # Replace style="border-color:' + color + ';color:' + color + '" with class + CSS custom property
    ('''style="border-color:' + color + ';color:' + color + '"''',
     '''class="inline-color" style="--tag-color:' + color + '"'''),

    # Dynamic background from JS variable
    ('''style="background:' + color + '"''',
     '''class="inline-bg" style="--tag-color:' + color + '"'''),

    # Dynamic brightness block - single match but worth migrating for pattern consistency
    ('''style="width:100%;aspect-ratio:1;background:' + brightness + ';border-radius:1px;"''',
     '''class="brightness-block" style="--brightness:' + brightness + '"'''),

    # Mono input
    ('''style="width:80px;background:var(--bg2);border:1px solid var(--border2);color:var(--text);padding:9px 12px;font-family:var(--font-mono);font-size:13px;border-radius:3px;outline:none;"''',
     'class="mono-input"'),

    # Card styles
    ('''style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);margin-bottom:8px;"''',
     'class="card-12"'),

    # Card with gold left accent
    ('''style="padding:12px 14px;background:var(--surface);border:1px solid var(--border);border-left:2px solid var(--gold);margin-bottom:8px;"''',
     'class="card-12-accent"'),

    # Row flex between
    ('''style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;"''',
     'class="row-flex-between"'),

    # Row flex between highlighted
    ('''style="padding:10px 14px;border-bottom:1px solid var(--border);background:var(--surface2);display:flex;justify-content:space-between;align-items:center;"''',
     'class="row-flex-between-highlight"'),

    # Warning box
    ('''style="margin:0 14px 10px;padding:8px 10px;background:rgba(232,160,32,0.08);border:1px solid rgba(232,160,32,0.25);border-radius:2px;"''',
     'class="alert-warning-box"'),

    # Section margin top
    ('''style="margin-top:8px;background:var(--surface);border:1px solid var(--border);"''',
     'class="section-margin"'),

    # text-align:right
    ('''style="text-align:right;"''', 'class="text-right"'),

    # padding:20px
    ('''style="padding:20px;"''', 'class="p-20"'),

    # padding:14px
    ('''style="padding:14px;"''', 'class="p-14"'),
]

for old, new in replacements:
    c = vis.count(old)
    if c > 0:
        vis = vis.replace(old, new)
        total += c
        print(f'  vision.js: replaced {c}x — {old[:50]}...')

with open('src/vision.js', 'w') as f:
    f.write(vis)
print(f'✅ vision.js: {total} replacements total')

# ── Step 3: Migrate trace.html remaining patterns ──
with open('trace.html', 'r') as f:
    html = f.read()

total = 0
t_changes = [
    # height:16px → h-16
    ('style="height:16px"', 'class="h-16"'),
    # padding:14px;overflow-x:auto;scrollbar... → p-14-overflow-x
    ('''style="padding:14px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;"''', 'class="p-14-overflow-x"'),
    # Full width 300px min
    ('''style="width:100%;flex:1;min-height:400px;display:none;background:var(--bg2);"''', 'class="full-width-300"'),
    # Gold full width button
    ('''style="width:100%;background:var(--surface);border:none;border-top:1px solid var(--border);padding:12px;font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);cursor:pointer;"''', 'class="btn-gold-full"'),
    # padding-bottom:8px
    ('style="padding-bottom:8px;"', 'class="pb-8"'),
    # padding-bottom:12px
    ('style="padding-bottom:12px;"', 'class="pb-12"'),
    # margin:0 12px
    ('style="margin:0 12px;"', 'class="mx-12"'),
    # line-height:1.6
    ('style="line-height:1.6;"', 'class="lh-1-6"'),
    # line-height with color
    ('''style="line-height:1.7;color:var(--text-mid);"''', 'class="lh-1-7 text-mid"'),
    # letter-spacing
    ('''style="letter-spacing:.1em;text-transform:uppercase;"''', 'class="ttu ls-01"'),
    ('''style="letter-spacing:.1em;"''', 'class="ls-01"'),
    # margin-top:8px;max-height:120px;overflow-y:auto
    ('''style="margin-top:8px;max-height:120px;overflow-y:auto;display:none;"''', 'class="mt-8 mh-120 ovy-auto" style="display:none;"'),
    # Specific button with margin-top:8px
    ('''style="margin-top:8px;width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text-dim);padding:8px;font-size:8px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;"''', 'class="mt-8 full-width-btn-dim"'),
    # line-height:1.7;color:var(--text-mid) 
    # Already covered above
    # padding:12px 20px
    ('style="padding:12px 20px;"', 'class="px-20 py-12"'),
    # padding:11px 14px
    ('style="padding:11px 14px;"', 'class="px-14 py-11"'),
    # gap:0;padding:0
    ('style="gap:0;padding:0;"', 'class="gap-0 p-0"'),
    # font-size:12px;letter-spacing:.08em;color:var(--text);font-weight:500
    ('''style="font-size:12px;letter-spacing:.08em;color:var(--text);font-weight:500;"''', 'class="text-12-semibold"'),
    # font-size:11px;line-height:1.6
    ('''style="font-size:11px;line-height:1.6;"''', 'class="text-11 lh-1-6"'),
    # min-height:300px;padding:10px
    ('''style="min-height:300px;padding:10px;"''', 'class="mh-300 p-10"'),
    # font-size:9px;color:var(--text-dim);cursor:pointer;letter-spacing:.1em
    ('''style="font-size:9px;color:var(--text-dim);cursor:pointer;letter-spacing:.1em;"''', 'class="text-9-dim ls-01" style="cursor:pointer;"'),
    # Circular profile avatar
    ('''style="width:72px;height:72px;border-radius:50%;border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(212,174,82,0.08) 0%,transparent 70%);margin-bottom:16px;"''', 'class="profile-avatar"'),
]

for old, new in t_changes:
    c = html.count(old)
    if c > 0:
        html = html.replace(old, new)
        total += c
        print(f'  trace.html: replaced {c}x')

with open('trace.html', 'w') as f:
    f.write(html)
print(f'✅ trace.html: {total} replacements total')

# ── Step 4: Migrate trace_hq.html remaining patterns ──
with open('src/trace_hq.html', 'r') as f:
    hq = f.read()

total = 0
hq_changes = [
    # width:0% → same pattern as progress
    ('style="width:0%"', 'class="w-0"'),
    # padding:8px 14px;border-bottom;display:flex;gap:8px
    ('''style="padding:8px 14px;border-bottom:1px solid var(--border);display:flex;gap:8px;"''', 'class="section-row"'),
    # padding:16px;text-align:center;color:var(--red)
    ('''style="padding:16px;text-align:center;color:var(--red);"''', 'class="p-16 text-center text-red"'),
    # max-height:300px
    ('style="max-height:300px;"', 'class="mh-300"'),
    # margin-top:8px;padding:8px 12px;background:...
    ('''style="margin-top:8px;padding:8px 12px;background:var(--surface2);border-radius:2px;"''', 'class="mt-8 p-8-12 bg-surface2"'),
    # margin-top:16px;padding-top:16px;border-top...
    ('''style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border);font-size:11px;color:var(--text-dim);line-height:1.8;"''', 'class="mt-16 pt-16 bt text-11-dim lh-1-8"'),
    # font-size:9px;letter-spacing:.15em;text-transform:uppercase...
    ('''style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--text-dim);margin-bottom:10px;"''', 'class="label-mini mb-10"'),
    # font-size:14px;color:var(--green)
    ('''style="font-size:14px;color:var(--green);"''', 'class="text-14 text-green"'),
    # padding:4px 10px;font-size:8px;border-color:...
    ('''style="padding:4px 10px;font-size:8px;border-color:rgba(196,72,72,.3);color:var(--red);"''', 'class="badge-sm text-red" style="border-color:rgba(196,72,72,.3);"'),
    # padding:13px 32px;font-size:10px
    ('''style="padding:13px 32px;font-size:10px;"''', 'class="px-32 py-13 text-10"'),
    # width:100%;height:80px;border-radius:2px
    ('''style="width:100%;height:80px;border-radius:2px;"''', 'class="w-full h-80 radius-2"'),
    # width:100%;height:120px;border-radius:2px;background...
    ('''style="width:100%;height:120px;border-radius:2px;background:var(--bg2);border:1px solid var(--border);"''', 'class="w-full h-120 radius-2 bg2 bordered"'),
    # margin-left:8px;padding:4px 8px;font-size:8px
    ('''style="margin-left:8px;padding:4px 8px;font-size:8px;"''', 'class="ml-8 p-4-8 text-8"'),
    # margin-bottom:0;flex:1
    ('''style="margin-bottom:0;flex:1;"''', 'class="mb-0 flex-1"'),
    # margin-top:4px;font-size:9px;color:var(--text-dim);white-space:pre-wrap...
    ('''style="margin-top:4px;font-size:9px;color:var(--text-dim);white-space:pre-wrap;max-height:80px;overflow-y:auto;"''', 'class="mt-4 text-9-dim pre-wrap mh-80 ovy-auto"'),
    # margin-top:6px;background:var(--bg2);padding:8px 12px;font-family:mono...
    ('''style="margin-top:6px;background:var(--bg2);padding:8px 12px;font-family:var(--font-mono);font-size:11px;border-radius:2px;border:1px solid var(--border2);"''', 'class="mt-6 mono-block"'),
]

for old, new in hq_changes:
    c = hq.count(old)
    if c > 0:
        hq = hq.replace(old, new)
        total += c
        print(f'  trace_hq.html: replaced {c}x')

with open('src/trace_hq.html', 'w') as f:
    f.write(hq)
print(f'✅ trace_hq.html: {total} replacements total')

# ── Step 5: Count remaining ──
import subprocess
for f in ['trace.html', 'src/trace_hq.html', 'src/vision.js', 'src/knowledge.js', 'src/cases.js', 'src/csv_import.js', 'src/upload.js', 'src/ops-dashboard.js']:
    r = subprocess.run(['grep', '-c', 'style="', f], capture_output=True, text=True)
    print(f'  {f}: {r.stdout.strip()}')

r = subprocess.run(['grep', '-rn', 'style="', 'src/', '--include=*.js'], capture_output=True, text=True)
js_total = len(r.stdout.strip().split('\n')) if r.stdout.strip() else 0
print(f'  src/*.js TOTAL: {js_total}')

print('\\n✅ Done! Script complete.')
