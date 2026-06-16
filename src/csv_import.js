// ══════════════════════════════════════════════
// TRACE — Getty CSV Import
// ══════════════════════════════════════════════
// Parses Getty Provenance Index CSV files and stores
// entries in localStorage for cross-referencing.
// ──
// Expected CSV columns (Getty Provenance Index format):
//   Title,Artist,ArtistBirth,ArtistDeath,Year,Medium,
//   CurrentLocation,Provenance,GPIReference,ULAN_ID

/** @type {Array} In-memory cache of imported CSV records */
window._gettyCSVRecords = null;

/**
 * Load imported CSV records from localStorage
 * @returns {Array}
 */
window.loadGettyCSVRecords = function loadGettyCSVRecords() {
  if (window._gettyCSVRecords) return window._gettyCSVRecords;
  try {
    var raw = localStorage.getItem('trace_getty_csv');
    window._gettyCSVRecords = raw ? JSON.parse(raw) : [];
  } catch(e) {
    window._gettyCSVRecords = [];
  }
  return window._gettyCSVRecords;
};

/**
 * Save CSV records to localStorage
 * @param {Array} records
 */
window.saveGettyCSVRecords = function saveGettyCSVRecords(records) {
  window._gettyCSVRecords = records;
  try {
    localStorage.setItem('trace_getty_csv', JSON.stringify(records));
  } catch(e) {
    if (typeof window.toast === 'function') {
      window.toast('Storage full — some records may not be saved');
    }
  }
};

/**
 * Parse a Getty CSV text string into structured records
 * @param {string} csvText - Raw CSV text
 * @returns {Array<Object>}
 */
window.parseGettyCSV = function parseGettyCSV(csvText) {
  var lines = csvText.split(/\r?\n/);
  var records = [];
  var headers = [];

  if (lines.length < 2) return records;

  // Parse header row — detect column mapping
  var headerLine = lines[0].trim();
  headers = window.parseCSVLine(headerLine);
  var headerMap = {};
  var knownCols = {
    'title': ['title', 'artwork', 'object', 'name', 'subject'],
    'artist': ['artist', 'creator', 'maker', 'author', 'painter'],
    'artist_birth': ['birth', 'born', 'artist_birth', 'birthyear'],
    'artist_death': ['death', 'died', 'artist_death', 'deathyear'],
    'year': ['year', 'date', 'created', 'creation', 'period'],
    'medium': ['medium', 'material', 'technique', 'support'],
    'location': ['currentlocation', 'location', 'institution', 'museum', 'repository'],
    'provenance': ['provenance', 'history', 'ownership', 'chain'],
    'reference': ['reference', 'gpi_reference', 'id', 'ref', 'gpi', 'accession'],
    'ulan_id': ['ulan', 'ulan_id', 'ulanid', 'vocab']
  };

  // Auto-detect column mapping — score-based to avoid false matches
  // e.g. 'Year' should match 'year' not 'birthyear'
  headers.forEach(function(h, i) {
    var hl = h.toLowerCase().replace(/[^a-z0-9_]/g, '');
    var bestScore = 0;
    var bestField = null;
    for (let field in knownCols) {
      if (knownCols.hasOwnProperty(field)) {
        var aliases = knownCols[field];
        for (let a = 0; a < aliases.length; a++) {
          var alias = aliases[a];
          var score = 0;
          if (hl === alias) {
            score = 3; // Exact match
          } else if (hl.indexOf(alias) === 0 || alias.indexOf(hl) === 0) {
            score = 2; // Prefix match (one starts with the other)
          } else if (hl.indexOf(alias) >= 0 || alias.indexOf(hl) >= 0) {
            score = 1; // Contains match (last resort)
          }
          if (score > bestScore) {
            bestScore = score;
            bestField = field;
          }
        }
      }
    }
    if (bestField) headerMap[i] = bestField;
  });

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var cols = window.parseCSVLine(line);
    if (cols.length < 2) continue;

    var record = {
      title: '',
      artist: '',
      artist_birth: '',
      artist_death: '',
      year: '',
      medium: '',
      location: '',
      provenance: '',
      reference: '',
      ulan_id: '',
      importedAt: new Date().toISOString()
    };

    var hasData = false;
    for (let ci = 0; ci < cols.length; ci++) {
      var field = headerMap[ci];
      if (field && record.hasOwnProperty(field)) {
        var val = cols[ci].trim();
        if (val) {
          record[field] = val;
          hasData = true;
        }
      }
    }

    if (hasData && (record.title || record.artist)) {
      records.push(record);
    }
  }

  return records;
};

