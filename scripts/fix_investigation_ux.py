import os

BASE = '/Users/gdv/paul-hilse-voice'

# ─── FIX 1: CSS — remove always-on crosshair from .inv-image-container ───
p = os.path.join(BASE, 'trace.html')
with open(p) as f:
    h = f.read()

old_css = '.inv-image-container{position:relative;overflow:hidden;background:var(--surface3);min-height:200px;cursor:crosshair}'
new_css = '.inv-image-container{position:relative;overflow:hidden;background:var(--surface3);min-height:200px}'

if old_css in h:
    h = h.replace(old_css, new_css, 1)
    print('Fix 1: Removed always-on crosshair cursor from .inv-image-container')
else:
    print('WARN: CSS pattern not found')

with open(p, 'w') as f:
    f.write(h)

# ─── FIX 2: investigation.js — import existing cases + sync with trace_cases ───
p2 = os.path.join(BASE, 'src', 'investigation.js')
with open(p2) as f:
    js = f.read()

# Add importExistingCases function and call it in init
import_func = '''
  /**
   * Import existing cases from the trace_cases index on first load
   */
  function importExistingCases() {
    try {
      var raw = localStorage.getItem(INVESTIGATION_KEY);
      if (raw) return; // Already has data, don't re-import

      // Import from existing trace_cases
      if (typeof window.getSavedCases === 'function') {
        var existing = window.getSavedCases();
        if (existing.length > 0) {
          var imported = existing.map(function(c) {
            // Look up timeline data
            var tl = (window._timelines && window._timelines[c.title]) || {};
            return {
              title: c.title || 'Untitled',
              artist: tl.artist || '',
              period: tl.period || '',
              subjectType: c.type || 'artwork',
              confidence: tl.confidence || 50,
              events: Array.isArray(tl.events) ? tl.events : [],
              annotations: [],
              status: 'active',
              createdAt: c.addedAt || Date.now(),
              updatedAt: Date.now(),
              notes: ''
            };
          });
          if (imported.length > 0) {
            localStorage.setItem(INVESTIGATION_KEY, JSON.stringify(imported));
            console.log('[TRACE Investigation] Imported ' + imported.length + ' existing cases');
          }
        }
      }
    } catch(e) {
      console.warn('[TRACE Investigation] Import failed:', e);
    }
  }'''

# Add importExistingCases before init function, and call it in init
old_init = '''  function init() {
    wireDelegation();'''
new_init = '''  function init() {
    importExistingCases();
    wireDelegation();'''

if 'importExistingCases' not in js:
    # Insert importExistingCases function before init
    js = js.replace('function init() {', import_func + '\n\n  function init() {')
    js = js.replace(import_func + '\n\n  function init() {\n    wireDelegation();', new_init)
    print('Fix 2a: Added importExistingCases function + init call')
else:
    print('Fix 2a: importExistingCases already exists')

# Add sync with trace_cases in pinToInvestigation
old_pin = '''    cases.unshift(newCase);
    saveInvestigationCases(cases);

    window.toast('Pinned to investigation board \\u2713');
    renderInvestigationBoard();

    // Emit event
    if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
      TRACE_REGISTRY.emit('investigation:pinned', { title: r.title });
    }'''

new_pin = '''    cases.unshift(newCase);
    saveInvestigationCases(cases);

    // Also add to existing trace_cases index for consistency
    if (typeof window.addCaseToIndex === 'function') {
      window.addCaseToIndex(r.title || 'Untitled', r.subject_type || 'artwork');
    }

    window.toast('Pinned to investigation board \\u2713');
    renderInvestigationBoard();

    // Emit event
    if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
      TRACE_REGISTRY.emit('investigation:pinned', { title: r.title });
    }'''

if old_pin in js and 'window.addCaseToIndex' not in js:
    js = js.replace(old_pin, new_pin, 1)
    print('Fix 2b: Added sync with trace_cases in pinToInvestigation')
else:
    print('Fix 2b: Already synced or pattern not found')

with open(p2, 'w') as f:
    f.write(js)

print('\nAll fixes applied!')
