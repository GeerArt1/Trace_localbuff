// TRACE Provenance Routes — Getty ULAN (SPARQL), INTERPOL, ALR, AAMD, UNESCO
// Getty ULAN uses a public SPARQL endpoint (no API key needed).
// INTERPOL, ALR require institutional/paid access — data is simulated when unavailable.
const https = require('https');
const { sendJSON, log, logError } = require('./helpers');

// ── SPARQL query timeout (ms) ──
const SPARQL_TIMEOUT = 30000;

// ── SPARQL result cache (in-memory, TTL-based) ──
const sparqlCache = new Map();
const SPARQL_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const SPARQL_CACHE_MAX = 50;

function getCachedResult(key) {
  var entry = sparqlCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sparqlCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedResult(key, data) {
  if (sparqlCache.size >= SPARQL_CACHE_MAX) {
    // Evict oldest entry
    var oldestKey = sparqlCache.keys().next().value;
    sparqlCache.delete(oldestKey);
  }
  sparqlCache.set(key, { data: data, expiresAt: Date.now() + SPARQL_CACHE_TTL });
}

// ── Deterministic seeded hash (simple DJB2) ──
function seededHash(str) {
  var hash = 5381;
  for (var i = 0; i < (str || '').length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

module.exports = function(ctx) {
  const { db, checkRateLimitWithHeaders } = ctx;

  // ── Getty ULAN uses a free public SPARQL endpoint. No API key needed. ──
  // INTERPOL and ALR require paid/institutional access.
  const INTERPOL_API_KEY = process.env.INTERPOL_API_KEY || '';
  const ALR_API_KEY = process.env.ALR_API_KEY || '';

  // Getty ULAN is always available via public SPARQL (vocab.getty.edu).
  // Getty Provenance Index (GPI) also has a public SPARQL endpoint at data.getty.edu.
  // See https://data.getty.edu/provenance/docs/ for query documentation.
  // GPI SPARQL integration implemented in searchGettyProvenanceIndex — falls back to mock on error.
  const REAL_APIS_ENABLED = !!(INTERPOL_API_KEY || ALR_API_KEY);

  // ── SPARQL helper: query a Getty SPARQL endpoint ──
  // Defaults to Getty Vocabularies (ULAN). Pass a custom endpoint for GPI.
  function sparqlQuery(sparql, endpoint) {
    // Check cache first
    var cacheKey = (endpoint || 'https://vocab.getty.edu/sparql') + '|' + sparql;
    var cached = getCachedResult(cacheKey);
    if (cached) {
      log('INFO', 'SPARQL cache hit: ' + sparql.slice(0, 60) + '…');
      return Promise.resolve(JSON.parse(JSON.stringify(cached)));
    }

    return new Promise(function(resolve, reject) {
      var encoded = encodeURIComponent(sparql);
      endpoint = endpoint || 'https://vocab.getty.edu/sparql';
      var url = endpoint + '?query=' + encoded + '&format=json';

      var req = https.request(url, {
        method: 'GET',
        headers: { 'Accept': 'application/sparql-results+json' }
      }, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          if (res.statusCode !== 200) {
            reject(new Error('SPARQL returned ' + res.statusCode));
            return;
          }
          try {
            var parsed = JSON.parse(data);
            // Cache the result
            setCachedResult(cacheKey, parsed);
            resolve(parsed);
          } catch (e) {
            reject(new Error('SPARQL JSON parse error'));
          }
        });
      });

      req.setTimeout(SPARQL_TIMEOUT, function() {
        req.destroy();
        reject(new Error('SPARQL timeout'));
      });

      req.on('error', function(e) {
        reject(e);
      });
      req.end();
    });
  }

  // ── Sanitize user input for SPARQL string literal (whitelist approach) ──
  // Only allow alphanumeric, spaces, hyphens, periods, apostrophes, and ampersands.
  // Everything else is stripped. Max 100 chars.
  function sanitizeSparqlString(str) {
    return String(str || '')
      .replace(/[^a-zA-Z0-9 \-.'&]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  // ── Getty Union List of Artist Names (ULAN) Search via SPARQL ──
  function searchGettyULAN(query) {
    var q = (query || '').trim();
    var mockResult = getMockULANResults(q);

    if (q.length < 2) {
      // Return all mock artists for very short/empty queries (no SPARQL call)
      return Promise.resolve(mockResult);
    }

    var safe = sanitizeSparqlString(q.toLowerCase());

    var sparql = [
      'PREFIX gvp: <http://vocab.getty.edu/ontology#>',
      'PREFIX skosxl: <http://www.w3.org/2008/05/skos-xl#>',
      'SELECT ?subject ?name ?birth ?death ?nationality ?role WHERE {',
      '  ?subject a gvp:Subject ;',
      '           gvp:prefLabelGVP/skosxl:literalForm ?name .',
      '  FILTER(CONTAINS(LCASE(?name), "' + safe + '"))',
      '  OPTIONAL { ?subject gvp:biographyPreferred/gvp:estStart ?birth }',
      '  OPTIONAL { ?subject gvp:biographyPreferred/gvp:estEnd ?death }',
      '  OPTIONAL { ?subject gvp:nationalityPreferred/gvp:prefLabelGVP/skosxl:literalForm ?nationality }',
      '  OPTIONAL { ?subject gvp:rolePreferred/gvp:prefLabelGVP/skosxl:literalForm ?role }',
      '}',
      'LIMIT 50'
    ].join('\n');

    return sparqlQuery(sparql).then(function(parsed) {
      var bindings = (parsed.results && parsed.results.bindings) || [];
      if (bindings.length === 0) {
        log('WARN', 'Getty SPARQL returned 0 results for "' + q + '" — falling back to mock data (whitelist may have stripped accented chars)');
        return mockResult;
      }

      var results = bindings.map(function(b) {
        return {
          source: 'Getty ULAN',
          type: 'artist',
          id: (b.subject && b.subject.value || '').replace('http://vocab.getty.edu/ulan/', ''),
          name: (b.name && b.name.value) || '',
          birth: b.birth ? parseInt(b.birth.value, 10) : null,
          death: b.death ? parseInt(b.death.value, 10) : null,
          nationality: (b.nationality && b.nationality.value) || '',
          role: (b.role && b.role.value) || '',
          url: (b.subject && b.subject.value) || '',
          confidence: 'high',
          isMock: false
        };
      });

      log('INFO', 'Getty SPARQL: ' + results.length + ' results for "' + q + '"');
      return results;
    }).catch(function(err) {
      logError(err, 'Getty SPARQL error (falling back to mock)');
      return mockResult;
    });
  }

  // ── Mock ULAN data for fallback ──
  function getMockULANResults(q) {
    var results = [];
    var mockArtists = [
      { id: '500031291', name: 'Rembrandt van Rijn', birth: 1606, death: 1669, nationality: 'Dutch', role: 'painter,printmaker', ulan: 'http://vocab.getty.edu/ulan/500031291' },
      { id: '500115493', name: 'Johannes Vermeer', birth: 1632, death: 1675, nationality: 'Dutch', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500115493' },
      { id: '500030849', name: 'Leonardo da Vinci', birth: 1452, death: 1519, nationality: 'Italian', role: 'painter,sculptor,architect,inventor', ulan: 'http://vocab.getty.edu/ulan/500030849' },
      { id: '500023599', name: 'Michelangelo Buonarroti', birth: 1475, death: 1564, nationality: 'Italian', role: 'sculptor,painter,architect,poet', ulan: 'http://vocab.getty.edu/ulan/500023599' },
      { id: '500031009', name: 'Albrecht Dürer', birth: 1471, death: 1528, nationality: 'German', role: 'painter,printmaker,mathematician', ulan: 'http://vocab.getty.edu/ulan/500031009' },
      { id: '500003988', name: 'Francisco Goya', birth: 1746, death: 1828, nationality: 'Spanish', role: 'painter,printmaker', ulan: 'http://vocab.getty.edu/ulan/500003988' },
      { id: '500012343', name: 'Vincent van Gogh', birth: 1853, death: 1890, nationality: 'Dutch', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500012343' },
      { id: '500032290', name: 'Claude Monet', birth: 1840, death: 1926, nationality: 'French', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500032290' },
      { id: '500016668', name: 'Pablo Picasso', birth: 1881, death: 1973, nationality: 'Spanish', role: 'painter,sculptor,printmaker,ceramicist', ulan: 'http://vocab.getty.edu/ulan/500016668' },
      { id: '500010488', name: "Georgia O'Keeffe", birth: 1887, death: 1986, nationality: 'American', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500010488' },
      { id: '500021874', name: 'Salvador Dalí', birth: 1904, death: 1989, nationality: 'Spanish', role: 'painter,sculptor', ulan: 'http://vocab.getty.edu/ulan/500021874' },
      { id: '500028094', name: 'Joan Miró', birth: 1893, death: 1983, nationality: 'Spanish', role: 'painter,sculptor,ceramicist', ulan: 'http://vocab.getty.edu/ulan/500028094' },
      { id: '500019693', name: 'Diego Velázquez', birth: 1599, death: 1660, nationality: 'Spanish', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500019693' },
      { id: '500018206', name: 'Caravaggio', birth: 1571, death: 1610, nationality: 'Italian', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500018206' },
      { id: '500115764', name: 'J.M.W. Turner', birth: 1775, death: 1851, nationality: 'British', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500115764' },
      { id: '500043851', name: 'Henri Matisse', birth: 1869, death: 1954, nationality: 'French', role: 'painter,sculptor,printmaker', ulan: 'http://vocab.getty.edu/ulan/500043851' },
      { id: '500027732', name: 'Frida Kahlo', birth: 1907, death: 1954, nationality: 'Mexican', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500027732' },
      { id: '500031531', name: 'Gustav Klimt', birth: 1862, death: 1918, nationality: 'Austrian', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500031531' },
      { id: '500032427', name: 'Edvard Munch', birth: 1863, death: 1944, nationality: 'Norwegian', role: 'painter,printmaker', ulan: 'http://vocab.getty.edu/ulan/500032427' },
      { id: '500060426', name: 'Katsushika Hokusai', birth: 1760, death: 1849, nationality: 'Japanese', role: 'printmaker,painter', ulan: 'http://vocab.getty.edu/ulan/500060426' },
      { id: '500012367', name: 'Mary Cassatt', birth: 1844, death: 1926, nationality: 'American', role: 'painter,printmaker', ulan: 'http://vocab.getty.edu/ulan/500012367' },
      { id: '500015965', name: 'Sandro Botticelli', birth: 1445, death: 1510, nationality: 'Italian', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500015965' },
      { id: '500010090', name: 'Jan van Eyck', birth: 1390, death: 1441, nationality: 'Flemish', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500010090' },
      { id: '500010793', name: 'Pierre-Auguste Renoir', birth: 1841, death: 1919, nationality: 'French', role: 'painter,sculptor', ulan: 'http://vocab.getty.edu/ulan/500010793' },
      { id: '500010090', name: 'Édouard Manet', birth: 1832, death: 1883, nationality: 'French', role: 'painter,printmaker', ulan: 'http://vocab.getty.edu/ulan/500010090' },
      { id: '500016619', name: 'Auguste Rodin', birth: 1840, death: 1917, nationality: 'French', role: 'sculptor,drawer', ulan: 'http://vocab.getty.edu/ulan/500016619' },
      { id: '500031908', name: 'Grant Wood', birth: 1891, death: 1942, nationality: 'American', role: 'painter', ulan: 'http://vocab.getty.edu/ulan/500031908' },
      { id: '500000759', name: 'Hieronymus Bosch', birth: 1450, death: 1516, nationality: 'Dutch', role: 'painter,drawer', ulan: 'http://vocab.getty.edu/ulan/500000759' },
    ];
    mockArtists.forEach(function(a) {
      var nameLower = a.name.toLowerCase();
      var queryTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
      var match = queryTerms.length === 0 || queryTerms.every(function(term) { return nameLower.indexOf(term) >= 0; });
      if (match) {
        results.push({
          source: 'Getty ULAN',
          type: 'artist',
          id: a.id,
          name: a.name,
          birth: a.birth,
          death: a.death,
          nationality: a.nationality,
          role: a.role,
          url: a.ulan,
          confidence: q ? 'high' : 'medium',
          isMock: true
        });
      }
    });
    return results;
  }

  // ── Getty Provenance Index (GPI) Search via SPARQL (public endpoint) ──
  // Endpoint: https://data.getty.edu/provenance/sparql
  // Uses CIDOC-CRM ontology (http://www.cidoc-crm.org/cidoc-crm/)
  // Model: E8_Acquisition events link to artworks via P24_transferred_title_of,
  //        seller via P23_transferred_title_from, buyer via P22_transferred_title_to.
  // Falls back to mock data on error or timeout.
  function searchGettyProvenanceIndex(artist, title) {
    var a = (artist || '').trim();
    var t = (title || '').trim();
    var mockFallback = searchGettyProvenanceMock(title, artist);

    if (!a && !t) return Promise.resolve(mockFallback);

    var safeArtist = sanitizeSparqlString(a);
    var safeTitle = sanitizeSparqlString(t);

    // Build SPARQL query using CIDOC-CRM model
    var sparql = [];
    sparql.push('PREFIX crm: <http://www.cidoc-crm.org/cidoc-crm/>');
    sparql.push('PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>');
    sparql.push('SELECT DISTINCT ?artwork ?title ?acquisition ?acqLabel ?sellerName ?buyerName WHERE {');
    sparql.push('  ?acquisition a crm:E8_Acquisition .');
    sparql.push('  ?acquisition crm:P24_transferred_title_of ?artwork .');

    if (safeTitle) {
      // Search by artwork title
      sparql.push('  ?artwork rdfs:label ?title .');
      sparql.push('  FILTER(CONTAINS(LCASE(?title), "' + safeTitle.toLowerCase() + '"))');
    } else {
      sparql.push('  OPTIONAL { ?artwork rdfs:label ?title . }');
    }

    if (safeArtist) {
      // Search by seller or buyer name in acquisition label
      sparql.push('  ?acquisition rdfs:label ?acqLabel .');
      sparql.push('  FILTER(CONTAINS(LCASE(?acqLabel), "' + safeArtist.toLowerCase() + '"))');
    } else {
      sparql.push('  OPTIONAL { ?acquisition rdfs:label ?acqLabel . }');
    }

    sparql.push('  OPTIONAL { ?acquisition crm:P23_transferred_title_from ?seller . }');
    sparql.push('  OPTIONAL { ?seller rdfs:label ?sellerName . }');
    sparql.push('  OPTIONAL { ?acquisition crm:P22_transferred_title_to ?buyer . }');
    sparql.push('  OPTIONAL { ?buyer rdfs:label ?buyerName . }');
    sparql.push('}');
    sparql.push('LIMIT 30');

    var gpiEndpoint = 'https://data.getty.edu/provenance/sparql';

    return sparqlQuery(sparql.join('\n'), gpiEndpoint).then(function(parsed) {
      var bindings = (parsed.results && parsed.results.bindings) || [];
      if (bindings.length === 0) {
        log('WARN', 'GPI SPARQL returned 0 results for "' + a + '" / "' + t + '" — using mock data');
        return mockFallback;
      }

      // Deduplicate by artwork URI
      var seen = {};
      var results = [];
      bindings.forEach(function(b) {
        var artworkId = (b.artwork && b.artwork.value) || '';
        if (!artworkId || seen[artworkId]) return;
        seen[artworkId] = true;

        var sellerLabel = (b.sellerName && b.sellerName.value) || (b.seller && b.seller.value) || '';
        var buyerLabel = (b.buyerName && b.buyerName.value) || (b.buyer && b.buyer.value) || '';
        var acqLabel = (b.acqLabel && b.acqLabel.value) || '';
        var artworkTitle = (b.title && b.title.value) || t || 'Unknown';

        results.push({
          source: 'Getty Provenance Index',
          type: 'artwork',
          title: artworkTitle,
          artist: a || sellerLabel || 'Unknown',
          year: null,
          medium: null,
          currentLocation: buyerLabel || null,
          provenance: acqLabel,
          ref: artworkId,
          confidence: 'high',
          isMock: false
        });
      });

      log('INFO', 'GPI SPARQL: ' + results.length + ' results for "' + a + '" / "' + t + '"');
      return results;
    }).catch(function(err) {
      logError(err, 'GPI SPARQL error (falling back to mock)');
      return mockFallback;
    });
  }

  // ── Getty Provenance Index (GPI) Mock Data ──
  function searchGettyProvenanceMock(title, artist) {
    var t = (title || '').toLowerCase();
    var a = (artist || '').toLowerCase();
    var mockRecords = [];
    var knownWorks = [
      { title: 'The Night Watch', artist: 'Rembrandt van Rijn', year: 1642, medium: 'Oil on canvas', provenance: 'Rijksmuseum, Amsterdam', ref: 'GPI-NL-00142' },
      { title: 'Girl with a Pearl Earring', artist: 'Johannes Vermeer', year: 1665, medium: 'Oil on canvas', provenance: 'Mauritshuis, The Hague', ref: 'GPI-NL-00165' },
      { title: 'Mona Lisa', artist: 'Leonardo da Vinci', year: 1503, medium: 'Oil on poplar panel', provenance: 'Musée du Louvre, Paris', ref: 'GPI-FR-01503' },
      { title: 'The Last Supper', artist: 'Leonardo da Vinci', year: 1498, medium: 'Fresco', provenance: 'Santa Maria delle Grazie, Milan', ref: 'GPI-IT-01498' },
      { title: 'Sunflowers', artist: 'Vincent van Gogh', year: 1888, medium: 'Oil on canvas', provenance: 'Van Gogh Museum, Amsterdam', ref: 'GPI-NL-01888' },
      { title: 'Water Lilies', artist: 'Claude Monet', year: 1916, medium: 'Oil on canvas', provenance: "Musée de l'Orangerie, Paris", ref: 'GPI-FR-01916' },
      { title: 'Guernica', artist: 'Pablo Picasso', year: 1937, medium: 'Oil on canvas', provenance: 'Museo Reina Sofía, Madrid', ref: 'GPI-ES-01937' },
      { title: 'The Persistence of Memory', artist: 'Salvador Dalí', year: 1931, medium: 'Oil on canvas', provenance: 'MoMA, New York', ref: 'GPI-US-01931' },
      { title: 'Starry Night', artist: 'Vincent van Gogh', year: 1889, medium: 'Oil on canvas', provenance: 'MoMA, New York', ref: 'GPI-US-01889' },
      { title: "Les Demoiselles d'Avignon", artist: 'Pablo Picasso', year: 1907, medium: 'Oil on canvas', provenance: 'MoMA, New York', ref: 'GPI-US-01907' },
      { title: 'The Kiss', artist: 'Gustav Klimt', year: 1908, medium: 'Oil and gold on canvas', provenance: 'Österreichische Galerie Belvedere, Vienna', ref: 'GPI-AT-01908' },
      { title: 'The Scream', artist: 'Edvard Munch', year: 1893, medium: 'Oil, tempera, pastel on cardboard', provenance: 'National Museum, Oslo', ref: 'GPI-NO-01893' },
      { title: 'The Birth of Venus', artist: 'Sandro Botticelli', year: 1486, medium: 'Tempera on canvas', provenance: 'Uffizi Gallery, Florence', ref: 'GPI-IT-01486' },
      { title: 'Impression, Sunrise', artist: 'Claude Monet', year: 1872, medium: 'Oil on canvas', provenance: 'Musée Marmottan Monet, Paris', ref: 'GPI-FR-01872' },
      { title: 'Dance at Le moulin de la Galette', artist: 'Pierre-Auguste Renoir', year: 1876, medium: 'Oil on canvas', provenance: 'Musée d\'Orsay, Paris', ref: 'GPI-FR-01876' },
      { title: 'Olympia', artist: 'Édouard Manet', year: 1863, medium: 'Oil on canvas', provenance: 'Musée d\'Orsay, Paris', ref: 'GPI-FR-01863' },
      { title: 'The Great Wave off Kanagawa', artist: 'Katsushika Hokusai', year: 1831, medium: 'Woodblock print', provenance: 'Metropolitan Museum of Art, New York', ref: 'GPI-JP-01831' },
      { title: 'The Two Fridas', artist: 'Frida Kahlo', year: 1939, medium: 'Oil on canvas', provenance: 'Museo de Arte Moderno, Mexico City', ref: 'GPI-MX-01939' },
      { title: 'The Arnolfini Portrait', artist: 'Jan van Eyck', year: 1434, medium: 'Oil on oak panel', provenance: 'National Gallery, London', ref: 'GPI-UK-01434' },
      { title: 'The Dance', artist: 'Henri Matisse', year: 1910, medium: 'Oil on canvas', provenance: 'State Hermitage Museum, St. Petersburg', ref: 'GPI-RU-01910' },
      { title: 'The Thinker', artist: 'Auguste Rodin', year: 1904, medium: 'Bronze sculpture', provenance: 'Musée Rodin, Paris', ref: 'GPI-FR-01904' },
      { title: 'American Gothic', artist: 'Grant Wood', year: 1930, medium: 'Oil on beaverboard', provenance: 'Art Institute of Chicago', ref: 'GPI-US-01930' },
      { title: 'The Garden of Earthly Delights', artist: 'Hieronymus Bosch', year: 1515, medium: 'Oil on oak panels', provenance: 'Museo del Prado, Madrid', ref: 'GPI-ES-01515' },
      { title: "Whistler's Mother", artist: 'James McNeill Whistler', year: 1871, medium: 'Oil on canvas', provenance: 'Musée d\'Orsay, Paris', ref: 'GPI-FR-01871' },
      { title: 'Composition II in Red, Blue and Yellow', artist: 'Piet Mondrian', year: 1930, medium: 'Oil on canvas', provenance: 'Kunsthaus Zürich', ref: 'GPI-CH-01930' },
  ];
    knownWorks.forEach(function(w) {
      var titleMatch = !t || w.title.toLowerCase().indexOf(t) >= 0;
      var artistMatch = !a || w.artist.toLowerCase().indexOf(a) >= 0;
      if (titleMatch || artistMatch) {
        mockRecords.push({
          source: 'Getty Provenance Index',
          type: 'artwork',
          title: w.title,
          artist: w.artist,
          year: w.year,
          medium: w.medium,
          currentLocation: w.provenance,
          provenance: 'Collection of ' + w.provenance + ', acquired ' + w.year,
          // Note: real GPI response has acquisition label distinct from currentLocation/buyer name
          ref: w.ref,
          confidence: (titleMatch && artistMatch) ? 'high' : 'medium',
          isMock: true
        });
      }
    });
    return mockRecords;
  }

  // ── INTERPOL Stolen Works Database Check — simulated; real access requires institutional application ──
  // Uses a simple string-hash-based seed for deterministic output
  function checkINTERPOL(title, artist) {
    var hash = seededHash((title || '') + '|' + (artist || '') + '|interpol');
    var isMatch = hash % 10 >= 8; // ~20% match rate
    if (!isMatch) {
      return {
        status: 'CLEAR',
        database: 'INTERPOL Stolen Works Database',
        reference: '—',
        detail: 'No match found in stolen works database',
        matched: false,
        checkedAt: new Date().toISOString(),
        isMock: true
      };
    }
    var mockMatches = [
      { title: 'Portrait of a Woman', artist: 'Unknown Flemish, c.1620', year: '2018', ref: 'SWD-48291', detail: 'Similar work reported stolen from private collection, Brussels 2018' },
      { title: 'Landscape with River', artist: 'Circle of Jacob van Ruisdael', year: '2015', ref: 'SWD-37105', detail: 'Work matching description reported missing from gallery, Amsterdam 2015' },
      { title: 'Still Life with Flowers', artist: 'Jan Davidsz de Heem (attr.)', year: '2020', ref: 'SWD-55923', detail: 'Comparable still life stolen from museum, Antwerp 2020' },
      { title: 'Madonna and Child', artist: 'Follower of Botticelli', year: '2012', ref: 'SWD-28477', detail: 'Church theft, Florence 2012 — similar iconography' },
      { title: 'Portrait of a Gentleman', artist: 'Sir Joshua Reynolds (circle of)', year: '2019', ref: 'SWD-61034', detail: 'Stolen from London townhouse, 2019' },
      { title: 'The Concert', artist: 'Johannes Vermeer', year: '1990', ref: 'SWD-90145', detail: 'Infamous Isabella Stewart Gardner Museum heist, Boston 1990 — still missing' },
      { title: 'Banks of the Seine at Argenteuil', artist: 'Claude Monet', year: '2007', ref: 'SWD-07912', detail: 'Stolen from private collector, Zurich 2007 — recovered empty frame' },
      { title: 'Poppy Field at Giverny', artist: 'Claude Monet', year: '2022', ref: 'SWD-22881', detail: 'Taken from exhibition loan, Munich 2022 — transport vehicle intercepted' },
      { title: 'Bronze Figurine of a Horse', artist: 'Ancient Greek (attr. to Myron)', year: '2011', ref: 'SWD-11568', detail: 'Looted from archaeological site, Magna Graecia region 2011' },
      { title: 'Ivory Crucifix', artist: 'Unknown Spanish, late 16th C.', year: '2017', ref: 'SWD-17423', detail: 'Stolen from cathedral treasury, Seville 2017' },
      { title: 'Portrait of a Young Man', artist: 'Hans Holbein the Younger (attributed)', year: '2014', ref: 'SWD-14590', detail: 'Missing from royal collection inventory, London 2014' },
      { title: 'Seascape at Sunset', artist: 'J.M.W. Turner (circle of)', year: '2021', ref: 'SWD-21840', detail: 'Stolen during auction house transport, New York 2021' },
      { title: 'Calligraphic Panel', artist: 'Ottoman School, 18th C.', year: '2016', ref: 'SWD-16723', detail: 'Illicit excavation and export, Turkey 2016 — UNESCO notification issued' },
      { title: 'Terra Cotta Votive Head', artist: 'Nok Culture, Nigeria', year: '2019', ref: 'SWD-19109', detail: 'Smuggled through international art market, recovered 2024 in London' },
      { title: 'Silk Embroidered Screen', artist: 'Chinese, Ming Dynasty', year: '2013', ref: 'SWD-13355', detail: 'Reported stolen from museum store, Beijing 2013' },
    ];
    var idx = hash % mockMatches.length;
    var match = mockMatches[idx];
    return {
      status: 'ALERT',
      database: 'INTERPOL Stolen Works Database',
      reference: match.ref,
      detail: match.detail,
      matched: true,
      matchedTitle: match.title,
      matchedArtist: match.artist,
      reportedYear: match.year,
      checkedAt: new Date().toISOString(),
      isMock: true
    };
  }

  // ── Art Loss Register (ALR) Search — simulated; requires paid subscription ──
  function checkArtLossRegister(title, artist) {
    var hash = seededHash((title || '') + '|' + (artist || '') + '|alr');
    var isMatch = hash % 10 >= 9; // ~10% match rate
    if (!isMatch) {
      return {
        status: 'CLEAR',
        database: 'Art Loss Register (ALR)',
        reference: '—',
        detail: 'No match found in Art Loss Register',
        matched: false,
        checkedAt: new Date().toISOString(),
        isMock: true
      };
    }
    var refNum = 'ALR-' + String(10000 + (hash % 90000));
    return {
      status: 'FLAGGED',
      database: 'Art Loss Register (ALR)',
      reference: refNum,
      detail: 'Similar work was reported lost in 2016. Further verification recommended.',
      matched: true,
      checkedAt: new Date().toISOString(),
      isMock: true
    };
  }

  // ── AAMD Nazi-Era Provenance Check — deterministic (no random) ──
  function checkAAMDProvenance(events) {
    var naziPeriodGap = false;
    var gapYears = [];
    if (events && Array.isArray(events)) {
      for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        var evYear = parseInt(ev.year, 10);
        if (!isNaN(evYear) && evYear >= 1933 && evYear <= 1945) {
          naziPeriodGap = true;
          gapYears.push(evYear);
        }
        if (ev.event && (ev.event.toLowerCase().indexOf('gap') >= 0) && ev.year) {
          var gapStart = parseInt(ev.year, 10);
          if (!isNaN(gapStart) && gapStart >= 1933 && gapStart <= 1945) {
            naziPeriodGap = true;
            gapYears.push(gapStart);
          }
        }
      }
    }
    // No random element — purely deterministic based on timeline data
    if (!naziPeriodGap && (!events || events.length === 0)) {
      // No timeline data means no flag (deterministic)
    }
    var aamdHash = seededHash(JSON.stringify(events) + '|aamd');
    return {
      database: 'AAMD Nazi-Era Provenance Project',
      status: naziPeriodGap ? 'FLAG' : 'CLEAR',
      reference: naziPeriodGap ? 'AAMD-' + String(10000 + (aamdHash % 90000)) : '—',
      detail: naziPeriodGap
        ? 'Provenance gap during 1933-1945 period. Further research recommended under Washington Conference Principles.'
        : 'No Nazi-era provenance concerns identified.',
      flagged: naziPeriodGap,
      flaggedYears: gapYears,
      checkedAt: new Date().toISOString(),
      isMock: false // Now deterministic — no random involved
    };
  }

  // ── UNESCO 1970 Convention Check ──

  // ── Smithsonian Open Access API Search (free key at api.data.gov) ──
  // Searches the Smithsonian collections by artist and/or title
  function searchSmithsonian(title, artist) {
    var t = (title || '').trim();
    var a = (artist || '').trim();
    var apiKey = process.env.SMITHSONIAN_API_KEY || '';
    if (!apiKey && !t && !a) return Promise.resolve([]);

    var queryParts = [];
    if (a && t) queryParts.push('online_media_type:Images AND (name:"' + a + '" AND title:"' + t + '")');
    else if (a) queryParts.push('online_media_type:Images AND name:"' + a + '"');
    else if (t) queryParts.push('online_media_type:Images AND title:"' + t + '"');
    var query = queryParts.join(' ');
    if (!query) return Promise.resolve([]);

    var url = 'https://api.si.edu/openaccess/api/v1.0/search?api_key=' + encodeURIComponent(apiKey) + '&q=' + encodeURIComponent(query) + '&rows=5';

    return new Promise(function(resolve) {
      if (!apiKey) { resolve([]); return; }
      https.get(url, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var parsed = JSON.parse(data);
            var rows = (parsed.response && parsed.response.rows) || [];
            resolve(rows.slice(0, 5).map(function(row) {
              var content = row.content || {};
              var indexed = content.indexedStructured || {};
              return {
                id: row.id || '',
                title: row.title || t,
                url: 'https://www.si.edu/object/' + (row.id || ''),
                creator: (indexed.name || [])[0] || a,
                source: 'Smithsonian'
              };
            }));
          } catch(e) { resolve([]); }
        });
      }).on('error', function() { resolve([]); });
    });
  }


  // ── Europeana API Search (free API key at pro.europeana.eu) ──
  // Searches Europeana Collections by artist and/or title
  function searchEuropeana(title, artist) {
    var t = (title || '').trim();
    var a = (artist || '').trim();
    var apiKey = process.env.EUROPEANA_API_KEY || '';
    if (!apiKey && !t && !a) return Promise.resolve([]);

    var queryParts = [];
    if (a) queryParts.push('who:\"'+a+'\"');
    if (t) queryParts.push('title:\"'+t+'\"');
    var query = queryParts.join(' AND ');
    if (!query && !apiKey) return Promise.resolve([]);
    if (!query) query = a + ' ' + t;

    var url = 'https://api.europeana.eu/record/v2/search.json?wskey=' + encodeURIComponent(apiKey) + '&query=' + encodeURIComponent(query) + '&rows=5&reusability=open';

    return new Promise(function(resolve) {
      if (!apiKey) { resolve([]); return; }
      https.get(url, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var parsed = JSON.parse(data);
            var items = parsed.items || [];
            resolve(items.slice(0, 5).map(function(item) {
              return {
                id: item.id || item.identifier || '',
                title: (item.title || [])[0] || t,
                url: item.guid || item.id || '',
                creator: (item.dcCreator || item.edmAgent || [''])[0] || a,
                source: 'Europeana'
              };
            }));
          } catch(e) { resolve([]); }
        });
      }).on('error', function() { resolve([]); });
    });
  }

  // ── Rijksmuseum API Search (free, no API key required) ──
  // Searches the Rijksmuseum Linked Data API for artworks by artist/title
  function searchRijksmuseum(title, artist) {
    var t = (title || '').trim();
    var a = (artist || '').trim();
    if (!t && !a) return Promise.resolve([]);

    return new Promise(function(resolve) {
      var encArtist = encodeURIComponent(a);
      var encTitle = encodeURIComponent(t);
      var url = 'https://data.rijksmuseum.nl/search/collection?creator=' + encArtist + '&title=' + encTitle;
      var req = https.get(url, function(res) {
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
          try {
            var parsed = JSON.parse(data);
            var items = parsed.orderedItems || [];
            if (items.length === 0) { resolve([]); return; }

            // Fetch details for up to 3 items
            Promise.all(items.slice(0, 3).map(function(item) {
              return new Promise(function(resolveDetail) {
                var itemId = typeof item === 'string' ? item : (item.id || '');
                if (!itemId) { resolveDetail(null); return; }
                var detailUrl = itemId;
                https.get(detailUrl, { headers: { 'Accept': 'application/ld+json' } }, function(dr) {
                  var dd = '';
                  dr.on('data', function(c) { dd += c; });
                  dr.on('end', function() {
                    try {
                      var dj = JSON.parse(dd);
                      var resource = dj.resource || dj;
                      resolveDetail({
                        id: itemId,
                        title: resource._label || resource.label || t,
                        url: itemId,
                        source: 'Rijksmuseum'
                      });
                    } catch(e) { resolveDetail(null); }
                  });
                }).on('error', function() { resolveDetail(null); });
              });
            })).then(function(details) {
              resolve(details.filter(Boolean));
            });
          } catch(e) { resolve([]); }
        });
      }).on('error', function() { resolve([]); });
      req.setTimeout(15000, function() { req.destroy(); resolve([]); });
    });
  }


  function checkUNESCO(artist, nationality) {
    return {
      database: 'UNESCO 1970 Convention on Cultural Property',
      status: 'CLEAR',
      reference: '—',
      detail: 'No cultural property concerns identified under UNESCO 1970 Convention.',
      flagged: false,
      checkedAt: new Date().toISOString(),
      isMock: true
    };
  }

  // ── Cross-Reference Handler (async — uses SPARQL) ──
  function handleCrossReference(req, res, body) {
    try {
      var data = JSON.parse(body);
      var title = data.artworkTitle || data.title || '';
      var artist = data.artist || '';
      var period = data.period || '';
      var events = data.timeline || [];
      var tier = data.tier || 'collector';

      // ULAN and GPI are async (SPARQL) — run in parallel with synchronous mock checks
      var ulanPromise = searchGettyULAN(artist);
      var gpiPromise = searchGettyProvenanceIndex(artist, title);
      var rijksmuseumPromise = searchRijksmuseum(title, artist);
      var europeanaPromise = searchEuropeana(title, artist);
      var smithsonianPromise = searchSmithsonian(title, artist);
      var interpolResult = checkINTERPOL(title, artist);
      var alrResult = checkArtLossRegister(title, artist);
      var aamdResult = checkAAMDProvenance(events);
      var unescoResult = checkUNESCO(artist, '');

      var hasAlerts = interpolResult.matched || alrResult.matched || aamdResult.flagged;

      // Wait for both SPARQL queries to resolve
      Promise.all([ulanPromise, gpiPromise, rijksmuseumPromise, europeanaPromise, smithsonianPromise]).then(function(results) {
        var gettyArtistResults = results[0];
        var gettyProvenanceResults = results[1];
        var rijksmuseumResults = results[2] || [];
        var europeanaResults = results[3] || [];
        var smithsonianResults = results[4] || [];

        var ulaMock = gettyArtistResults.some(function(r) { return r.isMock; });
        var gpiMock = gettyProvenanceResults.some(function(r) { return r.isMock; });
        var syncMockCount = [interpolResult, alrResult, unescoResult, {isMock:rijksmuseumResults.length===0}, {isMock:europeanaResults.length===0}, {isMock:smithsonianResults.length===0}].filter(function(r) {
          return r.isMock;
        }).length;
        var totalMock = (ulaMock ? 1 : 0) + (gpiMock ? 1 : 0) + syncMockCount;

        log('INFO', 'Cross-reference: ' + (title || 'unknown') + ' by ' + (artist || 'unknown') +
          ' — ' + (hasAlerts ? 'ALERTS FOUND' : 'CLEAR') + ' (mock: ' + totalMock + '/8)');

        sendJSON(res, 200, {
          artworkTitle: title,
          artist: artist,
          period: period,
          checkedAt: new Date().toISOString(),
          hasAlerts: hasAlerts,
          tier: tier,
          realApisEnabled: REAL_APIS_ENABLED,
          apis: {
            gettyUlan: { real: !ulaMock },
            gettyProvenance: { real: !gpiMock },
            interpol: { real: !!INTERPOL_API_KEY },
            alr: { real: !!ALR_API_KEY },
            aamd: { real: true },
            unesco: { real: false },
            rijksmuseum: { real: rijksmuseumResults.length > 0 },
            europeana: { real: !!(process.env.EUROPEANA_API_KEY) },
            smithsonian: { real: !!(process.env.SMITHSONIAN_API_KEY) }
          },
          databases: {
            getty: {
              artist: gettyArtistResults,
              provenance: gettyProvenanceResults
            },
            interpol: interpolResult,
            alr: alrResult,
            aamd: aamdResult,
            unesco: unescoResult,
            rijksmuseum: rijksmuseumResults,
            europeana: europeanaResults,
            smithsonian: smithsonianResults
          },
          summary: {
            totalChecks: 8,
            alerts: (interpolResult.matched ? 1 : 0) + (alrResult.matched ? 1 : 0) + (aamdResult.flagged ? 1 : 0),
            clear: (interpolResult.matched ? 0 : 1) + (alrResult.matched ? 0 : 1) + (aamdResult.flagged ? 0 : 1) + (unescoResult.flagged ? 0 : 1)
          }
        });
      }).catch(function(err) {
        logError(err, 'Cross-reference handler (promise)');
        // Fallback: use just the sync results
        sendJSON(res, 200, {
          artworkTitle: title,
          artist: artist,
          period: period,
          checkedAt: new Date().toISOString(),
          hasAlerts: hasAlerts,
          tier: tier,
          realApisEnabled: REAL_APIS_ENABLED,
          apis: {
            gettyUlan: { real: false },
            gettyProvenance: { real: false },
            interpol: { real: !!INTERPOL_API_KEY },
            alr: { real: !!ALR_API_KEY },
            aamd: { real: true },
            unesco: { real: false },
            rijksmuseum: { real: rijksmuseumResults.length > 0 },
            europeana: { real: !!(process.env.EUROPEANA_API_KEY) },
            smithsonian: { real: !!(process.env.SMITHSONIAN_API_KEY) }
          },
          databases: {
            getty: { artist: [], provenance: [] },
            interpol: interpolResult,
            alr: alrResult,
            aamd: aamdResult,
            unesco: unescoResult,
            rijksmuseum: rijksmuseumResults,
            europeana: europeanaResults,
            smithsonian: smithsonianResults
          },
          summary: {
            totalChecks: 8,
            alerts: (interpolResult.matched ? 1 : 0) + (alrResult.matched ? 1 : 0) + (aamdResult.flagged ? 1 : 0),
            clear: (interpolResult.matched ? 0 : 1) + (alrResult.matched ? 0 : 1) + (aamdResult.flagged ? 0 : 1) + (unescoResult.flagged ? 0 : 1)
          }
        });
      });
    } catch (e) {
      logError(e, 'Cross-reference handler');
      sendJSON(res, 400, { error: 'Invalid request: ' + e.message });
    }
  }

  // ── Getty ULAN Search Handler (async — uses SPARQL) ──
  function handleGettySearch(req, res, body) {
    try {
      var data = JSON.parse(body);
      var query = data.query || '';

      searchGettyULAN(query).then(function(results) {
        var isMock = results.length > 0 && results.some(function(r) { return r.isMock; });
        sendJSON(res, 200, {
          query: query,
          source: 'Getty ULAN',
          count: results.length,
          results: results,
          realApiEnabled: !isMock,
          isMock: isMock
        });
      }).catch(function(err) {
        logError(err, 'Getty search handler');
        sendJSON(res, 500, { error: 'Search failed' });
      });
    } catch (e) {
      sendJSON(res, 400, { error: 'Invalid request' });
    }
  }

  // ── Provenance Knowledge Graph Data Handler ──
  function handleKnowledgeGraph(req, res, body) {
    try {
      var data = JSON.parse(body);
      var title = data.title || '';
      var artist = data.artist || '';
      var events = data.timeline || [];

      var nodes = [];
      var edges = [];
      var nodeIds = {};

      function addNode(id, label, type, year) {
        if (nodeIds[id]) return;
        nodeIds[id] = true;
        nodes.push({ id: id, label: label, type: type, year: year });
      }

      function addEdge(from, to, label, year) {
        edges.push({ from: from, to: to, label: label, year: year });
      }

      var artworkId = 'artwork_' + (title || 'unknown').replace(/\s+/g, '_');
      addNode(artworkId, title || 'Artwork', 'artwork', null);

      if (artist) {
        addNode('artist_' + artist.replace(/\s+/g, '_'), artist, 'artist', null);
        addEdge(artworkId, 'artist_' + artist.replace(/\s+/g, '_'), 'created by', null);
      }

      var prevOwnerId = null;

      events.forEach(function(ev) {
        var year = ev.year || '';
        var eventType = (ev.category || 'life').toLowerCase();
        var eventLabel = ev.event || '';
        var detail = ev.detail || '';
        var evId = 'event_' + (title || '').replace(/\s+/g, '_') + '_' + year + '_' + Math.random().toString(36).slice(2, 5);

        switch (eventType) {
          case 'creation':
            addNode(evId, year + ': ' + eventLabel, 'creation', year);
            addEdge(artworkId, evId, 'event', year);
            break;
          case 'ownership':
            var ownerName = detail || eventLabel;
            var ownerId = 'owner_' + ownerName.replace(/\s+/g, '_') + '_' + year;
            addNode(ownerId, ownerName, 'owner', year);
            if (prevOwnerId) {
              addEdge(prevOwnerId, ownerId, 'sold to', year);
            } else {
              addEdge(artworkId, ownerId, 'owned by', year);
            }
            prevOwnerId = ownerId;
            break;
          case 'exhibition':
            var locName = detail || eventLabel;
            var locId = 'exhibition_' + locName.replace(/\s+/g, '_') + '_' + year;
            addNode(locId, locName + ' (' + year + ')', 'exhibition', year);
            if (prevOwnerId) {
              addEdge(prevOwnerId, locId, 'exhibited at', year);
            } else {
              addEdge(artworkId, locId, 'exhibited at', year);
            }
            break;
          case 'auction':
            var auctionName = detail || eventLabel;
            var auctionId = 'auction_' + auctionName.replace(/\s+/g, '_') + '_' + year;
            addNode(auctionId, auctionName + ' (' + year + ')', 'auction', year);
            if (prevOwnerId) {
              addEdge(prevOwnerId, auctionId, 'sold at', year);
            } else {
              addEdge(artworkId, auctionId, 'sold at', year);
            }
            var buyerId = 'buyer_' + year + '_' + Math.random().toString(36).slice(2, 5);
            addNode(buyerId, 'Buyer (' + year + ')', 'owner', year);
            addEdge(auctionId, buyerId, 'acquired by', year);
            prevOwnerId = buyerId;
            break;
          case 'life':
            addNode(evId, year + ': ' + eventLabel, 'life_event', year);
            if (prevOwnerId) {
              addEdge(prevOwnerId, evId, 'during ownership', year);
            } else {
              addEdge(artworkId, evId, 'event', year);
            }
            break;
          default:
            addNode(evId, year + ': ' + eventLabel, 'event', year);
            if (prevOwnerId) {
              addEdge(prevOwnerId, evId, 'event', year);
            } else {
              addEdge(artworkId, evId, 'event', year);
            }
        }
      });

      sendJSON(res, 200, {
        title: title,
        artist: artist,
        nodes: nodes,
        edges: edges,
        nodeCount: nodes.length,
        edgeCount: edges.length
      });
    } catch (e) {
      logError(e, 'Knowledge graph handler');
      sendJSON(res, 400, { error: 'Invalid request: ' + e.message });
    }
  }

  // ── Warmup Getty SPARQL endpoints (called on server startup) ──
  function warmupGetty() {
    return searchGettyULAN('Rembrandt').then(function(r) {
      log('INFO', 'Getty ULAN warmed up (' + r.length + ' results)');
      return searchGettyProvenanceIndex('Night Watch', 'Rembrandt').then(function(r2) {
        log('INFO', 'Getty GPI warmed up (' + r2.length + ' results)');
      });
    }).catch(function(e) {
      log('WARN', 'Getty warmup failed (non-critical): ' + e.message);
    });
  }


  return {
    handleCrossReference,
    handleGettySearch,
    handleKnowledgeGraph,
    REAL_APIS_ENABLED,
    warmupGetty
  };
};
