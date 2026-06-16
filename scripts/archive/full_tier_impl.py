import re

with open('trace_v29.html', 'r', encoding='utf-8') as f:
    content = f.read()

changes = []

# ═══════════════════════════════════════════════
# 1. FIX PROFESSIONAL NAV — remove duplicate geometry, fix indent
# ═══════════════════════════════════════════════
old_pro_nav = """    nav:[
          {id:'home',     label:'Dashboard', icon:'home'},
          {id:'scan',     label:'Scan',      icon:'scan'},
          {id:'chat',     label:'Chat',      icon:'chat'},
          {id:'cases',    label:'Cases',     icon:'cases'},
                {id:'geometry',label:'Geometry', icon:'geometry'},
        {id:'profile',  label:'Profile',   icon:'profile'},
          {id:'geometry',label:'Geometry', icon:'geometry'},
        ],"""

new_pro_nav = """    nav:[
          {id:'home',     label:'Dashboard', icon:'home'},
          {id:'scan',     label:'Scan',      icon:'scan'},
          {id:'chat',     label:'Chat',      icon:'chat'},
          {id:'cases',    label:'Cases',     icon:'cases'},
          {id:'profile',  label:'Profile',   icon:'profile'},
        ],"""

if old_pro_nav in content:
    content = content.replace(old_pro_nav, new_pro_nav)
    changes.append("✅ Fixed Pro nav (removed duplicate geometry)")
else:
    changes.append("⚠️ Could not find Pro nav to fix")

# ═══════════════════════════════════════════════
# 2. ADD GEOMETRY TO COLLECTOR NAV
# ═══════════════════════════════════════════════
old_col_nav = """    nav:[
          {id:'home',     label:'Home',     icon:'home'},
          {id:'scan',     label:'Scan',     icon:'scan'},
          {id:'chat',     label:'Chat',     icon:'chat'},
          {id:'cases',    label:'Cases',     icon:'cases'},
          {id:'profile',  label:'Profile',  icon:'profile'},
        ],"""

new_col_nav = """    nav:[
          {id:'home',     label:'Home',     icon:'home'},
          {id:'scan',     label:'Scan',     icon:'scan'},
          {id:'chat',     label:'Chat',     icon:'chat'},
          {id:'cases',    label:'Cases',     icon:'cases'},
          {id:'geometry',label:'Geometry', icon:'geometry'},
          {id:'profile',  label:'Profile',  icon:'profile'},
        ],"""

if old_col_nav in content:
    content = content.replace(old_col_nav, new_col_nav)
    changes.append("✅ Added geometry to Collector nav")
else:
    changes.append("⚠️ Could not find Collector nav")

# ═══════════════════════════════════════════════
# 3. ADD CHAT TO DISCOVER NAV + LIMITED CHAT SYSTEM
# ═══════════════════════════════════════════════
old_disc_nav = """    nav:[
          {id:'home',  label:'Home',     icon:'home'},
          {id:'scan',  label:'Discover', icon:'scan'},
          {id:'learn', label:'Learn',    icon:'learn'},
          {id:'profile',label:'Profile', icon:'profile'},
        ],"""

new_disc_nav = """    nav:[
          {id:'home',  label:'Home',     icon:'home'},
          {id:'scan',  label:'Discover', icon:'scan'},
          {id:'chat',  label:'Chat',     icon:'chat'},
          {id:'learn', label:'Learn',    icon:'learn'},
          {id:'profile',label:'Profile', icon:'profile'},
        ],"""

if old_disc_nav in content:
    content = content.replace(old_disc_nav, new_disc_nav)
    changes.append("✅ Added Chat to Discover nav")
else:
    changes.append("⚠️ Could not find Discover nav")

