// ══════════════════════════════════════════════
// TRACE — Knowledge Graph v2.0
// D3.js force-directed graph for provenance visualization
// Interactive: drag · zoom · pan · hover tooltips
// ══════════════════════════════════════════════

(function() {
  'use strict';

  var KNOWLEDGE = {
    graphData: null,
    simulation: null,
    svg: null,
    width: 0,
    height: 0,
    zoom: null,
    tooltip: null,

    /**
     * Load knowledge graph from timeline data
     */
    load: function(title, artist, events) {
      var container = document.getElementById('kg-container');
      if (!container) return;

      container.innerHTML = '<div class="kg-loading">Building knowledge graph…</div>';

      var data = this._buildFromTimeline(title, artist, events);

      if (!data || !data.nodes || data.nodes.length < 2) {
        container.innerHTML = '<div class="kg-empty">Add timeline events to visualize the ownership chain.<div class="kg-empty-sub">Scan an artwork and run analysis to generate provenance data.</div></div>';
        return;
      }

      this.graphData = data;
      this._renderD3(container, data);
    },

    /**
     * Build graph nodes and edges from timeline data
     */
    _buildFromTimeline: function(title, artist, events) {
      var nodes = [];
      var edges = [];
      var nodeMap = {};
      var nodeCounter = 0;

      function getNodeId(label) {
        return 'n' + (nodeCounter++);
      }

      function addNode(id, label, type, year, meta) {
        if (nodeMap[id]) return;
        nodeMap[id] = true;
        nodes.push({
          id: id,
          label: label,
          type: type || 'event',
          year: year || '',
          meta: meta || ''
        });
      }

      function addEdge(source, target, label, year) {
        edges.push({
          source: source,
          target: target,
          label: label || '',
          year: year || ''
        });
      }

      if (!title) title = 'Artwork';

      // Root: the artwork
      var artworkId = 'artwork';
      addNode(artworkId, title.length > 25 ? title.slice(0, 22) + '\u2026' : title, 'artwork', '');

      if (artist) {
        var artistId = 'artist';
        addNode(artistId, artist.length > 20 ? artist.slice(0, 18) + '\u2026' : artist, 'artist', '');
        addEdge(artworkId, artistId, 'created by', '');
      }

      var prevNodeId = artworkId;
      var prevYear = null;

      if (events && Array.isArray(events)) {
        events.forEach(function(ev, idx) {
          var year = ev.year || '';
          var eventType = (ev.category || 'life').toLowerCase();
          var eventLabel = ev.event || '';
          var detail = ev.detail || '';
          var nodeId = 'ev' + idx;

          var nodeType = eventType;
          var displayLabel = eventLabel;
          if (displayLabel.length > 22) displayLabel = displayLabel.slice(0, 20) + '\u2026';

          switch (eventType) {
            case 'creation':
              addNode(nodeId, year + ' ' + displayLabel, 'creation', year);
              addEdge(artworkId, nodeId, 'creation', year);
              prevNodeId = nodeId;
              break;

            case 'ownership':
              var ownerName = detail ? detail.split(',')[0].trim() : eventLabel;
              if (!ownerName || ownerName.length < 2) ownerName = 'Owner ' + year;
              var ownerId = 'o' + idx;
              addNode(ownerId, ownerName.length > 20 ? ownerName.slice(0, 18) + '\u2026' : ownerName, 'owner', year, detail);
              addEdge(prevNodeId !== artworkId ? prevNodeId : artworkId, ownerId, 'owned by', year);
              prevNodeId = ownerId;
              break;

            case 'exhibition':
              var locName = detail || eventLabel;
              var locId = 'ex' + idx;
              addNode(locId, (locName.length > 18 ? locName.slice(0, 16) + '\u2026' : locName) + ' (' + year + ')', 'exhibition', year);
              addEdge(prevNodeId !== artworkId ? prevNodeId : artworkId, locId, 'exhibited', year);
              break;

            case 'auction':
              var auctionName = detail || eventLabel;
              var auctionId = 'au' + idx;
              addNode(auctionId, (auctionName.length > 18 ? auctionName.slice(0, 16) + '\u2026' : auctionName) + ' (' + year + ')', 'auction', year);
              addEdge(prevNodeId !== artworkId ? prevNodeId : artworkId, auctionId, 'sold at', year);
              var buyerId = 'b' + idx;
              addNode(buyerId, 'Buyer ' + year, 'owner', year);
              addEdge(auctionId, buyerId, 'acquired', year);
              prevNodeId = buyerId;
              break;

            default:
              addNode(nodeId, year + ' ' + displayLabel, 'event', year);
              addEdge(prevNodeId !== artworkId ? prevNodeId : artworkId, nodeId, '', year);
              prevNodeId = nodeId;
          }

          prevYear = year;
        });
      }

      return { nodes: nodes, edges: edges };
    },

    /**
     * Render D3.js force-directed graph with SVG
     */
    _renderD3: function(container, data) {
      var self = this;
      var w = container.clientWidth || 360;
      var h = Math.min(window.innerHeight * 0.55, 500);
      this.width = w;
      this.height = h;

      container.innerHTML = '';

      // Color palette by node type
      var typeColors = {
        artwork: '#D4AE52',
        artist: '#8AADEA',
        owner: '#5AAA78',
        creation: '#D4AE52',
        exhibition: '#8B5CF6',
        auction: '#EF4444',
        event: '#C0B090'
      };

      var typeIcons = {
        artwork: '\u25C8',
        artist: '\u2726',
        owner: '\u25A0',
        creation: '\u25CF',
        exhibition: '\u25C6',
        auction: '\u25B2',
        event: '\u2022'
      };

      // SVG container
      var svg = d3.select(container)
        .append('svg')
        .attr('width', w)
        .attr('height', h)
        .attr('viewBox', [0, 0, w, h])
        .style('cursor', 'grab')
        .style('background', 'var(--bg2, #0E0C09)');

      this.svg = svg;

      // Defs for gradients, drop shadows
      var defs = svg.append('defs');

      // Drop shadow filter for nodes
      defs.append('filter')
        .attr('id', 'kg-drop-shadow')
        .append('feDropShadow')
        .attr('dx', 0)
        .attr('dy', 2)
        .attr('stdDeviation', 3)
        .attr('flood-color', 'rgba(0,0,0,0.5)');

      // Glow filter for artwork node
      var glowFilter = defs.append('filter')
        .attr('id', 'kg-glow');
      glowFilter.append('feGaussianBlur')
        .attr('stdDeviation', 4)
        .attr('result', 'blur');
      var glowMerge = glowFilter.append('feMerge');
      glowMerge.append('feMergeNode').attr('in', 'blur');
      glowMerge.append('feMergeNode').attr('in', 'SourceGraphic');

      // Arrow marker for edges
      defs.append('marker')
        .attr('id', 'kg-arrow')
        .attr('viewBox', [0, 0, 8, 8])
        .attr('refX', 20)
        .attr('refY', 4)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,0 L8,4 L0,8 Z')
        .attr('fill', 'rgba(212, 174, 82, 0.3)');

      // Tooltip
      var tooltip = d3.select(container)
        .append('div')
        .attr('class', 'kg-tooltip')
        .style('position', 'absolute')
        .style('background', 'rgba(20, 18, 9, 0.95)')
        .style('border', '1px solid rgba(212, 174, 82, 0.3)')
        .style('color', '#F5EDD8')
        .style('padding', '8px 12px')
        .style('border-radius', '4px')
        .style('font-size', '11px')
        .style('line-height', '1.5')
        .style('pointer-events', 'none')
        .style('opacity', 0)
        .style('z-index', 100)
        .style('max-width', '200px')
        .style('box-shadow', '0 4px 16px rgba(0,0,0,0.5)')
        .style('font-family', 'Montserrat, sans-serif');

      this.tooltip = tooltip;

      // Zoom behavior
      var zoom = d3.zoom()
        .scaleExtent([0.3, 4])
        .on('zoom', function(event) {
          gMain.attr('transform', event.transform);
        });

      svg.call(zoom)
        .on('dblclick.zoom', null); // disable double-click zoom

      this.zoom = zoom;

      // Main group for zoom/pan
      var gMain = svg.append('g').attr('class', 'kg-main');

      // Build nodes and links
      var nodeData = data.nodes.map(function(n) {
        return {
          id: n.id,
          label: n.label,
          type: n.type,
          year: n.year,
          meta: n.meta
        };
      });

      var linkData = data.edges.map(function(e) {
        return {
          source: e.source,
          target: e.target,
          label: e.label,
          year: e.year
        };
      });

      // Create force simulation
      var simulation = d3.forceSimulation(nodeData)
        .force('link', d3.forceLink(linkData)
          .id(function(d) { return d.id; })
          .distance(function(d) {
            return d.source.type === 'artwork' ? 100 : 80;
          })
          .strength(0.4)
        )
        .force('charge', d3.forceManyBody()
          .strength(function(d) {
            return d.type === 'artwork' ? -400 : -200;
          })
        )
        .force('center', d3.forceCenter(w / 2, h / 2))
        .force('collision', d3.forceCollide().radius(function(d) {
          return d.type === 'artwork' ? 35 : 25;
        }))
        .alphaDecay(0.02)
        .velocityDecay(0.3);

      this.simulation = simulation;

      // Draw edges
      var link = gMain.append('g')
        .attr('class', 'kg-links')
        .selectAll('line')
        .data(linkData)
        .join('line')
        .attr('stroke', 'rgba(212, 174, 82, 0.15)')
        .attr('stroke-width', 1.2)
        .attr('stroke-dasharray', function(d) {
          return d.label === 'gap' ? '4,3' : null;
        })
        .attr('marker-end', 'url(#kg-arrow)');

      // Edge labels
      var linkLabel = gMain.append('g')
        .attr('class', 'kg-link-labels')
        .selectAll('text')
        .data(linkData)
        .join('text')
        .attr('font-size', '7px')
        .attr('fill', 'rgba(192, 176, 144, 0.5)')
        .attr('font-family', 'Montserrat, sans-serif')
        .attr('text-anchor', 'middle')
        .attr('dy', '-4')
        .text(function(d) { return d.label; });

      // Draw nodes
      var node = gMain.append('g')
        .attr('class', 'kg-nodes')
        .selectAll('g')
        .data(nodeData)
        .join('g')
        .attr('class', function(d) { return 'kg-node kg-node-' + d.type; })
        .style('cursor', 'pointer')
        .call(d3.drag()
          .on('start', function(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
            svg.style('cursor', 'grabbing');
          })
          .on('drag', function(event, d) {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', function(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
            svg.style('cursor', 'grab');
          })
        );

      // Node circles
      node.append('circle')
        .attr('r', function(d) {
          return d.type === 'artwork' ? 16 : d.type === 'artist' ? 11 : 9;
        })
        .attr('fill', '#080705')
        .attr('stroke', function(d) { return typeColors[d.type] || '#C0B090'; })
        .attr('stroke-width', function(d) {
          return d.type === 'artwork' ? 2.5 : 1.5;
        })
        .attr('filter', function(d) {
          return d.type === 'artwork' ? 'url(#kg-glow)' : 'url(#kg-drop-shadow)';
        });

      // Node icons
      node.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('font-size', function(d) {
          return d.type === 'artwork' ? '11px' : '9px';
        })
        .attr('fill', function(d) { return typeColors[d.type] || '#C0B090'; })
        .text(function(d) { return typeIcons[d.type] || '\u2022'; });

      // Node labels
      node.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', function(d) {
          return d.type === 'artwork' ? 22 : 16;
        })
        .attr('font-size', function(d) {
          return d.type === 'artwork' ? '9px' : '8px';
        })
        .attr('fill', '#F5EDD8')
        .attr('font-family', 'Montserrat, sans-serif')
        .attr('font-weight', function(d) {
          return d.type === 'artwork' ? '600' : '400';
        })
        .text(function(d) { return d.label; });

      // Node year labels
      node.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', function(d) {
          return d.type === 'artwork' ? 32 : 26;
        })
        .attr('font-size', '7px')
        .attr('fill', '#8A7A60')
        .attr('font-family', 'Courier Prime, monospace')
        .text(function(d) { return d.year || ''; });

      // Hover interactions
      node.on('mouseenter', function(event, d) {
          tooltip.transition().duration(200).style('opacity', 1);
          var tipContent = '<strong style="color:' + (typeColors[d.type] || '#C0B090') + '">' +
            d.label.replace(/</g, '&lt;') + '</strong>';
          if (d.year) tipContent += '<br><span style="color:#8A7A60;font-size:10px;">' + d.year + '</span>';
          if (d.meta) tipContent += '<br><span style="color:#C0B090;font-size:10px;">' + d.meta.replace(/</g, '&lt;') + '</span>';
          tipContent += '<br><span style="color:#665840;font-size:8px;text-transform:uppercase;">' + d.type + '</span>';
          tooltip.html(tipContent);

          // Position tooltip relative to container
          var rect = container.getBoundingClientRect();
          var tx = event.clientX - rect.left + 12;
          var ty = event.clientY - rect.top - 10;
          tooltip.style('left', tx + 'px').style('top', ty + 'px');

          // Highlight connected edges
          link.attr('stroke', function(l) {
            return l.source.id === d.id || l.target.id === d.id ?
              'rgba(212, 174, 82, 0.5)' : 'rgba(212, 174, 82, 0.08)';
          });
          link.attr('stroke-width', function(l) {
            return l.source.id === d.id || l.target.id === d.id ? 2 : 0.8;
          });
        })
        .on('mousemove', function(event) {
          var rect = container.getBoundingClientRect();
          var tx = event.clientX - rect.left + 12;
          var ty = event.clientY - rect.top - 10;
          tooltip.style('left', tx + 'px').style('top', ty + 'px');
        })
        .on('mouseleave', function(event, d) {
          tooltip.transition().duration(300).style('opacity', 0);
          link.attr('stroke', 'rgba(212, 174, 82, 0.15)');
          link.attr('stroke-width', 1.2);
        });

      // Tick: update positions
      simulation.on('tick', function() {
        link
          .attr('x1', function(d) { return d.source.x; })
          .attr('y1', function(d) { return d.source.y; })
          .attr('x2', function(d) { return d.target.x; })
          .attr('y2', function(d) { return d.target.y; });

        linkLabel
          .attr('x', function(d) { return (d.source.x + d.target.x) / 2; })
          .attr('y', function(d) { return (d.source.y + d.target.y) / 2; });

        node.attr('transform', function(d) {
          return 'translate(' + d.x + ',' + d.y + ')';
        });
      });

      // Zoom to fit once simulation settles
      var zoomTimer = setTimeout(function() {
        var bounds = gMain.node().getBBox();
        if (bounds.width > 0 && bounds.height > 0) {
          var scale = Math.min(w / (bounds.width + 40), h / (bounds.height + 40), 1.8);
          var tx = (w - bounds.width * scale) / 2 - bounds.x * scale;
          var ty = (h - bounds.height * scale) / 2 - bounds.y * scale;
          svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
          );
        }
      }, 400);
      // Also try on simulation end for better positioning
      simulation.on('end', function() {
        clearTimeout(zoomTimer);
        var bounds = gMain.node().getBBox();
        if (bounds.width > 0 && bounds.height > 0) {
          var scale = Math.min(w / (bounds.width + 40), h / (bounds.height + 40), 1.8);
          var tx = (w - bounds.width * scale) / 2 - bounds.x * scale;
          var ty = (h - bounds.height * scale) / 2 - bounds.y * scale;
          svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
          );
        }
      });

      // Click on node to show detail
      node.on('click', function(event, d) {
        if (event.defaultPrevented) return; // dragged, not clicked
        if (typeof window.toast === 'function') {
          window.toast(d.type.toUpperCase() + ': ' + d.label + (d.year ? ' (' + d.year + ')' : ''));
        }
      });

      // Double-click to zoom to node
      node.on('dblclick', function(event, d) {
        var scale = 2;
        var tx = w / 2 - d.x * scale;
        var ty = h / 2 - d.y * scale;
        svg.transition().duration(500).call(
          zoom.transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
      });

      // Legend
      var legendData = [
        { label: 'Artwork', color: '#D4AE52' },
        { label: 'Artist', color: '#8AADEA' },
        { label: 'Owner', color: '#5AAA78' },
        { label: 'Exhibition', color: '#8B5CF6' },
        { label: 'Auction', color: '#EF4444' }
      ];

      var legend = svg.append('g')
        .attr('class', 'kg-legend')
        .attr('transform', 'translate(10, ' + (h - 22) + ')');

      legend.selectAll('text')
        .data(legendData)
        .join('text')
        .attr('x', function(d, i) { return i * 85; })
        .attr('y', 0)
        .attr('font-size', '7px')
        .attr('fill', 'rgba(192, 176, 144, 0.5)')
        .attr('font-family', 'Montserrat, sans-serif')
        .text(function(d) { return '\u25CF ' + d.label; });

      legend.selectAll('circle')
        .data(legendData)
        .join('circle')
        .attr('cx', function(d, i) { return i * 85 + 3; })
        .attr('cy', -4)
        .attr('r', 3)
        .attr('fill', function(d) { return d.color; })
        .attr('opacity', 0.7);

      // Handle resize
      var resizeHandler = function() {
        var newW = container.clientWidth || 360;
        var newH = Math.min(window.innerHeight * 0.55, 500);
        if (newW !== self.width || newH !== self.height) {
          svg.attr('width', newW).attr('height', newH);
          svg.attr('viewBox', [0, 0, newW, newH]);
          simulation.force('center', d3.forceCenter(newW / 2, newH / 2));
          simulation.alpha(0.3).restart();
          self.width = newW;
          self.height = newH;
        }
      };

      // Store handler for cleanup
      this._resizeHandler = resizeHandler;
      window.addEventListener('resize', resizeHandler);
    },

    /**
     * Clean up D3 resources
     */
    _cleanup: function() {
      if (this.simulation) {
        this.simulation.stop();
        this.simulation = null;
      }
      if (this._resizeHandler) {
        window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
      }
      this.svg = null;
      this.tooltip = null;
    },

    /**
     * Load from server knowledge graph API, enriched with cross-reference data
     */
    loadFromServer: function(title, artist, events) {
      var self = this;
      var apiBase = window.TRACE_API_PROXY || '';
      if (!apiBase) {
        this.load(title, artist, events);
        return;
      }

      // Fetch knowledge graph + cross-reference data in parallel
      var kgPromise = fetch(apiBase + '/api/provenance/knowledge-graph', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title, artist: artist, timeline: events })
      }).then(function(r) { return r.json(); });

      var xrefPromise = artist ? fetch(apiBase + '/api/provenance/cross-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkTitle: title || '', artist: artist, period: '', timeline: events, tier: window.TIER || 'collector' })
      }).then(function(r) { return r.json(); }) : Promise.resolve(null);

      Promise.all([kgPromise, xrefPromise]).then(function(results) {
        var kgData = results[0];
        var xrefData = results[1];

        // Use knowledge graph data as base
        if (kgData && kgData.nodes && kgData.nodes.length > 0) {
          self.graphData = kgData;
        } else {
          // Build from timeline if KG endpoint returned nothing
          self.graphData = self._buildFromTimeline(title, artist, events);
        }

        // Enrich with cross-reference data: add ULAN artist nodes
        if (xrefData && xrefData.databases && xrefData.databases.getty && xrefData.databases.getty.artist) {
          var ulanArtists = xrefData.databases.getty.artist;
          if (ulanArtists.length > 0) {
            var data = self.graphData;
            var existingIds = {};
            if (data.nodes) { data.nodes.forEach(function(n) { existingIds[n.id] = true; }); }

            // Add ULAN artist details as connected nodes
            ulanArtists.forEach(function(ula, idx) {
              var ulanId = 'ulan_' + (ula.id || idx);
              if (existingIds[ulanId]) return;
              existingIds[ulanId] = true;

              var lifespan = [ula.birth, ula.death].filter(Boolean).join('-');
              var label = ula.name + (lifespan ? ' (' + lifespan + ')' : '');
              if (label.length > 25) label = label.slice(0, 22) + '…';

              data.nodes.push({
                id: ulanId,
                label: label,
                type: 'artist',
                year: String(ula.birth || ''),
                meta: ula.role || ula.nationality || ''
              });

              // Connect ULAN node to main artist node if it exists
              var mainArtistId = 'artist';
              if (existingIds[mainArtistId]) {
                if (!data.edges) data.edges = [];
                data.edges.push({
                  source: mainArtistId,
                  target: ulanId,
                  label: 'ULAN: ' + (ula.isMock ? 'Simulated' : 'Live'),
                  year: ''
                });
              }
            });
          }

          // Add API status badges if appropriate (max once per session)
          if (xrefData.apis && !window._kgApiStatusWarned && typeof window.toast === 'function') {
            var liveCount = 0;
            var totalCount = 0;
            Object.keys(xrefData.apis).forEach(function(key) {
              totalCount++;
              if (xrefData.apis[key].real) liveCount++;
            });
            if (liveCount > 0 && liveCount < totalCount) {
              window._kgApiStatusWarned = true;
              window.toast('⚠ Some databases are simulated. Set API keys for live data.');
            }
          }
        }

        var container = document.getElementById('kg-container');
        if (container && self.graphData && self.graphData.nodes && self.graphData.nodes.length > 0) {
          self._renderD3(container, self.graphData);
        } else {
          // Fall back to client-side build
          self.load(title, artist, events);
        }
      }).catch(function() {
        self.load(title, artist, events);
      });
    },

    /**
     * Open knowledge graph screen
     */
    open: function() {
      if (typeof window.nav === 'function') {
        // Clean up previous graph if any
        this._cleanup();
        window.nav('knowledge');
      }
    }
  };

  // Expose globally
  window.KNOWLEDGE = KNOWLEDGE;

  // ── Register with registry ──
  if (typeof TRACE_REGISTRY !== 'undefined' && typeof TRACE_REGISTRY.register === 'function') {
    TRACE_REGISTRY.register('knowledge', {
      version: '2.0.0',
      dependsOn: ['utils']
    });
    // Subscribe to scan:complete to auto-build graph
    TRACE_REGISTRY.on('scan:complete', function(data) {
      if (data && data.result) {
        setTimeout(function() {
          KNOWLEDGE.loadFromServer(
            data.result.title || '',
            data.result.artist || '',
            data.result.timeline || []
          );
        }, 500);
      }
    });
  }

  console.log('[TRACE Knowledge] v2.0 loaded (D3.js)');
})();
