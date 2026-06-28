
/**
 * CIDOC-CRM v7.1.1 Data Model for TRACE
 * Standardized provenance data structures for cultural heritage interoperability
 * Maps artwork provenance to CIDOC-CRM entities and properties
 * Version 2.0.0
 */

window.TRACE = window.TRACE || {};
window.TRACE.CIDOC_CRM = {
  version: '7.1.1',
  
  // ── Core Entity Types ──
  entities: {
    E22_ManMadeObject: { label: 'Man-Made Object', desc: 'Artwork/object' },
    E21_Person: { label: 'Person', desc: 'Artist, owner, dealer' },
    E74_Group: { label: 'Group', desc: 'Institution, collection' },
    E52_TimeSpan: { label: 'Time-Span', desc: 'Date/time period' },
    E53_Place: { label: 'Place', desc: 'Location' },
    E7_Activity: { label: 'Activity', desc: 'Creation, acquisition, transfer' },
    E8_Acquisition: { label: 'Acquisition', desc: 'Purchase, inheritance, gift' },
    E10_TransferOfCustody: { label: 'Transfer of Custody', desc: 'Change of custody' },
    E12_Production: { label: 'Production', desc: 'Creation of artwork' },
    E15_Identifier: { label: 'Identifier', desc: 'Inventory number, accession' },
    E39_Actor: { label: 'Actor', desc: 'Person or group' },
    E42_Identifier: { label: 'Identifier', desc: 'Standard identifier' },
    E54_Dimension: { label: 'Dimension', desc: 'Measurements' },
    E82_ActorAppellation: { label: 'Actor Appellation', desc: 'Name of actor' },
    E35_Title: { label: 'Title', desc: 'Title of work' }
  },
  
  // ── Property Types ──
  properties: {
    P2_has_type: { label: 'has type', domain: 'E22', range: 'E55' },
    P4_has_time_span: { label: 'has time-span', domain: 'E52', range: 'E52' },
    P7_took_place_at: { label: 'took place at', domain: 'E7', range: 'E53' },
    P9_consists_of: { label: 'consists of', domain: 'E7', range: 'E7' },
    P14_carried_out_by: { label: 'carried out by', domain: 'E7', range: 'E39' },
    P24_transferred_title_of: { label: 'transferred title of', domain: 'E8', range: 'E22' },
    P27_moved_from: { label: 'moved from', domain: 'E10', range: 'E53' },
    P28_moved_to: { label: 'moved to', domain: 'E10', range: 'E53' },
    P30_transferred_custody_of: { label: 'transferred custody of', domain: 'E10', range: 'E22' },
    P43_has_dimension: { label: 'has dimension', domain: 'E22', range: 'E54' },
    P50_has_current_keeper: { label: 'has current keeper', domain: 'E22', range: 'E39' },
    P51_has_former_keeper: { label: 'has former keeper', domain: 'E22', range: 'E39' },
    P52_has_current_owner: { label: 'has current owner', domain: 'E22', range: 'E39' },
    P67_refers_to: { label: 'refers to', domain: 'E89', range: 'E1' },
    P102_has_title: { label: 'has title', domain: 'E22', range: 'E35' },
    P108_has_produced: { label: 'has produced', domain: 'E12', range: 'E22' },
    P138_has_representation: { label: 'has representation', domain: 'E22', range: 'E36' }
  },
  
  // ── Build CIDOC-CRM graph from provenance timeline ──
  buildFromTimeline: function(data) {
    if (!data || !data.events) return { graph: [], entities: [] };
    var graph = [];
    var entities = [];
    var idCounter = 0;
    var self = this;
    
    // Create object entity
    var objId = 'obj_' + (idCounter++);
    entities.push({
      id: objId,
      type: 'E22_ManMadeObject',
      label: data.title || 'Unidentified Artwork',
      artist: data.artist || 'Unknown',
      created: new Date().toISOString()
    });
    
    // Process each timeline event
    data.events.forEach(function(event) {
      var eventId = 'evt_' + (idCounter++);
      var actorId = 'act_' + (idCounter++);
      var placeId = 'plc_' + (idCounter++);
      var timeId = 'tsp_' + (idCounter++);
      
      // Actor
      entities.push({
        id: actorId,
        type: event.actorType === 'institution' ? 'E74_Group' : 'E21_Person',
        label: event.actor || 'Unknown',
        role: event.role || 'owner'
      });
      
      // Place
      entities.push({
        id: placeId,
        type: 'E53_Place',
        label: event.location || 'Unknown',
        geo: event.geo || null
      });
      
      // Time-span
      entities.push({
        id: timeId,
        type: 'E52_TimeSpan',
        label: event.year ? String(event.year) : 'Unknown',
        start: event.year,
        end: event.endYear || event.year
      });
      
      // Activity
      var activityType = event.type === 'acquisition' ? 'E8_Acquisition' :
                         event.type === 'creation' ? 'E12_Production' :
                         event.type === 'transfer' ? 'E10_TransferOfCustody' : 'E7_Activity';
      
      entities.push({
        id: eventId,
        type: activityType,
        label: event.description || event.type || 'Unknown event'
      });
      
      // Graph edges
      graph.push({ subject: eventId, predicate: 'P14_carried_out_by', object: actorId });
      graph.push({ subject: eventId, predicate: 'P7_took_place_at', object: placeId });
      graph.push({ subject: eventId, predicate: 'P4_has_time_span', object: timeId });
      
      if (activityType === 'E8_Acquisition') {
        graph.push({ subject: eventId, predicate: 'P24_transferred_title_of', object: objId });
      } else if (activityType === 'E10_TransferOfCustody') {
        graph.push({ subject: eventId, predicate: 'P30_transferred_custody_of', object: objId });
      } else if (activityType === 'E12_Production') {
        graph.push({ subject: eventId, predicate: 'P108_has_produced', object: objId });
      }
    });
    
    return { graph: graph, entities: entities };
  },
  
  // ── Export as CIDOC-CRM JSON (JSON-LD format) ──
  exportAsJSONLD: function(data) {
    var result = this.buildFromTimeline(data);
    var jsonld = {
      '@context': {
        'cidoc': 'http://www.cidoc-crm.org/cidoc-crm/',
        'schema': 'http://schema.org/',
        'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
      },
      '@graph': []
    };
    
    result.entities.forEach(function(entity) {
      var entry = {
        '@id': 'urn:uuid:' + entity.id,
        '@type': 'cidoc:' + entity.type,
        'rdfs:label': entity.label
      };
      if (entity.artist) entry['schema:creator'] = entity.artist;
      if (entity.start) entry['cidoc:P4_has_time_span'] = { '@type': 'cidoc:E52_TimeSpan', 'rdfs:label': String(entity.start) };
      if (entity.geo) entry['cidoc:P7_took_place_at'] = { '@type': 'cidoc:E53_Place', 'schema:latitude': entity.geo.lat, 'schema:longitude': entity.geo.lng };
      jsonld['@graph'].push(entry);
    });
    
    result.graph.forEach(function(edge) {
      jsonld['@graph'].push({
        '@type': 'rdf:Statement',
        'rdf:subject': 'urn:uuid:' + edge.subject,
        'rdf:predicate': 'cidoc:' + edge.predicate,
        'rdf:object': 'urn:uuid:' + edge.object
      });
    });
    
    return jsonld;
  },
  
  // ── Validate CIDOC-CRM compliance ──
  validate: function(graph) {
    var issues = [];
    if (!graph || !graph.entities) {
      issues.push('No entities found in graph');
      return { valid: false, issues: issues };
    }
    graph.entities.forEach(function(e) {
      if (!e.id) issues.push('Entity missing id: ' + JSON.stringify(e));
      if (!e.type) issues.push('Entity missing type: ' + e.id);
      if (!this.entities[e.type]) {
        issues.push('Unknown entity type: ' + e.type + ' on ' + e.id);
      }
    });
    return { valid: issues.length === 0, issues: issues };
  }
};

// Register with TRACE_REGISTRY
if (window.TRACE_REGISTRY) {
  window.TRACE_REGISTRY.register('cidoc-crm', {
    name: 'CIDOC-CRM v7.1.1',
    version: '2.0.0',
    dependencies: [],
    init: function() {
      console.log('[CIDOC-CRM] Data model loaded');
    }
  });
}
