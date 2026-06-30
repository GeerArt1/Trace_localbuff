/**
 * TRACK Worker v2.2 — Main Router
 *
 * Thin orchestrator that delegates to domain-specific modules.
 * v2.2 changes:
 *   - Split monolithic 2000+ line file into 12 domain modules
 *   - Added DeepSeek V4 Flash as economy AI tier (cheapest vision model)
 *   - Added Gemini fallback support
 *   - Added cost-tiered model routing: economy/standard/premium
 *   - Added JSDoc type annotations across all modules
 *
 * Modules:
 *   constants.js   - Shared constants (artists, keywords, triggers)
 *   utils.js       - Shared utilities (fetch, hash, CORS, JSON response)
 *   ai.js          - Multi-provider AI with cost-tiered routing
 *   alerts.js      - Alert scoring, media classification, item enrichment
 *   provenance.js  - Danger period analysis, RKD artist lookup
 *   search.js      - Multi-source marketplace search (eBay, LeBonCoin, etc.)
 *   oeuvre.js      - Missing works database and matching engine
 *   style.js       - Style database for Flemish Old Masters
 *   saved-finds.js - Saved finds CRUD
 *   notify.js      - Telegram + Resend email notifications
 *   watchlist.js   - Watchlist CRUD, alert history, background scanning
 *   report.js      - HTML report generator
 *
 * Endpoints:
 *   GET  /health
 *   GET  /search?q=&sources=&media=&lang=&limit=
 *   GET  /item/:id
 *   GET  /verify?title=&artist=
 *   GET  /reference?artist=
 *   GET  /danger-check?provenance=&seller_country=
 *   POST /watchlist  |  GET /watchlist
 *   GET  /alerts
 *   POST /test-notify
 *   GET  /trigger-scan
 *   POST /visual-screen          { image_url }
 *   GET  /style-database?artist=
 *   POST /analyse                { image_url, artist, media_type }
 *   POST /provenance-scan        { description, seller_location, price, media_type }
 *   GET  /oeuvre?artist=
 *   POST /saves  |  GET /saves  |  PUT /saves/:id  |  DELETE /saves/:id
 *   POST /report                 { id }
 *   POST /send-digest
 *
 *   POST /tts                    { text, voice_id?, language? }
 *
 * Secrets: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, ALLOWED_ORIGIN,
 *          TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, OPENROUTER_API_KEY,
 *          GEMINI_API_KEY, RESEND_API_KEY, ELEVENLABS_API_KEY
 * KV:      TOKEN_CACHE, TRACK_WATCHLIST, TRACK_SEEN_IDS,
 *          TRACK_ALERT_HISTORY, TRACK_REFERENCE_CACHE,
 *          TRACK_SAVED_FINDS, TRACK_VISUAL_CACHE, TRACK_OEUVRE_CACHE
 */

import { jsonResponse, corsPreflightResponse, addCorsHeaders, corsHeaders, hashString } from './utils.js';
import { withSentry } from './sentry.js';
import { buildVisionContent, callAI, getTierForTask } from './ai.js';
import { classifyMedia, scoreAlert } from './alerts.js';
import { analyzeDangerPeriods, lookupRkdArtist } from './provenance.js';
import { aggregateSearch, handleItem as handleEbayItem } from './search.js';
import { OEUVRE_DATA } from './oeuvre.js';
import { getStyleData } from './style.js';
import {
  handleSaveFind,
  handleGetSaves,
  handleUpdateSave,
  handleDeleteSave,
  runProvenanceScan,
} from './saved-finds.js';
import { sendTelegramAlert, sendResendEmail } from './notify.js';
import { handleGetWatchlist, handlePostWatchlist, handleGetAlerts, runBackgroundScan } from './watchlist.js';
import { handleReport } from './report.js';

// ── Visual pre-screening ──────────────────────────────────────────────────────

