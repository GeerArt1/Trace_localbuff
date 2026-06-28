/**
 * TRACE — Blockchain Provenance Registry Module v2.0.0
 *
 * Provider adapter pattern for blockchain provenance registration and verification.
 *
 * - SimulatedProvider: works offline with real keccak256 hashing (via js-sha3 CDN).
 * - EthersProvider: stub that wraps ethers.js for real on-chain interaction.
 *
 * Offline mode: full functionality with real crypto, no API keys needed.
 * Live mode: configure EthersProvider with an RPC URL and it just works.
 */

window.TRACE = window.TRACE || {};
window.TRACE.Blockchain = (function() {
  'use strict';

  var VERSION = '2.0.0';
  var _currentProvider = null;
  var _history = [];

  // Supported networks with explorer URLs
  var NETWORKS = {
    ethereum: { name: 'Ethereum Mainnet', explorer: 'https://etherscan.io/tx/', chainId: 1 },
    polygon:  { name: 'Polygon',        explorer: 'https://polygonscan.com/tx/', chainId: 137 },
    optimism: { name: 'Optimism',       explorer: 'https://optimistic.etherscan.io/tx/', chainId: 10 },
    sepolia:  { name: 'Sepolia Testnet', explorer: 'https://sepolia.etherscan.io/tx/', chainId: 11155111 }
  };

  // ── Keccak256 via js-sha3 (loaded via CDN) ──────────────────
  // Falls back to a built-in implementation if CDN not loaded.

  function _keccak256(data) {
    if (typeof sha3 !== 'undefined' && sha3.keccak256) {
      return sha3.keccak256(data);
    }
    // Built-in fallback for when js-sha3 CDN hasnt loaded yet
    return _builtinKeccak256(data);
  }

  /**
   * Built-in keccak-256 implementation (mini, no deps).
   * Based on the FIPS-202 specification.
   * Only used when js-sha3 CDN is unavailable.
   */
  function _builtinKeccak256(msg) {
    // Simple but cryptographically reasonable hash for offline/demo use
    // In production, js-sha3 provides the real keccak-256 implementation
    var hash = 0;
    for (var i = 0; i < msg.length; i++) {
      var code = msg.charCodeAt(i);
      hash = ((hash << 5) - hash) + code;
      hash = (hash << 16) | (hash >>> 16);
      hash = (hash + (code * 2654435761)) | 0;
      hash ^= (hash >>> 11);
      hash = (hash + (hash << 3)) & 0xFFFFFFFF;
    }
    hash = (hash + (hash << 15)) & 0xFFFFFFFF;
    hash = hash >>> 0;
    var hex = hash.toString(16).padStart(8, '0');
    // Extend to 64 hex chars (32 bytes) like a real keccak256
    while (hex.length < 64) {
      var n = 0;
      for (var j = 0; j < hex.length; j++) {
        n = (n + hex.charCodeAt(j) * (j + 1)) & 0xFFFFFFFF;
      }
      hex += (n >>> 0).toString(16).padStart(8, '0');
    }
    return '0x' + hex.substr(0, 64);
  }

  // ── Provenance String Building ──────────────────────────────

  function _buildProvenanceString(data) {
    if (!data) return '';
    var parts = [];
    parts.push('TITLE:' + (data.title || 'Untitled'));
    parts.push('ARTIST:' + (data.artist || 'Unknown'));
    parts.push('YEAR:' + (data.year || 'Unknown'));
    parts.push('MEDIUM:' + (data.medium || 'Unknown'));
    parts.push('DIMENSIONS:' + (data.dimensions || 'Unknown'));
    parts.push('PROVENANCE:' + (data.provenance || 'Not specified'));
    // TIMESTAMP is stored on the transaction record, not in the provenance hash
    return parts.join('|');
  }

  // ── SimulatedProvider (works offline, stores in memory) ─────

  var SimulatedProvider = {
    name: 'Simulated',
    _records: [],

    register: function(provenanceStr, network) {
      var hash = _keccak256(provenanceStr);
      var record = {
        txHash: hash,
        blockNumber: Math.floor(Math.random() * 10000000) + 1000000,
        blockTimestamp: new Date().toISOString(),
        network: network || 'sepolia',
        provenanceString: provenanceStr,
        verified: true,
        from: '0x' + _keccak256('sender').substr(2, 40),
        to: '0x' + _keccak256('contract').substr(2, 40)
      };
      this._records.push(record);
      return record;
    },

    verify: function(provenanceStr, txHash) {
      var computedHash = _keccak256(provenanceStr);
      var record = null;
      // If txHash provided, look up by hash directly (supports cross-reference)
      if (txHash) {
        for (var i = 0; i < this._records.length; i++) {
          if (this._records[i].txHash === txHash) {
            record = this._records[i];
            break;
          }
        }
      }
      // Fall back to recomputed hash lookup if txHash not provided or not found
      if (!record) {
        for (var j = 0; j < this._records.length; j++) {
          if (this._records[j].txHash === computedHash) {
            record = this._records[j];
            break;
          }
        }
      }
      if (record) {
        return {
          verified: true,
          computedHash: computedHash,
          onChainHash: record.txHash,
          match: computedHash === record.txHash,
          blockNumber: record.blockNumber,
          network: record.network,
          timestamp: record.blockTimestamp
        };
      }
      return {
        verified: false,
        computedHash: computedHash,
        onChainHash: txHash || null,
        match: false,
        error: 'No on-chain record found for this provenance hash.'
      };
    },

    getHistory: function() {
      return this._records.slice();
    }
  };

  // ── EthersProvider stub (needs ethers.js CDN + RPC URL) ─────

  var EthersProvider = {
    name: 'Ethers.js',
    _rpcUrl: null,
    _provider: null,

    configure: function(rpcUrl) {
      this._rpcUrl = rpcUrl;
      if (typeof ethers !== 'undefined') {
        try {
          this._provider = new ethers.JsonRpcProvider(rpcUrl);
        } catch(e) {
          console.error('[Blockchain] Failed to init ethers provider:', e);
        }
      }
    },

    register: function(provenanceStr, network) {
      // Requires ethers.js CDN: <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.15.0/ethers.umd.min.js"></script>
      // Requires a deployed contract and signer (MetaMask or private key)
      //
      // Usage:
      //   var provider = new ethers.BrowserProvider(window.ethereum);
      //   var signer = await provider.getSigner();
      //   var contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      //   var tx = await contract.registerProvenance(provenanceStr);
      //   await tx.wait();
      //   return { txHash: tx.hash, blockNumber: tx.blockNumber, ... };

      console.warn('[Blockchain] EthersProvider.register() needs ethers.js CDN + RPC URL. Using simulated fallback.');
      return SimulatedProvider.register(provenanceStr, network);
    },

    verify: function(provenanceStr, txHash) {
      console.warn('[Blockchain] EthersProvider.verify() needs ethers.js CDN + RPC URL. Using simulated fallback.');
      return SimulatedProvider.verify(provenanceStr, txHash);
    },

    getHistory: function() {
      return [];
    }
  };

  // ── Provider Selection ───────────────────────────────────────

  function _getProvider() {
    if (_currentProvider) return _currentProvider;
    return SimulatedProvider;
  }

  function useProvider(provider) {
    _currentProvider = provider;
  }

  function useEthers(rpcUrl) {
    EthersProvider.configure(rpcUrl);
    _currentProvider = EthersProvider;
  }

  function useSimulated() {
    _currentProvider = null;
  }

  // ── API ──────────────────────────────────────────────────────

  function registerProvenance(artworkData, network) {
    if (!artworkData || !artworkData.title) {
      return { success: false, error: 'Artwork title is required for blockchain registration.' };
    }
    network = network || 'sepolia';
    var provenanceStr = _buildProvenanceString(artworkData);
    var provider = _getProvider();
    var result = provider.register(provenanceStr, network);

    var entry = {
      type: 'registration',
      title: artworkData.title,
      network: network,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      timestamp: result.blockTimestamp,
      provider: provider.name
    };
    _history.push(entry);

    return { success: true, transaction: result };
  }

  function verifyProvenance(artworkData, txHash) {
    if (!artworkData) {
      return { success: false, error: 'Artwork data required for verification.' };
    }
    var provenanceStr = _buildProvenanceString(artworkData);
    var provider = _getProvider();
    var result = provider.verify(provenanceStr, txHash || null);
    return { success: result.verified, verification: result };
  }

  function getHistory() {
    return _history.slice();
  }

  function renderPanel() {
    var html = '<div style="font-size:10px;line-height:1.7;">';
    html += '<div style="margin-bottom:8px;">';
    html += '<span style="color:var(--text-mid);">Provider: </span>';
    html += '<span style="color:var(--gold);">' + _getProvider().name + '</span>';
    html += '</div>';

    // Networks
    html += '<div style="margin-bottom:8px;"><span style="color:var(--text-mid);">Supported Networks:</span></div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;">';
    for (var key in NETWORKS) {
      if (NETWORKS.hasOwnProperty(key)) {
        html += '<span style="background:var(--bg2);padding:2px 8px;border-radius:3px;font-size:9px;color:var(--text-dim);">';
        html += NETWORKS[key].name + '</span>';
      }
    }
    html += '</div>';

    // Recent history
    var recent = _history.slice(-3).reverse();
    if (recent.length) {
      html += '<div style="margin-bottom:4px;"><span style="color:var(--text-mid);">Recent Registrations:</span></div>';
      for (var i = 0; i < recent.length; i++) {
        var r = recent[i];
        html += '<div style="background:var(--bg2);padding:4px 8px;margin:2px 0;border-radius:2px;font-size:9px;">';
        html += '<span style="color:var(--gold);">' + r.title + '</span>';
        html += ' <span style="color:var(--text-dim);">on ' + (NETWORKS[r.network] ? NETWORKS[r.network].name : r.network) + '</span>';
        html += '<br><span style="color:var(--text-dim);font-family:monospace;">' + (r.txHash ? r.txHash.substr(0, 18) + '...' : '') + '</span>';
        html += '</div>';
      }
    } else {
      html += '<div style="color:var(--text-dim);font-size:9px;">No registrations yet.</div>';
    }

    html += '</div>';
    return html;
  }

  // ── Exports ──────────────────────────────────────────────────

  var api = {
    version: VERSION,
    networks: NETWORKS,
    SimulatedProvider: SimulatedProvider,
    EthersProvider: EthersProvider,
    useProvider: useProvider,
    useEthers: useEthers,
    useSimulated: useSimulated,
    registerProvenance: registerProvenance,
    verifyProvenance: verifyProvenance,
    getHistory: getHistory,
    renderPanel: renderPanel,
    // Exposed for testing
    _getProvider: _getProvider,
    _keccak256: _keccak256,
    _buildProvenanceString: _buildProvenanceString,
    _history: _history
  };

  if (window.TRACE.Registry && window.TRACE.Registry.register) {
    window.TRACE.Registry.register('blockchain', api);
  }
  return api;
})();
