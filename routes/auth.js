// ══════════════════════════════════════════════
// TRACE — User Authentication
// Email + password registration and login
// Sessions managed via HMAC-signed tokens
// ══════════════════════════════════════════════

const crypto = require('crypto');
const { sendJSON, logError, generateCsrfToken } = require('./helpers');

module.exports = function(ctx) {
  const { db, subscriptions, errorLog } = ctx;

  // ── Auth secret — auto-generated if not set ──
  const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
  const TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

  // ── Per-email login rate limiter (5 attempts/email/min) ──
  const loginRateLimits = new Map();

  function checkLoginRateLimit(email) {
    var now = Date.now();
    var entry = loginRateLimits.get(email);
    if (!entry || now > entry.resetAt) {
      loginRateLimits.set(email, { count: 1, resetAt: now + 60000 });
      return true;
    }
    entry.count++;
    return entry.count <= 5;
  }

  function resetLoginRateLimit(email) {
    loginRateLimits.delete(email);
  }

  // Clean up expired entries every 5 minutes
  setInterval(function() {
    var now = Date.now();
    loginRateLimits.forEach(function(entry, email) {
      if (now > entry.resetAt) loginRateLimits.delete(email);
    });
  }, 300000);

  // ── Per-IP registration rate limiter (3 registrations/IP/min) ──
  const registerRateLimits = new Map();

  function checkRegisterRateLimit(ip) {
    var now = Date.now();
    var entry = registerRateLimits.get(ip);
    if (!entry || now > entry.resetAt) {
      registerRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
      return true;
    }
    entry.count++;
    return entry.count <= 10;
  }

  // Clean up expired registration limits every 5 minutes
  setInterval(function() {
    var now = Date.now();
    registerRateLimits.forEach(function(entry, ip) {
      if (now > entry.resetAt) registerRateLimits.delete(ip);
    });
  }, 300000);

  // ── In-memory user store (mirrored to DB) ──
  // Structure: { email: { email, passwordHash, name, tier, createdAt } }
  let users = {};

  function loadUsers() {
    try {
      var loaded = db.loadAllUsers ? db.loadAllUsers() : {};
      users = loaded;
    } catch(e) {
      users = {};
    }
  }

  function saveUser(email, data) {
    users[email] = data;
    try {
      if (db.saveUser) db.saveUser(email, data);
    } catch(e) {
      logError(e, 'Saving user');
    }
  }

  // ── Password hashing with PBKDF2 (no bcrypt dependency needed) ──
  function hashPassword(password) {
    var salt = crypto.randomBytes(16).toString('hex');
    var hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return salt + ':' + hash;
  }

  function verifyPassword(password, stored) {
    var parts = stored.split(':');
    var salt = parts[0];
    var hash = parts[1];
    var verify = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hash === verify;
  }

  // ── Token generation (HMAC-signed, same pattern as subscription tokens) ──
  function signToken(payload) {
    var header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    var body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    var signature = crypto.createHmac('sha256', AUTH_SECRET).update(header + '.' + body).digest('base64url');
    return header + '.' + body + '.' + signature;
  }

  function verifyToken(token) {
    try {
      var parts = token.split('.');
      if (parts.length !== 3) return null;
      var expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
      if (parts[2] !== expectedSig) return null;
      var payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      if (payload.exp && Date.now() > payload.exp) return null;
      return payload;
    } catch(e) {
      return null;
    }
  }

  // ── Route handlers ──

  function handleRegister(req, res, body) {
    try {
      var data = JSON.parse(body);
      var email = (data.email || '').trim().toLowerCase();
      var password = data.password || '';
      var name = (data.name || '').trim() || email.split('@')[0];

      // Per-IP registration rate limiting
      var clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
      if (!checkRegisterRateLimit(clientIp)) {
        return sendJSON(res, 429, { error: 'Too many registrations from this IP. Try again later.' });
      }

      // Validate
      if (!email || !password) {
        return sendJSON(res, 400, { error: 'Email and password required' });
      }
      if (password.length < 8) {
        return sendJSON(res, 400, { error: 'Password must be at least 8 characters' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJSON(res, 400, { error: 'Invalid email address' });
      }
      if (users[email]) {
        return sendJSON(res, 409, { error: 'An account with this email already exists' });
      }

      var passwordHash = hashPassword(password);
      var userData = {
        email: email,
        passwordHash: passwordHash,
        name: name,
        tier: 'discover', // Always starts at Discover tier — upgrade via payment
        createdAt: Date.now()
      };

      saveUser(email, userData);

      // Generate session token
      var token = signToken({
        sub: email,
        name: name,
        tier: userData.tier,
        iat: Date.now(),
        exp: Date.now() + TOKEN_EXPIRY_MS
      });

      // Generate CSRF token for this session
      var csrfToken = generateCsrfToken(token);
      res.setHeader('x-csrf-token', csrfToken);

      sendJSON(res, 201, {
        ok: true,
        token: token,
        csrfToken: csrfToken,
        user: { email: email, name: name, tier: userData.tier }
      });
    } catch(e) {
      sendJSON(res, 400, { error: 'Invalid registration: ' + e.message });
    }
  }

  function handleLogin(req, res, body) {
    try {
      var data = JSON.parse(body);
      var email = (data.email || '').trim().toLowerCase();
      var password = data.password || '';

      if (!email || !password) {
        return sendJSON(res, 400, { error: 'Email and password required' });
      }

      // Per-email rate limiting
      if (!checkLoginRateLimit(email)) {
        return sendJSON(res, 429, { error: 'Too many login attempts. Try again in 60 seconds.' });
      }

      var user = users[email];
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return sendJSON(res, 401, { error: 'Invalid email or password' });
      }

      // Successful login — reset rate limit for this email
      resetLoginRateLimit(email);

      var token = signToken({
        sub: email,
        name: user.name,
        tier: user.tier,
        iat: Date.now(),
        exp: Date.now() + TOKEN_EXPIRY_MS
      });

      // Generate CSRF token for this session
      var csrfToken = generateCsrfToken(token);
      res.setHeader('x-csrf-token', csrfToken);

      sendJSON(res, 200, {
        ok: true,
        token: token,
        csrfToken: csrfToken,
        user: { email: email, name: user.name, tier: user.tier }
      });
    } catch(e) {
      sendJSON(res, 400, { error: 'Invalid login: ' + e.message });
    }
  }

  function handleVerify(req, res, body) {
    try {
      var data = JSON.parse(body);
      var token = data.token || '';

      if (!token) {
        return sendJSON(res, 200, { ok: false, authenticated: false });
      }

      var payload = verifyToken(token);
      if (!payload) {
        return sendJSON(res, 200, { ok: false, authenticated: false });
      }

      // Check user still exists
      var user = users[payload.sub];
      if (!user) {
        return sendJSON(res, 200, { ok: false, authenticated: false });
      }

      sendJSON(res, 200, {
        ok: true,
        authenticated: true,
        user: { email: payload.sub, name: payload.name, tier: payload.tier }
      });
    } catch(e) {
      sendJSON(res, 400, { error: 'Verification failed: ' + e.message });
    }
  }

  // ── Middleware: require auth token for protected routes ──
  function requireAuth(req, res) {
    var authHeader = req.headers['authorization'] || '';
    var token = authHeader.replace('Bearer ', '');
    if (!token) {
      sendJSON(res, 401, { error: 'Authentication required' });
      return null;
    }
    var payload = verifyToken(token);
    if (!payload) {
      sendJSON(res, 401, { error: 'Invalid or expired token' });
      return null;
    }
    return payload;
  }

  // ── Bootstrap: load from DB ──
  loadUsers();

  return {
    handleRegister: handleRegister,
    handleLogin: handleLogin,
    handleVerify: handleVerify,
    requireAuth: requireAuth,
    verifyToken: verifyToken,
    getUsers: function() { return users; }
  };
};
