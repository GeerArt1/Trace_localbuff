import re

# Clean up empty style="" attributes in trace_hq.html
with open('src/trace_hq.html', 'r') as f:
    content = f.read()

# Count before
count = content.count('style=""')

# Remove empty style attributes (with optional leading space)
content = re.sub(r'\s+style=""', '', content)
# Also handle style=''
content = re.sub(r"\s+style=''", '', content)

with open('src/trace_hq.html', 'w') as f:
    f.write(content)

print(f'Removed {count} empty style="" attributes')
