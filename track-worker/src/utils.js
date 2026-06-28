/**
 * TRACK Worker v2.2 — Shared Utilities
 *
 * Helper functions used across all worker modules.
 */

/** FNV-1a hash — stable string → 8-char hex */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Clamp a value between min and max */
export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

/** Fetch with timeout + AbortController */
export function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/** Decode HTML entities */
export function decodeHtml(str) {
  return (str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .trim();
}

/** Strip HTML tags */
export function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Alert level → numeric rank for sorting */
export function levelRank(level) {
  return level === 'APEX' ? 4 : level === 'CRITICAL' ? 3 : level === 'PRIORITY' ? 2 : level === 'WATCH' ? 1 : 0;
}

/** Create a JSON response */
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** CORS headers builder */
export function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Track-Key',
    'Access-Control-Max-Age': '86400',
  };
}

/** CORS preflight response */
export function corsPreflightResponse(env) {
  return new Response(null, { status: 204, headers: corsHeaders(env) });
}

/** Add CORS headers to an existing response */
export function addCorsHeaders(response, env) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

/** Escape markdown special chars for Telegram */
export function escapeMarkdown(str) {
  return (str || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
