// ══════════════════════════════════════════════
// TRACE — Chat System
// ══════════════════════════════════════════════

var DISCOVER_CHAT_LIMIT = 5;

function getDiscoverChatCount() {
  try {
    var key = 'trace_disc_chat_' + new Date().toISOString().slice(0, 10);
    return parseInt(localStorage.getItem(key) || '0', 10);
  } catch (e) { return 0; }
}

function incrementDiscoverChatCount() {
  try {
    var key = 'trace_disc_chat_' + new Date().toISOString().slice(0, 10);
    var count = parseInt(localStorage.getItem(key) || '0', 10);
    localStorage.setItem(key, String(count + 1));
    return count + 1;
  } catch (e) { return 0; }
}

function isDiscoverChatLimited() {
  return (window.TIER === 'discover' && getDiscoverChatCount() >= DISCOVER_CHAT_LIMIT);
}

var _chatAbortController = null;

/**
 * Streaming sendChat — replaces basic sendChat
 * @param {string} text
 */
window.sendChat = function sendChat(text) {
  if (typeof window.requireOnline === 'function' && !window.requireOnline()) return;

  if (isDiscoverChatLimited()) {
    if (typeof window.showUpgradeCard === 'function') window.showUpgradeCard('chat');
    return;
  }
  if (window.TIER === 'discover') {
    var remaining = DISCOVER_CHAT_LIMIT - getDiscoverChatCount() - 1;
    if (remaining <= 2 && remaining >= 0) {
      setTimeout(function() {
        window.toast(remaining + ' chat' + (remaining > 1 ? 's' : '') + ' remaining today. Upgrade for unlimited.');
      }, 300);
    }
  }

  var input = document.getElementById('chat-input');
  var msg = text || (input ? input.value.trim() : '');
  if (!msg) return;
  if (input) input.value = '';
  incrementDiscoverChatCount();

  var msgs = document.getElementById('chat-messages');
  if (!msgs) return;

  // User bubble
  msgs.innerHTML += '<div class="chat-msg user"><div class="chat-msg-label">You</div><div class="chat-msg-bubble">' + window.esc(msg) + '</div></div>';
  if (!window._chatHistory) window._chatHistory = [];
  window._chatHistory.push({ role: 'user', content: msg });
  // Persist chat history
  try { localStorage.setItem('trace_chat_history', JSON.stringify(window._chatHistory.slice(-50))); } catch(e) { TRACE_WATCHDOG?.warn('Chat', e); }

  // Hide suggestions
  var sug = document.getElementById('chat-suggestions');
  if (sug) sug.innerHTML = '';

  // Streaming AI bubble
  var typing = document.createElement('div');
  typing.className = 'chat-msg ai';
  typing.id = 'chat-streaming-msg';
  typing.innerHTML = '<div class="chat-msg-label">Analysing</div><div class="chat-msg-bubble streaming"><span id="chat-stream-text"></span><span class="chat-stream-cursor"></span></div>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;
  var sendBtn = document.getElementById('chat-send');
  if (sendBtn) sendBtn.disabled = true;

  var contextStr = window._chatContext
    ? 'You are discussing artwork: "' + window._chatContext.title + '" by ' + (window._chatContext.artist || 'Unknown') + ' (' + (window._chatContext.period || 'period unknown') + '). '
    : '';
  var systemMsg = contextStr + 'You are TRACE, an expert art intelligence assistant. Answer questions about the artwork concisely and helpfully. Keep responses under 3 sentences unless asked for detail. Be specific and cite art historical references when possible.';

  var apiMessages = window._chatHistory.map(function(m) { return { role: m.role, content: m.content }; });

  // Increment chat counter for HQ analytics
  try {
    var cc = parseInt(localStorage.getItem('trace_chat_count') || '0', 10);
    localStorage.setItem('trace_chat_count', String(cc + 1));
  } catch(e) { TRACE_WATCHDOG?.warn('Chat', e); }

  var apiBase = window.TRACE_API_PROXY || '';
  var apiUrl = apiBase ? apiBase + '/analyse' : 'https://api.anthropic.com/v1/messages';
  var headers = { 'Content-Type': 'application/json' };
  if (!apiBase) { headers['anthropic-version'] = '2023-06-01'; }

  // Abort any previous in-flight chat request
  if (_chatAbortController) _chatAbortController.abort();
  _chatAbortController = new AbortController();

  // Send analyse key if configured on server
  if (window.TRACE_ANALYSE_KEY) {
    headers['x-api-key'] = window.TRACE_ANALYSE_KEY;
  }
  // Send tier for per-tier rate limiting on server
  if (window.TIER) {
    headers['x-tier'] = window.TIER;
  }

  fetch(apiUrl, {
    method: 'POST',
    headers: headers,
    signal: _chatAbortController.signal,
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: systemMsg,
      messages: apiMessages
    })
  }).then(function(r) { return r.json(); }).then(function(data) {
    var fullReply = data.content ? data.content.map(function(b) { return b.text || ''; }).join('') : 'I could not process that question.';
    window._chatHistory.push({ role: 'assistant', content: fullReply });
    // Persist chat history
    try { localStorage.setItem('trace_chat_history', JSON.stringify(window._chatHistory.slice(-50))); } catch(e) { TRACE_WATCHDOG?.warn('Chat', e); }

    // Streaming simulation
    var streamEl = document.getElementById('chat-stream-text');
    var cursorEl = typing.querySelector('.chat-stream-cursor');
    var idx = 0;
    var streamSpeed = 18;

    function typeNext() {
      if (idx < fullReply.length) {
        var chunk = fullReply.substring(0, idx + 1);
        streamEl.textContent = chunk;
        idx++;
        msgs.scrollTop = msgs.scrollHeight;
        setTimeout(typeNext, streamSpeed);
      } else {
        if (cursorEl) cursorEl.remove();
        var bubble = typing.querySelector('.chat-msg-bubble');
        if (bubble) bubble.classList.remove('streaming');
        var label = typing.querySelector('.chat-msg-label');
        if (label) label.innerHTML = 'AI';
        if (sendBtn) sendBtn.disabled = false;
      }
    }
    typeNext();
  }).catch(function(err) {
    var t = document.getElementById('chat-streaming-msg');
    if (t) t.remove();
    msgs.innerHTML += '<div class="chat-msg ai"><div class="chat-msg-label">AI</div><div class="chat-msg-bubble" style="color:var(--red-lt)">Connection error \u2014 ' + window.esc(err.message) + '. Make sure the API proxy is running.</div></div>';
    if (sendBtn) sendBtn.disabled = false;
  });
};

