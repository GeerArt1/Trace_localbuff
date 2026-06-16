// ══════════════════════════════════════════════
// TRACE Database Layer — Dual Adapter
// Auto-detects engine from DATABASE_URL:
//   sqlite:///path/to/db.sqlite  → better-sqlite3
//   postgresql://user:pass@host/db → pg
// ══════════════════════════════════════════════

var fs = require('fs');
var path = require('path');

var ENGINE = 'sqlite'; // or 'postgres'
var DB_PATH = process.env.TRACE_DB_PATH || (__dirname + path.sep + 'trace_db.sqlite');
var DB_BAK_PATH = DB_PATH + '.bak';
var DB = null;
var DB_READY = false;

// ── In-memory data caches (mirror DB for read speed) ──
var subCache = {};
var keyCache = {};
var tlCache = {};
var userCache = {};

// ── Parse DATABASE_URL to determine engine ──
var DATABASE_URL = process.env.DATABASE_URL || '';

// ── Initialize the database ──
function init() {
  if (DB_READY) return Promise.resolve();

  if (DATABASE_URL.startsWith('postgresql://') || DATABASE_URL.startsWith('postgres://')) {
    return initPostgres();
  }
  return initSQLite();
}

// ── SQLite (better-sqlite3) ──
function initSQLite() {
  try {
    var Database = require('better-sqlite3');
    DB = new Database(DB_PATH);
    DB.pragma('journal_mode = WAL');
    DB.pragma('synchronous = NORMAL');
    ENGINE = 'sqlite';
    createSchemaSQLite();
    DB_READY = true;
    console.log('[TRACE DB] ✓ SQLite ready — ' + DB_PATH);
    return Promise.resolve();
  } catch (e) {
    console.error('[TRACE DB] SQLite init failed:', e.message);
    return Promise.reject(e);
  }
}

function createSchemaSQLite() {
  DB.exec(
    'CREATE TABLE IF NOT EXISTS subscriptions (' +
    '  license_key TEXT PRIMARY KEY,' +
    '  tier TEXT NOT NULL,' +
    '  owner TEXT NOT NULL,' +
    '  expires_at INTEGER NOT NULL,' +
    '  created_at INTEGER NOT NULL,' +
    '  active INTEGER NOT NULL DEFAULT 1,' +
    '  stripe_session_id TEXT' +
    ');' +

    'CREATE TABLE IF NOT EXISTS license_keys (' +
    '  key TEXT PRIMARY KEY,' +
    '  tier TEXT NOT NULL,' +
    '  expires_at INTEGER NOT NULL,' +
    '  owner TEXT NOT NULL' +
    ');' +

    'CREATE TABLE IF NOT EXISTS timelines (' +
    '  title TEXT PRIMARY KEY,' +
    '  sub TEXT DEFAULT "",' +
    '  type TEXT DEFAULT "artwork",' +
    '  artist TEXT DEFAULT "",' +
    '  period TEXT DEFAULT "",' +
    '  events TEXT DEFAULT "[]",' +
    '  saved_at INTEGER NOT NULL' +
    ');' +

    'CREATE TABLE IF NOT EXISTS meta (' +
    '  key TEXT PRIMARY KEY,' +
    '  value TEXT' +
    ');' +

    'CREATE TABLE IF NOT EXISTS users (' +
    '  email TEXT PRIMARY KEY,' +
    '  password_hash TEXT NOT NULL,' +
    '  name TEXT NOT NULL,' +
    '  tier TEXT NOT NULL DEFAULT "discover",' +
    '  created_at INTEGER NOT NULL' +
    ');'
  );
}

// ── PostgreSQL ──
function initPostgres() {
  return new Promise(function(resolve, reject) {
    try {
      var pg = require('pg');
      var pgUrl = DATABASE_URL;
      // Support both Pool and Client — prefer Pool for production
      var pool = new pg.Pool({ connectionString: pgUrl, max: 10, idleTimeoutMillis: 30000 });
      DB = pool;
      ENGINE = 'postgres';
      console.log('[TRACE DB] ✓ PostgreSQL pool created');

      createSchemaPostgres(pool).then(function() {
        DB_READY = true;
        console.log('[TRACE DB] ✓ PostgreSQL ready');
        resolve();
      }).catch(function(err) {
        console.error('[TRACE DB] PostgreSQL schema creation failed:', err.message);
        reject(err);
      });
    } catch(e) {
      console.error('[TRACE DB] PostgreSQL init failed:', e.message);
      console.error('[TRACE DB] Install with: npm install pg');
      reject(e);
    }
  });
}

