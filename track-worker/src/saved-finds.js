/**
 * TRACK Worker v2.2 — Saved Finds CRUD & Provenance Scan
 *
 * Full lifecycle management for saved finds: save, list, update, archive.
 * Includes the provenance scan function used by the auto-trigger on save.
 */

import { hashString, jsonResponse } from './utils.js';
import { callAI, getTierForTask } from './ai.js';

/**
 * Generate a stable find ID from a listing URL.
 * @param {string} url - Listing URL
 * @returns {string} 8-char hex hash
 */
export function savedFindId(url) {
  return hashString(url);
}

// ── Provenance quick scan ─────────────────────────────────────────────────────

/**
 * Pure risk scoring function. Applies business rules to compute a final
 * risk score and upgrade risk level as needed.
 *
 * Rules:
 *  - Each danger_period_overlap: +25
 *  - Each gap: +10
 *  - Church/monastery keywords in description: +15
 *  - Eastern European / German signals in seller location or description: +15
 *  - Score >= 50 → risk_level = HIGH (unless already HIGH)
 *  - Score >= 25 & current level === 'LOW' → MEDIUM
 *
 * @param {Object} result - Partial scan result from AI (before scoring)
 * @param {string} description - Original listing description
 * @param {string} [sellerLocation] - Seller location string
 * @returns {{ risk_score: number, risk_level: string }} Updated score and level
 */
export function scoreProvenanceRisk(result, description, sellerLocation) {
  let score = result.risk_score || 0;
  const level = result.risk_level || 'LOW';

  (result.danger_period_overlaps || []).forEach(() => {
    score += 25;
  });
  (result.gaps || []).forEach(() => {
    score += 10;
  });

  if (/church|monastery|klooster|abdij|kerk/i.test(description)) score += 15;
  if (/eastern europe|poland|czech|hungary|romania|germany/i.test((sellerLocation || '') + description)) score += 15;

  let risk_level = level;
  if (score >= 50 && risk_level !== 'HIGH') risk_level = 'HIGH';
  else if (score >= 25 && risk_level === 'LOW') risk_level = 'MEDIUM';

  return { risk_score: score, risk_level };
}

/**
 * Run an AI-powered provenance risk scan on a listing description.
 * Extracts signals, danger period overlaps, and risk scoring.
 *
 * @param {string} description - Listing description text
 * @param {string} sellerLocation - Seller location string
 * @param {string} price - Listing price
 * @param {string} mediaType - Classified media type
 * @param {Object} env - Environment bindings (for AI API keys)
 * @returns {Promise<Object>} Provenance scan result with risk assessment
 */
export async function runProvenanceScan(description, sellerLocation, price, mediaType, env) {
  const prompt = `Extract provenance signals from this auction listing. Identify: previous owners, locations, dates, acquisition circumstances, labels, institutional origins mentioned.

Flag overlaps with danger periods:
- French Revolution 1789–1799
- Napoleonic requisitions 1794–1815
- WWI Belgium 1914–1918
- WWII Nazi occupation 1940–1945
- Communist nationalisations 1945–1989

Also flag: church/monastery origin, Eastern European origin, German collection labels, estate sales, family heirlooms with no documentation.

Listing description: """${description}"""
Seller location: ${sellerLocation || 'unknown'}
Price: ${price || 'unknown'}
Media type: ${mediaType || 'unknown'}

Return JSON only:
{
  "signals": ["signal 1", "signal 2"],
  "danger_period_overlaps": ["period 1"],
  "timeline": [{"date": "ca. 1920", "event": "Private collection"}],
  "risk_level": "HIGH" or "MEDIUM" or "LOW",
  "risk_score": 0,
  "seller_questions": ["question 1"],
  "gaps": ["gap description"]
}`;

  // Use STANDARD tier (GPT-4.1 Nano) for provenance — balances quality and cost
  const { text: raw, provider } = await callAI(
    'You are a provenance risk analyst specialising in cultural property. Return only valid JSON.',
    prompt,
    env,
    800,
    getTierForTask('analysis'),
  );
  const clean = raw.replace(/```json|```/g, '').trim();
  const result = { ...JSON.parse(clean), _provider: provider };

  // Apply risk scoring rules using pure function
  const { risk_score, risk_level } = scoreProvenanceRisk(result, description, sellerLocation);
  result.risk_score = risk_score;
  result.risk_level = risk_level;

  result.links = {
    art_loss_register: 'https://www.artloss.com',
    err_database: 'https://errproject.org',
    lostart: 'https://www.lostart.de',
    interpol: 'https://www.interpol.int/en/Crimes/Works-of-Art',
  };

  return result;
}

// ── Saved Finds CRUD ──────────────────────────────────────────────────────────

/**
 * POST /saves — Save a new find or update an existing one.
 * Auto-triggers provenance scan for new saves with descriptions.
 * @param {Request} request
 * @param {Object} env - Environment bindings (TRACK_SAVED_FINDS KV)
 * @returns {Promise<Response>}
 */