/**
 * Parse a single CSV line handling quoted fields
 * @param {string} line
 * @returns {Array<string>}
 */
window.parseCSVLine = function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
};

/**
 * Handle CSV file upload event
 * @param {Event} event
 */
window.handleGettyCSV = function handleGettyCSV(event) {
  var file = event.target.files[0];
  if (!file) return;

  var statusEl = document.getElementById('csv-status');
  if (statusEl) statusEl.textContent = 'Reading ' + file.name + '…';

  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var text = e.target.result;
      var newRecords = window.parseGettyCSV(text);
      if (newRecords.length === 0) {
        if (statusEl) statusEl.textContent = 'No valid records found in CSV.';
        if (typeof window.toast === 'function') {
          window.toast('No records parsed — check CSV format');
        }
        return;
      }

      // Merge with existing records (dedup by reference)
      var existing = window.loadGettyCSVRecords();
      var existingRefs = {};
      existing.forEach(function(r) {
        if (r.reference) existingRefs[r.reference] = true;
      });

      var added = 0;
      newRecords.forEach(function(r) {
        if (r.reference && existingRefs[r.reference]) return;
        existing.push(r);
        added++;
      });

      window.saveGettyCSVRecords(existing);

      if (statusEl) {
        var msg = 'Imported ' + added + ' new records (total: ' + existing.length + ')';
        statusEl.textContent = msg;
        statusEl.style.color = 'var(--green)';
      }
      if (typeof window.toast === 'function') {
        window.toast('CSV: ' + added + ' records imported');
      }

      // Show preview
      window.showGettyCSVPreview(newRecords.slice(0, 10));

      // Emit event for other modules
      if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.emit === 'function') {
        TRACE_REGISTRY.emit('csv:imported', { count: added, total: existing.length });
      }

      // Reset file input so same file can be re-imported
      event.target.value = '';

    } catch(err) {
      if (statusEl) {
        statusEl.textContent = 'Error: ' + err.message;
        statusEl.style.color = 'var(--red-lt)';
      }
      if (typeof window.toast === 'function') {
        window.toast('CSV import failed: ' + err.message);
      }
    }
  };

  reader.onerror = function() {
    if (statusEl) statusEl.textContent = 'Failed to read file.';
  };

  reader.readAsText(file);
};

/**
 * Show a preview of imported records
 * @param {Array} records
 */
window.showGettyCSVPreview = function showGettyCSVPreview(records) {
  var previewEl = document.getElementById('csv-preview');
  if (!previewEl || !records.length) return;

  previewEl.style.display = 'block';
  previewEl.innerHTML = '<div style="font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:var(--gold);margin-bottom:6px;">Recent imports</div>' +
    records.map(function(r) {
      return '<div style="display:flex;gap:6px;padding:4px 0;border-bottom:1px solid var(--border);font-size:10px;">' +
        '<span style="color:var(--text);min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.esc(r.title || '—') + '</span>' +
        '<span style="color:var(--text-dim);min-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + window.esc(r.artist || '') + '</span>' +
        '<span style="color:var(--text-ghost);min-width:40px;">' + window.esc(r.year || '') + '</span>' +
        '</div>';
    }).join('');

  if (records.length >= 10) {
    previewEl.innerHTML += '<div style="font-size:9px;color:var(--text-dim);padding:4px 0;">… and ' + (window._gettyCSVRecords.length - 10) + ' more records</div>';
  }
};

/**
 * Search imported CSV records
 * @param {string} query - Search text
 * @returns {Array}
 */
window.searchGettyCSV = function searchGettyCSV(query) {
  var records = window.loadGettyCSVRecords();
  if (!query || !records.length) return [];

  var q = query.toLowerCase();
  return records.filter(function(r) {
    return (r.title && r.title.toLowerCase().indexOf(q) >= 0) ||
           (r.artist && r.artist.toLowerCase().indexOf(q) >= 0) ||
           (r.reference && r.reference.toLowerCase().indexOf(q) >= 0);
  });
};

/**
 * Get CSV import stats
 * @returns {{total:number, artists:number}}
 */
window.getGettyCSVStats = function getGettyCSVStats() {
  var records = window.loadGettyCSVRecords();
  var artistSet = {};
  records.forEach(function(r) {
    if (r.artist) artistSet[r.artist] = true;
  });
  return {
    total: records.length,
    artists: Object.keys(artistSet).length
  };
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('csv_import', {
    version: '1.0.0',
    dependsOn: ['utils']
  });
}

console.log('[TRACE CSV Import] Loaded');