function createSchemaPostgres(pool) {
  return pool.query(
    'CREATE TABLE IF NOT EXISTS subscriptions (' +
    '  license_key TEXT PRIMARY KEY,' +
    '  tier TEXT NOT NULL,' +
    '  owner TEXT NOT NULL,' +
    '  expires_at BIGINT NOT NULL,' +
    '  created_at BIGINT NOT NULL,' +
    '  active INTEGER NOT NULL DEFAULT 1,' +
    '  stripe_session_id TEXT' +
    ');'
  ).then(function() {
    return pool.query(
      'CREATE TABLE IF NOT EXISTS license_keys (' +
      '  key TEXT PRIMARY KEY,' +
      '  tier TEXT NOT NULL,' +
      '  expires_at BIGINT NOT NULL,' +
      '  owner TEXT NOT NULL' +
      ');'
    );
  }).then(function() {
    return pool.query(
      'CREATE TABLE IF NOT EXISTS timelines (' +
      '  title TEXT PRIMARY KEY,' +
      '  sub TEXT DEFAULT \'\',' +
      '  type TEXT DEFAULT \'artwork\',' +
      '  artist TEXT DEFAULT \'\',' +
      '  period TEXT DEFAULT \'\',' +
      '  events TEXT DEFAULT \'[]\',' +
      '  saved_at BIGINT NOT NULL' +
      ');'
    );
  }).then(function() {
    return pool.query(
      'CREATE TABLE IF NOT EXISTS meta (' +
      '  key TEXT PRIMARY KEY,' +
      '  value TEXT' +
      ');'
    );
  }).then(function() {
    return pool.query(
      'CREATE TABLE IF NOT EXISTS users (' +
      '  email TEXT PRIMARY KEY,' +
      '  password_hash TEXT NOT NULL,' +
      '  name TEXT NOT NULL,' +
      '  tier TEXT NOT NULL DEFAULT \'discover\',' +
      '  created_at BIGINT NOT NULL' +
      ');'
    );
  });
}

function isPromise(v) {
  return v && typeof v.then === 'function';
}

// ── Low-level helpers ──

function execQuery(sql, params) {
  if (!DB) return;
  if (ENGINE === 'postgres') {
    DB.query(sql, params || []).catch(function(e) {
      console.warn('[TRACE DB] Query error:', e.message.slice(0, 120));
    });
    return;
  }
  try {
    DB.prepare(sql).run(params || []);
  } catch(e) {
    if (sql.trim().toUpperCase().startsWith('CREATE TABLE')) return;
    console.warn('[TRACE DB] Query error:', e.message.slice(0, 120));
  }
}

function queryAll(sql, params) {
  if (!DB) return [];
  if (ENGINE === 'postgres') {
    return DB.query(sql, params || []).then(function(r) { return r.rows; }).catch(function() { return []; });
  }
  try {
    return DB.prepare(sql).all(params || []);
  } catch(e) {
    return [];
  }
}

function queryGet(sql, params) {
  if (!DB) return undefined;
  if (ENGINE === 'postgres') {
    return DB.query(sql + ' LIMIT 1', params || []).then(function(r) { return r.rows[0]; }).catch(function() { return undefined; });
  }
  try {
    return DB.prepare(sql).get(params || []);
  } catch(e) {
    return undefined;
  }
}

// ── Backup on every write (lightweight — just copies the file) ──
function backup() {
  try {
    fs.copyFileSync(DB_PATH, DB_BAK_PATH);
  } catch(e) {
    // Backup failure is non-fatal
  }
}

// ── Subscription Operations ──