async function handleVisualScreen(request, env) {
  if (!env.ANTHROPIC_API_KEY && !env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'No AI provider configured' }, 503);
  }

  const body = await request.json();
  const { image_url } = body;
  if (!image_url) return jsonResponse({ error: 'image_url required' }, 400);

  // Check cache
  const cacheKey = `vs:${hashString(image_url)}`;
  if (env.TRACK_VISUAL_CACHE) {
    const cached = await env.TRACK_VISUAL_CACHE.get(cacheKey, { type: 'json' });
    if (cached) return jsonResponse({ ...cached, cached: true });
  }

  const prompt = `Look at this image carefully.
Does it show a painting, drawing, print, etching, watercolour, or other artwork created by hand?

Return false for:
- Frames, furniture, decorative objects without art
- Toys, dolls, puppets, collectibles
- Appliances, machinery, tools
- Merchandise, clothing, sports items
- Posters of artworks (printed reproductions on modern paper)
- Photos of people unless clearly a painted portrait

Return JSON only, no other text:
{
  "is_artwork": true or false,
  "media_type": "painting" or "drawing" or "print" or "watercolour" or "sculpture" or "other_artwork" or "not_artwork",
  "confidence": "high" or "medium" or "low",
  "reason": "one sentence"
}`;

  try {
    // Use ECONOMY tier (DeepSeek V4 Flash) for screening — cheapest option
    const content = buildVisionContent(prompt, image_url);
    const {
      text: raw,
      provider,
      model,
    } = await callAI(
      'You are a visual art classifier. Return only valid JSON.',
      content,
      env,
      256,
      getTierForTask('screening'),
    );
    const clean = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const m = clean.match(/\{[\s\S]*\}/);
      if (m) {
        parsed = JSON.parse(m[0]);
      } else {
        return jsonResponse({
          is_artwork: null,
          confidence: 'low',
          reason: 'Model returned non-JSON',
          _provider: provider,
          _model: model,
        });
      }
    }

    const result = { ...parsed, _provider: provider, _model: model };

    // Cache for 7 days
    if (env.TRACK_VISUAL_CACHE) {
      await env.TRACK_VISUAL_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 86400 * 7 });
    }

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: e.message, is_artwork: null, confidence: 'low', reason: 'Visual screen failed' }, 500);
  }
}

// ── Style analysis via AI Vision ─────────────────────────────────────────────

