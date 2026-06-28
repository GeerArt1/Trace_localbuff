/**
 * TRACK Worker v2.2 — Notification Handlers
 *
 * Telegram alerts and Resend email integration for APEX and digest notifications.
 */

import { escapeMarkdown } from './utils.js';

/**
 * Send a Telegram alert for a tracked item.
 * @param {Object} item - Enriched marketplace item
 * @param {Object} env - Environment bindings (TELEGRAM_BOT_TOKEN)
 * @param {string} chatId - Telegram chat ID
 * @returns {Promise<Object>} Telegram API response
 */
export async function sendTelegramAlert(item, env, chatId) {
  if (!env.TELEGRAM_BOT_TOKEN || !chatId) return { ok: false, error: 'Missing bot token or chat ID' };

  const level = item.alert?.level || item.alert_level || 'WATCH';
  const levelEmoji = level === 'APEX' ? '⚡' : level === 'CRITICAL' ? '🔴' : level === 'PRIORITY' ? '🟠' : '🟡';
  const mediaEmoji = {
    painting: '🖼️',
    sketch: '✏️',
    drawing: '🖊️',
    print: '🗃️',
    plate: '🔩',
    tapestry: '🧶',
    book: '📖',
    other: '📦',
  };
  const dangerWarn = item.danger_periods?.length
    ? `\\n⚠️ ${item.danger_periods.map((p) => `${p.period} (${p.risk})`).join(', ')}`
    : '';

  const text =
    `${levelEmoji} *TRACK ALERT — ${level}*\\n` +
    `${mediaEmoji[item.media_type] || '📦'} Type: ${item.media_type}\\n` +
    `*${escapeMarkdown(item.title)}*\\n` +
    `${item.source} · ${item.location || '?'} · ${item.price?.value ? `€${item.price.value}` : '?'}` +
    dangerWarn +
    '\\n' +
    `_${escapeMarkdown((item.alert?.reasons || []).join(' · '))}_\\n` +
    `[View listing](${item.url})`;

  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });

  return res.json();
}

/**
 * @typedef {Object} DEFAULT_WATCHLIST
 * @property {string[]} artists
 * @property {string[]} media
 * @property {string[]} sources
 * @property {string} alert_threshold
 * @property {{telegram_chat_id: string|null, email: string|null}} notify
 */

export const DEFAULT_WATCHLIST = {
  artists: ['Rubens', 'Van Dyck', 'Jordaens'],
  media: ['painting', 'sketch', 'drawing', 'print', 'plate'],
  sources: ['ebay', '2dehands', 'marktplaats', 'leboncoin'],
  alert_threshold: 'PRIORITY',
  notify: { telegram_chat_id: null, email: null },
};

/**
 * Send an email notification via Resend API.
 * @param {'apex'|'digest'} type - Notification type
 * @param {Object|Object[]} data - Single item for APEX, array for digest
 * @param {Object} env - Environment bindings (RESEND_API_KEY, TRACK_WATCHLIST)
 * @returns {Promise<{ok: boolean, error?: string, resend?: Object}>}
 */
export async function sendResendEmail(type, data, env, toOverride = null) {
  if (!env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const wl = env.TRACK_WATCHLIST
    ? (await env.TRACK_WATCHLIST.get('watchlist:default', { type: 'json' })) || DEFAULT_WATCHLIST
    : DEFAULT_WATCHLIST;

  const toEmail = toOverride || wl.notify?.email;
  if (!toEmail) return { ok: false, error: 'No email configured in watchlist' };

  let subject, html;

  if (type === 'apex') {
    const item = data;
    subject = `⚡ APEX ALERT — Possible missing work match: ${item.title?.slice(0, 50)}`;
    html = `<h1>⚡ APEX ALERT</h1>
<p><strong>${item.title}</strong></p>
<p>Source: ${item.source} · Price: ${item.price?.value ? `€${item.price.value}` : '?'}</p>
<p>Alert: ${(item.alert?.reasons || []).join('<br>')}</p>
<p><a href="${item.url}">View listing →</a></p>
<hr><p><small>TRACK · Picturia Intelligence Suite</small></p>`;
  } else if (type === 'digest') {
    const finds = data;
    const n = finds.length;
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    subject = `⚡ TRACK — ${n} new find${n !== 1 ? 's' : ''} · ${today}`;
    html = `<h1>TRACK Daily Digest</h1>
<p>${n} new alert${n !== 1 ? 's' : ''} · ${today}</p>
<hr>
${finds
  .map((item) => {
    const level = item.alert?.level || item.alert_level || 'WATCH';
    const lvlColor =
      level === 'APEX' ? '#D2AC34' : level === 'CRITICAL' ? '#c0392b' : level === 'PRIORITY' ? '#e67e22' : '#888';
    return `<div style="border-left:4px solid ${lvlColor};padding:12px 16px;margin:12px 0;">
    <p><strong style="color:${lvlColor};">${level}</strong> · ${item.source || ''} · ${item.price?.value ? `€${item.price.value}` : '?'}</p>
    <p><strong>${item.title}</strong></p>
    <p>${(item.alert?.reasons || []).join(' · ')}</p>
    ${item.url ? `<p><a href="${item.url}">View listing →</a></p>` : ''}
  </div>`;
  })
  .join('')}
<hr><p><small>TRACK · Picturia Intelligence Suite · Unsubscribe by removing email from watchlist settings.</small></p>`;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'TRACK <alerts@picturia.art>',
      to: [toEmail],
      subject,
      html,
    }),
  });

  const result = await res.json();
  return { ok: res.ok, resend: result };
}
