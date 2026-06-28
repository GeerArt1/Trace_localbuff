
/**
 * TRACE — External Database Integration Route
 * Getty ULAN, INTERPOL Stolen Works, Art Loss Register, RKD
 * Version 1.0.0
 */

const https = require('https');

// ── Configuration ──
const DB_CONFIG = {
  getty: {
    base: 'https://vocab.getty.edu/sparql.json',
    timeout: 15000
  },
  interpol: {
    base: 'https://www.interpol.int/Crimes/Cultural-heritage-crime/Stolen-works-of-art-database',
    timeout: 20000
  },
  rkd: {
    base: 'https://rkd.nl/en/explore/artists',
    timeout: 10000
  }
};

// ── SPARQL Queries ──
const SPARQL = {
  // Getty ULAN: Find artist by name
  gettyArtistSearch: function(name) {
    return 'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n' +
      'PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n' +
      'SELECT ?artist ?name ?nationality ?birth ?death WHERE {\n' +
      '  ?artist a skos:Concept ;\n' +
      '         skos:inScheme <http://vocab.getty.edu/ulan/> ;\n' +
      '         foaf:focus ?f .\n' +
      '  ?f foaf:name ?name .\n' +
      '  FILTER(CONTAINS(LCASE(?name), LCASE("' + name.replace(/"/g, '') + '"))) .\n' +
      '} LIMIT 10';
  },
  
  // Getty AAT: Find artwork type/medium
  gettyAATSearch: function(term) {
    return 'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n' +
      'SELECT ?concept ?label WHERE {\n' +
      '  ?concept skos:inScheme <http://vocab.getty.edu/aat/> ;\n' +
      '           skos:prefLabel ?label .\n' +
      '  FILTER(CONTAINS(LCASE(?label), LCASE("' + term.replace(/"/g, '') + '"))) .\n' +
      '} LIMIT 5';
  },
  
  // TGN: Find place by name
  gettyTGNLookup: function(place) {
    return 'PREFIX skos: <http://www.w3.org/2004/02/skos/core#>\n' +
      'SELECT ?place ?label WHERE {\n' +
      '  ?place a skos:Concept ;\n' +
      '         skos:inScheme <http://vocab.getty.edu/tgn/> ;\n' +
      '         skos:prefLabel ?label .\n' +
      '  FILTER(CONTAINS(LCASE(?label), LCASE("' + place.replace(/"/g, '') + '"))) .\n' +
      '} LIMIT 5';
  }
};


// ── SPARQL sanitizer ──
function sanitizeSPARQL(input) {
  return String(input)
    .replace(/["{}();\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

// ── Getty query builder (sanitized) ──
function buildGettyQuery(type, term) {
  var safe = sanitizeSPARQL(term);
  switch(type) {
    case 'artist':
      return SPARQL.gettyArtistSearch(safe);
    case 'aat':
      return SPARQL.gettyAATSearch(safe);
    case 'tgn':
      return SPARQL.gettyTGNLookup(safe);
    default:
      return SPARQL.gettyArtistSearch(safe);
  }
}

// ── HTTP helper ──
function httpGet(url, timeout) {
  return new Promise(function(resolve, reject) {
    var req = https.get(url, { timeout: timeout || 10000 }, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve({ raw: data, parseError: e.message });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Getty SPARQL Query ──
async function queryGetty(sparqlQuery) {
  var url = DB_CONFIG.getty.base + '?query=' + encodeURIComponent(sparqlQuery) + '&format=json';
  try {
    var result = await httpGet(url, DB_CONFIG.getty.timeout);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── INTERPOL Stolen Works Search ──
async function searchInterpol(keywords) {
  // INTERPOL doesn't have a public JSON API, so we simulate the search
  // In production, this would scrape or use a licensed API
  var url = DB_CONFIG.interpol.base + '?search=' + encodeURIComponent(keywords);
  return {
    success: true,
    note: 'INTERPOL database is not publicly queryable via API. Redirect to: ' + url,
    url: url,
    instructions: 'Manual search required. Use the link above to check the INTERPOL Stolen Works database.'
  };
}

// ── Art Loss Register Search ──
async function searchArtLossRegister(keywords) {
  // ALR is a subscription service, so we provide the search URL
  var url = 'https://www.artloss.com/en/search?q=' + encodeURIComponent(keywords);
  return {
    success: true,
    note: 'Art Loss Register requires a subscription for full API access.',
    url: url,
    instructions: 'Search the ALR database manually using the link above.'
  };
}

// ── RKD Artist Lookup ──
async function lookupRKD(artistName) {
  var url = DB_CONFIG.rkd.base + '/' + encodeURIComponent(artistName.replace(/\s+/g, '-').toLowerCase());
  return {
    success: true,
    url: url,
    instructions: 'RKD research page for ' + artistName + '. Open in browser for full details.'
  };
}

// ── Main lookup function ──
async function lookupAll(database, query) {
  switch(database) {
    case 'getty_ulan':
      var sparql = SPARQL.gettyArtistSearch(query);
      return await queryGetty(sparql);
    case 'getty_aat':
      var sparql = SPARQL.gettyAATSearch(query);
      return await queryGetty(sparql);
    case 'getty_tgn':
      var sparql = SPARQL.gettyTGNLookup(query);
      return await queryGetty(sparql);
    case 'interpol':
      return await searchInterpol(query);
    case 'artloss':
      return await searchArtLossRegister(query);
    case 'rkd':
      return await lookupRKD(query);
    default:
      return { success: false, error: 'Unknown database: ' + database };
  }
}

// ── Route handler ──
async function handleDatabaseLookup(req, res) {
  var url = new URL(req.url, 'http://localhost');
  var db = url.searchParams.get('db');
  var q = url.searchParams.get('q');
  
  if (!db || !q) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing db or q parameter', available: ['getty_ulan','getty_aat','getty_tgn','interpol','artloss','rkd'] }));
    return;
  }
  
  try {
    var result = await lookupAll(db, q);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ database: db, query: q, timestamp: new Date().toISOString(), ...result }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = function(ctx) {
  return { handleDatabaseLookup: handleDatabaseLookup, lookupAll: lookupAll, SPARQL: SPARQL };
};
