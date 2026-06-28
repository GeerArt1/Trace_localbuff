import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock utils
vi.mock('../src/utils.js', () => ({
  jsonResponse: (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

let handleReport;
beforeAll(async () => {
  const mod = await import('../src/report.js');
  handleReport = mod.handleReport;
});

function req(body) {
  return new Request('https://track-ebay-proxy.geerart.workers.dev/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mkEnv(overrides = {}) {
  const kv = {
    get: vi.fn(),
    put: vi.fn(),
  };
  return { TRACK_SAVED_FINDS: kv, ...overrides };
}

describe('handleReport', () => {
  it('should return 503 when TRACK_SAVED_FINDS not configured', async () => {
    const resp = await handleReport(req({ id: '123' }), {});
    expect(resp.status).toBe(503);
    expect((await resp.json()).error).toBe('TRACK_SAVED_FINDS KV not configured');
  });

  it('should return 400 when id missing', async () => {
    const resp = await handleReport(req({}), mkEnv());
    expect(resp.status).toBe(400);
    expect((await resp.json()).error).toBe('id required');
  });

  it('should return 404 when find not found', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue(null);
    const resp = await handleReport(req({ id: 'missing' }), env);
    expect(resp.status).toBe(404);
  });

  it('should generate HTML report for a basic find', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue({
      id: 'abc123',
      artist: 'Peter Paul Rubens',
      title: 'The Raising of the Cross — oil sketch',
      price: '25000',
      url: 'https://ebay.com/item/123',
      image: 'https://img.ebay.com/test.jpg',
      source: 'ebay',
      alert_level: 'PRIORITY',
      media_type: 'sketch',
      date_saved: '2026-06-01T12:00:00Z',
      status: 'new',
      notes: 'Possible modello for the cathedral panel',
      style_analysis: null,
      provenance_scan: null,
      visual_screen: null,
      oeuvre_match: null,
    });

    const resp = await handleReport(req({ id: 'abc123' }), env);
    const text = await resp.text();

    expect(resp.status).toBe(200);
    expect(resp.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(resp.headers.get('Content-Disposition')).toContain('TRACK-abc123.html');
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('Peter Paul Rubens');
    expect(text).toContain('The Raising of the Cross');
    expect(text).toContain('PRIORITY');
    expect(text).toContain('ebay');
    expect(text).toContain('Possible modello');
    expect(text).toContain('TRACK');
    expect(text).toContain('Picturia Intelligence Suite');
    expect(env.TRACK_SAVED_FINDS.put).toHaveBeenCalled();
  });

  it('should include style analysis section when present', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue({
      id: 'styletest',
      artist: 'Van Dyck',
      title: 'Portrait Study',
      price: '',
      url: '',
      image: null,
      source: 'ebay',
      alert_level: 'CRITICAL',
      media_type: 'drawing',
      date_saved: '2026-06-15T00:00:00Z',
      status: 'analysed',
      style_analysis: {
        period_estimate: 'english',
        confidence: 'high',
        analysis_text: 'This work is consistent with Van Dyck English period',
        style_matches: ['Silver palette', 'Elegant figures'],
        style_deviations: ['Slightly softer handling'],
        attribution_suggestion: 'autograph',
        market_value: { atelier_low: 150000, atelier_high: 500000, autograph_estimate: 1500000 },
        next_steps: ['Consult Rubenianum', 'Technical analysis'],
      },
      provenance_scan: null,
      visual_screen: null,
      oeuvre_match: null,
    });

    const resp = await handleReport(req({ id: 'styletest' }), env);
    const text = await resp.text();

    expect(text).toContain('Stijlanalyse');
    expect(text).toContain('english');
    expect(text).toContain('autograph');
    expect(text).toContain('Elegant figures');
    expect(text).toContain('Consult Rubenianum');
  });

  it('should include provenance scan section when present', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue({
      id: 'proventest',
      artist: 'Rubens',
      title: 'Test Work',
      price: '',
      url: '',
      image: null,
      source: 'ebay',
      alert_level: 'WATCH',
      media_type: 'painting',
      date_saved: '2026-06-20T00:00:00Z',
      status: 'analysed',
      style_analysis: null,
      provenance_scan: {
        risk_level: 'HIGH',
        risk_score: 75,
        signals: ['German collection label', 'Missing WWII provenance'],
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
        gaps: ['Missing 1938–1945'],
        timeline: [{ date: 'ca. 1920', event: 'Berlin collection' }],
        seller_questions: ['Do you have pre-1933 provenance?'],
      },
      visual_screen: null,
      oeuvre_match: null,
    });

    const resp = await handleReport(req({ id: 'proventest' }), env);
    const text = await resp.text();

    expect(text).toContain('Provenance Risico Scan');
    expect(text).toContain('HIGH');
    expect(text).toContain('75');
    expect(text).toContain('German collection label');
    expect(text).toContain('WWII');
    expect(text).toContain('Berlin collection');
    expect(text).toContain('Berlin collection');
    expect(text).toContain('artloss.com');
    expect(text).toContain('errproject.org');
  });

  it('should include oeuvre match section when present', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue({
      id: 'oeuvretest',
      artist: 'Rubens',
      title: 'Massacre Sketch',
      price: '',
      url: '',
      image: null,
      source: 'ebay',
      alert_level: 'APEX',
      media_type: 'sketch',
      date_saved: '2026-06-25T00:00:00Z',
      status: 'analysed',
      style_analysis: null,
      provenance_scan: null,
      visual_screen: null,
      oeuvre_match: {
        matched: true,
        score: 85,
        apex: true,
        work: {
          id: 'rubens_massacre_v2',
          title: 'The Massacre of the Innocents — second version',
          last_seen: { location: 'Private collection, early 20th century', date: 'pre-1920' },
        },
      },
    });

    const resp = await handleReport(req({ id: 'oeuvretest' }), env);
    const text = await resp.text();

    expect(text).toContain('Oeuvre Match');
    expect(text).toContain('APEX');
    expect(text).toContain('Mogelijke match met vermist werk');
    expect(text).toContain('Massacre of the Innocents');
    expect(text).toContain('85');
  });

  it('should include image when find has image URL', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue({
      id: 'imgtest',
      artist: '',
      title: 'Work with image',
      price: '',
      url: 'https://ebay.com/item/1',
      image: 'https://img.example.com/art.jpg',
      source: 'ebay',
      alert_level: 'CLEAR',
      media_type: 'painting',
      date_saved: '2026-06-01T00:00:00Z',
      status: 'new',
      style_analysis: null,
      provenance_scan: null,
      visual_screen: null,
      oeuvre_match: null,
    });

    const resp = await handleReport(req({ id: 'imgtest' }), env);
    const text = await resp.text();

    expect(text).toContain('img.example.com/art.jpg');
    expect(text).toContain('image-block');
  });

  it('should include visual screening section when present', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue({
      id: 'vstest',
      artist: '',
      title: 'Screened work',
      price: '',
      url: '',
      image: null,
      source: 'ebay',
      alert_level: 'WATCH',
      media_type: 'painting',
      date_saved: '2026-06-01T00:00:00Z',
      status: 'new',
      style_analysis: null,
      provenance_scan: null,
      visual_screen: {
        is_artwork: true,
        confidence: 'high',
        media_type: 'painting',
        reason: 'Oil on canvas, visible brushwork',
      },
      oeuvre_match: null,
    });

    const resp = await handleReport(req({ id: 'vstest' }), env);
    const text = await resp.text();

    expect(text).toContain('Visuele Screening');
    expect(text).toContain('Bevestigd kunstwerk');
    expect(text).toContain('Oil on canvas');
  });

  it('should update status to report_ready', async () => {
    const env = mkEnv();
    env.TRACK_SAVED_FINDS.get.mockResolvedValue({
      id: 'statustest',
      artist: '',
      title: 'Status update',
      price: '',
      url: '',
      image: null,
      source: 'ebay',
      alert_level: 'CLEAR',
      media_type: 'painting',
      date_saved: '2026-06-01T00:00:00Z',
      status: 'analysed',
      style_analysis: null,
      provenance_scan: null,
      visual_screen: null,
      oeuvre_match: null,
    });

    await handleReport(req({ id: 'statustest' }), env);
    expect(env.TRACK_SAVED_FINDS.put).toHaveBeenCalledWith(
      'find:statustest',
      expect.stringContaining('"status":"report_ready"'),
    );
  });
});