async function handleAnalyse(request, env) {
  if (!env.ANTHROPIC_API_KEY && !env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'No AI provider configured' }, 503);
  }

  const body = await request.json();
  const { image_url, artist, media_type, saved_find_id } = body;
  if (!image_url || !artist) return jsonResponse({ error: 'image_url and artist required' }, 400);

  const prompt = `You are a forensic art historian specialising in Flemish Old Masters. Analyse this image forensically.

Artist being investigated: ${artist}
Media type: ${media_type || 'unknown'}

Examine and report on:
1. Compositional structure — figure placement, diagonals, balance
2. Colour palette and tonal values — warm/cool, specific pigment indicators
3. Brushwork visibility — loose/tight, impasto, blending
4. Figure types and proportions
5. Drapery treatment — how fabric is painted
6. Light treatment — source, modelling on flesh
7. Background treatment — landscape, architecture, atmosphere

Compare with known characteristics of ${artist} across different periods.

Give:
- Period estimate (early/peak or italian or english/late/mature) with confidence
- What matches the artist known style
- What deviates from the artist known style
- Attribution suggestion: autograph/workshop/circle/copy/uncertain
- Market value range estimate in EUR
- Recommended next steps

Be forensic not definitive. Always use "consistent with" not "this is".

Return JSON only:
{
  "period_estimate": "early" or "peak" or "late" or "italian" or "english" or "mature" or "unknown",
  "confidence": "high" or "medium" or "low",
  "analysis_text": "full forensic analysis paragraph",
  "style_matches": ["match 1", "match 2"],
  "style_deviations": ["deviation 1"],
  "attribution_suggestion": "autograph" or "workshop" or "circle" or "copy" or "uncertain",
  "market_value": {
    "atelier_low": 50000,
    "atelier_high": 200000,
    "autograph_estimate": 2000000
  },
  "next_steps": ["step 1", "step 2"]
}`;

  try {
    // Use PREMIUM tier (Claude Sonnet 4-6) for deep forensic analysis
    const content = buildVisionContent(prompt, image_url);
    const { text: raw, provider } = await callAI(
      'You are a forensic art historian specialising in Flemish Old Masters. Return only valid JSON.',
      content,
      env,
      1200,
      getTierForTask('deep_analysis'),
    );
    const clean = raw.replace(/```json|```/g, '').trim();
    const result = { ...JSON.parse(clean), _provider: provider };

    // Save to find if ID provided
    if (saved_find_id && env.TRACK_SAVED_FINDS) {
      const existing = await env.TRACK_SAVED_FINDS.get(`find:${saved_find_id}`, { type: 'json' });
      if (existing) {
        const updated = {
          ...existing,
          style_analysis: result,
          market_value: result.market_value || null,
          status: 'analysed',
        };
        await env.TRACK_SAVED_FINDS.put(`find:${saved_find_id}`, JSON.stringify(updated));
      }
    }

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// ── Provenance quick scan ─────────────────────────────────────────────────────
// runProvenanceScan is defined in saved-finds.js and imported above

async function handleProvenanceScan(request, env) {
  if (!env.ANTHROPIC_API_KEY && !env.OPENROUTER_API_KEY && !env.GEMINI_API_KEY) {
    return jsonResponse({ error: 'No AI provider configured' }, 503);
  }

  const body = await request.json();
  const { description, seller_location, price, media_type, saved_find_id } = body;
  if (!description) return jsonResponse({ error: 'description required' }, 400);

  try {
    const result = await runProvenanceScan(description, seller_location || '', price || '', media_type || '', env);

    if (saved_find_id && env.TRACK_SAVED_FINDS) {
      const existing = await env.TRACK_SAVED_FINDS.get(`find:${saved_find_id}`, { type: 'json' });
      if (existing) {
        await env.TRACK_SAVED_FINDS.put(
          `find:${saved_find_id}`,
          JSON.stringify({
            ...existing,
            provenance_scan: result,
            status: existing.status === 'new' ? 'analysed' : existing.status,
          }),
        );
      }
    }

    return jsonResponse(result);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

// ── Oeuvre data endpoint ──────────────────────────────────────────────────────

async function handleGetOeuvre(params, env) {
  const artist = (params.get('artist') || '').toLowerCase().trim();
  if (!artist) return jsonResponse({ error: 'artist param required' }, 400);

  const key = artist.replace(/\s+/g, ' ');
  const data = OEUVRE_DATA[key];

  if (!data) {
    return jsonResponse({
      found: false,
      available: Object.keys(OEUVRE_DATA),
      note: `Oeuvre data not available for "${artist}"`,
    });
  }

  return jsonResponse({ found: true, ...data });
}

// ── Verify & Reference handlers ───────────────────────────────────────────────

function handleVerify(params) {
  const title = params.get('title') || '';
  const artist = params.get('artist') || '';
  if (!title && !artist) return jsonResponse({ error: 'Provide title or artist' }, 400);

  const artistData = artist ? lookupRkdArtist(artist) : null;
  const dangerPeriods = title ? analyzeDangerPeriods(title, title, '') : [];
  const mediaType = title ? classifyMedia(title, '', []) : null;

  return jsonResponse({
    artist: artistData,
    title_analysis: title
      ? {
          media_type: mediaType,
          alert: scoreAlert(mediaType, title, '', []),
          danger_periods: dangerPeriods,
        }
      : null,
  });
}

function handleReference(params) {
  const artist = params.get('artist') || '';
  if (!artist) return jsonResponse({ error: 'Missing artist param' }, 400);
  return jsonResponse(lookupRkdArtist(artist));
}

async function handleDangerCheck(params) {
  const provenance = params.get('provenance') || '';
  const sellerCountry = params.get('seller_country') || '';
  const periods = analyzeDangerPeriods(provenance, provenance, sellerCountry);
  return jsonResponse({ seller_country: sellerCountry, danger_periods: periods });
}

// ── Test notification ─────────────────────────────────────────────────────────

async function handleTestNotify(request, env) {
  const body = await request.json().catch(() => ({}));
  const chatId =
    body.telegram_chat_id ||
    body.chatId ||
    (env.TRACK_WATCHLIST
      ? (await env.TRACK_WATCHLIST.get('watchlist:default', { type: 'json' }))?.notify?.telegram_chat_id
      : null);

  const testItem = {
    id: 'test_001',
    title: 'Test: Oil Sketch attributed to Circle of Rubens',
    price: { value: '2500', currency: 'EUR' },
    image: null,
    url: 'https://picturia.art',
    location: 'BE',
    description: 'Compositional study, olieverfschets, Vlaamse school 17e eeuw',
    source: 'ebay',
    localizedAspects: [],
    media_type: 'sketch',
    alert: { level: 'PRIORITY', reasons: ['Modello/oil sketch', 'Misattribution signal: circle of'] },
    danger_periods: [{ period: 'WWII', risk: 'MEDIUM', note: 'Test warning' }],
  };

  const results = { telegram: null, email: null };

  if (chatId) {
    results.telegram = await sendTelegramAlert(testItem, env, chatId);
  }

  const emailTo =
    body.email ||
    (env.TRACK_WATCHLIST ? (await env.TRACK_WATCHLIST.get('watchlist:default', { type: 'json' }))?.notify?.email : null);
  if (emailTo) {
    results.email = await sendResendEmail('digest', [testItem], env, emailTo);
  }

  return jsonResponse({ test: true, ...results });
}

// ── Main router ───────────────────────────────────────────────────────────────

// ── Timing instrumentation ───────────────────────────────────────────────────

/**
 * Wrap a handler call with execution timing. Returns both the response
 * and the elapsed time in milliseconds.
 */
async function timed(name, fn) {
  const start = Date.now();
  const response = await fn();
  const elapsed = Date.now() - start;
  const headers = new Headers(response.headers);
  headers.set('X-Track-Timing', `${name}:${elapsed}ms`);
  return new Response(response.body, { status: response.status, headers });
}

// ── Main router ───────────────────────────────────────────────────────────────

const router = {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsPreflightResponse(env);

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Sentry verification endpoint (must be before try/catch so Sentry captures it as unhandled)
    if (path === '/debug-sentry') {
      throw new Error('My first Sentry error!');
    }

    // Diagnostic endpoint — reveals whether Sentry DSN is present at runtime
    if (path === '/debug-env') {
      // Debug: show exact DSN value details
      const dsnRaw = env.SENTRY_DSN || '';
      var dsnHost = null;
      var dsnPath = null;
      var dsnParseError = null;
      try {
        const u = new URL(dsnRaw);
        dsnHost = u.hostname;
        dsnPath = u.pathname;
      } catch (e) {
        dsnParseError = e.message;
      }

      // Test connectivity to Sentry ingest endpoint
      var sentryReachable = null;
      var sentryResponse = null;
      if (dsnHost && dsnPath) {
        try {
          const projectId = dsnPath.split('/').filter(Boolean).pop();
          const ingestUrl = 'https://' + dsnHost + '/api/' + projectId + '/envelope/';
          var resp = await fetch(ingestUrl, { method: 'POST' });
          sentryResponse = resp.status;
          sentryReachable = true;
        } catch (e) {
          sentryReachable = false;
          sentryResponse = e.message;
        }
      }

      return jsonResponse({
        dsn_length: dsnRaw.length,
        dsn_starts_with: dsnRaw.slice(0, 8),
        dsn_ends_with: dsnRaw.slice(-8),
        dsn_host: dsnHost,
        dsn_path: dsnPath,
        dsn_parse_error: dsnParseError,
        sentry_reachable: sentryReachable,
        sentry_response: sentryResponse,
        sentry_environment: env.SENTRY_ENVIRONMENT || null,
      });
    }

    try {
      // Image proxy — returns early with its own CORS + Content-Type headers
      if (path === '/image-proxy') {
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
          return addCorsHeaders(new Response('Missing url parameter', { status: 400 }), env);
        }

        const ALLOWED_DOMAINS = [
          'upload.wikimedia.org',
          'commons.wikimedia.org',
          'lh3.ggpht.com',
          'lh3.googleusercontent.com',
          'images.metmuseum.org',
          'collectionapi.metmuseum.org',
          'gallica.bnf.fr',
          'api.europeana.eu',
          'rijksmuseum.nl',
          'www.rijksmuseum.nl',
          'iiif.bodleian.ox.ac.uk',
          'digi.ub.uni-heidelberg.de',
        ];

        let parsedUrl;
        try {
          parsedUrl = new URL(targetUrl);
        } catch {
          return addCorsHeaders(new Response('Invalid URL', { status: 400 }), env);
        }

        const isAllowed = ALLOWED_DOMAINS.some(
          (d) => parsedUrl.hostname === d || parsedUrl.hostname.endsWith('.' + d),
        );
        if (!isAllowed) {
          return addCorsHeaders(new Response('Domain not allowed', { status: 403 }), env);
        }

        try {
          const imageRes = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Picturia/1.0 (picturia.art; art history research)',
              Accept: 'image/*,*/*',
            },
            cf: { cacheTtl: 86400, cacheEverything: true },
          });

          if (!imageRes.ok) {
            return new Response(`Upstream error: ${imageRes.status}`, { status: imageRes.status });
          }

          const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
          const body = await imageRes.arrayBuffer();

          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400',
              'X-Picturia-Proxy': 'true',
              'X-Source-Domain': parsedUrl.hostname,
            },
          });
        } catch (err) {
          return new Response(`Proxy error: ${err.message}`, { status: 500 });
        }
      }

      let response;

      if (path === '/health') {
        const month = new Date().getMonth() + 1;
        const isHighSeason = [1, 2, 3, 4, 10, 11].includes(month);
        response = await timed('health', () =>
          Promise.resolve(
            jsonResponse({
              status: 'ok',
              version: '2.3',
              ts: Date.now(),
              season: isHighSeason ? 'high' : 'normal',
              month,
              modules: [
                'ai',
                'alerts',
                'provenance',
                'search',
                'oeuvre',
                'style',
                'saved-finds',
                'notify',
                'watchlist',
                'report',
              ],
              ai_tiers: ['economy (DeepSeek V4 Flash)', 'standard (GPT-4.1 Nano)', 'premium (Claude Sonnet 4-6)'],
            }),
          ),
        );

        // Search & listing
      } else if (path === '/search') {
        response = await timed('search', () => aggregateSearch(url.searchParams, env));
      } else if (path.startsWith('/item/')) {
        const itemId = path.replace('/item/', '').split('/')[0];
        response = await timed('item', () => handleEbayItem(itemId, env));
      } else if (path === '/verify') {
        response = await timed('verify', () => Promise.resolve(handleVerify(url.searchParams)));
      } else if (path === '/reference') {
        response = await timed('reference', () => Promise.resolve(handleReference(url.searchParams)));
      } else if (path === '/danger-check') {
        response = await timed('danger-check', () => handleDangerCheck(url.searchParams));

        // Watchlist & alerts
      } else if (path === '/watchlist' && method === 'GET') {
        response = await timed('watchlist:get', () => handleGetWatchlist(env));
      } else if (path === '/watchlist' && method === 'POST') {
        response = await timed('watchlist:post', () => handlePostWatchlist(request, env));
      } else if (path === '/alerts') {
        response = await timed('alerts', () => handleGetAlerts(env));
      } else if (path === '/test-notify' && method === 'POST') {
        response = await timed('test-notify', () => handleTestNotify(request, env));
      } else if (path === '/trigger-scan') {
        response = await timed('trigger-scan', () => runBackgroundScan(env, ctx).then((r) => jsonResponse(r)));

        // Saved Finds
      } else if (path === '/saves' && method === 'POST') {
        response = await timed('saves:post', () => handleSaveFind(request, env));
      } else if (path === '/saves' && method === 'GET') {
        response = await timed('saves:get', () => handleGetSaves(url.searchParams, env));
      } else if (path.startsWith('/saves/') && method === 'PUT') {
        const id = path.replace('/saves/', '').split('/')[0];
        response = await timed('saves:put', () => handleUpdateSave(id, request, env));
      } else if (path.startsWith('/saves/') && method === 'DELETE') {
        const id = path.replace('/saves/', '').split('/')[0];
        response = await timed('saves:delete', () => handleDeleteSave(id, env));

        // AI endpoints
      } else if (path === '/visual-screen' && method === 'POST') {
        response = await timed('visual-screen', () => handleVisualScreen(request, env));
      } else if (path === '/style-database' && method === 'GET') {
        response = await timed('style-database', () =>
          Promise.resolve(jsonResponse(getStyleData(url.searchParams.get('artist')))),
        );
      } else if (path === '/analyse' && method === 'POST') {
        response = await timed('analyse', () => handleAnalyse(request, env));
      } else if (path === '/provenance-scan' && method === 'POST') {
        response = await timed('provenance-scan', () => handleProvenanceScan(request, env));
      } else if (path === '/oeuvre' && method === 'GET') {
        response = await timed('oeuvre', () => handleGetOeuvre(url.searchParams, env));
      } else if (path === '/report' && method === 'POST') {
        response = await timed('report', () => handleReport(request, env));
      } else if (path === '/tts' && method === 'POST') {
        response = await timed('tts', () => handleTTS(request, env));
      } else if (path === '/send-digest' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const finds = body.finds || [];
        response = await timed('send-digest', () => sendResendEmail('digest', finds, env).then((r) => jsonResponse(r)));
      } else {
        response = jsonResponse({ error: 'Not found' }, 404);
      }

      return addCorsHeaders(response, env);
    } catch (err) {
      return addCorsHeaders(jsonResponse({ error: err.message || 'Internal error' }, 500), env);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runBackgroundScan(env, ctx));
  },
};