function loadAllSubscriptions() {
  subCache = {};
  keyCache = {};

  function processRows(rows) {
    rows.forEach(function(r) {
      subCache[r.license_key] = {
        tier: r.tier,
        owner: r.owner,
        licenseKey: r.license_key,
        expiresAt: r.expires_at,
        createdAt: r.created_at,
        active: !!r.active,
        stripeSessionId: r.stripe_session_id
      };
    });
  }

  function processKeys(keys) {
    keys.forEach(function(r) {
      keyCache[r.key] = { tier: r.tier, expiresAt: r.expires_at, owner: r.owner };
    });
  }

  var rows = queryAll('SELECT * FROM subscriptions');
  if (isPromise(rows)) {
    return rows.then(function(r) {
      processRows(r);
      var keys = queryAll('SELECT * FROM license_keys');
      return isPromise(keys) ? keys.then(function(k) { processKeys(k); return { subscriptions: subCache, licenseKeys: keyCache }; }) : (processKeys(keys), { subscriptions: subCache, licenseKeys: keyCache });
    });
  }
  processRows(rows);
  var keys = queryAll('SELECT * FROM license_keys');
  processKeys(keys);
  return { subscriptions: subCache, licenseKeys: keyCache };
}

function saveSubscription(sub) {
  subCache[sub.licenseKey] = sub;
  execQuery(
    'INSERT OR REPLACE INTO subscriptions ' +
    '(license_key, tier, owner, expires_at, created_at, active, stripe_session_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [sub.licenseKey, sub.tier, sub.owner,
     sub.expiresAt || 0, sub.createdAt || Date.now(),
     sub.active ? 1 : 0,
     sub.stripeSessionId || null]
  );
  backup();
}

function deleteSubscription(licenseKey) {
  delete subCache[licenseKey];
  delete keyCache[licenseKey];
  execQuery('DELETE FROM subscriptions WHERE license_key = ?', [licenseKey]);
  execQuery('DELETE FROM license_keys WHERE key = ?', [licenseKey]);
  backup();
}

function saveLicenseKey(key, data) {
  keyCache[key] = data;
  execQuery(
    'INSERT OR REPLACE INTO license_keys (key, tier, expires_at, owner) VALUES (?, ?, ?, ?)',
    [key, data.tier, data.expiresAt || 0, data.owner || '']
  );
  backup();
}

// ── Timeline Operations ──

function loadAllTimelines() {
  tlCache = {};

  function processRows(rows) {
    rows.forEach(function(r) {
      var events = [];
      try { events = JSON.parse(r.events || '[]'); } catch(e) {}
      tlCache[r.title] = {
        title: r.title,
        sub: r.sub || '',
        type: r.type || 'artwork',
        artist: r.artist || '',
        period: r.period || '',
        events: events,
        savedAt: r.saved_at || 0
      };
    });
  }

  var rows = queryAll('SELECT * FROM timelines');
  if (isPromise(rows)) {
    return rows.then(function(r) { processRows(r); return tlCache; });
  }
  processRows(rows);
  return tlCache;
}

function saveTimeline(timeline) {
  tlCache[timeline.title] = timeline;
  execQuery(
    'INSERT OR REPLACE INTO timelines (title, sub, type, artist, period, events, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [timeline.title || '', timeline.sub || '', timeline.type || 'artwork',
     timeline.artist || '', timeline.period || '',
     JSON.stringify(timeline.events || []),
     timeline.savedAt || Date.now()]
  );
  backup();
}

function deleteTimeline(title) {
  delete tlCache[title];
  execQuery('DELETE FROM timelines WHERE title = ?', [title]);
  backup();
}

// ── Migration from JSON files ──

