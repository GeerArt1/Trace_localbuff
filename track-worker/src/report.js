/**
 * TRACK Worker v2.2 — HTML Report Generator
 *
 * Generates professional PDF-ready HTML reports for saved finds.
 * Includes listing details, visual screening, style analysis,
 * provenance scan, oeuvre match, and expert contact information.
 */

import { jsonResponse } from './utils.js';

/**
 * POST /report — Generate an HTML report for a saved find.
 * @param {Request} request
 * @param {Object} env - Environment bindings (TRACK_SAVED_FINDS KV)
 * @returns {Promise<Response>} HTML response with Content-Disposition attachment
 */
export async function handleReport(request, env) {
  if (!env.TRACK_SAVED_FINDS) return jsonResponse({ error: 'TRACK_SAVED_FINDS KV not configured' }, 503);

  const body = await request.json();
  const { id } = body;
  if (!id) return jsonResponse({ error: 'id required' }, 400);

  const find = await env.TRACK_SAVED_FINDS.get(`find:${id}`, { type: 'json' });
  if (!find) return jsonResponse({ error: 'Find not found' }, 404);

  const date = new Date(find.date_saved).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const an = find.style_analysis;
  const ps = find.provenance_scan;
  const vs = find.visual_screen;
  const om = find.oeuvre_match;

  const levelColor = { APEX: '#D2AC34', CRITICAL: '#c0392b', PRIORITY: '#e67e22', WATCH: '#e67e22', CLEAR: '#27ae60' };
  const lc = levelColor[find.alert_level] || '#888';

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>TRACK Rapport — ${(find.title || 'Onbekend werk').slice(0, 60)}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Montserrat:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Cormorant Garamond',serif;color:#1a1a2e;background:#fff;padding:40px;max-width:820px;margin:0 auto;}
  h1{font-family:'Montserrat',sans-serif;font-size:1.1rem;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:#1a1a2e;margin-bottom:4px;}
  h2{font-family:'Montserrat',sans-serif;font-size:.65rem;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:#888;border-bottom:1px solid #ddd;padding-bottom:6px;margin:28px 0 12px;}
  p{font-size:1.05rem;line-height:1.8;color:#333;margin-bottom:10px;}
  .header{border-bottom:3px solid #D2AC34;padding-bottom:20px;margin-bottom:28px;}
  .header-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
  .logo{font-family:'Montserrat',sans-serif;font-size:2rem;font-weight:600;letter-spacing:.3em;color:#1a1a2e;}
  .logo span{color:#D2AC34;}
  .meta{font-family:'Montserrat',sans-serif;font-size:.6rem;letter-spacing:.18em;color:#888;text-transform:uppercase;line-height:2;}
  .alert-badge{display:inline-block;padding:6px 18px;background:${lc}22;border:2px solid ${lc};color:${lc};font-family:'Montserrat',sans-serif;font-size:.75rem;font-weight:700;letter-spacing:.22em;text-transform:uppercase;margin-top:12px;}
  .image-block{margin:20px 0;text-align:center;}
  .image-block img{max-width:100%;max-height:400px;border:1px solid #ddd;}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
  .field{margin-bottom:14px;}
  .field-label{font-family:'Montserrat',sans-serif;font-size:.56rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:#888;display:block;margin-bottom:4px;}
  .field-value{font-size:1.05rem;color:#1a1a2e;line-height:1.6;}
  .risk-block{border:2px solid #e67e22;padding:16px;margin:16px 0;background:#fff8f0;}
  .risk-block.high{border-color:#c0392b;background:#fff5f5;}
  .risk-block.low{border-color:#27ae60;background:#f5fff8;}
  .pill{display:inline-block;padding:3px 10px;border:1px solid #ddd;font-family:'Montserrat',sans-serif;font-size:.55rem;letter-spacing:.1em;text-transform:uppercase;margin:2px;}
  .contact{border-top:1px solid #eee;padding-top:12px;margin-top:12px;}
  .contact a{color:#1a3a6e;text-decoration:none;font-family:'Montserrat',sans-serif;font-size:.65rem;letter-spacing:.08em;}
  .footer{border-top:2px solid #D2AC34;padding-top:16px;margin-top:40px;text-align:center;font-family:'Montserrat',sans-serif;font-size:.52rem;letter-spacing:.14em;text-transform:uppercase;color:#aaa;}
  @media print{body{padding:20px;}h2{break-after:avoid;}div{break-inside:avoid;}}
</style>
</head>
<body>
<div class="header">
  <div class="header-top">
    <div>
      <div class="logo">TR<span>A</span>CK</div>
      <div class="meta">Picturia Intelligence Suite · Rapport<br>${date}</div>
    </div>
    <div style="text-align:right">
      <div class="meta">Gegenereerd door TRACK v2.2<br>track-ebay-proxy.geerart.workers.dev</div>
    </div>
  </div>
  <div class="alert-badge">${find.alert_level || 'ONBEKEND'}</div>
</div>

${find.image ? `<div class="image-block"><img src="${find.image}" alt="Werk afbeelding"/></div>` : ''}

<h2>1. Listing Details</h2>
<div class="grid">
  <div>
    <div class="field"><span class="field-label">Titel</span><div class="field-value">${find.title || '—'}</div></div>
    <div class="field"><span class="field-label">Kunstenaar</span><div class="field-value">${find.artist || '—'}</div></div>
    <div class="field"><span class="field-label">Prijs</span><div class="field-value">${find.price || '—'}</div></div>
  </div>
  <div>
    <div class="field"><span class="field-label">Bron</span><div class="field-value">${find.source || '—'}</div></div>
    <div class="field"><span class="field-label">Media type</span><div class="field-value">${find.media_type || '—'}</div></div>
    <div class="field"><span class="field-label">Opgeslagen op</span><div class="field-value">${date}</div></div>
  </div>
</div>
${find.url ? `<div class="field"><span class="field-label">Bron URL</span><div class="field-value"><a href="${find.url}" style="color:#1a3a6e;">${find.url}</a></div></div>` : ''}
${find.notes ? `<div class="field"><span class="field-label">Notities</span><div class="field-value">${find.notes}</div></div>` : ''}

${
  vs
    ? `<h2>2. Visuele Screening</h2>
<p>${vs.is_artwork ? '✓ Bevestigd kunstwerk' : '✗ Geen kunstwerk gedetecteerd'} · Vertrouwen: ${vs.confidence} · Type: ${vs.media_type || '—'}</p>
<p><em>${vs.reason || ''}</em></p>`
    : ''
}

${
  an
    ? `<h2>3. Stijlanalyse — ${find.artist || ''}</h2>
<p>${an.analysis_text || ''}</p>
<div class="grid">
  <div>
    <div class="field"><span class="field-label">Periode schatting</span><div class="field-value">${an.period_estimate || '—'} · Vertrouwen: ${an.confidence || '—'}</div></div>
    <div class="field"><span class="field-label">Attributie suggestie</span><div class="field-value">${an.attribution_suggestion || '—'}</div></div>
  </div>
  <div>
    ${
      an.market_value
        ? `<div class="field"><span class="field-label">Marktwaarde schatting</span><div class="field-value">
      Atelier: €${(an.market_value.atelier_low || 0).toLocaleString('nl-NL')} – €${(an.market_value.atelier_high || 0).toLocaleString('nl-NL')}<br>
      Autograaf: €${(an.market_value.autograph_estimate || 0).toLocaleString('nl-NL')}+
    </div></div>`
        : ''
    }
  </div>
</div>
${(an.style_matches || []).length ? `<div class="field"><span class="field-label">Stijl overeenkomsten</span><div>${(an.style_matches || []).map((m) => `<span class="pill" style="border-color:#27ae60;color:#27ae60;">${m}</span>`).join(' ')}</div></div>` : ''}
${(an.style_deviations || []).length ? `<div class="field"><span class="field-label">Afwijkingen</span><div>${(an.style_deviations || []).map((m) => `<span class="pill" style="border-color:#e67e22;color:#e67e22;">${m}</span>`).join(' ')}</div></div>` : ''}
${(an.next_steps || []).length ? `<div class="field"><span class="field-label">Aanbevolen stappen</span><ol style="padding-left:18px;margin-top:6px;">${(an.next_steps || []).map((s) => `<li style="font-size:1rem;line-height:1.8;">${s}</li>`).join('')}</ol></div>` : ''}`
    : ''
}

${
  om
    ? `<h2>4. Oeuvre Match</h2>
<div class="risk-block${om.apex ? ' high' : ''}">
  <p><strong>${om.apex ? '⚡ APEX — Mogelijke match met vermist werk' : 'Mogelijke oeuvre match'}</strong></p>
  <p>Match score: ${om.score}/100 · Werk: <strong>${om.work?.title || '—'}</strong></p>
  <p>Laatste locatie: ${om.work?.last_seen?.location || '—'} (${om.work?.last_seen?.date || '—'})</p>
</div>`
    : ''
}

${
  ps
    ? `<h2>5. Provenance Risico Scan</h2>
<div class="risk-block${ps.risk_level === 'HIGH' ? ' high' : ps.risk_level === 'LOW' ? ' low' : ''}">
  <p><strong>Risico niveau: ${ps.risk_level || '—'}</strong> · Score: ${ps.risk_score || 0}/100</p>
</div>
${(ps.signals || []).length ? `<div class="field"><span class="field-label">Gedetecteerde signalen</span><div>${(ps.signals || []).map((s) => `<span class="pill">${s}</span>`).join(' ')}</div></div>` : ''}
${(ps.danger_period_overlaps || []).length ? `<div class="field"><span class="field-label">⚠ Gevaarlijke perioden</span><div>${(ps.danger_period_overlaps || []).map((s) => `<span class="pill" style="border-color:#c0392b;color:#c0392b;">${s}</span>`).join(' ')}</div></div>` : ''}
${(ps.timeline || []).length ? `<div class="field"><span class="field-label">Provenance tijdlijn</span><div style="margin-top:6px;">${(ps.timeline || []).map((t) => `<div style="padding:4px 0;border-bottom:1px solid #eee;font-size:.95rem;"><strong>${t.date}</strong> — ${t.event}</div>`).join('')}</div></div>` : ''}
${(ps.seller_questions || []).length ? `<div class="field"><span class="field-label">Vragen voor verkoper</span><ol style="padding-left:18px;margin-top:6px;">${(ps.seller_questions || []).map((q) => `<li style="font-size:1rem;line-height:1.8;">${q}</li>`).join('')}</ol></div>` : ''}
${(ps.gaps || []).length ? `<div class="field"><span class="field-label">Gedocumenteerde lacunes</span><div>${(ps.gaps || []).map((g) => `<span class="pill" style="border-color:#e67e22;color:#e67e22;">${g}</span>`).join(' ')}</div></div>` : ''}
<div class="contact">
  <span class="field-label">Controledatabases</span><br>
  <a href="https://www.artloss.com" target="_blank">Art Loss Register (artloss.com)</a> ·
  <a href="https://errproject.org" target="_blank">ERR Database (errproject.org)</a> ·
  <a href="https://www.lostart.de" target="_blank">Lostart.de</a> ·
  <a href="https://www.interpol.int/en/Crimes/Works-of-Art" target="_blank">Interpol Stolen Works</a>
</div>`
    : ''
}

<h2>6. Expert Contacten</h2>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
  <div class="contact">
    <strong style="font-family:'Montserrat',sans-serif;font-size:.7rem;letter-spacing:.1em;">Rubenianum Antwerp</strong><br>
    <a href="https://rubenianum.be" target="_blank">rubenianum.be</a>
  </div>
  <div class="contact">
    <strong style="font-family:'Montserrat',sans-serif;font-size:.7rem;letter-spacing:.1em;">RKD Den Haag</strong><br>
    <a href="https://rkd.nl" target="_blank">rkd.nl</a>
  </div>
  <div class="contact">
    <strong style="font-family:'Montserrat',sans-serif;font-size:.7rem;letter-spacing:.1em;">KMSKA Antwerp</strong><br>
    <a href="https://kmska.be" target="_blank">kmska.be</a>
  </div>
  <div class="contact">
    <strong style="font-family:'Montserrat',sans-serif;font-size:.7rem;letter-spacing:.1em;">Art Loss Register</strong><br>
    <a href="https://artloss.com" target="_blank">artloss.com</a>
  </div>
</div>

<div class="footer">
  TRACK · Picturia Intelligence Suite · ${date}<br>
  Dit rapport is gegenereerd door een AI-systeem. Verificatie door een erkend expert is altijd vereist.
</div>
</body>
</html>`;

  // Update status to report_ready
  if (env.TRACK_SAVED_FINDS) {
    const updated = { ...find, status: 'report_ready' };
    await env.TRACK_SAVED_FINDS.put(`find:${id}`, JSON.stringify(updated));
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="TRACK-${id}.html"`,
    },
  });
}