// ── ElevenLabs TTS with KV caching ───────────────────────────────────────────

async function handleTTS(request, env) {
  if (!env.ELEVENLABS_API_KEY) {
    return jsonResponse({ error: 'ElevenLabs not configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { text, voice_id = 'onwK4e9ZLuTAKqWW03F9', language = 'nl' } = body;
  if (!text || typeof text !== 'string') return jsonResponse({ error: 'text required' }, 400);

  const truncated = text.slice(0, 2500);
  const cacheKey = `tts_${voice_id}_${language}_${hashString(truncated)}`;

  const cached = await env.TOKEN_CACHE.get(cacheKey, { type: 'arrayBuffer' });
  if (cached) {
    return new Response(cached, {
      headers: { 'Content-Type': 'audio/mpeg', 'X-Cache': 'HIT', ...corsHeaders(env) },
    });
  }

  const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
    method: 'POST',
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: truncated,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.72, similarity_boost: 0.85, style: 0.12 },
    }),
  });

  if (!elRes.ok) {
    const err = await elRes.text().catch(() => elRes.status);
    return jsonResponse({ error: 'ElevenLabs error', detail: err }, elRes.status);
  }

  const audio = await elRes.arrayBuffer();
  await env.TOKEN_CACHE.put(cacheKey, audio, { expirationTtl: 86400 * 30 });

  return new Response(audio, {
    headers: { 'Content-Type': 'audio/mpeg', 'X-Cache': 'MISS', ...corsHeaders(env) },
  });
}

export default withSentry(router);
