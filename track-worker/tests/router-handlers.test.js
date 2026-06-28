import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ── Mock ALL imported module functions ──
const mockBuildVisionContent = vi.fn();
const mockCallAI = vi.fn();
const mockGetTierForTask = vi.fn();
const mockClassifyMedia = vi.fn();
const mockScoreAlert = vi.fn();
const mockAnalyzeDangerPeriods = vi.fn();
const mockLookupRkdArtist = vi.fn();
const mockAggregateSearch = vi.fn();
const mockHandleEbayItem = vi.fn();
const mockGetStyleData = vi.fn();
const mockHandleSaveFind = vi.fn();
const mockHandleGetSaves = vi.fn();
const mockHandleUpdateSave = vi.fn();
const mockHandleDeleteSave = vi.fn();
const mockRunProvenanceScan = vi.fn();
const mockSendTelegramAlert = vi.fn();
const mockSendResendEmail = vi.fn();
const mockHandleGetWatchlist = vi.fn();
const mockHandlePostWatchlist = vi.fn();
const mockHandleGetAlerts = vi.fn();
const mockRunBackgroundScan = vi.fn();
const mockHandleReport = vi.fn();
const mockHashString = vi.fn();

// Mock utils (jsonResponse, corsPreflightResponse, addCorsHeaders return real Response for inspection)
vi.mock('../src/utils.js', () => ({
  jsonResponse: (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  corsPreflightResponse: () => new Response(null, { status: 204 }),
  addCorsHeaders: (response) => response,
  hashString: mockHashString,
}));

vi.mock('../src/ai.js', () => ({
  buildVisionContent: mockBuildVisionContent,
  callAI: mockCallAI,
  getTierForTask: mockGetTierForTask,
}));

vi.mock('../src/alerts.js', () => ({
  classifyMedia: mockClassifyMedia,
  scoreAlert: mockScoreAlert,
}));

vi.mock('../src/provenance.js', () => ({
  analyzeDangerPeriods: mockAnalyzeDangerPeriods,
  lookupRkdArtist: mockLookupRkdArtist,
}));

vi.mock('../src/search.js', () => ({
  aggregateSearch: mockAggregateSearch,
  handleItem: mockHandleEbayItem,
}));

vi.mock('../src/oeuvre.js', () => ({
  OEUVRE_DATA: { rubens: { artist: 'Peter Paul Rubens', dates: '1577–1640', total_documented: 1403 } },
}));

vi.mock('../src/style.js', () => ({
  getStyleData: mockGetStyleData,
}));

vi.mock('../src/saved-finds.js', () => ({
  handleSaveFind: mockHandleSaveFind,
  handleGetSaves: mockHandleGetSaves,
  handleUpdateSave: mockHandleUpdateSave,
  handleDeleteSave: mockHandleDeleteSave,
  runProvenanceScan: mockRunProvenanceScan,
}));

vi.mock('../src/notify.js', () => ({
  sendTelegramAlert: mockSendTelegramAlert,
  sendResendEmail: mockSendResendEmail,
}));

vi.mock('../src/watchlist.js', () => ({
  handleGetWatchlist: mockHandleGetWatchlist,
  handlePostWatchlist: mockHandlePostWatchlist,
  handleGetAlerts: mockHandleGetAlerts,
  runBackgroundScan: mockRunBackgroundScan,
}));

vi.mock('../src/report.js', () => ({
  handleReport: mockHandleReport,
}));

vi.mock('../src/sentry.js', () => ({
  withSentry: (handlers) => handlers,
}));

// Import the router after all mocks are set up
let router;
beforeAll(async () => {
  const mod = await import('../src/index.js');
  router = mod.default;
});

/**
 * Build a Request with JSON body already serialized.
 * NOTE: destructure `body` out of opts so it doesn't get spread raw into new Request.
 */
function req(path, opts = {}) {
  const url = `https://track-ebay-proxy.geerart.workers.dev${path}`;
  const { body, ...rest } = opts;
  return new Request(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    ...rest,
    body: body ? JSON.stringify(body) : undefined,
  });
}

