/**
 * TRACK Worker v2.2 — Multi-Source Search Engine
 *
 * Aggregated search across eBay (API), LeBonCoin (Next.js SSR),
 * 2dehands (HTML scraping), Marktplaats (HTML scraping).
 */

import { TOKEN_KEY, TOKEN_TTL_BUFFER_S, UA_HEADERS } from './constants.js';
import { fetchWithTimeout, decodeHtml, stripHtml, clamp, levelRank, jsonResponse } from './utils.js';
import { enrichItem } from './alerts.js';

// ── eBay source ───────────────────────────────────────────────────────────────

async function getEbayToken(env) {
  const cached = await env.TOKEN_CACHE.get(TOKEN_KEY, { type: 'json' });
  if (cached && cached.expires_at > Date.now()) return cached.access_token;

  const credentials = btoa(`${env.EBAY_CLIENT_ID}:${env.EBAY_CLIENT_SECRET}`);
  const res = await fetch(`${env.EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token fetch failed (${res.status}): ${text}`);
  }

  const token = await res.json();
  const expiresIn = token.expires_in || 7200;
  const expiresAt = Date.now() + (expiresIn - TOKEN_TTL_BUFFER_S) * 1000;

  await env.TOKEN_CACHE.put(TOKEN_KEY, JSON.stringify({ access_token: token.access_token, expires_at: expiresAt }), {
    expirationTtl: expiresIn - TOKEN_TTL_BUFFER_S,
  });

  return token.access_token;
}

function normalizeEbayItem(item, detail) {
  return {
    id: item.itemId,
    title: item.title || '',
    price: item.price || null,
    image: item.image?.imageUrl || null,
    url: item.itemWebUrl || '',
    location: item.itemLocation?.country || null,
    description: detail?.description ? stripHtml(detail.description).slice(0, 500) : item.shortDescription || null,
    source: 'ebay',
    condition: item.condition || null,
    endDate: item.itemEndDate || null,
    seller: item.seller?.username || null,
    feedbackScore: item.seller?.feedbackScore || null,
    categories: (item.categories || []).map((c) => c.categoryName),
    buyingOptions: item.buyingOptions || [],
    localizedAspects: (detail?.localizedAspects || []).map((a) => ({ name: a.name, value: a.value })),
  };
}

async function searchEbay(q, limit, env) {
  const token = await getEbayToken(env);
  const marketplace = env.EBAY_MARKETPLACE || 'EBAY_NL';

  const sp = new URLSearchParams({ q, limit: String(limit), offset: '0', sort: 'bestMatch', fieldgroups: 'EXTENDED' });
  const res = await fetchWithTimeout(
    `${env.EBAY_API_BASE}/buy/browse/v1/item_summary/search?${sp}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': marketplace,
      },
    },
    10000,
  );

  if (!res.ok) {
    const data = await res.json();
    return { source: 'ebay', items: [], error: data };
  }

  const data = await res.json();
  const summaries = data.itemSummaries || [];

  const detailSlice = summaries.slice(0, 5);
  const detailResults = await Promise.allSettled(
    detailSlice.map((s) =>
      fetchWithTimeout(
        `${env.EBAY_API_BASE}/buy/browse/v1/item/${encodeURIComponent(s.itemId)}`,
        {
          headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace },
        },
        6000,
      ).then((r) => (r.ok ? r.json() : null)),
    ),
  );

  const items = summaries.map((s, i) => {
    const d = i < 5 && detailResults[i].status === 'fulfilled' ? detailResults[i].value : null;
    return normalizeEbayItem(s, d);
  });

  return { source: 'ebay', items, total: data.total || 0 };
}

// ── LeBonCoin source ──────────────────────────────────────────────────────────

async function searchLeBonCoin(query) {
  const url = `https://www.leboncoin.fr/recherche?text=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { ...UA_HEADERS, 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' } },
      8000,
    );
    if (!res.ok) return { source: 'leboncoin', items: [], error: `HTTP ${res.status}` };

    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]+?)<\/script>/);
    if (!m) return { source: 'leboncoin', items: [], error: 'No NEXT_DATA' };

    const data = JSON.parse(m[1]);
    const ads = data?.props?.pageProps?.searchData?.ads || [];

    const items = ads.map((ad) => ({
      id: `lbc_${ad.list_id}`,
      title: ad.subject || '',
      price: { value: String(ad.price?.[0] ?? ''), currency: 'EUR' },
      image: ad.images?.thumb_url || (ad.images?.urls || [])[0] || null,
      url: ad.url || `https://www.leboncoin.fr/annonce/${ad.list_id}`,
      location: [ad.location?.city, ad.location?.country_id].filter(Boolean).join(' ') || null,
      description: ad.body || null,
      source: 'leboncoin',
      localizedAspects: [],
    }));

    return { source: 'leboncoin', items };
  } catch (e) {
    return { source: 'leboncoin', items: [], error: e.message };
  }
}

// ── 2dehands / Marktplaats source ─────────────────────────────────────────────

