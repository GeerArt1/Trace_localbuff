/**
 * TRACK Worker v2.2 — Watchlist & Background Scan
 *
 * Watchlist CRUD, alert history, and seasonal cron-based background scanning
 * across all configured marketplaces for tracked artists.
 */

import { jsonResponse, levelRank } from './utils.js';
import { SOURCE_MAP } from './search.js';
import { enrichItem } from './alerts.js';
import { DEFAULT_WATCHLIST, sendTelegramAlert, sendResendEmail } from './notify.js';

/**
 * GET /watchlist — Retrieve the current watchlist configuration.
 * @param {Object} env - Environment bindings (TRACK_WATCHLIST KV)
 * @returns {Promise<Response>}
 */
export async function handleGetWatchlist(env) {
  const wl = env.TRACK_WATCHLIST
    ? (await env.TRACK_WATCHLIST.get('watchlist:default', { type: 'json' })) || DEFAULT_WATCHLIST
    : DEFAULT_WATCHLIST;
  return jsonResponse(wl);
}

/**
 * POST /watchlist — Update the watchlist configuration.
 * @param {Request} request
 * @param {Object} env
 * @returns {Promise<Response>}
 */
export async function handlePostWatchlist(request, env) {
  if (!env.TRACK_WATCHLIST) return jsonResponse({ error: 'TRACK_WATCHLIST KV not configured' }, 503);
  const body = await request.json();
  const merged = { ...DEFAULT_WATCHLIST, ...body };
  merged.notify = { ...DEFAULT_WATCHLIST.notify, ...(body.notify || {}) };
  if (body.telegramChatId) merged.notify.telegram_chat_id = body.telegramChatId;
  if (body.email) merged.notify.email = body.email;
  await env.TRACK_WATCHLIST.put('watchlist:default', JSON.stringify(merged));
  return jsonResponse({ ok: true, watchlist: merged });
}

/**
 * GET /alerts — Retrieve alert history.
 * @param {Object} env - Environment bindings (TRACK_ALERT_HISTORY KV)
 * @returns {Promise<Response>}
 */
export async function handleGetAlerts(env) {
  const history = env.TRACK_ALERT_HISTORY ? (await env.TRACK_ALERT_HISTORY.get('history', { type: 'json' })) || [] : [];
  return jsonResponse({ total: history.length, alerts: history.slice(0, 50) });
}

/**
 * Seasonal background scan — runs on cron or manual trigger.
 * Adapts source priority based on time of year (auction season, estate clearance, summer).
 *
 * @param {Object} env - Environment bindings
 * @param {{waitUntil: Function}} ctx - Execution context
 * @returns {Promise<Object>} Scan results
 */
export async function runBackgroundScan(env, ctx) {
  const wl = env.TRACK_WATCHLIST
    ? (await env.TRACK_WATCHLIST.get('watchlist:default', { type: 'json' })) || DEFAULT_WATCHLIST
    : DEFAULT_WATCHLIST;

  const month = new Date().getMonth() + 1;
  const isHighSeason = [1, 2, 3, 4, 10, 11].includes(month);
  const isPeakAuction = [3, 4, 10, 11].includes(month);
  const isEstateSeason = [1, 2].includes(month);
  const isSummerHoliday = [6, 7, 8].includes(month);

  let sources = [...wl.sources];
  if (isPeakAuction && !sources.includes('catawiki')) sources.push('catawiki');
  if (isEstateSeason) {
    sources = ['2dehands', 'marktplaats', ...sources.filter((s) => s !== '2dehands' && s !== 'marktplaats')];
  }
  if (isSummerHoliday && !sources.includes('leboncoin')) sources.push('leboncoin');

  const seenIds = env.TRACK_SEEN_IDS ? (await env.TRACK_SEEN_IDS.get('seen', { type: 'json' })) || {} : {};

  const newAlerts = [];

  for (const artist of wl.artists) {
    const results = await Promise.allSettled(
      sources.map((src) =>
        SOURCE_MAP[src] ? SOURCE_MAP[src](artist, 20, env) : Promise.resolve({ source: src, items: [] }),
      ),
    );

    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value.items : []));
    const enriched = items.map(enrichItem);

    const thresholdRank = levelRank(wl.alert_threshold || 'PRIORITY');
    const newFinds = enriched.filter((item) => levelRank(item.alert.level) >= thresholdRank && !seenIds[item.id]);

    for (const item of newFinds) {
      seenIds[item.id] = Date.now();
      newAlerts.push({ ...item, artist_searched: artist, found_at: new Date().toISOString() });

      if (wl.notify?.telegram_chat_id) {
        ctx.waitUntil(sendTelegramAlert(item, env, wl.notify.telegram_chat_id));
      }

      // Immediate email for APEX
      if (item.alert.level === 'APEX' && wl.notify?.email) {
        ctx.waitUntil(sendResendEmail('apex', item, env));
      }
    }
  }

  // Prune seen IDs to max 10k
  if (env.TRACK_SEEN_IDS && newAlerts.length > 0) {
    const allKeys = Object.keys(seenIds);
    if (allKeys.length > 10000) {
      const sorted = allKeys.sort((a, b) => seenIds[a] - seenIds[b]);
      sorted.slice(0, allKeys.length - 10000).forEach((k) => delete seenIds[k]);
    }
    await env.TRACK_SEEN_IDS.put('seen', JSON.stringify(seenIds), { expirationTtl: 86400 * 30 });
  }

  // Update alert history
  if (env.TRACK_ALERT_HISTORY && newAlerts.length > 0) {
    const history = (await env.TRACK_ALERT_HISTORY.get('history', { type: 'json' })) || [];
    const updated = [...newAlerts, ...history].slice(0, 200);
    await env.TRACK_ALERT_HISTORY.put('history', JSON.stringify(updated));
  }

  // Daily digest email
  if (newAlerts.length > 0) {
    ctx.waitUntil(sendResendEmail('digest', newAlerts, env));
  }

  const seasonNote = isHighSeason
    ? isPeakAuction
      ? 'Peak auction season'
      : 'Estate clearance season'
    : 'Regular season';

  return {
    ok: true,
    scanned_at: new Date().toISOString(),
    season: seasonNote,
    sources_used: sources,
    new_alerts: newAlerts.length,
    alerts: newAlerts,
  };
}