function mkEnv(overrides = {}) {
  return {
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENROUTER_API_KEY: 'or-test',
    GEMINI_API_KEY: 'gem-test',
    TRACK_VISUAL_CACHE: null,
    TRACK_SAVED_FINDS: null,
    TRACK_WATCHLIST: null,
    TRACK_ALERT_HISTORY: null,
    TRACK_SEEN_IDS: null,
    ...overrides,
  };
}

function ctx() {
  return { waitUntil: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHashString.mockImplementation((s) => 'ab' + s.slice(0, 6));
});

// ── Health ────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('should return status ok with version', async () => {
    const resp = await router.fetch(req('/health'), mkEnv(), ctx());
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.version).toBe('2.3');
    expect(body.modules).toContain('ai');
    expect(body.ai_tiers).toContain('economy (DeepSeek V4 Flash)');
  });

  it('should include season and month', async () => {
    const resp = await router.fetch(req('/health'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body).toHaveProperty('season');
    expect(body).toHaveProperty('month');
    expect(body).toHaveProperty('ts');
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────

describe('unknown route', () => {
  it('should return 404 for unknown paths', async () => {
    const resp = await router.fetch(req('/unknown'), mkEnv(), ctx());
    const body = await resp.json();

    expect(resp.status).toBe(404);
    expect(body.error).toBe('Not found');
  });
});

// ── OPTIONS (CORS preflight) ─────────────────────────────────────────────

describe('OPTIONS request', () => {
  it('should return 204 for CORS preflight', async () => {
    const resp = await router.fetch(
      new Request('https://track-ebay-proxy.geerart.workers.dev/search', { method: 'OPTIONS' }),
      mkEnv(),
      ctx(),
    );
    expect(resp.status).toBe(204);
  });
});

// ── POST /visual-screen ──────────────────────────────────────────────────

describe('POST /visual-screen', () => {
  it('should return 503 when no AI keys configured', async () => {
    const resp = await router.fetch(
      req('/visual-screen', { method: 'POST', body: { image_url: 'https://img.jpg' } }),
      mkEnv({ ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '', GEMINI_API_KEY: '' }),
      ctx(),
    );
    const body = await resp.json();
    expect(resp.status).toBe(503);
    expect(body.error).toBe('No AI provider configured');
  });

  it('should return 400 when image_url missing', async () => {
    const resp = await router.fetch(req('/visual-screen', { method: 'POST', body: {} }), mkEnv(), ctx());
    const body = await resp.json();
    expect(resp.status).toBe(400);
    expect(body.error).toBe('image_url required');
  });

  it('should return cached result when available', async () => {
    const cache = { get: vi.fn(), put: vi.fn() };
    cache.get.mockResolvedValue({ is_artwork: true, media_type: 'painting', confidence: 'high' });

    const resp = await router.fetch(
      req('/visual-screen', { method: 'POST', body: { image_url: 'https://img.jpg' } }),
      mkEnv({ TRACK_VISUAL_CACHE: cache }),
      ctx(),
    );
    const body = await resp.json();

    expect(body.is_artwork).toBe(true);
    expect(body.cached).toBe(true);
    expect(mockCallAI).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenCalledWith(expect.stringContaining('vs:'), { type: 'json' });
  });

  it('should call AI and cache result on cache miss', async () => {
    const cache = { get: vi.fn(), put: vi.fn() };
    cache.get.mockResolvedValue(null);
    mockBuildVisionContent.mockReturnValue('vision-content');
    mockCallAI.mockResolvedValue({
      text: '{"is_artwork":true,"media_type":"painting","confidence":"high","reason":"Oil on canvas"}',
      provider: 'anthropic',
      model: 'claude-haiku-3-5',
    });
    mockGetTierForTask.mockReturnValue('economy');
    mockHashString.mockReturnValue('abc12345');

    const resp = await router.fetch(
      req('/visual-screen', { method: 'POST', body: { image_url: 'https://img.jpg' } }),
      mkEnv({ TRACK_VISUAL_CACHE: cache }),
      ctx(),
    );
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.is_artwork).toBe(true);
    expect(body._provider).toBe('anthropic');
    expect(mockCallAI).toHaveBeenCalledWith(
      'You are a visual art classifier. Return only valid JSON.',
      'vision-content',
      expect.any(Object),
      256,
      'economy',
    );
    expect(cache.put).toHaveBeenCalledWith('vs:abc12345', expect.any(String), { expirationTtl: 86400 * 7 });
  });

  it('should fall back to JSON extraction when AI returns text with code fences', async () => {
    mockBuildVisionContent.mockReturnValue('vision-content');
    mockCallAI.mockResolvedValue({
      text: 'Some text ```json\n{"is_artwork":false}\n```',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    mockGetTierForTask.mockReturnValue('economy');

    const resp = await router.fetch(
      req('/visual-screen', { method: 'POST', body: { image_url: 'https://img.jpg' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.is_artwork).toBe(false);
    expect(body._provider).toBe('openrouter');
  });

  it('should handle AI returning completely non-JSON text', async () => {
    mockBuildVisionContent.mockReturnValue('vision-content');
    mockCallAI.mockResolvedValue({
      text: 'I cannot process images right now',
      provider: 'anthropic',
      model: 'claude-haiku-3-5',
    });
    mockGetTierForTask.mockReturnValue('economy');

    const resp = await router.fetch(
      req('/visual-screen', { method: 'POST', body: { image_url: 'https://img.jpg' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.is_artwork).toBeNull();
    expect(body.confidence).toBe('low');
    expect(body.reason).toBe('Model returned non-JSON');
  });

  it('should return 500 when AI call throws', async () => {
    mockBuildVisionContent.mockReturnValue('vision-content');
    mockCallAI.mockRejectedValue(new Error('API rate limited'));
    mockGetTierForTask.mockReturnValue('economy');

    const resp = await router.fetch(
      req('/visual-screen', { method: 'POST', body: { image_url: 'https://img.jpg' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(resp.status).toBe(500);
    expect(body.error).toBe('API rate limited');
    expect(body.is_artwork).toBeNull();
  });
});

// ── POST /analyse ─────────────────────────────────────────────────────────

describe('POST /analyse', () => {
  it('should return 503 when no AI keys', async () => {
    const resp = await router.fetch(
      req('/analyse', { method: 'POST', body: { image_url: 'https://img.jpg', artist: 'Rubens' } }),
      mkEnv({ ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '', GEMINI_API_KEY: '' }),
      ctx(),
    );
    expect(resp.status).toBe(503);
  });

  it('should return 400 when image_url or artist missing', async () => {
    const resp1 = await router.fetch(req('/analyse', { method: 'POST', body: { artist: 'Rubens' } }), mkEnv(), ctx());
    expect((await resp1.json()).error).toBe('image_url and artist required');
    expect(resp1.status).toBe(400);

    const resp2 = await router.fetch(
      req('/analyse', { method: 'POST', body: { image_url: 'https://img.jpg' } }),
      mkEnv(),
      ctx(),
    );
    expect(resp2.status).toBe(400);
  });

  it('should call AI with premium tier and return analysis', async () => {
    const analysisResult = {
      period_estimate: 'peak',
      confidence: 'high',
      analysis_text: 'This work is consistent with Rubens peak period',
      style_matches: ['Monumental figures', 'Warm palette'],
      style_deviations: ['Unusually small format'],
      attribution_suggestion: 'autograph',
      market_value: { atelier_low: 50000, atelier_high: 200000, autograph_estimate: 2000000 },
      next_steps: ['Consult Rubenianum', 'Technical analysis'],
    };
    mockBuildVisionContent.mockReturnValue('vision-content');
    mockCallAI.mockResolvedValue({
      text: JSON.stringify(analysisResult),
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    mockGetTierForTask.mockReturnValue('premium');

    const resp = await router.fetch(
      req('/analyse', {
        method: 'POST',
        body: { image_url: 'https://img.jpg', artist: 'Rubens', media_type: 'painting' },
      }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.period_estimate).toBe('peak');
    expect(body.attribution_suggestion).toBe('autograph');
    expect(body._provider).toBe('anthropic');
    expect(mockGetTierForTask).toHaveBeenCalledWith('deep_analysis');
  });

  it('should save analysis to saved find when saved_find_id provided', async () => {
    const savedFinds = { get: vi.fn(), put: vi.fn() };
    savedFinds.get.mockResolvedValue({ id: 'find123', title: 'Test', status: 'new' });
    mockBuildVisionContent.mockReturnValue('vision-content');
    mockCallAI.mockResolvedValue({
      text: '{"period_estimate":"peak","analysis_text":"Analysis","attribution_suggestion":"autograph"}',
      provider: 'anthropic',
    });
    mockGetTierForTask.mockReturnValue('premium');

    const resp = await router.fetch(
      req('/analyse', {
        method: 'POST',
        body: { image_url: 'https://img.jpg', artist: 'Rubens', saved_find_id: 'find123' },
      }),
      mkEnv({ TRACK_SAVED_FINDS: savedFinds }),
      ctx(),
    );
    expect(resp.status).toBe(200);
    expect(savedFinds.get).toHaveBeenCalledWith('find:find123', { type: 'json' });
    expect(savedFinds.put).toHaveBeenCalledWith('find:find123', expect.stringContaining('"status":"analysed"'));
  });

  it('should handle AI error gracefully', async () => {
    mockBuildVisionContent.mockReturnValue('vision-content');
    mockCallAI.mockRejectedValue(new Error('Model overloaded'));
    mockGetTierForTask.mockReturnValue('premium');

    const resp = await router.fetch(
      req('/analyse', { method: 'POST', body: { image_url: 'https://img.jpg', artist: 'Van Dyck' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(resp.status).toBe(500);
    expect(body.error).toBe('Model overloaded');
  });
});

// ── POST /provenance-scan ────────────────────────────────────────────────

describe('POST /provenance-scan', () => {
  const scanResult = {
    risk_level: 'MEDIUM',
    risk_score: 35,
    signals: ['German collection label', 'Missing 1940–1945 provenance'],
    danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
    gaps: ['Missing provenance 1939–1946'],
    timeline: [{ date: 'ca. 1920', event: 'Private collection, Berlin' }],
    seller_questions: ['Do you have proof of pre-1933 provenance?'],
    links: { art_loss_register: 'https://www.artloss.com' },
  };

  it('should return 503 when no AI keys', async () => {
    const resp = await router.fetch(
      req('/provenance-scan', { method: 'POST', body: { description: 'A painting' } }),
      mkEnv({ ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '', GEMINI_API_KEY: '' }),
      ctx(),
    );
    expect(resp.status).toBe(503);
  });

  it('should return 400 when description missing', async () => {
    const resp = await router.fetch(req('/provenance-scan', { method: 'POST', body: {} }), mkEnv(), ctx());
    const body = await resp.json();
    expect(resp.status).toBe(400);
    expect(body.error).toBe('description required');
  });

  it('should call runProvenanceScan and return result', async () => {
    mockRunProvenanceScan.mockResolvedValue(scanResult);

    const resp = await router.fetch(
      req('/provenance-scan', {
        method: 'POST',
        body: {
          description: 'Oil painting from Berlin collection',
          seller_location: 'Germany',
          price: '15000',
          media_type: 'painting',
        },
      }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.risk_level).toBe('MEDIUM');
    expect(body.risk_score).toBe(35);
    expect(mockRunProvenanceScan).toHaveBeenCalledWith(
      'Oil painting from Berlin collection',
      'Germany',
      '15000',
      'painting',
      expect.any(Object),
    );
  });

  it('should save result to saved find when saved_find_id provided', async () => {
    const savedFinds = { get: vi.fn(), put: vi.fn() };
    savedFinds.get.mockResolvedValue({ id: 'scan123', title: 'Test', status: 'new' });
    mockRunProvenanceScan.mockResolvedValue(scanResult);

    const resp = await router.fetch(
      req('/provenance-scan', { method: 'POST', body: { description: 'Berlin painting', saved_find_id: 'scan123' } }),
      mkEnv({ TRACK_SAVED_FINDS: savedFinds }),
      ctx(),
    );
    expect(resp.status).toBe(200);
    expect(savedFinds.put).toHaveBeenCalledWith('find:scan123', expect.stringContaining('"status":"analysed"'));
  });

  it('should handle scan failure', async () => {
    mockRunProvenanceScan.mockRejectedValue(new Error('AI provider unavailable'));

    const resp = await router.fetch(
      req('/provenance-scan', { method: 'POST', body: { description: 'Test' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(resp.status).toBe(500);
    expect(body.error).toBe('AI provider unavailable');
  });
});

// ── GET /verify ──────────────────────────────────────────────────────────

describe('GET /verify', () => {
  it('should return 400 when no title or artist', async () => {
    const resp = await router.fetch(req('/verify'), mkEnv(), ctx());
    const body = await resp.json();
    expect(resp.status).toBe(400);
    expect(body.error).toBe('Provide title or artist');
  });

  it('should return artist data and title analysis', async () => {
    mockLookupRkdArtist.mockReturnValue({ found: true, artist: { name: 'Anthony van Dyck', born: '1599' } });
    mockClassifyMedia.mockReturnValue('painting');
    mockScoreAlert.mockReturnValue({ level: 'PRIORITY', reasons: ['Artist mention'] });
    mockAnalyzeDangerPeriods.mockReturnValue([{ period: 'WWII', risk: 'MEDIUM' }]);

    const resp = await router.fetch(req('/verify?title=Van Dyck painting&artist=Van Dyck'), mkEnv(), ctx());
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.artist.found).toBe(true);
    expect(body.artist.artist.name).toBe('Anthony van Dyck');
    expect(body.title_analysis.media_type).toBe('painting');
    expect(body.title_analysis.alert.level).toBe('PRIORITY');
    expect(body.title_analysis.danger_periods).toHaveLength(1);
    expect(mockLookupRkdArtist).toHaveBeenCalledWith('Van Dyck');
  });
});

// ── GET /reference ───────────────────────────────────────────────────────

describe('GET /reference', () => {
  it('should return 400 when missing artist param', async () => {
    const resp = await router.fetch(req('/reference'), mkEnv(), ctx());
    expect(resp.status).toBe(400);
  });

  it('should return RKD artist data', async () => {
    mockLookupRkdArtist.mockReturnValue({ found: true, artist: { name: 'Peter Paul Rubens', id: 64180 } });

    const resp = await router.fetch(req('/reference?artist=Rubens'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.found).toBe(true);
    expect(body.artist.name).toBe('Peter Paul Rubens');
  });
});

// ── GET /danger-check ───────────────────────────────────────────────────

describe('GET /danger-check', () => {
  it('should return danger periods for provenance text', async () => {
    mockAnalyzeDangerPeriods.mockReturnValue([{ period: 'WWII', risk: 'HIGH', note: 'Nazi occupation' }]);

    const resp = await router.fetch(
      req('/danger-check?provenance=Jewish collection 1933&seller_country=DE'),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.seller_country).toBe('DE');
    expect(body.danger_periods).toHaveLength(1);
    expect(body.danger_periods[0].period).toBe('WWII');
    expect(mockAnalyzeDangerPeriods).toHaveBeenCalled();
  });

  it('should handle empty provenance gracefully', async () => {
    mockAnalyzeDangerPeriods.mockReturnValue([]);

    const resp = await router.fetch(req('/danger-check'), mkEnv(), ctx());
    const body = await resp.json();

    expect(resp.status).toBe(200);
    expect(body.danger_periods).toEqual([]);
  });
});

// ── GET /oeuvre ──────────────────────────────────────────────────────────

describe('GET /oeuvre', () => {
  it('should return 400 when missing artist param', async () => {
    const resp = await router.fetch(req('/oeuvre'), mkEnv(), ctx());
    expect(resp.status).toBe(400);
  });

  it('should return oeuvre data for known artist', async () => {
    const resp = await router.fetch(req('/oeuvre?artist=rubens'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.found).toBe(true);
    expect(body.artist).toBe('Peter Paul Rubens');
  });

  it('should return not found for unknown artist', async () => {
    const resp = await router.fetch(req('/oeuvre?artist=unknown'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.found).toBe(false);
    expect(body.available).toContain('rubens');
  });
});

// ── GET /style-database ─────────────────────────────────────────────────

describe('GET /style-database', () => {
  it('should return style data for an artist', async () => {
    mockGetStyleData.mockReturnValue({ found: true, artist: 'Rubens', periods: { peak: { period: '1610–1628' } } });

    const resp = await router.fetch(req('/style-database?artist=Rubens'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.found).toBe(true);
    expect(body.artist).toBe('Rubens');
  });

  it('should handle missing artist param', async () => {
    mockGetStyleData.mockReturnValue({ found: false, error: 'artist param required' });

    const resp = await router.fetch(req('/style-database'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.found).toBe(false);
  });
});

// ── Watchlist & Alerts ──────────────────────────────────────────────────

describe('Watchlist & Alerts endpoints', () => {
  it('GET /watchlist should delegate to handleGetWatchlist', async () => {
    mockHandleGetWatchlist.mockResolvedValue(
      new Response(JSON.stringify({ artists: ['Rubens'], media: ['painting'] }), { status: 200 }),
    );

    const resp = await router.fetch(req('/watchlist'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.artists).toContain('Rubens');
    expect(mockHandleGetWatchlist).toHaveBeenCalledTimes(1);
  });

  it('POST /watchlist should delegate to handlePostWatchlist', async () => {
    mockHandlePostWatchlist.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const resp = await router.fetch(
      req('/watchlist', { method: 'POST', body: { artists: ['Rubens'] } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(mockHandlePostWatchlist).toHaveBeenCalledTimes(1);
  });

  it('GET /alerts should delegate to handleGetAlerts', async () => {
    mockHandleGetAlerts.mockResolvedValue(new Response(JSON.stringify({ total: 5, alerts: [] }), { status: 200 }));

    const resp = await router.fetch(req('/alerts'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.total).toBe(5);
    expect(mockHandleGetAlerts).toHaveBeenCalledTimes(1);
  });

  it('GET /trigger-scan should delegate to runBackgroundScan', async () => {
    mockRunBackgroundScan.mockResolvedValue({ ok: true, new_alerts: 3 });

    const resp = await router.fetch(req('/trigger-scan'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(body.new_alerts).toBe(3);
    expect(mockRunBackgroundScan).toHaveBeenCalledTimes(1);
  });
});

// ── POST /test-notify ───────────────────────────────────────────────────

describe('POST /test-notify', () => {
  it('should send Telegram alert when chatId provided', async () => {
    mockSendTelegramAlert.mockResolvedValue({ ok: true });

    const resp = await router.fetch(
      req('/test-notify', { method: 'POST', body: { telegram_chat_id: '12345' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.test).toBe(true);
    expect(mockSendTelegramAlert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'test_001' }),
      expect.any(Object),
      '12345',
    );
  });

  it('should send email when email provided in body', async () => {
    mockSendResendEmail.mockResolvedValue({ ok: true, resend: { id: 'email123' } });

    const resp = await router.fetch(
      req('/test-notify', { method: 'POST', body: { email: 'test@example.com' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.test).toBe(true);
    expect(mockSendResendEmail).toHaveBeenCalledWith('digest', expect.any(Array), expect.any(Object));
  });

  it('should handle both Telegram and email', async () => {
    mockSendTelegramAlert.mockResolvedValue({ ok: true });
    mockSendResendEmail.mockResolvedValue({ ok: true });

    const resp = await router.fetch(
      req('/test-notify', { method: 'POST', body: { telegram_chat_id: '123', email: 'a@b.com' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.telegram.ok).toBe(true);
    expect(mockSendTelegramAlert).toHaveBeenCalled();
    expect(mockSendResendEmail).toHaveBeenCalled();
  });

  it('should handle missing body (JSON parse fallback)', async () => {
    const resp = await router.fetch(req('/test-notify', { method: 'POST' }), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.test).toBe(true);
  });
});

// ── Saved Finds ─────────────────────────────────────────────────────────

describe('Saved Finds endpoints', () => {
  it('POST /saves should delegate to handleSaveFind', async () => {
    mockHandleSaveFind.mockResolvedValue(new Response(JSON.stringify({ ok: true, id: 'abc123' }), { status: 200 }));

    const resp = await router.fetch(
      req('/saves', { method: 'POST', body: { url: 'https://ebay.com/item/1' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(mockHandleSaveFind).toHaveBeenCalledTimes(1);
  });

  it('GET /saves should delegate to handleGetSaves', async () => {
    mockHandleGetSaves.mockResolvedValue(new Response(JSON.stringify({ total: 2, finds: [] }), { status: 200 }));

    const resp = await router.fetch(req('/saves'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.total).toBe(2);
    expect(mockHandleGetSaves).toHaveBeenCalledTimes(1);
  });

  it('PUT /saves/:id should delegate to handleUpdateSave', async () => {
    mockHandleUpdateSave.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const resp = await router.fetch(
      req('/saves/abc123', { method: 'PUT', body: { notes: 'Updated' } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(mockHandleUpdateSave).toHaveBeenCalledWith('abc123', expect.any(Object), expect.any(Object));
  });

  it('DELETE /saves/:id should delegate to handleDeleteSave', async () => {
    mockHandleDeleteSave.mockResolvedValue(new Response(JSON.stringify({ ok: true, archived: true }), { status: 200 }));

    const resp = await router.fetch(req('/saves/abc123', { method: 'DELETE' }), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.archived).toBe(true);
    expect(mockHandleDeleteSave).toHaveBeenCalledWith('abc123', expect.any(Object));
  });
});

// ── Search & Item ───────────────────────────────────────────────────────

describe('Search & Item endpoints', () => {
  it('GET /search should delegate to aggregateSearch', async () => {
    mockAggregateSearch.mockResolvedValue(
      new Response(JSON.stringify({ q: 'Rubens', total: 3, items: [] }), { status: 200 }),
    );

    const resp = await router.fetch(req('/search?q=Rubens'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.q).toBe('Rubens');
    expect(mockAggregateSearch).toHaveBeenCalledWith(expect.any(URLSearchParams), expect.any(Object));
  });

  it('GET /item/:id should delegate to handleItem', async () => {
    mockHandleEbayItem.mockResolvedValue(new Response(JSON.stringify({ itemId: 'v1|12345' }), { status: 200 }));

    const resp = await router.fetch(req('/item/v1|12345'), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.itemId).toBe('v1|12345');
    expect(mockHandleEbayItem).toHaveBeenCalledWith('v1|12345', expect.any(Object));
  });
});

// ── Report & Send Digest ────────────────────────────────────────────────

describe('Report & Send Digest endpoints', () => {
  it('POST /report should delegate to handleReport', async () => {
    mockHandleReport.mockResolvedValue(
      new Response('<html>Report</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );

    const resp = await router.fetch(req('/report', { method: 'POST', body: { id: 'find123' } }), mkEnv(), ctx());
    const text = await resp.text();

    expect(text).toContain('<html>');
    expect(mockHandleReport).toHaveBeenCalledTimes(1);
  });

  it('POST /send-digest should call sendResendEmail', async () => {
    mockSendResendEmail.mockResolvedValue({ ok: true, resend: { id: 'digest123' } });

    const resp = await router.fetch(
      req('/send-digest', { method: 'POST', body: { finds: [{ title: 'Test' }] } }),
      mkEnv(),
      ctx(),
    );
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(mockSendResendEmail).toHaveBeenCalledWith('digest', [{ title: 'Test' }], expect.any(Object));
  });

  it('POST /send-digest should handle empty finds array', async () => {
    mockSendResendEmail.mockResolvedValue({ ok: true });

    const resp = await router.fetch(req('/send-digest', { method: 'POST', body: {} }), mkEnv(), ctx());
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(mockSendResendEmail).toHaveBeenCalledWith('digest', [], expect.any(Object));
  });
});

// ── Scheduled handler ───────────────────────────────────────────────────

describe('Scheduled handler', () => {
  it('should delegate to runBackgroundScan', async () => {
    mockRunBackgroundScan.mockResolvedValue({ ok: true });

    await router.scheduled({}, mkEnv(), { waitUntil: vi.fn() });

    expect(mockRunBackgroundScan).toHaveBeenCalledTimes(1);
  });
});

// ── Error handling in router catch ──────────────────────────────────────

describe('Router error handling', () => {
  it('should return 500 when a handler throws an unexpected error', async () => {
    mockAggregateSearch.mockRejectedValue(new Error('Unexpected database error'));

    const resp = await router.fetch(req('/search?q=test'), mkEnv(), ctx());
    const body = await resp.json();

    expect(resp.status).toBe(500);
    expect(body.error).toBe('Unexpected database error');
  });
});
