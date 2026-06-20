// ══════════════════════════════════════════════
// TRACE — Service Worker v2 (PWA Offline-First)
// Cache-first for static assets
// Network-first for API calls
// Background sync for offline mutations
// ══════════════════════════════════════════════

var STATIC_CACHE = 'trace-static-v2';
var DYNAMIC_CACHE = 'trace-dynamic-v2';
var CACHE_MAX_ITEMS = 50;
var API_PATTERNS = ['/api/', '/analyse', '/events'];

// ── Static assets to pre-cache on install ──
var PRECACHE_URLS = [
  '/trace.html',
  '/trace.css',
  '/trace.html',
  '/src/utils.js',
  '/src/tiers.js',
  '/src/persistence.js',
  '/src/nav.js',
  '/src/intro.js',
  '/src/scan.js',
  '/src/results.js',
  '/src/timeline.js',
  '/src/cases.js',
  '/src/chat.js',
  '/src/viewer.js',
  '/src/hw.js',
  '/src/registry.js',
  '/src/correlation.js',
  '/src/vision.js',
  '/src/export.js',
  '/src/app.js',
  '/src/offline.js',
  '/src/idb.js',    '/src/ai-config.js',    '/src/sync.js',
    '/src/investigation.js',
  '/src/knowledge.js',
  '/src/upload.js',
  '/lib/d3.v7.min.js',
  '/trace_subscription.js',
  '/manifest.json'
];

// ── INSTALL: Pre-cache all static assets ──
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return cache.addAll(PRECACHE_URLS).catch(function(err) {
        // Individual URLs may 404 (e.g. offline.js before it exists) —
        // that's ok, we cache what we can
        console.warn('[TRACE SW] Pre-cache warning:', err.message);
      });
    })
  );
});

// ── ACTIVATE: Clean old caches, claim all clients ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    Promise.all([
      // Remove old cache versions
      caches.keys().then(function(cacheNames) {
        return Promise.all(
          cacheNames.filter(function(name) {
            return name !== STATIC_CACHE && name !== DYNAMIC_CACHE;
          }).map(function(name) {
            return caches.delete(name);
          })
        );
      }),
      // Claim all clients immediately so the SW controls all pages
      self.clients.claim()
    ])
  );
});

// ── HELPERS ──

function isApiRequest(url) {
  return API_PATTERNS.some(function(pattern) {
    return url.indexOf(pattern) >= 0;
  });
}

function isStaticAsset(url) {
  var ext = url.split('?')[0].split('.').pop().toLowerCase();
  return ['html', 'js', 'css', 'json', 'svg', 'woff', 'woff2', 'ttf', 'png', 'jpg', 'jpeg', 'gif', 'ico'].indexOf(ext) >= 0
    && !isApiRequest(url)
    && url.indexOf('cdnjs.cloudflare.com') < 0
    && url.indexOf('fonts.googleapis.com') < 0
    && url.indexOf('fonts.gstatic.com') < 0;
}

function limitCacheSize(cache, maxItems) {
  cache.keys().then(function(keys) {
    if (keys.length > maxItems) {
      // Delete oldest entries
      var toDelete = keys.slice(0, keys.length - maxItems);
      return Promise.all(toDelete.map(function(key) { return cache.delete(key); }));
    }
  });
}

