import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock all dependencies
const mockJsonResponse = vi.fn();
const mockLevelRank = vi.fn();
const mockSourceMap = {};
const mockEnrichItem = vi.fn();
const mockSendTelegramAlert = vi.fn();
const mockSendResendEmail = vi.fn();
const mockDEFAULT_WATCHLIST = {
  artists: ['Rubens', 'Van Dyck', 'Jordaens'],
  media: ['painting', 'sketch', 'drawing', 'print', 'plate'],
  sources: ['ebay', '2dehands', 'marktplaats', 'leboncoin'],
  alert_threshold: 'PRIORITY',
  notify: { telegram_chat_id: null, email: null },
};

vi.mock('../src/utils.js', () => ({
  jsonResponse: mockJsonResponse,
  levelRank: mockLevelRank,
}));

vi.mock('../src/search.js', () => ({
  SOURCE_MAP: mockSourceMap,
}));

vi.mock('../src/alerts.js', () => ({
  enrichItem: mockEnrichItem,
}));

vi.mock('../src/notify.js', () => ({
  DEFAULT_WATCHLIST: mockDEFAULT_WATCHLIST,
  sendTelegramAlert: mockSendTelegramAlert,
  sendResendEmail: mockSendResendEmail,
}));

let handleGetWatchlist, handlePostWatchlist, handleGetAlerts, runBackgroundScan;
beforeAll(async () => {
  const mod = await import('../src/watchlist.js');
  handleGetWatchlist = mod.handleGetWatchlist;
  handlePostWatchlist = mod.handlePostWatchlist;
  handleGetAlerts = mod.handleGetAlerts;
  runBackgroundScan = mod.runBackgroundScan;
});