function parseHzListings(html, source, baseUrl) {
  const blocks = html.split('hz-Listing--list-item');
  const items = [];
  const seen = new Set();

  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i].slice(0, 5000);

    const hrefM = b.match(/href="(\/v\/[^"]+)"/);
    const imgM = b.match(/<img[^>]+src="(https?:\/\/[^"]+)"/);
    const titleM = b.match(/Listing-title-new[^>]+>([^<]+)</);
    const priceM = b.match(/ListingPrice[^>]+>([^<]+)</);
    const locM = b.match(/location-label[^>]+>([^<]+)</);
    const descM = b.match(/Listing-description-new[^>]+>([^<]+)</);

    if (!hrefM || !titleM) continue;
    const href = hrefM[1];
    const listingKey = href.match(/\/(m\d+)-/)?.[1] || href;
    if (seen.has(listingKey)) continue;
    seen.add(listingKey);

    const priceStr = priceM ? priceM[1].replace(/[€\s ]/g, '').trim() : '';
    const rawPrice = /\d/.test(priceStr) ? priceStr.replace(/\.(?=\d{3})/g, '').replace(',', '.') : null;

    items.push({
      id: `${source}_${href.replace(/\//g, '_').slice(-30)}`,
      title: decodeHtml(titleM[1]),
      price: { value: rawPrice, currency: 'EUR' },
      image: imgM ? imgM[1] : null,
      url: baseUrl + href,
      location: locM ? decodeHtml(locM[1].trim()) : null,
      description: descM ? decodeHtml(descM[1]).slice(0, 300) : null,
      source,
      localizedAspects: [],
    });
  }

  return items;
}

async function search2dehands(query) {
  const slug = encodeURIComponent(query.replace(/\s+/g, '+'));
  try {
    const res = await fetchWithTimeout(`https://www.2dehands.be/q/${slug}/`, { headers: UA_HEADERS }, 8000);
    if (!res.ok) return { source: '2dehands', items: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    return { source: '2dehands', items: parseHzListings(html, '2dehands', 'https://www.2dehands.be') };
  } catch (e) {
    return { source: '2dehands', items: [], error: e.message };
  }
}

async function searchMarktplaats(query) {
  const slug = encodeURIComponent(query.replace(/\s+/g, '+'));
  try {
    const res = await fetchWithTimeout(`https://www.marktplaats.nl/q/${slug}/`, { headers: UA_HEADERS }, 8000);
    if (!res.ok) return { source: 'marktplaats', items: [], error: `HTTP ${res.status}` };
    const html = await res.text();
    return { source: 'marktplaats', items: parseHzListings(html, 'marktplaats', 'https://www.marktplaats.nl') };
  } catch (e) {
    return { source: 'marktplaats', items: [], error: e.message };
  }
}

function searchCatawiki(query) {
  return {
    source: 'catawiki',
    items: [],
    error:
      'Catawiki blocks server-side requests (Akamai WAF). Manual search: https://www.catawiki.com/en/search?q=' +
      encodeURIComponent(query) +
      '&category=art',
  };
}

function searchDorotheum(query) {
  return {
    source: 'dorotheum',
    items: [],
    error:
      'Dorotheum blocks server-side requests (Cloudflare WAF). Manual search: https://www.dorotheum.com/en/search/?q=' +
      encodeURIComponent(query),
  };
}

// ── Aggregated search ─────────────────────────────────────────────────────────

export const SOURCE_MAP = {
  ebay: (q, lim, env) => searchEbay(q, lim, env),
  leboncoin: (q) => searchLeBonCoin(q),
  '2dehands': (q) => search2dehands(q),
  marktplaats: (q) => searchMarktplaats(q),
  catawiki: (q) => searchCatawiki(q),
  dorotheum: (q) => searchDorotheum(q),
};

export const ALL_SOURCES = Object.keys(SOURCE_MAP);

/**
 * Aggregate search across multiple marketplaces.
 * @param {URLSearchParams} params - Query params: q, sources, media, limit
 * @param {Object} env - Environment bindings
 * @returns {Promise<Response>} JSON response with enriched items
 */
export async function aggregateSearch(params, env) {
  const q = params.get('q') || '';
  if (!q.trim()) return jsonResponse({ error: 'Missing q' }, 400);

  const sourcesParam = params.get('sources') || 'ebay,2dehands,marktplaats,leboncoin';
  const mediaFilter = (params.get('media') || '').split(',').filter(Boolean);
  const limit = clamp(parseInt(params.get('limit') || '20', 10), 1, 50);

  const requestedSources =
    sourcesParam === 'all'
      ? ALL_SOURCES
      : sourcesParam
          .split(',')
          .map((s) => s.trim())
          .filter((s) => SOURCE_MAP[s]);

  const results = await Promise.allSettled(requestedSources.map((src) => SOURCE_MAP[src](q, limit, env)));

  const sourceResults = {};
  let allItems = [];

  results.forEach((r, i) => {
    const src = requestedSources[i];
    if (r.status === 'fulfilled') {
      sourceResults[src] = { count: r.value.items.length, error: r.value.error || null };
      allItems = allItems.concat(r.value.items);
    } else {
      sourceResults[src] = { count: 0, error: r.reason?.message || 'Failed' };
    }
  });

  let enriched = allItems.map(enrichItem);
  enriched = enriched.filter((item) => item.media_type !== 'other' || item.has_art_context);

  if (mediaFilter.length > 0) {
    enriched = enriched.filter((item) => mediaFilter.includes(item.media_type));
  }

  enriched.sort((a, b) => levelRank(b.alert.level) - levelRank(a.alert.level));

  return jsonResponse({ q, total: enriched.length, sources: sourceResults, items: enriched });
}

/**
 * Fetch an individual eBay item by ID.
 * @param {string} itemId - eBay item ID
 * @param {Object} env - Environment bindings
 * @returns {Promise<Response>}
 */
export async function handleItem(itemId, env) {
  const token = await getEbayToken(env);
  const marketplace = env.EBAY_MARKETPLACE || 'EBAY_NL';
  const res = await fetch(`${env.EBAY_API_BASE}/buy/browse/v1/item/${encodeURIComponent(itemId)}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': marketplace },
  });
  const data = await res.json();
  if (!res.ok) return jsonResponse({ error: 'eBay API error', details: data }, res.status);
  return jsonResponse(data);
}
