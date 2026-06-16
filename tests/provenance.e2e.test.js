// ══════════════════════════════════════════════
// TRACE — Provenance API E2E Tests
// Tests SPARQL-backed Getty ULAN cross-reference,
// Getty search, and knowledge graph endpoints.
// Run: npx playwright test tests/provenance.e2e.test.js
// ══════════════════════════════════════════════

const { test, expect } = require('@playwright/test');

const API_BASE = 'http://localhost:3000';

// ══════════════════════════════════════════════
// Cross-Reference
// ══════════════════════════════════════════════

test('POST /api/provenance/cross-reference returns structured response', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/cross-reference`, {
    data: {
      artworkTitle: 'The Night Watch',
      artist: 'Rembrandt van Rijn',
      period: 'Dutch Golden Age',
      timeline: [
        { year: '1642', event: 'Painted', detail: 'Commissioned by Captain Frans Banninck Cocq', category: 'creation' },
        { year: '1715', event: 'Moved', detail: 'Transferred to Amsterdam Town Hall', category: 'ownership' },
        { year: '1808', event: 'Exhibited', detail: 'Rijksmuseum, Amsterdam', category: 'exhibition' }
      ],
      tier: 'professional'
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  // Top-level fields
  expect(body).toHaveProperty('artworkTitle', 'The Night Watch');
  expect(body).toHaveProperty('artist', 'Rembrandt van Rijn');
  expect(body).toHaveProperty('hasAlerts');
  expect(body).toHaveProperty('checkedAt');
  expect(body).toHaveProperty('tier', 'professional');

  // Database results
  expect(body).toHaveProperty('databases');
  expect(body.databases).toHaveProperty('getty');
  expect(body.databases.getty).toHaveProperty('artist');
  expect(body.databases.getty).toHaveProperty('provenance');
  expect(body.databases).toHaveProperty('interpol');
  expect(body.databases).toHaveProperty('alr');
  expect(body.databases).toHaveProperty('aamd');
  expect(body.databases).toHaveProperty('unesco');

  // Getty ULAN results — real SPARQL query should return Rembrandt
  const artistResults = body.databases.getty.artist;
  expect(Array.isArray(artistResults)).toBeTruthy();
  expect(artistResults.length).toBeGreaterThan(0);
  const rembrandt = artistResults.find(r => r.name && r.name.toLowerCase().indexOf('rembrandt') >= 0);
  // Either real SPARQL returned Rembrandt, or mock fallback matched
  expect(rembrandt).toBeTruthy();

  // Getty Provenance Index — mock data
  const provenanceResults = body.databases.getty.provenance;
  expect(Array.isArray(provenanceResults)).toBeTruthy();
  expect(provenanceResults.length).toBeGreaterThan(0);

  // Per-database API status
  expect(body).toHaveProperty('apis');
  expect(body.apis).toHaveProperty('gettyUlan');
  expect(body.apis).toHaveProperty('gettyProvenance');
  expect(body.apis).toHaveProperty('interpol');
  expect(body.apis).toHaveProperty('alr');
  expect(body.apis).toHaveProperty('aamd');
  expect(body.apis).toHaveProperty('unesco');

  // Each API has a real boolean
  Object.keys(body.apis).forEach(key => {
    expect(body.apis[key]).toHaveProperty('real');
    expect(typeof body.apis[key].real).toBe('boolean');
  });

  // Summary
  expect(body).toHaveProperty('summary');
  expect(body.summary).toHaveProperty('totalChecks', 5);
  expect(body.summary).toHaveProperty('alerts');
  expect(typeof body.summary.alerts).toBe('number');
  expect(body.summary).toHaveProperty('clear');
  expect(typeof body.summary.clear).toBe('number');
});

test('POST /api/provenance/cross-reference returns isMock flags on every result', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/cross-reference`, {
    data: {
      artworkTitle: 'Mona Lisa',
      artist: 'Leonardo da Vinci',
      tier: 'collector'
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  // Getty artist results should have isMock (true or false)
  body.databases.getty.artist.forEach(r => {
    expect(r).toHaveProperty('isMock');
    expect(typeof r.isMock).toBe('boolean');
  });

  // Getty provenance results should have isMock
  body.databases.getty.provenance.forEach(r => {
    expect(r).toHaveProperty('isMock');
    expect(typeof r.isMock).toBe('boolean');
  });

  // INTERPOL, ALR, AAMD, UNESCO results should have isMock
  ['interpol', 'alr', 'aamd', 'unesco'].forEach(db => {
    expect(body.databases[db]).toHaveProperty('isMock');
    expect(typeof body.databases[db].isMock).toBe('boolean');
  });
});

test('POST /api/provenance/cross-reference works with accented artist names', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/cross-reference`, {
    data: {
      artworkTitle: 'The Persistence of Memory',
      artist: 'Salvador Dalí',  // Accented character
      tier: 'collector'
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  // Should still return results (mock fallback handles accented names)
  expect(body.databases.getty.artist.length).toBeGreaterThan(0);
  expect(body.databases.getty.provenance.length).toBeGreaterThan(0);
});

// ══════════════════════════════════════════════
// Getty Search
// ══════════════════════════════════════════════

test('POST /api/provenance/getty-search returns ULAN results', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/getty-search`, {
    data: { query: 'Vermeer' }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  expect(body).toHaveProperty('query', 'Vermeer');
  expect(body).toHaveProperty('source', 'Getty ULAN');
  expect(body).toHaveProperty('count');
  expect(body.count).toBeGreaterThan(0);
  expect(body).toHaveProperty('results');
  expect(Array.isArray(body.results)).toBeTruthy();

  // Each result should have required fields
  body.results.forEach(r => {
    expect(r).toHaveProperty('source', 'Getty ULAN');
    expect(r).toHaveProperty('type', 'artist');
    expect(r).toHaveProperty('id');
    expect(r).toHaveProperty('name');
    expect(r).toHaveProperty('isMock');
    expect(typeof r.isMock).toBe('boolean');
  });
});

test('POST /api/provenance/getty-search with empty query returns all mock artists', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/getty-search`, {
    data: { query: '' }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  expect(body.count).toBeGreaterThan(0);
  // All results should be mock (no SPARQL call for empty query)
  body.results.forEach(r => {
    expect(r.isMock).toBe(true);
  });
});

test('POST /api/provenance/getty-search with short query (< 2 chars) returns mock data', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/getty-search`, {
    data: { query: 'a' }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  // Short queries skip SPARQL and return mock
  expect(body.count).toBeGreaterThan(0);
});

// ══════════════════════════════════════════════
// Knowledge Graph
// ══════════════════════════════════════════════

test('POST /api/provenance/knowledge-graph builds graph from timeline', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/knowledge-graph`, {
    data: {
      title: 'Sunflowers',
      artist: 'Vincent van Gogh',
      timeline: [
        { year: '1888', event: 'Painted', detail: 'Arles, France', category: 'creation' },
        { year: '1901', event: 'Sold', detail: 'Private collection, Paris', category: 'ownership' },
        { year: '1973', event: 'Exhibited', detail: 'Van Gogh Museum', category: 'exhibition' },
        { year: '1987', event: 'Auctioned', detail: 'Christies London', category: 'auction' }
      ]
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  expect(body).toHaveProperty('title', 'Sunflowers');
  expect(body).toHaveProperty('artist', 'Vincent van Gogh');
  expect(body).toHaveProperty('nodes');
  expect(body).toHaveProperty('edges');
  expect(Array.isArray(body.nodes)).toBeTruthy();
  expect(Array.isArray(body.edges)).toBeTruthy();
  expect(body).toHaveProperty('nodeCount');
  expect(body).toHaveProperty('edgeCount');

  // Should have at least: artwork + artist + 4 event nodes
  expect(body.nodeCount).toBeGreaterThanOrEqual(6);
  // Should have at least 4 edges (connecting events)
  expect(body.edgeCount).toBeGreaterThanOrEqual(4);

  // Node structure validation
  body.nodes.forEach(n => {
    expect(n).toHaveProperty('id');
    expect(n).toHaveProperty('label');
    expect(n).toHaveProperty('type');
    expect(['artwork', 'artist', 'creation', 'owner', 'exhibition', 'auction', 'event', 'life_event'].includes(n.type)).toBeTruthy();
  });

  // Edge structure validation
  body.edges.forEach(e => {
    expect(e).toHaveProperty('from');
    expect(e).toHaveProperty('to');
    expect(e).toHaveProperty('label');
    expect(typeof e.from).toBe('string');
    expect(typeof e.to).toBe('string');
  });
});

test('POST /api/provenance/knowledge-graph handles minimal data', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/knowledge-graph`, {
    data: {
      title: 'Untitled',
      artist: '',
      timeline: []
    }
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();

  // Should still produce a basic graph with just the artwork node
  expect(body.nodeCount).toBeGreaterThanOrEqual(1);
});

test('POST /api/provenance/knowledge-graph handles missing fields', async ({ request }) => {
  const res = await request.post(`${API_BASE}/api/provenance/knowledge-graph`, {
    data: {}
  });
  // Should return 200 (graceful handling) or 400 (validation)
  // The handler defaults missing fields gracefully
  expect(res.ok()).toBeTruthy();
});