function migrateFromJson() {
  var STATIC_DIR = __dirname + path.sep;

  function doMigration() {
    var migratedCount = 0;

    // Migrate subscriptions
    var subPath = path.join(STATIC_DIR, '.subscriptions.json');
    try {
      if (fs.existsSync(subPath)) {
        var raw = fs.readFileSync(subPath, 'utf-8').trim();
        if (raw) {
          var data = JSON.parse(raw);
          if (data.subscriptions) {
            Object.keys(data.subscriptions).forEach(function(key) {
              var s = data.subscriptions[key];
              saveSubscription({
                licenseKey: key,
                tier: s.tier, owner: s.owner,
                expiresAt: s.expiresAt, createdAt: s.createdAt,
                active: s.active !== false,
                stripeSessionId: s.stripeSessionId
              });
              migratedCount++;
            });
          }
          if (data.licenseKeys) {
            Object.keys(data.licenseKeys).forEach(function(key) {
              saveLicenseKey(key, data.licenseKeys[key]);
            });
          }
        }
      }
    } catch(e) {
      console.warn('[TRACE DB] Subscription migration:', e.message);
    }

    // Migrate timelines
    var tlPath = path.join(STATIC_DIR, '.timelines.json');
    try {
      if (fs.existsSync(tlPath)) {
        var raw2 = fs.readFileSync(tlPath, 'utf-8').trim();
        if (raw2) {
          var data2 = JSON.parse(raw2);
          if (data2.timelines) {
            Object.keys(data2.timelines).forEach(function(key) {
              var t = data2.timelines[key];
              saveTimeline({
                title: t.title || key, sub: t.sub || '',
                type: t.type || 'artwork', artist: t.artist || '',
                period: t.period || '', events: t.events || [],
                savedAt: t.savedAt || Date.now()
              });
              migratedCount++;
            });
          }
        }
      }
    } catch(e) {
      console.warn('[TRACE DB] Timeline migration:', e.message);
    }

    execQuery('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['migrated_from_json', 'true']);

    if (migratedCount > 0) {
      console.log('[TRACE DB] ✓ Migrated ' + migratedCount + ' records from JSON files');
    }
  }

  var row = queryGet('SELECT value FROM meta WHERE key = ?', ['migrated_from_json']);
  if (isPromise(row)) {
    return row.then(function(r) {
      if (r && r.value === 'true') {
        console.log('[TRACE DB] Already migrated from JSON');
        return;
      }
      doMigration();
    });
  }
  if (row && row.value === 'true') {
    console.log('[TRACE DB] Already migrated from JSON');
    return;
  }
  doMigration();
}

// ── User operations ──

function loadAllUsers() {
  userCache = {};

  function processRows(rows) {
    rows.forEach(function(r) {
      userCache[r.email] = {
        email: r.email,
        passwordHash: r.password_hash,
        name: r.name,
        tier: r.tier,
        createdAt: r.created_at
      };
    });
  }

  var rows = queryAll('SELECT * FROM users');
  if (isPromise(rows)) {
    return rows.then(function(r) { processRows(r); return userCache; });
  }
  processRows(rows);
  return userCache;
}

function saveUser(email, data) {
  userCache[email] = data;
  if (ENGINE === 'postgres') {
    DB.query(
      'INSERT INTO users (email, password_hash, name, tier, created_at) VALUES ($1, $2, $3, $4, $5) ' +
      'ON CONFLICT (email) DO UPDATE SET password_hash = $2, name = $3, tier = $4',
      [email, data.passwordHash, data.name, data.tier, data.createdAt]
    ).catch(function(e) {
      console.warn('[TRACE DB] User save error:', e.message.slice(0, 120));
    });
    return;
  }
  execQuery(
    'INSERT OR REPLACE INTO users (email, password_hash, name, tier, created_at) VALUES (?, ?, ?, ?, ?)',
    [email, data.passwordHash, data.name, data.tier, data.createdAt]
  );
}

// ── Public API ──
module.exports = {
  init: init,
  isReady: function() { return DB_READY; },
  getEngine: function() {
    return ENGINE === 'postgres' ? 'postgresql' : 'better-sqlite3';
  },

  // Subscription ops
  loadAllSubscriptions: loadAllSubscriptions,
  saveSubscription: saveSubscription,
  deleteSubscription: deleteSubscription,
  saveLicenseKey: saveLicenseKey,

  // Timeline ops
  loadAllTimelines: loadAllTimelines,
  saveTimeline: saveTimeline,
  deleteTimeline: deleteTimeline,

  // User ops
  loadAllUsers: loadAllUsers,
  saveUser: saveUser,

  // Migration
  migrateFromJson: migrateFromJson,

  // Path info (for server debug/metrics)
  getDbPath: function() { return DB_PATH; },
  getBakPath: function() { return DB_BAK_PATH; },

  // Flush is a no-op now — better-sqlite3 writes synchronously
  flush: function() { /* better-sqlite3 is always synced */ },

  // Direct cache access (for compatibility with existing Map-based code)
  getSubCache: function() { return subCache; },
  getKeyCache: function() { return keyCache; },
  getTlCache: function() { return tlCache; }
};

console.log('[TRACE DB] Module loaded — better-sqlite3');