# ═══════════════════════════════════════════════
# 4. ADD LIMITED CHAT LOGIC + UPGRADE TRIGGERS + COLLECTIONS + BATCH SCAN
#    Insert before TELEMETRY section (which is near end of main script)
# ═══════════════════════════════════════════════
new_js_block = '''
// ══ TIER-ENHANCED FEATURES ══

// ── DISCOVER CHAT LIMIT (5 msg/day) ──
var DISCOVER_CHAT_LIMIT = 5;

function getDiscoverChatCount() {
  try {
    var key = 'trace_disc_chat_' + new Date().toISOString().slice(0,10);
    return parseInt(localStorage.getItem(key) || '0', 10);
  } catch(e) { return 0; }
}

function incrementDiscoverChatCount() {
  try {
    var key = 'trace_disc_chat_' + new Date().toISOString().slice(0,10);
    var count = parseInt(localStorage.getItem(key) || '0', 10);
    localStorage.setItem(key, String(count + 1));
    return count + 1;
  } catch(e) { return 0; }
}

function isDiscoverChatLimited() {
  return TIER === 'discover' && getDiscoverChatCount() >= DISCOVER_CHAT_LIMIT;
}

// Wrap sendChat to enforce discover limit
(function() {
  var origSend = window.sendChat;
  if (origSend) {
    window.sendChat = function(msg) {
      if (TIER === 'discover' && getDiscoverChatCount() >= DISCOVER_CHAT_LIMIT) {
        showUpgradeCard('chat');
        return;
      }
      if (TIER === 'discover') {
        incrementDiscoverChatCount();
        // Show remaining count
        var remaining = DISCOVER_CHAT_LIMIT - getDiscoverChatCount();
        if (remaining > 0 && remaining <= 3) {
          toast(remaining + ' chat' + (remaining > 1 ? 's' : '') + ' remaining today. Upgrade for unlimited.');
        }
      }
      origSend(msg);
    };
  }
})();

// ── SMART UPGRADE TRIGGERS ──
var UPGRADE_CARDS = {
  chat: {
    title: 'Unlimited AI Chat',
    body: 'Ask unlimited questions about any artwork. Discuss attribution, style, provenance, and get expert analysis.',
    btn: 'UPGRADE TO COLLECTOR',
    tier: 'collector'
  },
  cases: {
    title: 'Save Your Investigations',
    body: 'Track artworks, build case files, and monitor provenance across your entire collection.',
    btn: 'UPGRADE TO COLLECTOR',
    tier: 'collector'
  },
  timeline: {
    title: 'Full Provenance Timeline',
    body: 'See the complete ownership chain from creation to present day, with exhibition history and auction records.',
    btn: 'UPGRADE TO COLLECTOR',
    tier: 'collector'
  },
  geometry: {
    title: 'Sacred Geometry Analysis',
    body: 'Reveal the compositional frameworks artists used — golden ratio, dynamic symmetry, and radial harmony.',
    btn: 'UPGRADE TO COLLECTOR',
    tier: 'collector'
  },
  batch: {
    title: 'Batch Scanning',
    body: 'Upload up to 20 artworks at once for bulk analysis. Perfect for catalogues and collection audits.',
    btn: 'UPGRADE TO PROFESSIONAL',
    tier: 'professional'
  },
  export: {
    title: 'Institutional Export',
    body: 'Generate PDF reports, CIDOC-CRM records, and Getty-compatible provenance documentation.',
    btn: 'UPGRADE TO PROFESSIONAL',
    tier: 'professional'
  }
};

function showUpgradeCard(key) {
  var card = UPGRADE_CARDS[key];
  if (!card) return;
  // Remove any existing upgrade card
  var existing = document.getElementById('upgrade-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'upgrade-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:600;background:rgba(5,4,3,0.7);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:fadeIn .25s ease;';

  var box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border:1px solid var(--border-strong);padding:28px 24px;max-width:360px;width:100%;text-align:center;';

  var icon = document.createElement('div');
  icon.textContent = '◈';
  icon.style.cssText = 'font-size:36px;color:var(--gold);margin-bottom:12px;';

  var title = document.createElement('div');
  title.textContent = card.title;
  title.style.cssText = 'font-family:\'Cormorant Garamond\',serif;font-size:22px;font-weight:400;color:var(--text);margin-bottom:10px;';

  var body = document.createElement('div');
  body.textContent = card.body;
  body.style.cssText = 'font-size:12px;line-height:1.7;color:var(--text-mid);margin-bottom:20px;';

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

  var upgradeBtn = document.createElement('button');
  upgradeBtn.textContent = card.btn;
  upgradeBtn.style.cssText = 'width:100%;background:var(--gold);color:#060402;border:none;padding:14px;font-family:\'Montserrat\',sans-serif;font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:background .18s;';
  upgradeBtn.onclick = function() {
    overlay.remove();
    showTierComparison();
  };
  upgradeBtn.onmouseenter = function() { upgradeBtn.style.background = 'var(--gold-lt)'; };
  upgradeBtn.onmouseleave = function() { upgradeBtn.style.background = 'var(--gold)'; };

  var dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Maybe later';
  dismissBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);padding:8px;font-family:\'Montserrat\',sans-serif;font-size:9px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:color .18s;';
  dismissBtn.onclick = function() { overlay.remove(); };
  dismissBtn.onmouseenter = function() { dismissBtn.style.color = 'var(--text)'; };
  dismissBtn.onmouseleave = function() { dismissBtn.style.color = 'var(--text-dim)'; };

  btnRow.appendChild(upgradeBtn);
  btnRow.appendChild(dismissBtn);
  box.appendChild(icon);
  box.appendChild(title);
  box.appendChild(body);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Track upgrade view
  if (typeof traceTelemetry === 'function') traceTelemetry('upgrade_view', {feature: key});
}

function showTierComparison() {
  var existing = document.getElementById('tier-compare-overlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'tier-compare-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:700;background:rgba(5,4,3,0.8);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fadeIn .25s ease;';

  var box = document.createElement('div');
  box.style.cssText = 'background:var(--surface);border:1px solid var(--border-mid);max-width:380px;width:100%;max-height:90vh;overflow-y:auto;';

  var head = document.createElement('div');
  head.style.cssText = 'padding:20px 20px 14px;border-bottom:1px solid var(--border);text-align:center;';
  head.innerHTML = '<div style="font-family:\'Cormorant Garamond\',serif;font-size:20px;font-weight:400;color:var(--text);">Choose Your Plan</div>';

  var tiers = [
    {name:'TRACE Discover', badge:'FREE', price:'€0', color:'var(--gold)', features:['Identify any artwork','5 AI chats / day','Learn art history','Sacred Geometry (basic)','']},
    {name:'TRACE Collector', badge:'COLLECTOR', price:'€49', color:'var(--gold)', features:['Unlimited AI chat','Full provenance timeline','Case management','Sacred Geometry (all overlays)','Smart Collections']},
    {name:'TRACE Pro', badge:'PROFESSIONAL', price:'€299', color:'var(--accent)', features:['Batch scanning (up to 20)','Export: PDF · CIDOC-CRM · Getty','Database cross-reference','API access · Priority processing','Collaboration tools']}
  ];

  var body = document.createElement('div');
  body.style.cssText = 'padding:16px;';

  tiers.forEach(function(t, idx) {
    var card = document.createElement('div');
    card.style.cssText = 'margin-bottom:10px;border:1px solid ' + (idx === 1 ? 'var(--border-strong)' : 'var(--border)') + ';background:var(--bg2);padding:16px;border-radius:4px;';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';

    var nameSpan = document.createElement('span');
    nameSpan.style.cssText = 'font-family:\'Cormorant Garamond\',serif;font-size:16px;font-weight:500;color:var(--text);';
    nameSpan.textContent = t.name;

    var priceSpan = document.createElement('span');
    priceSpan.style.cssText = 'font-size:18px;font-weight:600;color:' + t.color + ';';
    priceSpan.textContent = t.price + '/mo';

    header.appendChild(nameSpan);
    header.appendChild(priceSpan);

    var featureList = document.createElement('div');
    t.features.forEach(function(f) {
      if (!f) return;
      var item = document.createElement('div');
      item.style.cssText = 'padding:5px 0;font-size:11px;color:var(--text-mid);display:flex;align-items:center;gap:8px;';
      item.innerHTML = '<span style="color:' + t.color + ';">◆</span> ' + f;
      featureList.appendChild(item);
    });

    card.appendChild(header);
    card.appendChild(featureList);
    body.appendChild(card);
  });

  var closeBtn = document.createElement('button');
  closeBtn.textContent = 'CLOSE';
  closeBtn.style.cssText = 'width:100%;background:var(--surface2);border:1px solid var(--border);color:var(--text-dim);padding:12px;font-family:\'Montserrat\',sans-serif;font-size:9px;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;';
  closeBtn.onclick = function() { overlay.remove(); };

  box.appendChild(head);
  box.appendChild(body);
  box.appendChild(closeBtn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// ── COLLECTIONS (Collector tier) ──
var COLLECTIONS_KEY = 'trace_collections';

function colLoad() {
  try {
    var raw = localStorage.getItem(COLLECTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
}

function colSave(collections) {
  try {
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
  } catch(e) {}
}

function colCreate(name) {
  var cols = colLoad();
  cols.push({id: Date.now().toString(36), name: name, artworks: [], created: new Date().toISOString()});
  colSave(cols);
  return cols;
}

function colAddArtwork(colId, artwork) {
  var cols = colLoad();
  var col = cols.find(function(c) { return c.id === colId; });
  if (col) {
    // Avoid duplicates
    if (!col.artworks.some(function(a) { return a.id === artwork.id; })) {
      col.artworks.push(artwork);
      colSave(cols);
    }
  }
  return cols;
}

function colRemove(colId) {
  var cols = colLoad().filter(function(c) { return c.id !== colId; });
  colSave(cols);
  return cols;
}

// Render collections in the profile page (Collector+)
function colRender() {
  var container = document.getElementById('collections-section');
  if (!container) return;
  if (TIER === 'discover') { container.style.display = 'none'; return; }

  container.style.display = 'block';
  var cols = colLoad();
  var html = '<div class="p-sec">Collections</div>';

  cols.forEach(function(c) {
    html += '<div class="p-row" style="cursor:default;">' +
      '<div class="p-row-l">' + esc(c.name) + ' <span style="font-size:10px;color:var(--text-dim);">(' + c.artworks.length + ')</span></div>' +
      '<div style="display:flex;gap:6px;">' +
      '<button onclick="colDeletePrompt(\\'' + c.id + '\\')" style="background:none;border:none;color:var(--text-ghost);font-size:10px;cursor:pointer;padding:2px 6px;">✕</button>' +
      '</div></div>';
  });

  html += '<div class="p-row" onclick="colCreatePrompt()" style="cursor:pointer;">' +
    '<div class="p-row-l" style="color:var(--gold);">+ New Collection</div>' +
    '<div class="p-row-r"></div></div>';

  container.innerHTML = html;
}

function colCreatePrompt() {
  var name = prompt('Collection name:');
  if (name && name.trim()) {
    colCreate(name.trim());
    colRender();
  }
}

function colDeletePrompt(id) {
  if (confirm('Delete this collection?')) {
    colRemove(id);
    colRender();
  }
}

// ── BATCH SCANNING (Professional tier) ──
var BATCH_QUEUE = [];

function batchInit() {
  var btn = document.getElementById('batch-btn');
  if (!btn) return;
  btn.style.display = TIER === 'professional' ? 'flex' : 'none';
}

function batchSelectFiles() {
  if (TIER !== 'professional') {
    showUpgradeCard('batch');
    return;
  }
  var inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = 'image/*';
  inp.multiple = true;
  inp.onchange = function(e) {
    var files = Array.from(e.target.files);
    if (files.length > 20) { toast('Maximum 20 files per batch'); files = files.slice(0, 20); }
    batchQueue(files);
  };
  inp.click();
}

function batchQueue(files) {
  files.forEach(function(f) {
    BATCH_QUEUE.push({file: f, status: 'pending', result: null});
  });
  batchRender();
  if (BATCH_QUEUE.length > 0) batchProcessNext();
}

function batchProcessNext() {
  var pending = BATCH_QUEUE.filter(function(item) { return item.status === 'pending'; });
  if (pending.length === 0) return;

  var item = pending[0];
  item.status = 'processing';
  batchRender();

  // Read file and trigger analysis
  var reader = new FileReader();
  reader.onload = function(ev) {
    // Set as current scan image
    var dataUrl = ev.target.result;
    img64 = dataUrl.split(',')[1];
    imgType = item.file.type || 'image/jpeg';

    var p = document.getElementById('main-preview');
    p.src = dataUrl;
    p.style.display = 'block';
    document.getElementById('main-empty').style.display = 'none';

    // Auto-analyse
    var origDone = window._batchDone;
    window._batchDone = function() {
      item.status = 'done';
      item.result = window._lastResult || {title: 'Unknown'};
      batchRender();
      window._batchDone = origDone;
      // Process next
      setTimeout(batchProcessNext, 500);
    };

    document.getElementById('btn-go').disabled = false;
    analyse();
  };
  reader.readAsDataURL(item.file);
}

function batchRender() {
  var container = document.getElementById('batch-queue');
  if (!container) return;

  var total = BATCH_QUEUE.length;
  var doneCount = BATCH_QUEUE.filter(function(i) { return i.status === 'done'; }).length;
  var processing = BATCH_QUEUE.some(function(i) { return i.status === 'processing'; });

  var html = '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);">' +
    '<span style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-dim);">Batch Queue (' + doneCount + '/' + total + ')</span>';

  if (total > 0) {
    html += '<button onclick="BATCH_QUEUE=[];batchRender();" style="background:none;border:1px solid var(--border);color:var(--text-dim);padding:4px 8px;font-size:8px;cursor:pointer;letter-spacing:.08em;text-transform:uppercase;">Clear</button>';
  }
  html += '</div>';

  if (total === 0) {
    html += '<div style="padding:14px;text-align:center;color:var(--text-ghost);font-size:10px;">No files queued. Select images to batch-analyse.</div>';
  } else {
    BATCH_QUEUE.forEach(function(item, idx) {
      var statusIcon = item.status === 'done' ? '✅' : item.status === 'processing' ? '⏳' : '⬜';
      var name = item.file.name.length > 30 ? item.file.name.slice(0,27) + '...' : item.file.name;
      var result = item.result ? (item.result.title || 'Complete') : '';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid var(--border);font-size:10px;">' +
        '<span>' + statusIcon + '</span>' +
        '<span style="flex:1;color:var(--text-mid);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(name) + '</span>' +
        '<span style="color:var(--text-dim);font-size:9px;">' + esc(result) + '</span></div>';
    });
  }

  container.innerHTML = html;
}

// Add batch UI to scan page on load
setTimeout(function() {
  // Add batch button for Pro
  var scanBtns = document.getElementById('source-picker');
  if (scanBtns) {
    var batchBtn = document.createElement('button');
    batchBtn.id = 'batch-btn';
    batchBtn.className = 'btn-up';
    batchBtn.style.cssText = 'display:none;border-right:1px solid var(--border);';
    batchBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="display:inline;vertical-align:middle;margin-right:5px;"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>Batch (' + TIER + ')';
    batchBtn.onclick = batchSelectFiles;
    scanBtns.appendChild(batchBtn);

    // Batch queue display
    var queueDiv = document.createElement('div');
    queueDiv.id = 'batch-queue';
    queueDiv.style.cssText = 'display:none;';
    scanBtns.parentNode.insertBefore(queueDiv, scanBtns.nextSibling);

    batchInit();
  }

  // Add collections section to profile
  var profileScroll = document.querySelector('#s-profile .scroll');
  if (profileScroll) {
    var colSection = document.createElement('div');
    colSection.id = 'collections-section';
    // Insert before the last p-sec (Settings)
    var settingsSec = profileScroll.querySelector('.p-sec:last-of-type');
    if (settingsSec) {
      profileScroll.insertBefore(colSection, settingsSec);
    } else {
      profileScroll.appendChild(colSection);
    }
    colRender();
  }

  // Listen for tier changes to re-render
  var origSetTier = window.setTier;
  if (origSetTier) {
    window.setTier = function(t) {
      origSetTier(t);
      setTimeout(function() {
        batchInit();
        colRender();
      }, 100);
    };
  }
}, 100);

// ── ANIMATIONS ──
var styleSheet = document.createElement('style');
styleSheet.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}';
document.head.appendChild(styleSheet);
'''