/**
 * Set chat context from scan result
 * @param {Object} result
 * @param {string} imgSrc
 */
window.traceSetChatContext = function traceSetChatContext(result, imgSrc) {
  window._chatContext = {
    title: result.title || 'Unknown Subject',
    artist: result.artist || '',
    period: result.period || '',
    imgSrc: imgSrc || '',
    subjectType: result.subject_type || 'artwork'
  };
};

/**
 * Open chat screen
 */
window.openChat = function openChat() {
  var tier = window.TIER || '';
  if (tier === 'discover') {
    var remaining = DISCOVER_CHAT_LIMIT - getDiscoverChatCount();
    if (remaining <= 0) {
      if (typeof window.showUpgradeCard === 'function') window.showUpgradeCard('chat');
      return;
    }
  } else if (tier !== 'collector' && tier !== 'professional') {
    window.toast('Chat available in Discover, Collector and Professional tiers');
    return;
  }

  window.nav('chat');

  var ctx = document.getElementById('chat-context');
  var titleEl = document.getElementById('chat-ctx-title');
  var subEl = document.getElementById('chat-ctx-sub');
  var imgEl = document.getElementById('chat-ctx-img');

  var chatCtx = window._chatContext;
  if (chatCtx && ctx) {
    ctx.style.display = 'flex';
    if (titleEl) titleEl.textContent = chatCtx.title;
    if (subEl) subEl.textContent = (chatCtx.artist || '') + (chatCtx.period ? ', ' + chatCtx.period : '');
    if (imgEl && chatCtx.imgSrc) { imgEl.src = chatCtx.imgSrc; imgEl.style.display = 'block'; }
    else if (imgEl) { imgEl.style.display = 'none'; }
  } else if (ctx) {
    ctx.style.display = 'none';
  }

  var msgs = document.getElementById('chat-messages');
  var cfg = window.TIERS[tier];
  
  // Restore persisted chat history
  var savedHistory = null;
  try {
    var raw = localStorage.getItem('trace_chat_history');
    if (raw) savedHistory = JSON.parse(raw);
  } catch(e) { TRACE_WATCHDOG?.warn('Chat', e); }
  
  if (savedHistory && savedHistory.length > 0) {
    window._chatHistory = savedHistory;
    if (msgs) {
      msgs.innerHTML = savedHistory.map(function(m) {
        var role = m.role === 'user' ? 'user' : 'ai';
        var label = m.role === 'user' ? 'You' : 'AI';
        return '<div class="chat-msg ' + role + '"><div class="chat-msg-label">' + label + '</div><div class="chat-msg-bubble">' + window.esc(m.content || '') + '</div></div>';
      }).join('');
      msgs.scrollTop = msgs.scrollHeight;
    }
  } else {
    var introText = (cfg && cfg.chatIntro) ? cfg.chatIntro : 'Ask me anything about the artwork. I can discuss style, provenance, period details, or suggest next investigation steps.';
    if (msgs) {
      msgs.innerHTML = '<div class="chat-msg ai"><div class="chat-msg-label">AI</div><div class="chat-msg-bubble">' + introText + '</div></div>';
    }
    window._chatHistory = [];
  }
  var suggestions = (cfg && cfg.chatSuggestions) ? cfg.chatSuggestions : ['Is this signature authentic?', 'What period does this style suggest?', 'Are there similar works to compare?'];
  updateChatSuggestions(suggestions);
};