export async function handleSaveFind(request, env) {
  if (!env.TRACK_SAVED_FINDS) return jsonResponse({ error: 'TRACK_SAVED_FINDS KV not configured' }, 503);
  const body = await request.json();
  if (!body.url) return jsonResponse({ error: 'url required' }, 400);

  const id = savedFindId(body.url);
  const existing = await env.TRACK_SAVED_FINDS.get(`find:${id}`, { type: 'json' });

  const find = {
    id,
    artist: body.artist || '',
    title: body.title || '',
    price: body.price || '',
    url: body.url,
    image: body.image || null,
    source: body.source || '',
    alert_level: body.alert_level || '',
    media_type: body.media_type || '',
    danger_periods: body.danger_periods || [],
    date_saved: existing?.date_saved || new Date().toISOString(),
    status: existing?.status || 'new',
    notes: body.notes !== undefined ? body.notes : existing?.notes || '',
    style_analysis: existing?.style_analysis || null,
    visual_screen: existing?.visual_screen || null,
    market_value: existing?.market_value || null,
    provenance_scan: existing?.provenance_scan || null,
    oeuvre_match: body.oeuvre_match || existing?.oeuvre_match || null,
  };

  await env.TRACK_SAVED_FINDS.put(`find:${id}`, JSON.stringify(find));

  // Update artist index
  const artistKey = `artist:${(body.artist || 'unknown').toLowerCase().replace(/\s+/g, '_')}`;
  const artistIndex = (await env.TRACK_SAVED_FINDS.get(artistKey, { type: 'json' })) || [];
  if (!artistIndex.includes(id)) artistIndex.unshift(id);
  await env.TRACK_SAVED_FINDS.put(artistKey, JSON.stringify(artistIndex.slice(0, 200)));

  // Auto-trigger provenance scan for new saves with description
  if (!existing && body.description && env.OPENROUTER_API_KEY) {
    try {
      const scanResult = await runProvenanceScan(
        body.description,
        body.source || '',
        body.price || '',
        body.media_type || '',
        env,
      );
      find.provenance_scan = scanResult;
      find.status = 'analysed';
      await env.TRACK_SAVED_FINDS.put(`find:${id}`, JSON.stringify(find));
    } catch (_) {
      /* non-blocking */
    }
  }

  return jsonResponse({ ok: true, id, find, created: !existing });
}

/**
 * GET /saves — List saved finds with optional artist and status filters.
 * @param {URLSearchParams} params
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handleGetSaves(params, env) {
  if (!env.TRACK_SAVED_FINDS) return jsonResponse({ error: 'TRACK_SAVED_FINDS KV not configured' }, 503);

  const artist = params.get('artist') || '';
  const status = params.get('status') || '';

  let ids = [];
  if (artist) {
    const artistKey = `artist:${artist.toLowerCase().replace(/\s+/g, '_')}`;
    ids = (await env.TRACK_SAVED_FINDS.get(artistKey, { type: 'json' })) || [];
  } else {
    const listed = await env.TRACK_SAVED_FINDS.list({ prefix: 'find:' });
    ids = listed.keys.map((k) => k.name.replace('find:', ''));
  }

  const finds = (await Promise.all(ids.map((id) => env.TRACK_SAVED_FINDS.get(`find:${id}`, { type: 'json' })))).filter(
    Boolean,
  );

  const filtered = status ? finds.filter((f) => f.status === status) : finds;
  filtered.sort((a, b) => new Date(b.date_saved) - new Date(a.date_saved));

  return jsonResponse({ total: filtered.length, finds: filtered });
}

/**
 * PUT /saves/:id — Update a saved find's notes/status/fields.
 * @param {string} id
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handleUpdateSave(id, request, env) {
  if (!env.TRACK_SAVED_FINDS) return jsonResponse({ error: 'TRACK_SAVED_FINDS KV not configured' }, 503);

  const existing = await env.TRACK_SAVED_FINDS.get(`find:${id}`, { type: 'json' });
  if (!existing) return jsonResponse({ error: 'Find not found' }, 404);

  const body = await request.json();
  const updated = { ...existing, ...body, id };
  await env.TRACK_SAVED_FINDS.put(`find:${id}`, JSON.stringify(updated));

  return jsonResponse({ ok: true, find: updated });
}

/**
 * DELETE /saves/:id — Archive a saved find (soft delete).
 * @param {string} id
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handleDeleteSave(id, env) {
  if (!env.TRACK_SAVED_FINDS) return jsonResponse({ error: 'TRACK_SAVED_FINDS KV not configured' }, 503);

  const existing = await env.TRACK_SAVED_FINDS.get(`find:${id}`, { type: 'json' });
  if (!existing) return jsonResponse({ error: 'Find not found' }, 404);

  const archived = { ...existing, status: 'archived' };
  await env.TRACK_SAVED_FINDS.put(`find:${id}`, JSON.stringify(archived));

  return jsonResponse({ ok: true, archived: true });
}