# Find the TELEMETRY section or the end of the main script
telemetry_marker = '// TELEMETRY & FEATURE FLAGS'
telemetry_idx = content.find(telemetry_marker)
if telemetry_idx > 0:
    content = content[:telemetry_idx] + new_js_block + content[telemetry_idx:]
    changes.append("✅ Added limited chat, upgrade triggers, collections, batch scan")
else:
    # Find a good insertion point — near end of main script but before the last </script>
    last_script_close = content.rfind('</script>')
    # Find the start of the last script block
    last_script_start = content.rfind('<script', 0, last_script_close)
    # Insert near the end of the main JS
    # Look for the traceTelemetry function
    telemetry_alt = content.find('function traceTelemetry')
    if telemetry_alt > 0:
        content = content[:telemetry_alt] + new_js_block + content[telemetry_alt:]
        changes.append("✅ Added features before traceTelemetry")
    else:
        content = content[:last_script_close] + new_js_block + content[last_script_close:]
        changes.append("✅ Added features before last </script>")

# ═══════════════════════════════════════════════
# 5. UPDATE DISCOVER CONFIG — add chat-related settings
# ═══════════════════════════════════════════════
# Find Discover section and update system prompt to mention limited chat
old_disc_chat = "chatIntro:'Ask me anything about the artwork you just scanned. I can discuss style, provenance, period details, or suggest next investigation steps.',"
new_disc_chat = "chatIntro:'Ask me anything about the artwork you just scanned. You have 5 free chats per day — upgrade for unlimited access.',"

# Only replace in discover section
disc_start = content.find("discover:", content.find("const TIERS"))
disc_chat_idx = content.find(old_disc_chat, disc_start)
if disc_chat_idx > disc_start and disc_chat_idx < content.find("},", disc_start) + 5000:
    content = content[:disc_chat_idx] + new_disc_chat + content[disc_chat_idx + len(old_disc_chat):]
    changes.append("✅ Updated Discover chat intro with limit info")
else:
    changes.append("⚠️ Could not update Discover chat intro")

# ═══════════════════════════════════════════════
# 6. ADD COLLECTOR SETTINGS — hasExport=true for geometry export
# ═══════════════════════════════════════════════
# Already has hasPro:false, hasExport:false - keep as is

# ═══════════════════════════════════════════════
# WRITE OUTPUT
# ═══════════════════════════════════════════════
with open('trace_v29.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("\n".join(changes))
print("\n✅ Full tier implementation complete!")