// ── FETCH: Strategy per request type ──

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = request.url;

  // Only handle GET requests
  if (request.method !== 'GET') {
    // For non-GET requests to our API, try network but don't cache
    if (isApiRequest(url)) {
      event.respondWith(fetch(request).catch(function() {
        return new Response(JSON.stringify({ error: 'You are offline. This action will be queued.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }));
    }
    return;
  }

  // ── Static assets: Cache-first ──
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(function(cached) {
        if (cached) return cached;
        // Not in cache — fetch from network
        return fetch(request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(STATIC_CACHE).then(function(cache) {
              cache.put(request, clone);
              limitCacheSize(cache, CACHE_MAX_ITEMS);
            });
          }
          return response;
        }).catch(function() {
          // Offline and not cached — fallback
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // ── Cross-origin fonts & CDN: Cache-first, network-update ──
  if (url.indexOf('fonts.googleapis.com') >= 0 ||
      url.indexOf('fonts.gstatic.com') >= 0 ||
      url.indexOf('cdnjs.cloudflare.com') >= 0) {
    event.respondWith(
      caches.match(request).then(function(cached) {
        var fetchPromise = fetch(request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(function(cache) {
              cache.put(request, clone);
            });
          }
          return response;
        }).catch(function() {
          return cached;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // ── API requests (including /analyse): Network-first, cache fallback ──
  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).then(function(response) {
        // Cache successful API responses for offline use
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(function(cache) {
            cache.put(request, clone);
            limitCacheSize(cache, CACHE_MAX_ITEMS);
          });
        }
        return response;
      }).catch(function() {
        // Offline — serve cached API response if available
        return caches.match(request).then(function(cached) {
          if (cached) return cached;
          return new Response(JSON.stringify({
            error: 'offline',
            message: 'You are offline. Cached data shown.',
            offline: true
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // ── Everything else: Network-first, cache fallback ──
  event.respondWith(
    fetch(request).then(function(response) {
      if (response && response.status === 200 && url.indexOf(location.origin) === 0) {
        var clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(function(cache) {
          cache.put(request, clone);
        });
      }
      return response;
    }).catch(function() {
      return caches.match(request).then(function(cached) {
        return cached || new Response('Offline', { status: 503 });
      });
    })
  );
});

// ── BACKGROUND SYNC: Process queued offline mutations ──

self.addEventListener('sync', function(event) {
  if (event.tag === 'trace-sync') {
    event.waitUntil(processSyncQueue());
  }
});

function processSyncQueue() {
  // Open IndexedDB to read the sync queue
  return openSyncDB().then(function(db) {
    return readQueue(db).then(function(entries) {
      if (!entries || entries.length === 0) return;
      return processEntries(db, entries);
    });
  }).catch(function() {
    // Sync queue may not exist yet — no-op
  });
}

function openSyncDB() {
  return new Promise(function(resolve, reject) {
    var open = indexedDB.open('trace-sync-queue', 1);
    open.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('pending')) {
        db.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
      }
    };
    open.onsuccess = function(e) { resolve(e.target.result); };
    open.onerror = function() { reject(); };
  });
}

function readQueue(db) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('pending', 'readonly');
    var store = tx.objectStore('pending');
    var all = store.getAll();
    all.onsuccess = function() { resolve(all.result); };
    all.onerror = function() { reject(); };
  });
}

function processEntries(db, entries) {
  // Process each queued operation sequentially
  return entries.reduce(function(promise, entry) {
    return promise.then(function() {
      return executeQueuedOp(entry).then(function() {
        // Remove from queue on success
        return removeFromQueue(db, entry.id);
      }).catch(function() {
        // Keep in queue for next sync attempt — but log failure
        console.warn('[TRACE SW] Sync failed for entry', entry.id, entry.type);
      });
    });
  }, Promise.resolve());
}

function executeQueuedOp(entry) {
  return fetch(entry.url, {
    method: entry.method || 'POST',
    headers: entry.headers || { 'Content-Type': 'application/json' },
    body: entry.body ? JSON.stringify(entry.body) : undefined
  }).then(function(resp) {
    if (!resp.ok) throw new Error('Sync failed: ' + resp.status);
  });
}

function removeFromQueue(db, id) {
  return new Promise(function(resolve, reject) {
    var tx = db.transaction('pending', 'readwrite');
    var store = tx.objectStore('pending');
    store.delete(id);
    tx.oncomplete = function() { resolve(); };
    tx.onerror = function() { reject(); };
  });
}

// ── MESSAGE FROM CLIENT: Queue an operation for background sync ──

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'queue-sync') {
    var data = event.data;
    openSyncDB().then(function(db) {
      var tx = db.transaction('pending', 'readwrite');
      var store = tx.objectStore('pending');
      store.add({
        url: data.url,
        method: data.method || 'POST',
        headers: data.headers || { 'Content-Type': 'application/json' },
        body: data.body,
        type: data.opType || 'unknown',
        timestamp: Date.now()
      });
    }).catch(function() {});
  }

  // Skip waiting on demand
  if (event.data && event.data.type === 'skip-waiting') {
    self.skipWaiting();
  }
});
