#!/usr/bin/env python3
"""Split trace_v29.html into trace.html + trace.css + trace_app.js"""

import re

SRC = 'trace_v29.html'
OUT_HTML = 'trace.html'
OUT_CSS = 'trace.css'
OUT_JS = 'trace_app.js'

with open(SRC, 'r', encoding='utf-8') as f:
    html = f.read()

print(f"Read {len(html):,} chars from {SRC}")

# ── 1. Extract CSS ──
css_start = html.find('<style>')
css_end = html.find('</style>')
assert css_start > 0 and css_end > 0, "Could not find CSS boundaries"

css_content = html[css_start + 7:css_end].strip()
print(f"CSS: {len(css_content):,} chars extracted")

# ── 2. Find ALL script blocks ──
js_markers = []
for m in re.finditer(r'<script[^>]*>', html):
    start = m.start()
    tag = m.group()
    end = html.find('</script>', start)
    inner = html[start + len(tag):end]
    has_src = 'src=' in tag
    js_markers.append({
        'start': start,
        'end': end + 9,  # include </script>
        'tag': tag,
        'inner': inner,
        'has_src': has_src,
        'size': len(inner)
    })

# Find the main inline JS block (first inline script with content)
main_inline = None
for m in js_markers:
    if not m['has_src'] and m['size'] > 1000:
        main_inline = m
        break

assert main_inline, "Could not find main inline JS block"

js_content = main_inline['inner'].strip()
print(f"JS (main inline): {len(js_content):,} chars extracted")

# ── 3. Build new HTML ──

# Before CSS: head + meta tags (everything before <style>)
before_css = html[:css_start].rstrip()

# After CSS, before JS: <body> + HTML content
after_css_before_js = html[css_end + 8:main_inline['start']]

# Build <head> with external CSS link
new_head = before_css + '\n<link rel="stylesheet" href="trace.css">\n</head>\n'

# Build JS section: trace_app.js + external script references (WITHOUT inline content)
new_js = '\n<script src="trace_app.js"></script>\n'

for m in js_markers:
    if not m['has_src']:
        continue  # Skip inline scripts (main is now trace_app.js)
    # External script: keep only the tag (no inline content — browser ignores it anyway)
    # For self-closing XHTML: <script src="..."/>
    # For HTML5: <script src="..."></script>
    new_js += m['tag'] + '</script>\n'

# Add closing HTML
last_script_end = js_markers[-1]['end']
closing_html = html[last_script_end:]
new_js += closing_html

# Build final HTML
new_html = new_head + '\n' + after_css_before_js + '\n' + new_js

# Clean up excessive blank lines
new_html = re.sub(r'\n{3,}', '\n\n', new_html)

# ── 4. Write files ──
with open(OUT_CSS, 'w', encoding='utf-8') as f:
    f.write(css_content)

with open(OUT_JS, 'w', encoding='utf-8') as f:
    f.write(js_content)

with open(OUT_HTML, 'w', encoding='utf-8') as f:
    f.write(new_html)

print(f"\n✅ Wrote {OUT_CSS} ({len(css_content):,} chars)")
print(f"✅ Wrote {OUT_JS} ({len(js_content):,} chars)")
print(f"✅ Wrote {OUT_HTML} ({len(new_html):,} chars)")
print(f"\nOriginal: {len(html):,} chars across 1 file")
print(f"New: {len(new_html) + len(css_content) + len(js_content):,} chars across 3 files")
print(f"Redundancy removed: {len(html) - (len(new_html) + len(css_content) + len(js_content)):,} chars")