/**
 * Clear chat history and reset the UI
 */
window.clearChat = function clearChat() {
  window._chatHistory = [];
  try {
    localStorage.removeItem('trace_chat_history');
  } catch(e) { TRACE_WATCHDOG?.warn('Chat', e); }

  var msgs = document.getElementById('chat-messages');
  var tier = window.TIER || 'collector';
  var cfg = window.TIERS[tier];
  var introText = (cfg && cfg.chatIntro) ? cfg.chatIntro : 'Ask me anything about the artwork. I can discuss style, provenance, period details, or suggest next investigation steps.';
  if (msgs) {
    msgs.innerHTML = '<div class="chat-msg ai"><div class="chat-msg-label">AI</div><div class="chat-msg-bubble">' + introText + '</div></div>';
  }
  // Restore suggestions
  var suggestions = (cfg && cfg.chatSuggestions) ? cfg.chatSuggestions : ['Is this signature authentic?', 'What period does this style suggest?', 'Are there similar works to compare?'];
  var sugEl = document.getElementById('chat-suggestions');
  if (sugEl) {
    sugEl.innerHTML = suggestions.map(function(s) {
      return '<div class="chat-sug">' + window.esc(s) + '</div>';
    }).join('');
  }
  window.toast('Chat cleared');
};

window.closeChat = function closeChat() { window.nav('scan'); };

function updateChatSuggestions(sugs) {
  var el = document.getElementById('chat-suggestions');
  if (!el || !sugs.length) return;
  el.innerHTML = sugs.map(function(s) {
    return '<div class="chat-sug">' + window.esc(s) + '</div>';
  }).join('');
  // Wire up suggestion clicks via event delegation (parent listener)
  if (!el._sugBound) {
    el._sugBound = true;
    el.addEventListener('click', function(e) {
      var sug = e.target.closest('.chat-sug');
      if (sug && typeof window.sendChat === 'function') {
        window.sendChat(sug.textContent.trim());
      }
    });
  }
}

// ── Add "Chat" button to result panel ──
(function() {
  function addChatButton() {
    var cfg = window.TIERS && window.TIERS[window.TIER];
    if (!cfg || !cfg.chatIntro) return;
    var resultPanel = document.getElementById('main-result');
    if (!resultPanel || document.getElementById('trace-chat-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'trace-chat-btn';
    btn.style.cssText = 'width:100%;background:var(--surface2);border:1px solid var(--border-mid);border-top:1px solid var(--border);color:var(--gold);padding:14px;font-family:Montserrat,sans-serif;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;transition:all .18s;display:flex;align-items:center;justify-content:center;gap:8px;';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> Ask Follow-up Questions';
    btn.addEventListener('click', function() { window.openChat(); });
    btn.addEventListener('mouseenter', function() { btn.style.borderColor = 'var(--gold)'; });
    btn.addEventListener('mouseleave', function() { btn.style.borderColor = 'var(--border-mid)'; });
    resultPanel.parentNode.insertBefore(btn, resultPanel.nextSibling);
  }

  if (typeof MutationObserver !== 'undefined') {
    var obs = new MutationObserver(function() {
      var mr = document.getElementById('main-result');
      if (mr && mr.classList.contains('on')) addChatButton();
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
})();

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('chat', {
    version: '1.0.0',
    dependsOn: ['utils', 'tiers'],
    hooks: {
      'result:render': function(data) {
        if (data && data.result) {
          window.traceSetChatContext(data.result, data.imgSrc || '');
        }
      }
    }
  });
}

console.log('[TRACE Chat] Loaded');
