// ══════════════════════════════════════════════
// TRACE Subscription Manager v1.0
// Handles: subscription verification, license keys,
// tier unlocking, payment flow, database cross-reference
// ══════════════════════════════════════════════

var TRACE_SUB = (function() {
  var API_BASE = window.TRACE_API_PROXY || 'http://localhost:' + (window.LOCAL_PORT || 3000);
  var SUB_KEY = 'trace_subscription';
  var TOKEN_KEY = 'trace_sub_token';

  // ── Admin security ──
  // In production, the server's ADMIN_SECRET must be set explicitly and NEVER exposed to client code.
  // In dev mode, the server auto-generates ADMIN_SECRET and prints it at startup.
  // To enable the Demo Key button in dev mode, set this in your browser console:
  //   window.TRACE_DEMO_ADMIN_TOKEN = '<the-key-from-startup-banner>';
  // This is NOT a security risk locally; the token comes from your own machine.
  var DEMO_ADMIN_TOKEN = window.TRACE_DEMO_ADMIN_TOKEN || '';

  // ── Subscription State ──
  var state = {
    verified: false,
    tier: null,
    owner: null,
    expiresAt: null,
    token: null,
    loading: false
  };

  // ── Init: Verify subscription on page load ──
  function init(callback) {
    state.loading = true;
    // Check for stored token/license
    var storedToken = getStoredToken();
    var storedLicense = getStoredLicense();

    if (storedToken) {
      verifyToken(storedToken, function(result) {
        if (result && result.ok) {
          applySubscription(result.tier, result.owner, result.expiresAt, storedToken);
        } else {
          // Token expired, try license key
          if (storedLicense) {
            verifyLicense(storedLicense, function(licResult) {
              if (licResult && licResult.ok) {
                applySubscription(licResult.tier, licResult.owner, licResult.expiresAt, licResult.token);
              } else {
                // No valid subscription — use tier from localStorage/app default
                if (storedLicense && typeof toast === 'function') {
                  toast('⚠️ Subscription server unreachable — using default tier');
                }
                state.verified = true;
                state.loading = false;
              }
              if (callback) callback(state);
            });
            return;
          }
          state.verified = true;
          state.loading = false;
        }
        if (callback) callback(state);
      });
    } else if (storedLicense) {
      verifyLicense(storedLicense, function(result) {
        if (result && result.ok) {
          applySubscription(result.tier, result.owner, result.expiresAt, result.token);
        }
        state.verified = true;
        state.loading = false;
        if (callback) callback(state);
      });
    } else {
      state.verified = true;
      state.loading = false;
      if (callback) callback(state);
    }
  }

  function applySubscription(tier, owner, expiresAt, token) {
    state.tier = tier;
    state.owner = owner;
    state.expiresAt = expiresAt;
    state.token = token;
    state.verified = true;
    storeToken(token);
  }

  // ── CSRF token from auth session ──
  function getCsrfToken() {
    try { return sessionStorage.getItem('trace_csrf_token'); } catch(e) { return null; }
  }

  // ── API Calls ──
  function apiPost(endpoint, data, callback) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      // Attach CSRF token if available for protected endpoints
      var csrf = getCsrfToken();
      if (csrf) xhr.setRequestHeader('x-csrf-token', csrf);
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { callback(JSON.parse(xhr.responseText)); }
          catch(e) { callback(null); }
        } else {
          callback(null);
        }
      };
      xhr.onerror = function() { callback(null); };
      xhr.send(JSON.stringify(data));
    } catch(e) {
      callback(null);
    }
  }

  function apiGet(endpoint, callback) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', API_BASE + endpoint, true);
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { callback(JSON.parse(xhr.responseText)); }
          catch(e) { callback(null); }
        } else {
          callback(null);
        }
      };
      xhr.onerror = function() { callback(null); };
      xhr.send();
    } catch(e) {
      callback(null);
    }
  }

  function verifyToken(token, callback) {
    apiPost('/api/verify-subscription', { token: token }, callback);
  }

  function verifyLicense(licenseKey, callback) {
    apiPost('/api/verify-subscription', { licenseKey: licenseKey }, callback);
  }

  // ── Storage ──
  function storeToken(token) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch(e) {}
  }

  function getStoredToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch(e) { return null; }
  }

  function getStoredLicense() {
    try { return localStorage.getItem('trace_license_key'); } catch(e) { return null; }
  }

  function storeLicense(licenseKey) {
    try { localStorage.setItem('trace_license_key', licenseKey); } catch(e) {}
  }

  // ── Activation via UI (redirects to showUpgradeFlow) ──
  // License keys must be created from the TRACE HQ admin panel (requires ADMIN_SECRET).
  // The upgrade dialog supports: (a) entering an existing license key, or (b) demo key generation.
  function activate(tier, owner, callback) {
    if (callback) callback('License keys must be created from the TRACE HQ admin panel. Use showUpgradeFlow() instead.');
  }

  // ── Database Cross-Reference (INTERPOL/ALR) ──
  function interpolCheck(artworkTitle, artist, year, callback) {
    apiPost('/api/interpol-check', { artworkTitle: artworkTitle, artist: artist, year: year }, function(result) {
      if (result && result.checks) {
        callback(null, result);
      } else {
        callback(result && result.error ? result.error : 'Check failed');
      }
    });
  }

  // ── Bulk Export ──
  function bulkExport(ids, format) {
    if (!ids || ids.length === 0) return;
    var url = API_BASE + '/api/bulk-export?ids=' + ids.join(',') + '&format=' + (format || 'csv');
    window.open(url, '_blank');
  }

  // ── Display ──
  function renderSubscriptionStatus() {
    var el = document.getElementById('sub-status');
    if (!el) return;
    if (state.tier) {
      el.innerHTML = '<span style="color:var(--gold);font-weight:600;">' + state.tier.toUpperCase() + '</span> · ' +
        (state.owner || '') + ' · ' + (state.expiresAt ? 'Expires ' + new Date(state.expiresAt).toLocaleDateString() : 'Lifetime');
    } else {
      el.innerHTML = '<span style="color:var(--text-dim);">Free Tier</span>';
    }
  }

  // ── Upgrade flow — two paths: enter license key OR request a trial ──
  function showUpgradeFlow(tier) {
    var overlay = document.createElement('div');
    overlay.id = 'sub-flow-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:700;background:rgba(5,4,3,0.8);display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:fadeIn .25s ease;';

    var box = document.createElement('div');
    box.style.cssText = 'background:var(--surface);border:1px solid var(--border-strong);max-width:380px;width:100%;';

    // ── Tab: License Key ──
    var sectionKey = document.createElement('div');
    sectionKey.style.cssText = 'padding:20px;border-bottom:1px solid var(--border);';
    sectionKey.innerHTML = '<div style="font-family:\'Cormorant Garamond\',serif;font-size:17px;font-weight:400;color:var(--text);margin-bottom:6px;">' +
      'Activate ' + (tier === 'professional' ? 'TRACE Professional' : 'TRACE Collector') + '</div>' +
      '<div style="font-size:10px;color:var(--text-dim);margin-bottom:14px;">' +
      (tier === 'professional' ? '€299/month — Institutional provenance intelligence' : '€49/month — Full provenance & case management') + '</div>' +
      '<div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-mid);margin-bottom:6px;">License Key</div>';

    var licInput = document.createElement('input');
    licInput.type = 'text';
    licInput.placeholder = 'e.g. TRACE-XXXX-XXXX-XXXX-XXXX';
    licInput.style.cssText = 'width:100%;background:var(--bg2);border:1px solid var(--border);padding:12px 14px;font-family:\'Montserrat\',sans-serif;font-size:13px;color:var(--text);outline:none;margin-bottom:10px;';

    var licStatus = document.createElement('div');
    licStatus.style.cssText = 'font-size:10px;color:var(--text-mid);margin-bottom:10px;text-align:center;';

    var licBtn = document.createElement('button');
    licBtn.textContent = 'ACTIVATE LICENSE';
    licBtn.style.cssText = 'width:100%;background:var(--gold);color:#060402;border:none;padding:12px;font-family:\'Montserrat\',sans-serif;font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:background .18s;';
    licBtn.addEventListener('click', function() {
      var key = licInput.value.trim();
      if (!key) { licStatus.textContent = 'Please enter a license key'; return; }
      licBtn.disabled = true;
      licBtn.textContent = 'VERIFYING…';
      verifyLicense(key, function(result) {
        if (result && result.ok) {
          storeLicense(key);
          storeToken(result.token);
          applySubscription(result.tier, result.owner, result.expiresAt, result.token);
          if (typeof setTier === 'function') setTier(result.tier);
          licStatus.innerHTML = '<span style="color:var(--green-lt);">✅ ' + result.tier.toUpperCase() + ' activated</span>';
          licBtn.textContent = '✅ ACTIVATED';
          setTimeout(function() { overlay.remove(); }, 1500);
        } else {
          licStatus.innerHTML = '<span style="color:var(--red-lt);">❌ Invalid or expired license key</span>';
          licBtn.disabled = false;
          licBtn.textContent = 'ACTIVATE LICENSE';
        }
      });
    });

    sectionKey.appendChild(licInput);
    sectionKey.appendChild(licStatus);
    sectionKey.appendChild(licBtn);

    // ── Tab: Request Trial / Get a Key ──
    var sectionDemo = document.createElement('div');
    sectionDemo.style.cssText = 'padding:16px 20px;';
    sectionDemo.innerHTML = '<div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-ghost);margin-bottom:10px;">Subscribe via</div>' +
      '<button id="sub-stripe-btn" style="background:var(--gold);color:#060402;border:none;padding:12px;font-family:\'Montserrat\',sans-serif;font-size:9px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;cursor:pointer;width:100%;margin-bottom:10px;">💳 SUBSCRIBE WITH STRIPE</button>' +
      '<div style="font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-ghost);margin-bottom:8px;">Or generate a demo key</div>' +
      '<div style="font-size:11px;color:var(--text-dim);line-height:1.6;margin-bottom:10px;">Demo keys are for testing only. In production, use Stripe checkout above.</div>' +
      '<button id="demo-gen-key" style="background:none;border:1px solid var(--border);color:var(--text-dim);padding:10px;font-family:\'Montserrat\',sans-serif;font-size:8px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;width:100%;">GENERATE DEMO KEY</button>';

    var dismissBtn = document.createElement('button');
    dismissBtn.textContent = 'Cancel';
    dismissBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);padding:10px 0 0;font-family:\'Montserrat\',sans-serif;font-size:9px;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;width:100%;text-align:center;';
    dismissBtn.addEventListener('click', function() { overlay.remove(); });

    sectionDemo.appendChild(dismissBtn);

    box.appendChild(sectionKey);
    box.appendChild(sectionDemo);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(function() { licInput.focus(); }, 200);

    // Stripe checkout button
    setTimeout(function() {
      var stripeBtn = document.getElementById('sub-stripe-btn');
      if (stripeBtn) {
        stripeBtn.addEventListener('click', function() {
          stripeBtn.disabled = true;
          stripeBtn.textContent = 'OPENING CHECKOUT…';
          apiPost('/api/create-checkout-session', {
            tier: tier,
            owner: 'Stripe Customer',
            successUrl: window.location.origin + '/trace.html?checkout=success',
            cancelUrl: window.location.origin + '/trace.html?checkout=cancel'
          }, function(result) {
            if (result && result.checkoutUrl) {
              // Real Stripe checkout
              window.open(result.checkoutUrl, '_blank');
              stripeBtn.textContent = '✅ CHECKOUT OPENED';
              setTimeout(function() { overlay.remove(); }, 2000);
            } else if (result && result.demo) {
              // Demo mode — inform user
              licStatus.innerHTML = '<span style="color:var(--gold);">⚡ Stripe not configured. Set STRIPE_SECRET_KEY in your .env to enable real payments. Use the demo key below for testing.</span>';
              stripeBtn.disabled = false;
              stripeBtn.textContent = '💳 SUBSCRIBE WITH STRIPE';
            } else {
              var errMsg = (result && result.error) ? result.error : 'Checkout failed';
              licStatus.innerHTML = '<span style="color:var(--red-lt);">❌ ' + errMsg + '</span>';
              stripeBtn.disabled = false;
              stripeBtn.textContent = '💳 SUBSCRIBE WITH STRIPE';
            }
          });
        });
      }
    }, 100);

    // Demo key generation uses the activate endpoint with default admin token
    // This only works in demo mode (ADMIN_SECRET default). In production,
    // the admin changes ADMIN_SECRET and keys come exclusively from HQ.
    setTimeout(function() {
      var demoBtn = document.getElementById('demo-gen-key');
      if (demoBtn) {
        demoBtn.addEventListener('click', function() {
          demoBtn.disabled = true;
          demoBtn.textContent = 'GENERATING…';
          apiPost('/api/subscribe', {
            tier: tier,
            owner: 'Demo User',
            adminToken: DEMO_ADMIN_TOKEN
          }, function(result) {
            if (result && result.ok) {
              licInput.value = result.licenseKey;
              licStatus.innerHTML = '<span style="color:var(--green-lt);">✅ Key generated! Click ACTIVATE LICENSE to apply.</span>';
              demoBtn.textContent = '✅ KEY GENERATED';
            } else {
              licStatus.innerHTML = '<span style="color:var(--red-lt);">❌ ' + (result && result.error ? result.error : 'Generation failed') + '</span>';
              demoBtn.disabled = false;
              demoBtn.textContent = 'GENERATE DEMO KEY';
            }
          });
        });
      }
    }, 100);
  }

  // ── Public API ──
  return {
    init: init,
    state: state,
    activate: activate,
    interpolCheck: interpolCheck,
    bulkExport: bulkExport,
    showUpgradeFlow: showUpgradeFlow,
    renderSubscriptionStatus: renderSubscriptionStatus,
    getStoredLicense: getStoredLicense
  };
})();

