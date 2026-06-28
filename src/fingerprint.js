/**
 * TRACE — Digital Fingerprinting Module v2.0.0
 *
 * Real cryptographic hashing via Web Crypto API (SHA-256).
 * Perceptual image hashing via Canvas API (dHash, pHash).
 * Provider adapter pattern — swap in a backend service for live use.
 *
 * Offline mode: uses crypto.subtle + Canvas (all browser-native, no API keys).
 * Live mode: set _provider to a backend service adapter.
 */

window.TRACE = window.TRACE || {};
window.TRACE.Fingerprint = (function() {
  'use strict';

  var VERSION = '2.0.0';
  var HASH_TYPES = ['dhash', 'phash', 'color_histogram'];
  var _provider = null;

  function setProvider(provider) { _provider = provider; }

  // SHA-256 via Web Crypto API (native in all modern browsers)
  function _sha256(data) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      var encoder = new TextEncoder();
      return crypto.subtle.digest('SHA-256', encoder.encode(data))
        .then(function(buffer) { return _bufToHex(buffer); });
    }
    return Promise.resolve(_simpleHash(data));
  }

  function _bufToHex(buffer) {
    var arr = Array.from(new Uint8Array(buffer));
    return arr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function _simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  // dHash: difference hash — compare adjacent pixels in 9×8 grayscale
  function _computeDHash(pixels, width, height) {
    if (!pixels || width < 2 || height < 1) return _fallbackHash('dhash');
    var gray = _grayscale(pixels, width, height);
    var resized = _resizeBilinear(gray, width, height, 9, 8);
    var hash = '';
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        hash += resized[y * 9 + x] < resized[y * 9 + x + 1] ? '1' : '0';
      }
    }
    return _binToHex(hash);
  }

  // pHash: perceptual hash — 32×32 grayscale, DCT, top-left 8×8
  function _computePHash(pixels, width, height) {
    if (!pixels || width < 2 || height < 1) return _fallbackHash('phash');
    var gray = _grayscale(pixels, width, height);
    var resized = _resizeBilinear(gray, width, height, 32, 32);
    var dct = _simplifiedDCT(resized, 32);
    var topLeft = [];
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        topLeft.push(dct[y * 32 + x]);
      }
    }
    var sorted = topLeft.slice().sort(function(a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    var hash = '';
    for (var i = 0; i < topLeft.length; i++) {
      hash += topLeft[i] > median ? '1' : '0';
    }
    return _binToHex(hash);
  }

  // Color histogram: 16 bins per RGB channel
  function _computeColorHistogram(pixels, width, height) {
    if (!pixels || width < 1 || height < 1) return _fallbackHash('histogram');
    var bins = 16, total = width * height;
    var rHist = new Array(bins).fill(0);
    var gHist = new Array(bins).fill(0);
    var bHist = new Array(bins).fill(0);
    for (var i = 0; i < total; i++) {
      var off = i * 4;
      rHist[Math.floor(pixels[off] / (256 / bins))]++;
      gHist[Math.floor(pixels[off + 1] / (256 / bins))]++;
      bHist[Math.floor(pixels[off + 2] / (256 / bins))]++;
    }
    var result = [];
    for (var j = 0; j < bins; j++) {
      result.push(Math.round((rHist[j] / total) * 255));
      result.push(Math.round((gHist[j] / total) * 255));
      result.push(Math.round((bHist[j] / total) * 255));
    }
    return result.map(function(v) { return v.toString(16).padStart(2, '0'); }).join('');
  }

  function _grayscale(pixels, w, h) {
    var g = new Float64Array(w * h);
    for (var i = 0; i < w * h; i++) {
      var off = i * 4;
      g[i] = 0.299 * pixels[off] + 0.587 * pixels[off + 1] + 0.114 * pixels[off + 2];
    }
    return g;
  }

  function _resizeBilinear(src, sw, sh, dw, dh) {
    var dst = new Float64Array(dw * dh);
    var xr = sw / dw, yr = sh / dh;
    for (var dy = 0; dy < dh; dy++) {
      for (var dx = 0; dx < dw; dx++) {
        var sx = Math.min(dx * xr, sw - 2);
        var sy = Math.min(dy * yr, sh - 2);
        var ix = Math.floor(sx), iy = Math.floor(sy);
        var fx = sx - ix, fy = sy - iy;
        var v00 = src[iy * sw + ix], v01 = src[iy * sw + Math.min(ix + 1, sw - 1)];
        var v10 = src[Math.min(iy + 1, sh - 1) * sw + ix];
        var v11 = src[Math.min(iy + 1, sh - 1) * sw + Math.min(ix + 1, sw - 1)];
        dst[dy * dw + dx] = (1-fx)*(1-fy)*v00 + fx*(1-fy)*v01 + (1-fx)*fy*v10 + fx*fy*v11;
      }
    }
    return dst;
  }

  function _simplifiedDCT(data, N) {
    var r = new Float64Array(N * N);
    for (var u = 0; u < 8; u++) {
      for (var v = 0; v < 8; v++) {
        var s = 0;
        for (var x = 0; x < N; x++) {
          for (var y = 0; y < N; y++) {
            s += data[x * N + y] * Math.cos(((2*x+1)*u*Math.PI)/(2*N)) * Math.cos(((2*y+1)*v*Math.PI)/(2*N));
          }
        }
        r[u * N + v] = s * (u === 0 ? 1 / Math.sqrt(N) : Math.sqrt(2 / N)) * (v === 0 ? 1 / Math.sqrt(N) : Math.sqrt(2 / N));
      }
    }
    return r;
  }

  function _binToHex(bin) {
    var hex = '';
    for (var i = 0; i < bin.length; i += 4) {
      hex += parseInt(bin.substr(i, 4), 2).toString(16);
    }
    return hex;
  }

  function _fallbackHash(type) {
    var h = 0;
    for (var i = 0; i < type.length; i++) {
      h = ((h << 5) - h) + type.charCodeAt(i);
      h |= 0;
    }
    var seed = Math.abs(h).toString(16);
    var result = '';
    for (var j = 0; j < 16; j++) {
      result += seed[j % seed.length];
    }
    return result.padEnd(16, '0');
  }

  // Core generate function
  function generate(input) {
    if (_provider && typeof _provider.generate === 'function') {
      return _provider.generate(input);
    }
    return _generateLocal(input);
  }

  function _generateLocal(input) {
    if (!input) return Promise.resolve(_demoGenerate());

    var fp = {
      fingerprint_id: 'FP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      version: VERSION,
      generated_at: new Date().toISOString(),
      source: input.title || 'Unknown',
      hashTypes: {},
      metadata: {}
    };

    var metaStr = [input.title || '', input.artist || '', input.year || '', input.medium || '', Date.now()].join('|');
    var promises = [];

    promises.push(_sha256(metaStr).then(function(h) { fp.hashTypes.sha256 = h; }));

    var pixelData = null;
    if (input.image_data && input.image_data.data && input.image_data.width && input.image_data.height) {
      pixelData = { pixels: new Uint8ClampedArray(input.image_data.data), width: input.image_data.width, height: input.image_data.height };
    }

    if (pixelData) {
      try {
        fp.hashTypes.dhash = _computeDHash(pixelData.pixels, pixelData.width, pixelData.height);
        fp.hashTypes.phash = _computePHash(pixelData.pixels, pixelData.width, pixelData.height);
        fp.hashTypes.color_histogram = _computeColorHistogram(pixelData.pixels, pixelData.width, pixelData.height);
      } catch(e) {
        fp.hashTypes.dhash = _fallbackHash('dhash');
        fp.hashTypes.phash = _fallbackHash('phash');
        fp.hashTypes.color_histogram = _fallbackHash('histogram');
      }
    } else {
      fp.hashTypes.dhash = _fallbackHash('dhash');
      fp.hashTypes.phash = _fallbackHash('phash');
      fp.hashTypes.color_histogram = _fallbackHash('histogram');
      fp.metadata.note = 'No image pixel data — using deterministic hashes';
    }

    return Promise.all(promises).then(function() {
      fp.hash_string = [fp.hashTypes.dhash, fp.hashTypes.phash, fp.hashTypes.sha256].join(':');
      return fp;
    });
  }

  function provenanceFingerprint(events) {
    if (!events || !events.length) return Promise.resolve(_simpleHash('empty_provenance'));
    var chainStr = events.map(function(e) {
      return (e.date || '') + '|' + (e.event || '') + '|' + (e.party || '');
    }).join('||');
    return _sha256('TRACE_PROVENANCE_' + chainStr);
  }

  function similarity(fp1, fp2) {
    if (!fp1 || !fp2) return 0;
    if (fp1 === fp2) return 1;
    var scores = [];
    var weights = { dhash: 0.35, phash: 0.35, sha256: 0.2, color_histogram: 0.1 };
    HASH_TYPES.concat(['sha256']).forEach(function(type) {
      var h1 = fp1.hashTypes && fp1.hashTypes[type];
      var h2 = fp2.hashTypes && fp2.hashTypes[type];
      if (h1 && h2 && h1.length === h2.length) {
        var dist = _hammingDistance(h1, h2);
        scores.push((1 - dist / (h1.length * 4)) * (weights[type] || 0.25));
      }
    });
    return scores.length ? scores.reduce(function(a, b) { return a + b; }, 0) : 0;
  }

  function _hammingDistance(hex1, hex2) {
    var d = 0;
    for (var i = 0; i < Math.min(hex1.length, hex2.length); i++) {
      var xor = parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16);
      while (xor) { d += xor & 1; xor >>= 1; }
    }
    return d + Math.abs(hex1.length - hex2.length) * 4;
  }

  function verifyAgainstStolen(fp, db, threshold) {
    if (!fp || !db || !db.length) return [];
    threshold = threshold || 0.7;
    var matches = [];
    db.forEach(function(entry, idx) {
      var score = similarity(fp, entry);
      if (score >= threshold) matches.push({ index: idx, entry: entry, similarity: Math.round(score * 1000) / 1000 });
    });
    return matches.sort(function(a, b) { return b.similarity - a.similarity; });
  }

  function render(fp) {
    if (!fp) return '<div style="color:var(--text-dim);font-size:10px;">No fingerprint generated yet.</div>';
    var html = '<div style="font-size:10px;line-height:1.7;">';
    html += '<div style="color:var(--gold);margin-bottom:6px;">ID: ' + fp.fingerprint_id + '</div>';
    html += '<div style="color:var(--text-dim);">Source: ' + (fp.source || 'Unknown') + '</div>';
    html += '<div style="margin-top:6px;padding:6px;background:var(--bg2);border-radius:3px;">';
    var labels = { dhash: 'dHash', phash: 'pHash', sha256: 'SHA-256', color_histogram: 'Color Hist' };
    for (var t in fp.hashTypes) {
      if (fp.hashTypes.hasOwnProperty(t)) {
        html += '<div style="margin:2px 0;"><span style="color:var(--text-mid);">' + (labels[t] || t) + ':</span> ';
        html += '<span style="color:var(--text);font-family:monospace;font-size:9px;">' + fp.hashTypes[t].substr(0, 20) + '...</span></div>';
      }
    }
    html += '</div></div>';
    return html;
  }

  function _demoGenerate() {
    return {
      fingerprint_id: 'DEMO-' + Date.now().toString(36).toUpperCase(),
      version: VERSION, generated_at: new Date().toISOString(), source: 'Demo Mode',
      hashTypes: { dhash: _fallbackHash('dhash'), phash: _fallbackHash('phash'), sha256: _fallbackHash('sha256'), color_histogram: _fallbackHash('histogram') },
      hash_string: _fallbackHash('dhash') + ':' + _fallbackHash('phash') + ':' + _fallbackHash('sha256'),
      metadata: { mode: 'demo' }
    };
  }

  var api = {
    version: VERSION, hashTypes: HASH_TYPES, setProvider: setProvider,
    generate: generate, provenanceFingerprint: provenanceFingerprint,
    similarity: similarity, verifyAgainstStolen: verifyAgainstStolen,
    render: render,
    _sha256: _sha256, _computeDHash: _computeDHash, _computePHash: _computePHash,
    _hammingDistance: _hammingDistance, _demoGenerate: _demoGenerate
  };

  if (window.TRACE.Registry && window.TRACE.Registry.register) {
    window.TRACE.Registry.register('fingerprint', api);
  }
  return api;
})();
