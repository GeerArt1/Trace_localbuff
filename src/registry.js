// ══════════════════════════════════════════════
// TRACE — Module Registry (v1.0)
// Plugin system for modular app architecture
// ══════════════════════════════════════════════

window.TRACE_REGISTRY = (function() {
  'use strict';

  /** @type {Map<string, Object>} Registered modules */
  var modules = new Map();

  /** @type {Object<string, Function[]>} Hook -> handler map */
  var hooks = {};

  /** @type {Array} Registered screens (for nav auto-discovery) */
  var screens = [];

  /** @type {Array} Registered commands */
  var commands = [];

  /** @type {string[]} Module load order (for dependency tracking) */
  var loadOrder = [];

  /** @type {boolean} Whether app has initialized */
  var initialized = false;

  /**
   * Register a module with the registry
   * @param {string} name - Unique module name
   * @param {Object} module - Module definition
   * @param {string} [module.version] - Semver version
   * @param {string} [module.tier] - Required tier (discover|collector|professional)
   * @param {Object} [module.screen] - Screen definition {id, label, icon}
   * @param {Array} [module.commands] - Command definitions
   * @param {Function} [module.init] - Called on app init
   * @param {Array<string>} [module.dependsOn] - Dependency module names
   */
  function register(name, module) {
    if (modules.has(name)) {
      console.warn('[Registry] Module already registered: ' + name);
      return;
    }

    // Resolve dependencies
    var deps = module.dependsOn || [];
    var missing = deps.filter(function(d) { return !modules.has(d); });
    if (missing.length > 0) {
      console.warn('[Registry] Module "' + name + '" has unmet dependencies: ' + missing.join(', '));
    }

    modules.set(name, module);
    loadOrder.push(name);

    // Register screen if provided
    if (module.screen) {
      screens.push(module.screen);
    }

    // Register commands if provided
    if (module.commands && Array.isArray(module.commands)) {
      module.commands.forEach(function(cmd) { commands.push(cmd); });
    }

    // Emit registration event
    emit('module:registered', { name: name, module: module });
    console.log('[Registry] ✓ Module loaded: ' + name + (module.version ? ' v' + module.version : ''));

    // Auto-init if app already initialized
    if (initialized && typeof module.init === 'function') {
      try {
        module.init();
      } catch (e) {
        console.error('[Registry] Module "' + name + '" init failed:', e);
      }
    }
  }

  /**
   * Register a hook handler
   * @param {string} hook - Hook name
   * @param {Function} handler - Handler function
   */
  function on(hook, handler) {
    if (!hooks[hook]) hooks[hook] = [];
    hooks[hook].push(handler);
    // Return unsubscribe function
    return function() {
      var idx = hooks[hook].indexOf(handler);
      if (idx >= 0) hooks[hook].splice(idx, 1);
    };
  }

  /**
   * Emit a hook event
   * @param {string} hook - Hook name
   * @param {*} data - Event data
   */
  function emit(hook, data) {
    var handlers = hooks[hook];
    if (!handlers || handlers.length === 0) return;
    handlers.forEach(function(fn) {
      try {
        fn(data);
      } catch (e) {
        console.error('[Registry] Hook "' + hook + '" handler error:', e);
      }
    });
  }

  /**
   * Initialize all registered modules
   */
  function init() {
    if (initialized) return;
    initialized = true;

    modules.forEach(function(module, name) {
      if (typeof module.init === 'function') {
        try {
          module.init();
          console.log('[Registry] Initialized: ' + name);
        } catch (e) {
          console.error('[Registry] Failed to init module "' + name + '":', e);
        }
      }
    });

    emit('app:init', { modules: modules.size, screens: screens.length });
    console.log('[Registry] ✓ App initialized — ' + modules.size + ' modules, ' + screens.length + ' screens');
  }

  /**
   * Get a registered module by name
   * @param {string} name
   * @returns {Object|undefined}
   */
  function get(name) {
    return modules.get(name);
  }

  /**
   * Get all registered screens
   * @returns {Array}
   */
  function getScreens() {
    return screens.slice();
  }

  /**
   * Get all registered module names
   * @returns {string[]}
   */
  function getModuleNames() {
    return Array.from(modules.keys());
  }

  /**
   * Get load order
   * @returns {string[]}
   */
  function getLoadOrder() {
    return loadOrder.slice();
  }

  /**
   * Get module count
   * @returns {number}
   */
  function count() {
    return modules.size;
  }

  /**
   * Get a diagnostic report of all modules
   * @returns {Object}
   */
  function diagnose() {
    var report = {
      modules: [],
      screens: screens.length,
      hookCount: Object.keys(hooks).length,
      initialized: initialized
    };
    modules.forEach(function(m, name) {
      report.modules.push({
        name: name,
        version: m.version || '—',
        tier: m.tier || 'all',
        hasScreen: !!m.screen,
        hasInit: typeof m.init === 'function'
      });
    });
    return report;
  }

  // ── Public API ──
  return {
    register: register,
    on: on,
    emit: emit,
    init: init,
    get: get,
    getScreens: getScreens,
    getModuleNames: getModuleNames,
    getLoadOrder: getLoadOrder,
    count: count,
    diagnose: diagnose
  };
})();

console.log('[TRACE Registry] Loaded — v1.0');
