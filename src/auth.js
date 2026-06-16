// ══════════════════════════════════════════════
// TRACE Auth Client — login, register, token verification
// Extracted from trace.html inline script into
// a module for maintainability.
// ══════════════════════════════════════════════

var TRACE_AUTH = (function() {
  var API_BASE = window.TRACE_API_PROXY || 'http://localhost:' + (window.LOCAL_PORT || 3000);
  var TOKEN_KEY = 'trace_auth_token';
  var USER_KEY = 'trace_auth_user';
  var CSRF_KEY = 'trace_csrf_token';

  function getToken() { try { return sessionStorage.getItem(TOKEN_KEY); } catch(e) { return null; } }
  function setToken(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch(e) {} }
  function getStoredUser() { try { return JSON.parse(sessionStorage.getItem(USER_KEY) || 'null'); } catch(e) { return null; } }
  function setStoredUser(u) { try { sessionStorage.setItem(USER_KEY, JSON.stringify(u)); } catch(e) {} }
  function clearAuth() { try { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); sessionStorage.removeItem(CSRF_KEY); } catch(e) {} }

  // CSRF token management
  function getCsrfToken() { try { return sessionStorage.getItem(CSRF_KEY); } catch(e) { return null; } }
  function setCsrfToken(t) { try { if (t) sessionStorage.setItem(CSRF_KEY, t); } catch(e) {} }

  function apiPost(path, data, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', API_BASE + path, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    // Attach CSRF token for state-changing requests
    var csrf = getCsrfToken();
    if (csrf) xhr.setRequestHeader('x-csrf-token', csrf);
    xhr.onload = function() {
      try { cb(JSON.parse(xhr.responseText)); } catch(e) { cb(null); }
    };
    xhr.onerror = function() { cb(null); };
    xhr.send(JSON.stringify(data));
  }

  function init() {
    var token = getToken();
    if (!token) {
      showAuthScreen();
      return;
    }
    // Verify existing token
    apiPost('/api/auth/verify', { token: token }, function(result) {
      if (result && result.authenticated) {
        setStoredUser(result.user);
        hideAuthScreen();
        if (result.user.tier && typeof setTier === 'function') {
          setTier(result.user.tier);
        }
      } else {
        clearAuth();
        showAuthScreen();
      }
    });
  }

  function showAuthScreen() {
    var s = document.getElementById('auth-screen');
    if (s) { s.style.display = 'flex'; }
    var app = document.getElementById('app');
    if (app) { app.style.display = 'none'; }
  }

  function hideAuthScreen() {
    var s = document.getElementById('auth-screen');
    if (s) { s.style.display = 'none'; }
    var app = document.getElementById('app');
    if (app) { app.style.display = ''; }
  }

  return {
    init: init,
    getToken: getToken,
    getUser: getStoredUser,
    clear: clearAuth,
    showAuthScreen: showAuthScreen,
    hideAuthScreen: hideAuthScreen
  };
})();

// ── Auth UI functions ──
function authShowRegister() {
  document.getElementById('auth-login').style.display = 'none';
  document.getElementById('auth-register').style.display = 'block';
  document.getElementById('reg-error').textContent = '';
}
function authShowLogin() {
  document.getElementById('auth-register').style.display = 'none';
  document.getElementById('auth-login').style.display = 'block';
  document.getElementById('auth-error').textContent = '';
}

function authRegister() {
  var name = document.getElementById('reg-name').value.trim();
  var email = document.getElementById('reg-email').value.trim();
  var password = document.getElementById('reg-pass').value;
  var errEl = document.getElementById('reg-error');

  if (!email || !password) { errEl.textContent = 'Email and password required'; return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters'; return; }

  errEl.textContent = 'Creating account...';
  var xhr = new XMLHttpRequest();
  xhr.open('POST', (window.TRACE_API_PROXY || 'http://localhost:' + (window.LOCAL_PORT || 3000)) + '/api/auth/register', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function() {
    try {
      var d = JSON.parse(xhr.responseText);
      if (d.ok) {
        sessionStorage.setItem('trace_auth_token', d.token);
        sessionStorage.setItem('trace_auth_user', JSON.stringify(d.user));
        // Store CSRF token from response
        if (d.csrfToken) sessionStorage.setItem('trace_csrf_token', d.csrfToken);
        window.TRACE_AUTH.hideAuthScreen();
        if (d.user.tier && typeof setTier === 'function') setTier(d.user.tier);
      } else {
        errEl.textContent = d.error || 'Registration failed';
      }
    } catch(e) { errEl.textContent = 'Server error'; }
  };
  xhr.onerror = function() { errEl.textContent = 'Connection failed — is the server running?'; };
  xhr.send(JSON.stringify({ name: name, email: email, password: password }));
}

function authLogin() {
  var email = document.getElementById('auth-email').value.trim();
  var password = document.getElementById('auth-pass').value;
  var errEl = document.getElementById('auth-error');

  if (!email || !password) { errEl.textContent = 'Email and password required'; return; }

  errEl.textContent = 'Signing in...';
  var xhr = new XMLHttpRequest();
  xhr.open('POST', (window.TRACE_API_PROXY || 'http://localhost:' + (window.LOCAL_PORT || 3000)) + '/api/auth/login', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function() {
    try {
      var d = JSON.parse(xhr.responseText);
      if (d.ok) {
        sessionStorage.setItem('trace_auth_token', d.token);
        sessionStorage.setItem('trace_auth_user', JSON.stringify(d.user));
        // Store CSRF token from response
        if (d.csrfToken) sessionStorage.setItem('trace_csrf_token', d.csrfToken);
        window.TRACE_AUTH.hideAuthScreen();
        if (d.user.tier && typeof setTier === 'function') setTier(d.user.tier);
      } else {
        errEl.textContent = d.error || 'Invalid email or password';
      }
    } catch(e) { errEl.textContent = 'Server error'; }
  };
  xhr.onerror = function() { errEl.textContent = 'Connection failed — is the server running?'; };
  xhr.send(JSON.stringify({ email: email, password: password }));
}

function authLogout() {
  TRACE_AUTH.clear();
  TRACE_AUTH.showAuthScreen();
  if (typeof nav === 'function') nav('intro');
}

// ── Bind event listeners for extracted inline handlers ──
document.addEventListener('DOMContentLoaded', function() {
  var loginBtn = document.getElementById('auth-login-btn');
  if (loginBtn) loginBtn.addEventListener('click', authLogin);

  var registerBtn = document.getElementById('auth-register-btn');
  if (registerBtn) registerBtn.addEventListener('click', authRegister);

  var showReg = document.getElementById('auth-show-register');
  if (showReg) showReg.addEventListener('click', authShowRegister);

  var showLogin = document.getElementById('auth-show-login');
  if (showLogin) showLogin.addEventListener('click', authShowLogin);

  var emailInput = document.getElementById('auth-email');
  if (emailInput) emailInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') authLogin();
  });

  var passInput = document.getElementById('auth-pass');
  if (passInput) passInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') authLogin();
  });

  var regEmail = document.getElementById('reg-email');
  if (regEmail) regEmail.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') authRegister();
  });

  var regPass = document.getElementById('reg-pass');
  if (regPass) regPass.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') authRegister();
  });

  // ── Register with registry (deferred to DOMContentLoaded so TRACE_REGISTRY exists) ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('auth', {
      version: '1.0.0',
      dependsOn: ['utils'],
      init: function() { TRACE_AUTH.init(); }
    });
  }
});

console.log('[TRACE Auth Client] Loaded');
