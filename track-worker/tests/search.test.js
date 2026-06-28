import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock utils + alerts before search imports them
vi.mock('../src/utils.js', () => ({
  jsonResponse: (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  fetchWithTimeout: mockFetchWithTimeout,
  decodeHtml: (s) =>
    (s || '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim(),
  stripHtml: (html) =>
    (html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  clamp: (val, min, max) => Math.min(Math.max(val, min), max),
  levelRank: (level) =>
    level === 'APEX' ? 4 : level === 'CRITICAL' ? 3 : level === 'PRIORITY' ? 2 : level === 'WATCH' ? 1 : 0,
  hashString: (s) => 'testhash',
}));

vi.mock('../src/alerts.js', () => ({
  enrichItem: (item) => ({
    ...item,
    media_type: 'painting',
    has_art_context: true,
    alert: { level: 'WATCH', reasons: ['Test match'] },
    danger_periods: [],
    oeuvre_match: null,
  }),
}));

vi.mock('../src/constants.js', () => ({
  TOKEN_KEY: 'ebay_token',
  TOKEN_TTL_BUFFER_S: 300,
  UA_HEADERS: { 'User-Agent': 'Mozilla/5.0 Test' },
}));

const mockFetchWithTimeout = vi.fn();

let aggregateSearch, handleItem, SOURCE_MAP, ALL_SOURCES;
beforeAll(async () => {
  const mod = await import('../src/search.js');
  aggregateSearch = mod.aggregateSearch;
  handleItem = mod.handleItem;
  SOURCE_MAP = mod.SOURCE_MAP;
  ALL_SOURCES = mod.ALL_SOURCES;
});

beforeAll(() => {
  vi.clearAllMocks();
});

function params(q) {
  return new URLSearchParams(q);
}

function mkEnv(overrides = {}) {
  return {
    TOKEN_CACHE: { get: vi.fn(), put: vi.fn() },
    EBAY_CLIENT_ID: 'test-id',
    EBAY_CLIENT_SECRET: 'test-secret',
    EBAY_API_BASE: 'https://api.ebay.com',
    EBAY_MARKETPLACE: 'EBAY_NL',
    ...overrides,
  };
}

const mockEbaySummary = {
  itemSummaries: [
    {
      itemId: 'v1|12345',
      title: 'Rubens Painting Oil on Canvas',
      price: { value: '5000.00', currency: 'EUR' },
      image: { imageUrl: 'https://i.ebayimg.com/test.jpg' },
      itemWebUrl: 'https://ebay.com/itm/12345',
      itemLocation: { country: 'BE' },
      shortDescription: 'A beautiful painting',
      categories: [{ categoryName: 'Paintings' }],
      buyingOptions: ['FIXED_PRICE'],
      seller: { username: 'seller1', feedbackScore: 98 },
      condition: 'USED',
      itemEndDate: '2026-07-01T00:00:00Z',
    },
  ],
  total: 1,
};

describe('SOURCE_MAP structure', () => {
  it('should have all expected sources', () => {
    expect(ALL_SOURCES).toContain('ebay');
    expect(ALL_SOURCES).toContain('leboncoin');
    expect(ALL_SOURCES).toContain('2dehands');
    expect(ALL_SOURCES).toContain('marktplaats');
    expect(ALL_SOURCES).toContain('catawiki');
    expect(ALL_SOURCES).toContain('dorotheum');
  });

  it('catawiki and dorotheum should return blocked messages', async () => {
    const catawiki = await SOURCE_MAP.catawiki('Rubens');
    expect(catawiki.source).toBe('catawiki');
    expect(catawiki.error).toContain('blocks server-side requests');

    const dorotheum = await SOURCE_MAP.dorotheum('Rubens');
    expect(dorotheum.source).toBe('dorotheum');
    expect(dorotheum.error).toContain('blocks server-side requests');
  });
});

describe('aggregateSearch', () => {
  it('should return 400 when q is missing', async () => {
    const resp = await aggregateSearch(params({}), mkEnv());
    expect(resp.status).toBe(400);
    const body = await resp.json();
    expect(body.error).toBe('Missing q');
  });

  it('should return empty results when sources return no items', async () => {
    const env = mkEnv();
    env.TOKEN_CACHE.get.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });

    // Mock eBay search to return empty
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ itemSummaries: [], total: 0 }),
    });

    const resp = await aggregateSearch(params({ q: 'Rubens' }), env);
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.q).toBe('Rubens');
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.sources).toHaveProperty('ebay');
  });

  it('should use specified sources param', async () => {
    const env = mkEnv();
    env.TOKEN_CACHE.get.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEbaySummary),
    });

    const resp = await aggregateSearch(params({ q: 'Rubens', sources: 'ebay' }), env);
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(Object.keys(body.sources)).toEqual(['ebay']);
  });

  it('should use "all" to include all sources', async () => {
    const env = mkEnv();
    env.TOKEN_CACHE.get.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ itemSummaries: [], total: 0 }),
    });

    const resp = await aggregateSearch(params({ q: 'Rubens', sources: 'all' }), env);
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(Object.keys(body.sources).length).toBeGreaterThanOrEqual(6);
  });

  it('should apply media filter', async () => {
    const env = mkEnv();
    env.TOKEN_CACHE.get.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockEbaySummary),
    });

    const resp = await aggregateSearch(params({ q: 'Rubens', media: 'painting' }), env);
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('should clamp limit between 1 and 50', async () => {
    const env = mkEnv();
    env.TOKEN_CACHE.get.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ itemSummaries: [], total: 0 }),
    });

    const respHigh = await aggregateSearch(params({ q: 'Rubens', limit: '999' }), env);
    const bodyHigh = await respHigh.json();
    expect(respHigh.status).toBe(200);

    const respLow = await aggregateSearch(params({ q: 'Rubens', limit: '0' }), env);
    const bodyLow = await respLow.json();
    expect(respLow.status).toBe(200);
  });
});

describe('handleItem', () => {
  it('should return eBay item data', async () => {
    const env = mkEnv();
    env.TOKEN_CACHE.get.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ itemId: 'v1|12345', title: 'Test Item' }),
    });

    const resp = await handleItem('v1|12345', env);
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.itemId).toBe('v1|12345');
  });

  it('should return error on eBay API failure', async () => {
    const env = mkEnv();
    env.TOKEN_CACHE.get.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ errors: [{ message: 'Not found' }] }),
    });

    const resp = await handleItem('invalid', env);
    const body = await resp.json();

    expect(resp.status).toBe(404);
    expect(body.error).toBe('eBay API error');
  });
});