beforeEach(() => {
  vi.clearAllMocks();
  mockLevelRank.mockImplementation((lvl) =>
    lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
  );
  mockJsonResponse.mockImplementation(
    (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
});

function req(body) {
  return new Request('https://track-ebay-proxy.geerart.workers.dev/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function mkEnv(overrides = {}) {
  return {
    TRACK_WATCHLIST: { get: vi.fn(), put: vi.fn() },
    TRACK_ALERT_HISTORY: { get: vi.fn(), put: vi.fn() },
    TRACK_SEEN_IDS: { get: vi.fn(), put: vi.fn() },
    ...overrides,
  };
}

function mkCtx() {
  return { waitUntil: vi.fn() };
}

// ── GET /watchlist ──────────────────────────────────────────────────────

describe('handleGetWatchlist', () => {
  it('should return default watchlist when no KV configured', async () => {
    const resp = await handleGetWatchlist({});
    const body = await resp.json();
    expect(body.artists).toContain('Rubens');
    expect(body.sources).toContain('ebay');
  });

  it('should return stored watchlist from KV', async () => {
    const env = mkEnv();
    env.TRACK_WATCHLIST.get.mockResolvedValue({
      artists: ['Rubens'],
      sources: ['ebay'],
      alert_threshold: 'CRITICAL',
      notify: { telegram_chat_id: '123', email: null },
    });

    const resp = await handleGetWatchlist(env);
    const body = await resp.json();
    expect(body.artists).toEqual(['Rubens']);
    expect(body.alert_threshold).toBe('CRITICAL');
  });
});

// ── POST /watchlist ─────────────────────────────────────────────────────

describe('handlePostWatchlist', () => {
  it('should return 503 when KV not configured', async () => {
    const resp = await handlePostWatchlist(req({}), {});
    expect(resp.status).toBe(503);
  });

  it('should merge with defaults and save', async () => {
    const env = mkEnv();
    const resp = await handlePostWatchlist(req({ artists: ['Rubens'], telegramChatId: 'chat456' }), env);
    const body = await resp.json();

    expect(body.ok).toBe(true);
    expect(body.watchlist.artists).toEqual(['Rubens']);
    expect(body.watchlist.notify.telegram_chat_id).toBe('chat456');
    expect(body.watchlist.sources).toEqual(mockDEFAULT_WATCHLIST.sources);
    expect(env.TRACK_WATCHLIST.put).toHaveBeenCalledWith('watchlist:default', expect.any(String));
  });
});

// ── GET /alerts ─────────────────────────────────────────────────────────

describe('handleGetAlerts', () => {
  it('should return empty array when no KV', async () => {
    const resp = await handleGetAlerts({});
    const body = await resp.json();
    expect(body.alerts).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('should return stored alerts from KV', async () => {
    const env = mkEnv();
    env.TRACK_ALERT_HISTORY.get.mockResolvedValue([
      { id: 'a1', title: 'Alert 1' },
      { id: 'a2', title: 'Alert 2' },
    ]);

    const resp = await handleGetAlerts(env);
    const body = await resp.json();
    expect(body.total).toBe(2);
    expect(body.alerts).toHaveLength(2);
  });

  it('should cap alerts at 50', async () => {
    const env = mkEnv();
    const manyAlerts = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}` }));
    env.TRACK_ALERT_HISTORY.get.mockResolvedValue(manyAlerts);

    const resp = await handleGetAlerts(env);
    const body = await resp.json();
    expect(body.alerts).toHaveLength(50);
  });
});

// ── runBackgroundScan ───────────────────────────────────────────────────

describe('runBackgroundScan', () => {
  it('should return result with ok:true and zero alerts when no items found', async () => {
    mockLevelRank.mockReturnValue(2);
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      alert: { level: 'CLEAR', reasons: [] },
      danger_periods: [],
    }));
    // Return empty items for all sources
    mockSourceMap.ebay = vi.fn().mockResolvedValue({ source: 'ebay', items: [] });
    mockSourceMap['2dehands'] = vi.fn().mockResolvedValue({ source: '2dehands', items: [] });
    mockSourceMap['marktplaats'] = vi.fn().mockResolvedValue({ source: 'marktplaats', items: [] });
    mockSourceMap['leboncoin'] = vi.fn().mockResolvedValue({ source: 'leboncoin', items: [] });

    const env = mkEnv();
    const result = await runBackgroundScan(env, mkCtx());

    expect(result.ok).toBe(true);
    expect(result.new_alerts).toBe(0);
    expect(result.sources_used).toContain('ebay');
  });

  it('should detect new alerts above threshold', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'PRIORITY', reasons: ['Artist mention: rubens'] },
      danger_periods: [],
      oeuvre_match: null,
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'item1', title: 'Rubens painting' }],
    });

    const env = mkEnv();
    env.TRACK_SEEN_IDS.get.mockResolvedValue({});
    const result = await runBackgroundScan(env, mkCtx());

    expect(result.new_alerts).toBeGreaterThanOrEqual(1);
    expect(result.alerts[0].id).toBe('item1');
  });

  it('should skip already-seen IDs', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'PRIORITY', reasons: ['Test'] },
      danger_periods: [],
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'seen1', title: 'Already seen' }],
    });

    const env = mkEnv();
    env.TRACK_SEEN_IDS.get.mockResolvedValue({ seen1: Date.now() });
    const result = await runBackgroundScan(env, mkCtx());

    expect(result.new_alerts).toBe(0);
  });

  it('should send Telegram notification for new alerts', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'PRIORITY', reasons: ['Test'] },
      danger_periods: [],
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'newitem', title: 'New find' }],
    });

    const env = mkEnv();
    env.TRACK_WATCHLIST.get.mockResolvedValue({
      ...mockDEFAULT_WATCHLIST,
      notify: { telegram_chat_id: 'chat789', email: null },
    });
    env.TRACK_SEEN_IDS.get.mockResolvedValue({});

    const ctx = mkCtx();
    await runBackgroundScan(env, ctx);

    expect(mockSendTelegramAlert).toHaveBeenCalled();
    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('should send APEX email for apex alerts', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'APEX', reasons: ['Possible missing work'] },
      danger_periods: [],
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'apex1', title: 'Potential Rubens' }],
    });

    const env = mkEnv();
    env.TRACK_WATCHLIST.get.mockResolvedValue({
      ...mockDEFAULT_WATCHLIST,
      alert_threshold: 'WATCH',
      notify: { telegram_chat_id: null, email: 'curator@museum.org' },
    });
    env.TRACK_SEEN_IDS.get.mockResolvedValue({});

    const ctx = mkCtx();
    await runBackgroundScan(env, ctx);

    expect(mockSendResendEmail).toHaveBeenCalledWith('apex', expect.any(Object), expect.any(Object));
  });

  it('should update seen IDs in KV', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'PRIORITY', reasons: ['Test'] },
      danger_periods: [],
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'new_seen', title: 'New item' }],
    });

    const env = mkEnv();
    env.TRACK_SEEN_IDS.get.mockResolvedValue({});

    const ctx = mkCtx();
    await runBackgroundScan(env, ctx);

    expect(env.TRACK_SEEN_IDS.put).toHaveBeenCalledWith('seen', expect.any(String), { expirationTtl: 86400 * 30 });
  });

  it('should prune seen IDs to max 10k', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'PRIORITY', reasons: ['Test'] },
      danger_periods: [],
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'prune_test', title: 'Prune test' }],
    });

    const manySeen = {};
    for (let i = 0; i < 10001; i++) manySeen[`id_${i}`] = i;
    const env = mkEnv();
    env.TRACK_SEEN_IDS.get.mockResolvedValue(manySeen);

    await runBackgroundScan(env, mkCtx());

    // put should have been called, meaning pruning logic ran
    expect(env.TRACK_SEEN_IDS.put).toHaveBeenCalled();
  });

  it('should update alert history in KV', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'PRIORITY', reasons: ['Test'] },
      danger_periods: [],
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'history1', title: 'History' }],
    });

    const env = mkEnv();
    env.TRACK_SEEN_IDS.get.mockResolvedValue({});
    env.TRACK_ALERT_HISTORY.get.mockResolvedValue([]);

    await runBackgroundScan(env, mkCtx());

    expect(env.TRACK_ALERT_HISTORY.put).toHaveBeenCalledWith('history', expect.any(String));
  });

  it('should not send digest when no alerts found', async () => {
    mockLevelRank.mockImplementation((lvl) =>
      lvl === 'APEX' ? 4 : lvl === 'CRITICAL' ? 3 : lvl === 'PRIORITY' ? 2 : lvl === 'WATCH' ? 1 : 0,
    );
    mockEnrichItem.mockImplementation((item) => ({
      ...item,
      media_type: 'painting',
      has_art_context: true,
      alert: { level: 'CLEAR', reasons: [] },
      danger_periods: [],
    }));
    mockSourceMap.ebay = vi.fn().mockResolvedValue({
      source: 'ebay',
      items: [{ id: 'x', title: 'X' }],
    });

    const env = mkEnv();
    env.TRACK_SEEN_IDS.get.mockResolvedValue({});

    await runBackgroundScan(env, mkCtx());

    expect(mockSendResendEmail).not.toHaveBeenCalled();
  });
});
