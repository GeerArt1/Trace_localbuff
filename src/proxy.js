/**
 * TRACE — Railway API Proxy Module
 * Connects frontend to Railway-hosted analysis backend
 * Falls back to localStorage demo data when no URL configured
 * Version 1.0.0
 */

window.TRACE = window.TRACE || {};
window.TRACE.Proxy = {
  version: "1.0.0",

  STORAGE_KEY: "trace_hq_railway",

  // Get configured Railway URL
  getUrl: function() {
    try {
      return localStorage.getItem(this.STORAGE_KEY) || "";
    } catch (e) {
      return "";
    }
  },

  // Save Railway URL
  saveUrl: function(url) {
    try {
      localStorage.setItem(this.STORAGE_KEY, url);
      return true;
    } catch (e) {
      return false;
    }
  },

  // Check if configured
  isConfigured: function() {
    var url = this.getUrl();
    return !!(url && url.length > 0 && url.indexOf("http") === 0);
  },

  // Health check against the Railway proxy
  healthCheck: function() {
    var url = this.getUrl();
    if (!url) {
      return Promise.resolve({
        status: "not_configured",
        message: "No Railway URL configured. Set one in Settings > API Proxy."
      });
    }
    return fetch(url + "/health", { method: "GET", mode: "cors" })
      .then(function(res) {
        if (res.ok) return { status: "healthy", message: "Proxy is online" };
        return { status: "error", message: "Health check returned " + res.status };
      })
      .catch(function(err) {
        return { status: "unreachable", message: "Cannot reach proxy: " + err.message };
      });
  },

  // Analyse artwork via Railway proxy
  analyzeImage: function(imageData) {
    var url = this.getUrl();
    if (!url) {
      return Promise.resolve(this._demoAnalyze(imageData));
    }
    return fetch(url + "/analyse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imageData })
    })
      .then(function(res) { return res.json(); })
      .catch(function(err) {
        console.warn("Proxy analyze failed, falling back to demo:", err.message);
        return this._demoAnalyze(imageData);
      }.bind(this));
  },

  // Query external databases via proxy
  queryDatabase: function(db, query) {
    var url = this.getUrl();
    if (!url) {
      return Promise.resolve(this._demoQuery(db, query));
    }
    return fetch(url + "/api/databases?db=" + encodeURIComponent(db) + "&q=" + encodeURIComponent(query))
      .then(function(res) { return res.json(); })
      .catch(function(err) {
        console.warn("Proxy query failed, falling back to demo:", err.message);
        return this._demoQuery(db, query);
      }.bind(this));
  },

  // Handle API errors gracefully
  callWithFallback: function(endpoint, params, demoFn) {
    var url = this.getUrl();
    if (!url) {
      return Promise.resolve(demoFn(params));
    }
    return fetch(url + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    })
      .then(function(res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(function(err) {
        console.warn("Proxy call to " + endpoint + " failed:", err.message);
        return demoFn(params);
      });
  },

  // Demo fallback for analyze
  _demoAnalyze: function(imageData) {
    return {
      demo: true,
      message: "Demo mode - no Railway proxy configured",
      title: (imageData && imageData.title) || "Unknown Artwork",
      artist: (imageData && imageData.artist) || "Unknown",
      period: "17th century",
      media_type: "oil on canvas",
      confidence: 0.75,
      analysis: {
        composition: "Balanced pyramidal composition typical of Baroque period",
        attribution: "Style consistent with workshop of " + ((imageData && imageData.artist) || "the period"),
        condition: "Moderate craquelure, minor retouching in upper-left quadrant",
        notes: ["No signature visible", "Provenance gap detected: 1795-1820", "Frame is 19th century replacement"]
      }
    };
  },

  // Demo fallback for database query
  _demoQuery: function(db, query) {
    return {
      demo: true,
      message: "Demo mode - no Railway proxy configured",
      database: db,
      query: query,
      results: [
        { source: db, label: query + " (simulated result 1)", confidence: "simulated" },
        { source: db, label: query + " (simulated result 2)", confidence: "simulated" }
      ]
    };
  },

  // Render proxy status
  renderStatus: function() {
    var url = this.getUrl();
    if (!url) {
      return "<div style=\"padding:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:4px;font-size:11px;color:#EF4444;\">" +
        "\u26a0 No Railway proxy configured. Set URL in Settings or use demo mode.</div>";
    }
    return "<div style=\"padding:10px;background:rgba(90,170,120,0.1);border:1px solid rgba(90,170,120,0.3);border-radius:4px;font-size:11px;color:#5AAA78;\">" +
      "\u2713 Proxy configured: <span style=\"font-family:monospace;color:#C0B090;\">" + url + "</span></div>";
  }
};

if (window.TRACE && window.TRACE.Registry) {
  window.TRACE.Registry.register("proxy", window.TRACE.Proxy);
}
