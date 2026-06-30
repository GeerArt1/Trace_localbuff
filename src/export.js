// ══════════════════════════════════════════════
// TRACE — Export System
// PDF · CIDOC-CRM · Case JSON
// ══════════════════════════════════════════════

/**
 * Export analysis as a PDF (opens in new window for Print/PDF save)
 */
window.exportPDF = function exportPDF() {
  var r = window._lastResult;
  if (!r) { window.showToastError && window.showToastError('No analysis to export'); return; }

  window.showToastInfo && window.showToastInfo('Generating PDF report\u2026');

  var conf = r.provenance_confidence || 55;
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TRACE Report \u2014 ' + (r.title || 'Analysis') + '</title>';
  html += '<style>@page{margin:1in;size:A4;}body{font-family:"Cormorant Garamond",Georgia,serif;color:#1a1a1a;line-height:1.7;font-size:11pt;}' +
    '.header{border-bottom:2px solid #D4AE52;padding-bottom:16px;margin-bottom:24px;}' +
    '.logo{font-size:28px;color:#D4AE52;letter-spacing:0.15em;font-weight:300;}' +
    '.title{font-size:22px;margin:16px 0 4px;font-weight:400;}' +
    '.attr{color:#8A6F2E;font-style:italic;font-size:12pt;margin-bottom:12px;}' +
    '.section{margin:16px 0;}' +
    '.section-title{font-size:9pt;text-transform:uppercase;letter-spacing:0.15em;color:#8A6F2E;border-bottom:1px solid #e0d8c0;padding-bottom:6px;margin-bottom:8px;}' +
    '.conf{display:flex;justify-content:space-between;align-items:center;margin:12px 0;}' +
    '.conf-bar{flex:1;height:4px;background:#f0e8d0;margin:0 12px;border-radius:2px;}' +
    '.conf-fill{height:100%;background:#D4AE52;border-radius:2px;}' +
    '.conf-val{font-size:14pt;font-weight:700;color:#D4AE52;}' +
    '.timeline-table{width:100%;border-collapse:collapse;margin-top:8px;}' +
    '.timeline-table td{padding:6px 8px;border-bottom:1px solid #f0e8d0;font-size:10pt;vertical-align:top;}' +
    '.timeline-table td:first-child{font-family:"Courier Prime","Courier New",monospace;color:#8A6F2E;width:70px;white-space:nowrap;}' +
    '.timeline-table .cat{font-size:8pt;text-transform:uppercase;letter-spacing:0.1em;color:#8A6F2E;}' +
    '.gap-row{background:#FFF8E8;}' +
    '.footer{margin-top:32px;padding-top:16px;border-top:1px solid #e0d8c0;font-size:9pt;color:#8A6F2E;text-align:center;}' +
    '.keywords{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;}' +
    '.keyword{font-size:8pt;padding:2px 8px;border:1px solid #e0d8c0;border-radius:2px;color:#666;}' +
    '</style></head><body>';

  html += '<div class="header"><div class="logo">\u25C8 TRACE</div><div style="font-size:9pt;color:#8A6F2E;letter-spacing:0.1em;">ART INTELLIGENCE \u2014 INVESTIGATION REPORT</div></div>' +
    '<div class="title">' + window.esc(r.title || 'Unknown Subject') + '</div>' +
    '<div class="attr">' + window.esc(r.artist || '') + (r.period ? ', ' + window.esc(r.period) : '') + (r.medium ? ' \u00b7 ' + window.esc(r.medium) : '') + '</div>' +
    '<div class="conf"><span style="font-size:10pt;color:#666;">Provenance Confidence</span><div class="conf-bar"><div class="conf-fill" style="width:' + conf + '%"></div></div><span class="conf-val">' + conf + '%</span></div>';

  var sections = r.style_analysis ? [['Stylistic Analysis', r.style_analysis]] : [];
  if (r.historical_context) sections.push(['Historical Context', r.historical_context]);
  if (r.investigation_notes) sections.push(['Investigation Notes', r.investigation_notes]);
  if (r.professional_assessment) sections.push(['Professional Assessment', r.professional_assessment]);
  if (r.provenance_chain) sections.push(['Provenance Chain', r.provenance_chain]);
  if (r.risk_assessment) sections.push(['Risk Assessment', r.risk_assessment]);
  if (r.recommended_actions) sections.push(['Recommended Actions', r.recommended_actions]);
  if (r.the_story) sections.push(['The Story', r.the_story]);
  if (r.fascinating_fact) sections.push(['Fascinating Fact', r.fascinating_fact]);

  sections.forEach(function(s) {
    html += '<div class="section"><div class="section-title">' + s[0] + '</div><div>' + window.esc(s[1]) + '</div></div>';
  });

  if (r.timeline && r.timeline.length) {
    if (window.GAP_SEVERITY) window.GAP_SEVERITY.calculate(r.timeline);
    html += '<div class="section"><div class="section-title">Provenance Timeline</div><table class="timeline-table">';
    r.timeline.forEach(function(ev) {
      var gapClass = ev._severity ? ' class="gap-row"' : '';
      html += '<tr' + gapClass + '><td>' + window.esc(ev.year) + '</td><td><strong>' + window.esc(ev.event) + '</strong>';
      if (ev._severity && window.GAP_SEVERITY) html += window.GAP_SEVERITY.badgeHTML(ev._severity);
      html += '<br><span style="color:#666;">' + window.esc(ev.detail || '') + '</span>' +
        '<br><span class="cat">' + window.esc(ev.category || '') + '</span></td></tr>';
    });
    html += '</table></div>';
  }

  if (r.keywords && r.keywords.length) {
    html += '<div class="section"><div class="section-title">Keywords</div><div class="keywords">';
    r.keywords.forEach(function(k) { html += '<span class="keyword">' + window.esc(k) + '</span>'; });
    html += '</div></div>';
  }

  html += '<div class="footer">Generated by TRACE Art Intelligence \u00b7 ' + new Date().toLocaleDateString() + ' \u00b7 Confidential Investigation Report</div></body></html>';

  var win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
  window.showToastSuccess && window.showToastSuccess('PDF report generated');
    win.document.close();
    setTimeout(function() { win.print(); }, 500);
  } else {
    var blob = new Blob([html], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'TRACE_Report_' + (r.title || 'analysis').replace(/[^a-zA-Z0-9]/g, '_') + '.html';
    a.click();
    URL.revokeObjectURL(url);
    window.toast('Report downloaded \u2014 open in browser to print as PDF');
  }
};

