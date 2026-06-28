
/**
 * TRACE — Expert Consultation System
 * Matches artworks with specialist experts, facilitates consultation requests,
 *   manages expert profiles and availability
 * Version 1.0.0
 */

window.TRACE = window.TRACE || {};
window.TRACE.Expert = {
  version: '1.0.0',
  
  // ── Expert specialties ──
  specialties: [
    { id: 'old_master', label: 'Old Master Paintings', icon: '\ud83d\uddbc\ufe0f' },
    { id: 'provenance', label: 'Provenance Research', icon: '\ud83d\udd0d' },
    { id: 'conservation', label: 'Conservation & Restoration', icon: '\ud83d\udd27' },
    { id: 'forensic', label: 'Forensic Analysis', icon: '\ud83d\udd2c' },
    { id: 'valuation', label: 'Valuation & Appraisal', icon: '\ud83d\udcb0' },
    { id: 'legal', label: 'Art Law & Due Diligence', icon: '\u2696\ufe0f' },
    { id: 'scientific', label: 'Scientific Analysis', icon: '\ud83d\udd2d' },
    { id: 'digital', label: 'Digital Authentication', icon: '\ud83d\udda5\ufe0f' }
  ],
  
  // ── Expert profiles (curated network) ──
  experts: [
    {
      id: 'exp_001', name: 'Dr. Maria Hendriks', title: 'Senior Art Historian',
      institution: 'RKD Netherlands Institute', specialties: ['old_master', 'provenance'],
      regions: ['Netherlands', 'Belgium', 'Germany'], languages: ['nl', 'en', 'de'],
      availability: 'consultation', rate: '€200-400/hr'
    },
    {
      id: 'exp_002', name: 'Prof. Jan Van der Weyden', title: 'Professor of Art History',
      institution: 'KU Leuven', specialties: ['old_master', 'provenance', 'forensic'],
      regions: ['Belgium', 'France'], languages: ['nl', 'fr', 'en', 'la'],
      availability: 'limited', rate: '€300-500/hr'
    },
    {
      id: 'exp_003', name: 'Dr. Sarah Thornton', title: 'Conservation Scientist',
      institution: 'Getty Conservation Institute', specialties: ['conservation', 'scientific', 'forensic'],
      regions: ['USA', 'Europe'], languages: ['en', 'fr', 'it'],
      availability: 'available', rate: '€250-450/hr'
    },
    {
      id: 'exp_004', name: 'Hans Meier M.A.', title: 'Provenance Researcher',
      institution: 'Freelance Specialist', specialties: ['provenance', 'legal'],
      regions: ['Germany', 'Austria', 'Switzerland'], languages: ['de', 'en', 'fr'],
      availability: 'available', rate: '€150-300/hr'
    },
    {
      id: 'exp_005', name: 'Dr. Elena Vasquez', title: 'Technical Art Historian',
      institution: 'Prado Museum', specialties: ['old_master', 'scientific', 'digital'],
      regions: ['Spain', 'Italy', 'Latin America'], languages: ['es', 'it', 'en', 'pt'],
      availability: 'consultation', rate: '€200-350/hr'
    },
    {
      id: 'exp_006', name: 'Prof. James Whitfield', title: 'Valuation Specialist',
      institution: 'Christie\'s (Former)', specialties: ['valuation', 'old_master', 'legal'],
      regions: ['UK', 'USA', 'Switzerland'], languages: ['en'],
      availability: 'limited', rate: '€400-800/hr'
    },
    {
      id: 'exp_007', name: 'Dr. Anna Kowalski', title: 'Dendrochronologist',
      institution: 'Warsaw University', specialties: ['scientific', 'forensic'],
      regions: ['Eastern Europe', 'Baltic'], languages: ['pl', 'en', 'de', 'ru'],
      availability: 'available', rate: '€180-320/hr'
    }
  ],
  
  // ── Match experts to artwork ──
  findMatches: function(artworkData) {
    if (!artworkData) return [];
    var artist = (artworkData.artist || '').toLowerCase();
    var media = (artworkData.media_type || '').toLowerCase();
    var needs = [];
    
    // Determine needed specialties based on artwork
    if (artist.includes('rubens') || artist.includes('van dyck') || artist.includes('jordaens')) {
      needs.push('old_master', 'forensic');
    }
    if (media.includes('panel') || media.includes('canvas')) {
      needs.push('conservation', 'scientific');
    }
    needs.push('provenance'); // Always need provenance research
    
    var matches = [];
    var self = this;
    this.experts.forEach(function(expert) {
      var matchCount = 0;
      needs.forEach(function(need) {
        if (expert.specialties.indexOf(need) >= 0) matchCount++;
      });
      if (matchCount > 0) {
        matches.push({
          expert: expert,
          match_score: matchCount / needs.length,
          matched_specialties: needs.filter(function(n) { return expert.specialties.indexOf(n) >= 0; })
        });
      }
    });
    
    matches.sort(function(a, b) { return b.match_score - a.match_score; });
    return matches;
  },
  
  // ── Generate consultation request ──
  createRequest: function(expertId, artworkData, message) {
    return {
      id: 'req_' + Date.now().toString(36),
      expert_id: expertId,
      artwork: artworkData ? artworkData.title || 'Unidentified' : 'Unidentified',
      message: message || 'Requesting expert consultation on artwork provenance and authentication.',
      status: 'pending',
      created: new Date().toISOString(),
      priority: 'normal'
    };
  },
  
  // ── Render expert matches as HTML ──
  renderMatches: function(matches) {
    if (!matches || !matches.length) {
      return '<div class="text-dim-sm" style="text-align:center;padding:20px;">No matching experts found for this artwork.</div>';
    }
    var html = '';
    matches.forEach(function(m) {
      var e = m.expert;
      var availColor = e.availability === 'available' ? 'var(--green)' : e.availability === 'consultation' ? 'var(--gold)' : 'var(--text-dim)';
      html += '<div style="background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:12px;margin-bottom:8px;">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">';
      html += '<div style="width:32px;height:32px;border-radius:50%;background:var(--gold);color:#060402;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0;">' + e.name.charAt(0) + '</div>';
      html += '<div style="flex:1;"><div style="font-size:11px;font-weight:600;color:var(--text);">' + e.name + '</div><div style="font-size:9px;color:var(--text-dim);">' + e.title + ' • ' + e.institution + '</div></div>';
      html += '<div style="font-size:9px;color:' + availColor + ';">' + e.availability + '</div>';
      html += '</div>';
      html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">';
      m.matched_specialties.forEach(function(s) {
        var found = null;
        if (window.TRACE && window.TRACE.Expert && window.TRACE.Expert.specialties) {
          window.TRACE.Expert.specialties.forEach(function(sp) { if (sp.id === s) found = sp; });
        }
        html += '<span style="background:rgba(232,193,74,0.1);border:1px solid rgba(232,193,74,0.2);border-radius:2px;padding:2px 6px;font-size:8px;color:var(--gold);">' + (found ? found.label : s) + '</span>';
      });
      html += '</div>';
      html += '<div style="font-size:9px;color:var(--text-dim);">' + e.languages.map(function(l) { return {'nl':'NL','en':'EN','fr':'FR','de':'DE','it':'IT','es':'ES','pt':'PT','pl':'PL','la':'LA','ru':'RU'}[l] || l; }).join(' ') + ' • ' + e.rate + '</div>';
      html += '</div>';
    });
    return html;
  }
};

// Register
if (window.TRACE_REGISTRY) {
  window.TRACE_REGISTRY.register('expert', {
    name: 'Expert Consultation System',
    version: '1.0.0',
    dependencies: [],
    init: function() {}
  });
}
