// ══════════════════════════════════════════════
// TRACE — IndexedDB Store v1.0
// Primary persistence layer for all app data
// Falls back to localStorage when IndexedDB unavailable
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var DB_NAME = 'trace-store-v1';
  var DB_VERSION = 1;
  var DB = null;
  var _ready = false;

  // ── Schema ──
  var STORES = {
    timelines: { keyPath: 'title' },
    cases: { keyPath: 'title' },
    results: { keyPath: 'id' },
    sync_queue: { keyPath: 'id' },
    bookmarks: { keyPath: 'title' },
    annotations: { keyPath: 'caseTitle' },
    settings: { keyPath: 'key' }
  };

  function openDB() {
    return new Promise(function(resolve, reject) {
      if (DB) return resolve(DB);
      var open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = function(e) {
        var db = e.target.result;
        Object.keys(STORES).forEach(function(name) {
          if (!db.objectStoreNames.contains(name)) {
            var cfg = STORES[name];
            db.createObjectStore(name, { keyPath: cfg.keyPath });
          }
        });
      };
      open.onsuccess = function(e) {
        DB = e.target.result;
        DB.onversionchange = function() { DB.close(); };
        _ready = true;
        resolve(DB);
      };
      open.onerror = function() {
        _ready = false;
        reject(new Error('IndexedDB unavailable'));
      };
    });
  }

  function getStore(name, mode) {
    if (!DB) throw new Error('DB not open');
    var tx = DB.transaction(name, mode || 'readonly');
    return tx.objectStore(name);
  }

  // ── Public API ──

  window.IDB = {
    ready: function() { return _ready; },

    init: function() {
      return openDB().then(function() {
        console.log('[IDB] Store ready — ' + Object.keys(STORES).length + ' object stores');
        return true;
      }).catch(function(err) {
        console.warn('[IDB] Unavailable:', err.message, '— using localStorage fallback');
        return false;
      });
    },

    // ── CRUD ──

    put: function(store, data) {
      return new Promise(function(resolve, reject) {
        openDB().then(function(db) {
          var tx = db.transaction(store, 'readwrite');
          var s = tx.objectStore(store);
          var req = s.put(data);
          req.onsuccess = function() { resolve(req.result); };
          req.onerror = function() { reject(req.error); };
        }).catch(reject);
      });
    },

    get: function(store, key) {
      return new Promise(function(resolve, reject) {
        openDB().then(function(db) {
          var tx = db.transaction(store, 'readonly');
          var s = tx.objectStore(store);
          var req = s.get(key);
          req.onsuccess = function() { resolve(req.result); };
          req.onerror = function() { reject(req.error); };
        }).catch(reject);
      });
    },

    getAll: function(store) {
      return new Promise(function(resolve, reject) {
        openDB().then(function(db) {
          var tx = db.transaction(store, 'readonly');
          var s = tx.objectStore(store);
          var req = s.getAll();
          req.onsuccess = function() { resolve(req.result || []); };
          req.onerror = function() { reject(req.error); };
        }).catch(function() { resolve([]); });
      });
    },

    delete: function(store, key) {
      return new Promise(function(resolve, reject) {
        openDB().then(function(db) {
          var tx = db.transaction(store, 'readwrite');
          var s = tx.objectStore(store);
          var req = s.delete(key);
          req.onsuccess = function() { resolve(); };
          req.onerror = function() { reject(req.error); };
        }).catch(reject);
      });
    },

    clear: function(store) {
      return new Promise(function(resolve, reject) {
        openDB().then(function(db) {
          var tx = db.transaction(store, 'readwrite');
          var s = tx.objectStore(store);
          var req = s.clear();
          req.onsuccess = function() { resolve(); };
          req.onerror = function() { reject(req.error); };
        }).catch(reject);
      });
    },

    // ── Convenience wrappers for timelines ──

    saveTimeline: function(data) {
      data.savedAt = data.savedAt || Date.now();
      return this.put('timelines', data);
    },

    loadAllTimelines: function() {
      return this.getAll('timelines').then(function(list) {
        var map = {};
        list.forEach(function(t) { map[t.title] = t; });
        return map;
      });
    },

    deleteTimeline: function(title) {
      return this.delete('timelines', title);
    },

    // ── Sync queue ──

    queueSyncOp: function(op) {
      op.id = op.id || Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      op.timestamp = op.timestamp || Date.now();
      return this.put('sync_queue', op);
    },

    getSyncQueue: function() {
      return this.getAll('sync_queue');
    },

    removeSyncOp: function(id) {
      return this.delete('sync_queue', id);
    },

    clearSyncQueue: function() {
      return this.clear('sync_queue');
    },

    // ── Migration from localStorage ──

    migrateFromLocalStorage: function() {
      var migrated = 0;
      return this._migrateTimelines().then(function(count) { migrated += count; return migrated; });
    },

    _migrateTimelines: function() {
      var self = this;
      try {
        var raw = localStorage.getItem('trace_timelines');
        if (!raw) return Promise.resolve(0);
        var data = JSON.parse(raw);
        var keys = Object.keys(data);
        if (keys.length === 0) return Promise.resolve(0);
        var promises = keys.map(function(k) {
          var t = data[k];
          return self.put('timelines', {
            title: t.title || k,
            sub: t.sub || '',
            type: t.type || 'artwork',
            events: Array.isArray(t.events) ? t.events : [],
            artist: t.artist || '',
            period: t.period || '',
            savedAt: t.savedAt || Date.now()
          });
        });
        return Promise.all(promises).then(function() { return keys.length; });
      } catch (e) { return Promise.resolve(0); }
    }
  };

  // Auto-init on load
  window.IDB.init();

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('idb', {
      version: '1.0.0',
      dependsOn: []
    });
  }

  console.log('[IDB] Module loaded');
})();