/**
 * Export analysis as CIDOC-CRM JSON (museum-standard format)
 */
window.exportCIDOC = function exportCIDOC() {
  var r = window._lastResult;
  if (!r) { window.showToastError && window.showToastError('No analysis to export'); return; }

  var cidoc = {
    '@context': 'https://www.cidoc-crm.org/contexts/cidoc-crm-v7.1.1.jsonld',
    '@type': 'E22_Human-Made_Object',
    'P102_has_title': { '@type': 'E35_Title', 'P3_has_note': r.title || 'Untitled' },
    'P108i_was_produced_by': {
      '@type': 'E12_Production',
      'P14_carried_out_by': { '@type': 'E39_Actor', 'P3_has_note': r.artist || 'Unknown' },
      'P4_has_time-span': { '@type': 'E52_Time-Span', 'P3_has_note': r.period || 'Unknown' },
      'P126_employed': r.medium ? { '@type': 'E55_Type', 'P3_has_note': r.medium } : undefined
    },
    'P130_shows_features_of': r.movement ? { '@type': 'E55_Type', 'P3_has_note': r.movement } : undefined,
    'P45_consists_of': r.keywords ? r.keywords.map(function(k) {
      return { '@type': 'E57_Material', 'P3_has_note': k };
    }) : [],
    '_trace_metadata': {
      confidence: r.provenance_confidence || null,
      subject_type: r.subject_type || 'artwork',
      value_estimate: r.value_estimate || 'N/A',
      generated_by: 'TRACE Art Intelligence',
      generated_at: new Date().toISOString()
    }
  };

  if (r.timeline && r.timeline.length) {
    if (window.GAP_SEVERITY) window.GAP_SEVERITY.calculate(r.timeline);
    cidoc._provenance_chain = r.timeline.map(function(ev) {
      return {
        '@type': ev.category === 'creation' ? 'E12_Production' : 'E13_Attribute_Assignment',
        'P4_has_time-span': { '@type': 'E52_Time-Span', 'P3_has_note': ev.year },
        'P2_has_type': { '@type': 'E55_Type', 'P3_has_note': ev.category || 'unknown' },
        'P3_has_note': ev.detail || ev.event,
        '_gap_severity': ev._severity || null
      };
    });
  }

  var json = JSON.stringify(cidoc, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'CIDOC_CRM_' + (r.title || 'analysis').replace(/[^a-zA-Z0-9]/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  window.toast('CIDOC-CRM record exported');
};

/**
 * Export analysis as a case JSON file
 */
window.exportCaseJSON = function exportCaseJSON() {
  var r = window._lastResult;
  if (!r) { window.showToastError && window.showToastError('No analysis to export'); return; }

  var data = JSON.stringify(r, null, 2);
  var blob = new Blob([data], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'TRACE_Case_' + (r.title || 'analysis').replace(/[^a-zA-Z0-9]/g, '_') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  window.toast('Case file exported');
};

// ── Register with registry ──
if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
  TRACE_REGISTRY.register('export', {
    version: '1.0.0',
    dependsOn: ['utils', 'vision']
  });
}

console.log('[TRACE Export] Loaded');


// ── Museum-Grade Documentation Export ──
// Generates comprehensive CIDOC-CRM compliant museum documentation package
window.exportMuseumDoc = function(data) {
  if (!data) data = window._lastResult;
  if (!data) { alert('No analysis data available'); return; }
  
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
  html += '<title>Museum Documentation - ' + (data.title || 'Artwork') + '</title>';
  html += '<style>@page{margin:1in;size:A4;}body{';
  html += 'font-family: Georgia, serif; color: #1a1a1a; line-height: 1.7; font-size: 11pt; max-width: 7in; margin: auto; padding: 1in;}';
  html += 'h1{font-size:18pt;color:#8A6F2E;border-bottom:2px solid #D4AE52;padding-bottom:6pt;}';
  html += 'h2{font-size:14pt;color:#8A6F2E;margin-top:24pt;}';
  html += 'table{width:100%;border-collapse:collapse;margin:12pt 0;}';
  html += 'td,th{border:1px solid #ccc;padding:6pt 10pt;text-align:left;font-size:10pt;}';
  html += 'th{background:#f5f0e8;color:#555;}';
  html += '.section{margin:16pt 0;padding:0;}';
  html += '.badge{display:inline-block;background:#D4AE52;color:#fff;padding:2pt 8pt;border-radius:3pt;font-size:9pt;}';
  html += '.critical{border-left:4px solid #c0392b;padding-left:12pt;}';
  html += '.footer{margin-top:36pt;padding-top:12pt;border-top:1px solid #ccc;font-size:9pt;color:#999;}';
  html += '@media print{body{padding:0;max-width:none;}}</style></head><body>';
  
  // Header
  html += '<h1>Museum Documentation Report</h1>';
  html += '<p style="font-size:10pt;color:#666;">Generated: ' + new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) + '</p>';
  
  // 1. Object Identification
  html += '<h2>1. Object Identification</h2>';
  html += '<table><tr><th>Field</th><th>Value</th></tr>';
  html += '<tr><td>Title</td><td>' + (data.title || 'Unknown') + '</td></tr>';
  html += '<tr><td>Artist</td><td>' + (data.artist || 'Unknown') + '</td></tr>';
  html += '<tr><td>Date/Period</td><td>' + (data.period_estimate || data.period || 'Unknown') + '</td></tr>';
  html += '<tr><td>Media</td><td>' + (data.media_type || 'Unknown') + '</td></tr>';
  html += '<tr><td>Dimensions</td><td>' + (data.dimensions || 'Not recorded') + '</td></tr>';
  html += '<tr><td>Current Location</td><td>' + (data.current_location || 'Unknown') + '</td></tr>';
  html += '</table>';
  
  // 2. Provenance
  html += '<h2>2. Provenance Chain</h2>';
  if (data.provenance_timeline && data.provenance_timeline.length) {
    html += '<table><tr><th>Year</th><th>Event</th><th>Actor</th><th>Location</th></tr>';
    data.provenance_timeline.forEach(function(e) {
      html += '<tr><td>' + (e.year || '') + '</td><td>' + (e.type || '') + '</td><td>' + (e.actor || '') + '</td><td>' + (e.location || '') + '</td></tr>';
    });
    html += '</table>';
  } else {
    html += '<p class="critical">No provenance chain recorded. Further research required.</p>';
  }
  
  // 3. Risk Assessment
  html += '<h2>3. Risk Assessment</h2>';
  html += '<table><tr><th>Factor</th><th>Assessment</th></tr>';
  html += '<tr><td>Alert Level</td><td>' + (data.alert && data.alert.level ? '<span class="badge">' + data.alert.level + '</span>' : 'Normal') + '</td></tr>';
  html += '<tr><td>Attribution</td><td>' + (data.attribution_suggestion || 'Not assessed') + '</td></tr>';
  html += '<tr><td>Market Value</td><td>' + (data.market_value ? '€' + (data.market_value?.atelier_low || 0).toLocaleString() + ' - €' + (data.market_value?.atelier_high || 0).toLocaleString() : 'Not estimated') + '</td></tr>';
  html += '</table>';
  
  // 4. AI Analysis
  if (data.analysis_text) {
    html += '<h2>4. Forensic Analysis</h2>';
    html += '<div class="section"><p>' + data.analysis_text + '</p></div>';
  }
  
  // 5. Recommendations
  html += '<h2>5. Recommendations</h2>';
  html += '<ul>';
  var recs = data.next_steps || [];
  if (recs.length) {
    recs.forEach(function(r) { html += '<li>' + r + '</li>'; });
  } else {
    html += '<li>Complete provenance research with RKD database cross-reference</li>';
    html += '<li>Consult INTERPOL Stolen Works Database</li>';
    html += '<li>Schedule physical examination by conservation specialist</li>';
  }
  html += '</ul>';
  
  // Footer
  html += '<div class="footer">';
  html += '<p>This report was generated by TRACE Art Intelligence System using AI-assisted analysis.</p>';
  html += '<p>All conclusions are preliminary and require expert verification.</p>';
  html += '<p>TRACE v2.0 — ' + new Date().toISOString() + '</p>';
  html += '</div>';
  
  html += '</body></html>';
  
  // Open in new window for printing
  var w = window.open('', '_blank');
  if (w) {
    w.document.write(html);
    w.document.close();
    w.focus();
  } else {
    alert('Please allow pop-ups to generate the documentation report.');
  }
};