// ── Auto-init on page load ──
(function() {
  // Initialize subscription check after a short delay to let app bootstrap
  var subInitTimer = setTimeout(function() {
    TRACE_SUB.init(function(state) {
      TRACE_SUB.renderSubscriptionStatus();
      // If we have a verified subscription, ensure tier matches
      if (state.tier && typeof setTier === 'function') {
        // Only override if current tier is different and user is subscribed
        if (window.TIER && state.tier !== window.TIER) {
          setTier(state.tier);
        }
      }
    });
  }, 500);

  // Patch showUpgradeCard to use real subscription flow
  var origShowUpgrade = window.showUpgradeCard;
  if (origShowUpgrade) {
    var patchedShow = function(key) {
      var tierMap = { chat: 'collector', cases: 'collector', timeline: 'collector', geometry: 'collector', batch: 'professional', export: 'professional' };
      var targetTier = tierMap[key] || 'collector';
      if (typeof TRACE_SUB !== 'undefined') {
        TRACE_SUB.showUpgradeFlow(targetTier);
      }
    };
    window.showUpgradeCard = patchedShow;
  }

  // Patch the upgrade button in the tier comparison modal
  // (Handled by the patched showUpgradeCard above)
})();

// ── Interpol check integration for batch results ──
function batchInterpolCheck() {
  if (typeof BATCH_QUEUE === 'undefined' || BATCH_QUEUE.length === 0) {
    toast('No batch results to check');
    return;
  }
  var results = BATCH_QUEUE.filter(function(i) { return i.status === 'done' && i.result; });
  if (results.length === 0) {
    toast('No completed results yet');
    return;
  }
  toast('Checking ' + results.length + ' artworks against databases…');

  var completed = 0;
  var total = results.length;
  var hasAlerts = false;

  results.forEach(function(item, idx) {
    var title = item.result ? (item.result.title || 'Unknown') : 'Unknown';
    setTimeout(function() {
      TRACE_SUB.interpolCheck(title, '', '', function(err, data) {
        completed++;
        if (data) {
          item.interpolResult = data;
          if (data.hasAlerts) {
            hasAlerts = true;
            toast('⚠️ Database hit: ' + title);
          }
        }
        // Only show summary when ALL checks complete (counter, not time)
        if (completed >= total) {
          if (hasAlerts) {
            toast('⚠️ Some artworks flagged in databases — check batch queue for details');
          } else {
            toast('✅ All clear — no database matches found');
          }
        }
      });
    }, idx * 1200);
  });
}

// Add Interpol check button to batch controls
(function() {
  var pollTimer = setInterval(function() {
    var batchControls = document.querySelector('#batch-queue > div:first-child');
    if (batchControls && !document.getElementById('interpol-batch-btn')) {
      var btn = document.createElement('button');
      btn.id = 'interpol-batch-btn';
      btn.textContent = '🔍 Cross-Reference';
      btn.style.cssText = 'background:none;border:1px solid var(--border);color:var(--text-dim);padding:4px 8px;font-size:8px;cursor:pointer;letter-spacing:.08em;text-transform:uppercase;margin-left:6px;';
      btn.addEventListener('click', batchInterpolCheck);
      batchControls.appendChild(btn);
      clearInterval(pollTimer);
    }
  }, 1000);
})();
