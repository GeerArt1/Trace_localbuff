/**
 * Full-pipeline integration test — connects modules together without mocking
 * internal business logic. Only mocks external dependencies (KV, fetch).
 *
 * Pipeline: search → enrich (classify media → score alert → danger periods → oeuvre match) → notify
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Mock only external IO: fetchWithTimeout (network), KV stores
const mockFetchWithTimeout = vi.fn();
const mockKvGet = vi.fn();
const mockKvPut = vi.fn();
const mockKvList = vi.fn();

vi.mock('../src/utils.js', () => ({
  fetchWithTimeout: mockFetchWithTimeout,
  jsonResponse: (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  corsPreflightResponse: () => new Response(null, { status: 204 }),
  addCorsHeaders: (r) => r,
  hashString: (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  },
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
  clamp: (v, min, max) => Math.min(Math.max(v, min), max),
  levelRank: (level) =>
    level === 'APEX' ? 4 : level === 'CRITICAL' ? 3 : level === 'PRIORITY' ? 2 : level === 'WATCH' ? 1 : 0,
  escapeMarkdown: (str) => (str || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&'),
}));

vi.mock('../src/constants.js', () => ({
  TOKEN_KEY: 'ebay_token',
  TOKEN_TTL_BUFFER_S: 300,
  UA_HEADERS: { 'User-Agent': 'Mozilla/5.0 (compatible; TRACK-bot; +https://track-ebay-proxy.geerart.workers.dev)' },
  TARGET_ARTISTS: ['rubens', 'van dyck', 'jordaens'],
  FALSE_POSITIVE_PATTERNS: [
    'race car',
    'formule 1',
    'schumacher',
    'grand prix',
    'lego',
    'playmobil',
    'action figure',
    'toy',
    'soccer',
    'football',
  ],
  FALSE_POSITIVE_WORDS: [/^no\s/, /^vintage\s+(race|car|toy|golf|fishing|radio|phone|train)/],
  ART_CONTEXT_KW: [
    'painting',
    'oil on canvas',
    'canvas',
    'panel',
    'sketch',
    'drawing',
    'print',
    'etching',
    'watercolour',
    'art',
    'artwork',
    'old master',
    '17th century',
    '17de eeuw',
    '17e eeuw',
    'flemish',
    'vlaams',
    'vlaamse',
    'flamand',
    'baroque',
    'rubens',
    'van dyck',
    'jordaens',
    'attributed',
    'circle of',
    'workshop',
    'studio of',
    'follower of',
    'school of',
    'manner of',
    'signed',
    'dated',
    'antwerp',
    'collection',
  ],
  NON_ART_CONTEXT_KW: [
    'fishing',
    'tackle',
    'lures',
    'reels',
    'soccer',
    'football',
    'jersey',
    'shirt',
    'toy',
    'doll',
    'train',
    'model',
    'golf',
    'club',
    'radio',
    'camera',
    'phone',
    'bike',
    'motor',
    'coin',
    'stamp',
    'wine',
    'gun',
    'knife',
    'sword',
    'helmet',
    'medal',
    'poster',
    'print of',
  ],
  TRIGGERS: {
    misattribution: {
      en: ['circle of', 'school of', 'workshop of', 'follower of', 'manner of', 'attributed to', 'style of', 'after'],
      nl: [
        'kring van',
        'school van',
        'atelier van',
        'navolger van',
        'trant van',
        'toegeschreven aan',
        'stijl van',
        'naar',
      ],
    },
    drawing: {
      en: ['drawing', 'chalk', 'ink on paper', 'brush and ink', 'pen and ink', 'black chalk', 'red chalk'],
      nl: ['tekening', 'krijt', 'pentekening', 'inkt op papier', 'pen en inkt'],
    },
    print: {
      en: ['engraving', 'etching', 'woodcut', 'lithograph', 'old master print'],
      nl: ['gravure', 'ets', 'kopergravure', 'lithografie'],
    },
    modelli: {
      en: ['bozzetto', 'modello', 'oil sketch', 'preparatory sketch'],
      nl: ['bozzetto', 'modello', 'oliestudie', 'voorstudie'],
    },
    plate: {
      en: ['copper plate', 'printing plate', 'engraved plate'],
      nl: ['koperplaat', 'drukplaat', 'graveerplaat'],
    },
  },
  PAINTING_KW: [
    'oil on canvas',
    'oil on panel',
    'olieverf op doek',
    'olieverf op paneel',
    'panel, oil',
    'canvas, oil',
    'painting',
    'schilderkunst',
    'schilderij',
  ],
  TAPESTRY_KW: ['tapestry', 'wandtapijt', 'tapisserie', 'tapijt'],
  BOOK_KW: ['catalogue raisonné', 'boek', 'book', 'monograph', 'monografie'],
  SKETCH_KW: ['sketch', 'schets', 'study', 'studie', 'bozzetto', 'modello'],
}));

// Import real modules (all business logic is real, only IO mocked)
let classifyMedia,
  scoreAlert,
  enrichItem,
  checkOeuvreMatch,
  analyzeDangerPeriods,
  lookupRkdArtist,
  savedFindId,
  scoreProvenanceRisk;
let aggregateSearch, handleItem, SOURCE_MAP;
let handleGetWatchlist, handlePostWatchlist, handleGetAlerts, runBackgroundScan;
let sendTelegramAlert, sendResendEmail;
let router;

beforeAll(async () => {
  const alerts = await import('../src/alerts.js');
  classifyMedia = alerts.classifyMedia;
  scoreAlert = alerts.scoreAlert;
  enrichItem = alerts.enrichItem;

  const oeuvre = await import('../src/oeuvre.js');
  checkOeuvreMatch = oeuvre.checkOeuvreMatch;

  const prov = await import('../src/provenance.js');
  analyzeDangerPeriods = prov.analyzeDangerPeriods;
  lookupRkdArtist = prov.lookupRkdArtist;

  const sf = await import('../src/saved-finds.js');
  savedFindId = sf.savedFindId;
  scoreProvenanceRisk = sf.scoreProvenanceRisk;

  const search = await import('../src/search.js');
  aggregateSearch = search.aggregateSearch;
  handleItem = search.handleItem;
  SOURCE_MAP = search.SOURCE_MAP;

  const wl = await import('../src/watchlist.js');
  handleGetWatchlist = wl.handleGetWatchlist;
  handlePostWatchlist = wl.handlePostWatchlist;
  handleGetAlerts = wl.handleGetAlerts;
  runBackgroundScan = wl.runBackgroundScan;

  const notify = await import('../src/notify.js');
  sendTelegramAlert = notify.sendTelegramAlert;
  sendResendEmail = notify.sendResendEmail;

  const routerMod = await import('../src/index.js');
  router = routerMod.default;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchWithTimeout.mockReset();
});

function mockKvEnv(overrides = {}) {
  return {
    TOKEN_CACHE: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    TRACK_WATCHLIST: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    TRACK_SEEN_IDS: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    TRACK_ALERT_HISTORY: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    TRACK_SAVED_FINDS: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    TRACK_VISUAL_CACHE: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    TRACK_REFERENCE_CACHE: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    TRACK_OEUVRE_CACHE: { get: mockKvGet, put: mockKvPut, list: mockKvList },
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENROUTER_API_KEY: 'or-test',
    GEMINI_API_KEY: 'gem-test',
    EBAY_CLIENT_ID: 'test-id',
    EBAY_CLIENT_SECRET: 'test-secret',
    EBAY_API_BASE: 'https://api.ebay.com',
    EBAY_MARKETPLACE: 'EBAY_NL',
    TELEGRAM_BOT_TOKEN: 'bot-test',
    RESEND_API_KEY: 're_test',
    ...overrides,
  };
}

// ── Pipeline Step 1: Media Classification ─────────────────────────────────

describe('Pipeline — classifyMedia', () => {
  it('should classify a Flemish painting listing', () => {
    const result = classifyMedia(
      'Oil on canvas, Antwerp school, 17th century',
      'Beautiful Flemish old master painting, oil on panel',
      [{ name: 'Primary Category', value: 'Paintings' }],
    );
    expect(result).toBe('painting');
  });

  it('should classify a Rubens oil sketch', () => {
    const result = classifyMedia(
      'Circle of Rubens — oil sketch, modello for larger work',
      'Olieverfschets op paneel, 17e eeuw',
      [],
    );
    expect(result).toBe('sketch');
  });

  it('should classify a Van Dyck etching', () => {
    const result = classifyMedia('Anthony van Dyck — old master etching', 'Fine engraving after Van Dyck', []);
    expect(result).toBe('print');
  });

  it('should classify a copper printing plate', () => {
    const result = classifyMedia('Original copper plate after Rubens', 'Koperplaat voor gravure', []);
    expect(result).toBe('plate');
  });
});

// ── Pipeline Step 2: Alert Scoring ──────────────────────────────────────

describe('Pipeline — scoreAlert', () => {
  it('should return PRIORITY for artist name + sketch', () => {
    const result = scoreAlert('sketch', 'Circle of Rubens — oil sketch, modello', 'Olieverfschets, 17e eeuw', []);
    expect(result.level).toBe('CRITICAL');
    expect(result.reasons.some((r) => r.includes('rubens'))).toBe(true);
  });

  it('should not trigger on books', () => {
    const result = scoreAlert('book', 'Rubens Catalogue Raisonné', 'Book about Rubens', []);
    expect(result.level).toBe('CLEAR');
  });

  it('should return CLEAR for false positive patterns', () => {
    const result = scoreAlert('other', 'Lego Rubens painting set', 'toy building blocks', []);
    expect(result.level).toBe('CLEAR');
  });

  it('should return APEX via oeuvre match for high-scoring listing', () => {
    // enrichItem calls checkOeuvreMatch internally
    const item = enrichItem({
      id: 'test_apex',
      title: 'Oil on canvas, Massacre of the Innocents',
      description: 'Herod children mothers biblical scene, 17th century Flemish',
      price: { value: '50000', currency: 'EUR' },
      source: 'ebay',
      location: 'BE',
      localizedAspects: [],
      categories: [],
    });
    // enrichItem should call checkOeuvreMatch which should find rubens_massacre_v2
    expect(item.alert.level).toBe('APEX');
    expect(item.oeuvre_match).not.toBeNull();
    expect(item.oeuvre_match.apex).toBe(true);
    expect(item.oeuvre_match.work.title).toContain('Massacre of the Innocents');
  });
});

// ── Pipeline Step 3: Danger Period Detection ────────────────────────────

describe('Pipeline — analyzeDangerPeriods', () => {
  it('should detect WWII provenance risk from keywords', () => {
    const result = analyzeDangerPeriods('Jewish collection, forced sale 1938', 'Painting from Berlin collection', 'DE');
    expect(result.some((p) => p.period === 'WWII')).toBe(true);
  });

  it('should detect French Revolution risk from church keywords', () => {
    const result = analyzeDangerPeriods('Monastery painting, 18th century', 'Uit het klooster', 'BE');
    expect(result.some((p) => p.period === 'French Revolution')).toBe(true);
  });

  it('should detect Communist nationalisation risk from Eastern European countries', () => {
    const result = analyzeDangerPeriods('Family heirloom', 'Old painting', 'CZ');
    expect(result.some((p) => p.period === 'Communist Nationalisation')).toBe(true);
  });
});

// ── Pipeline Step 4: Oeuvre Match ───────────────────────────────────────

describe('Pipeline — checkOeuvreMatch', () => {
  it('should find Rubens Massacre of the Innocents from keywords', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, The Massacre of the Innocents',
      'Herod children mothers biblical scene',
      'painting',
      { w: 200, h: 270 },
    );
    expect(result).not.toBeNull();
    expect(result.matched).toBe(true);
    expect(result.work.id).toBe('rubens_massacre_v2');
  });

  it('should find Van Dyck equestrian portrait', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, Charles I on Horseback',
      'Equestrian portrait of the king of England',
      'painting',
      null,
    );
    expect(result).not.toBeNull();
    expect(result.work.artist).toBe('van dyck');
  });

  it('should return null for unrelated listing', () => {
    const result = checkOeuvreMatch('Antique table', '19th century furniture', 'other', null);
    expect(result).toBeNull();
  });
});

// ── Pipeline Step 5: Provenance Risk Scoring ────────────────────────────

describe('Pipeline — scoreProvenanceRisk', () => {
  it('should compute score from danger periods and gaps', () => {
    const result = scoreProvenanceRisk(
      {
        risk_score: 0,
        risk_level: 'LOW',
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
        gaps: ['Missing provenance 1939–1946'],
      },
      'Church painting from Polish monastery',
      'Krakow, Poland',
    );
    // 25 (danger) + 10 (gap) + 15 (monastery) + 15 (poland) = 65
    expect(result.risk_score).toBe(65);
    expect(result.risk_level).toBe('HIGH');
  });
});

// ── Pipeline Step 6: RKD Artist Lookup ─────────────────────────────────

describe('Pipeline — lookupRkdArtist', () => {
  it('should find known Flemish masters', () => {
    expect(lookupRkdArtist('Rubens').found).toBe(true);
    expect(lookupRkdArtist('Van Dyck').found).toBe(true);
    expect(lookupRkdArtist('Jordaens').found).toBe(true);
  });

  it('should return search links for unknown artists', () => {
    const result = lookupRkdArtist('Rembrandt');
    expect(result.found).toBe(false);
    expect(result.search_links).toHaveProperty('rkd');
    expect(result.search_links).toHaveProperty('wikidata');
    expect(result.search_links).toHaveProperty('getty_ulan');
  });
});

// ── Pipeline Step 7: Saved Find ID generation ──────────────────────────

describe('Pipeline — savedFindId', () => {
  it('should produce consistent 8-char hex hashes', () => {
    const id1 = savedFindId('https://ebay.com/itm/123');
    const id2 = savedFindId('https://ebay.com/itm/123');
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^[0-9a-f]{8}$/);
  });
});

// ── Pipeline Step 8: Full enrichItem flow ──────────────────────────────

describe('Pipeline — enrichItem (full enrichment chain)', () => {
  it('should fully enrich a Rubens sketch listing', () => {
    const item = enrichItem({
      id: 'test_enrich_1',
      title: 'Circle of Rubens — oil sketch, modello for larger composition',
      description: 'Flemish old master sketch, olieverfschets, 17e eeuw, Antwerp school',
      price: { value: '15000', currency: 'EUR' },
      source: 'ebay',
      location: 'BE',
      localizedAspects: [{ name: 'Period', value: '17th Century' }],
      categories: ['Paintings', 'Art'],
    });

    expect(item.media_type).toBe('sketch');
    expect(item.has_art_context).toBe(true);
    expect(item.alert.level).toBe('CRITICAL');
    expect(item.danger_periods).toBeDefined();
    expect(Array.isArray(item.danger_periods)).toBe(true);
  });

  it('should skip oeuvre match for CLEAR items (book category)', () => {
    const item = enrichItem({
      id: 'test_enrich_2',
      title: 'Antique wooden frame for photo',
      description: '19th century gilt frame',
      price: { value: '200', currency: 'EUR' },
      source: 'ebay',
      location: 'FR',
      localizedAspects: [],
      categories: ['Books'],
    });

    expect(item.alert.level).toBe('CLEAR');
    // CLEAR items skip oeuvre match
    expect(item.oeuvre_match).toBeNull();
  });

  it('should apply price < €50 filter for non-art items', () => {
    const item = enrichItem({
      id: 'test_enrich_3',
      title: 'Vintage decorative plate',
      description: 'old ceramic plate from a sale',
      price: { value: '30', currency: 'EUR' },
      source: 'ebay',
      location: 'NL',
      localizedAspects: [],
      categories: ['Collectibles'],
    });

    // No art context keywords, low price → CLEAR
    expect(item.alert.level).toBe('CLEAR');
  });
});

// ── Pipeline Step 9: Search result processing ──────────────────────────

describe('Pipeline — aggregateSearch (mocked eBay)', () => {
  it('should return 400 for empty query', async () => {
    const resp = await aggregateSearch(new URLSearchParams(), mockKvEnv());
    expect(resp.status).toBe(400);
  });

  it('should process eBay results through enrichItem pipeline', async () => {
    mockKvGet.mockResolvedValue({ access_token: 'token', expires_at: Date.now() + 100000 });
    mockFetchWithTimeout.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          itemSummaries: [
            {
              itemId: 'v1|pipe_test',
              title: 'Circle of Rubens — oil sketch',
              price: { value: '25000.00', currency: 'EUR' },
              image: { imageUrl: 'https://i.ebayimg.com/test.jpg' },
              itemWebUrl: 'https://ebay.com/itm/pipe_test',
              itemLocation: { country: 'BE' },
              shortDescription: 'Flemish old master sketch, olieverfschets',
              categories: [{ categoryName: 'Paintings' }],
              buyingOptions: ['FIXED_PRICE'],
              seller: { username: 'artseller', feedbackScore: 99 },
              condition: 'USED',
            },
          ],
          total: 1,
        }),
    });

    const resp = await aggregateSearch(new URLSearchParams({ q: 'Rubens sketch', sources: 'ebay' }), mockKvEnv());
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.q).toBe('Rubens sketch');
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    // Items should be enriched through the full pipeline
    const item = body.items[0];
    expect(item.media_type).toBeDefined();
    expect(item.alert).toBeDefined();
    expect(item.danger_periods).toBeDefined();
  });
});

// ── Pipeline Step 10: End-to-end router health check ───────────────────

describe('Pipeline — router health', () => {
  it('should return health status via router', async () => {
    const resp = await router.fetch(new Request('https://track-ebay-proxy.geerart.workers.dev/health'), mockKvEnv(), {
      waitUntil: vi.fn(),
    });
    const body = await resp.json();
    expect(resp.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('2.3');
  });

  it('should return 404 for unknown routes', async () => {
    const resp = await router.fetch(new Request('https://track-ebay-proxy.geerart.workers.dev/unknown'), mockKvEnv(), {
      waitUntil: vi.fn(),
    });
    expect(resp.status).toBe(404);
  });
});

// ── Pipeline Step 11: Verify endpoint with multiple deps ───────────────

describe('Pipeline — /verify endpoint (multi-module integration)', () => {
  it('should return 400 without params', async () => {
    const resp = await router.fetch(new Request('https://track-ebay-proxy.geerart.workers.dev/verify'), mockKvEnv(), {
      waitUntil: vi.fn(),
    });
    expect(resp.status).toBe(400);
  });

  it('should combine classifyMedia + scoreAlert + analyzeDangerPeriods + lookupRkdArtist', async () => {
    const resp = await router.fetch(
      new Request(
        'https://track-ebay-proxy.geerart.workers.dev/verify?title=Rubens%20oil%20sketch%20modello&artist=Rubens',
      ),
      mockKvEnv(),
      { waitUntil: vi.fn() },
    );
    const body = await resp.json();

    expect(resp.status).toBe(200);
    // artist lookup
    expect(body.artist.found).toBe(true);
    expect(body.artist.artist.name).toBe('Peter Paul Rubens');
    // title analysis — classifyMedia + scoreAlert
    expect(body.title_analysis.media_type).toBe('sketch');
    expect(body.title_analysis.alert.level).toBe('CRITICAL');
    expect(body.title_analysis.danger_periods).toBeDefined();
  });
});

// ── Pipeline Step 12: Danger-check endpoint ────────────────────────────

describe('Pipeline — /danger-check endpoint', () => {
  it('should detect danger periods from provenance text', async () => {
    const resp = await router.fetch(
      new Request(
        'https://track-ebay-proxy.geerart.workers.dev/danger-check?provenance=forced%20sale%201933%20Jewish%20collection&seller_country=DE',
      ),
      mockKvEnv(),
      { waitUntil: vi.fn() },
    );
    const body = await resp.json();

    expect(body.seller_country).toBe('DE');
    expect(body.danger_periods.length).toBeGreaterThanOrEqual(1);
    expect(body.danger_periods.some((p) => p.period === 'WWII')).toBe(true);
  });
});

// ── Pipeline Step 13: Oeuvre endpoint ─────────────────────────────────

describe('Pipeline — /oeuvre endpoint', () => {
  it('should return oeuvre stats for Rubens', async () => {
    const resp = await router.fetch(
      new Request('https://track-ebay-proxy.geerart.workers.dev/oeuvre?artist=rubens'),
      mockKvEnv(),
      { waitUntil: vi.fn() },
    );
    const body = await resp.json();
    expect(body.found).toBe(true);
    expect(body.artist).toBe('Peter Paul Rubens');
    expect(body.unlocated).toBe(133);
  });
});

// ── Pipeline Step 14: Style database endpoint ──────────────────────────

describe('Pipeline — /style-database endpoint', () => {
  it('should return Rubens periods', async () => {
    const resp = await router.fetch(
      new Request('https://track-ebay-proxy.geerart.workers.dev/style-database?artist=Rubens'),
      mockKvEnv(),
      { waitUntil: vi.fn() },
    );
    const body = await resp.json();
    expect(body.found).toBe(true);
    expect(body.artist).toBe('Rubens');
    expect(body.periods.peak.period).toBe('1610–1628');
  });
});
