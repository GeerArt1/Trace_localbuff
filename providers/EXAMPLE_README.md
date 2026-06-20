# TRACE Provider Plugins

This directory contains plugin modules that register themselves as AI providers with the TRACE server. Each `.js` file here is auto-discovered and loaded at startup via `loadProviderPlugins()`.

## Plugin Interface

Each plugin module must export an object with these properties:

```javascript
module.exports = {
  // Required: unique provider name (lowercase, no spaces)
  name: 'my-provider',

  // Required: async function that accepts (payload, model) and
  // returns an Anthropic-format response { content: [{ type: 'text', text: '...' }], role: 'assistant' }
  // - payload: the original /analyse request body (anthropic messages format)
  // - model: the model string to use
  call: async function(payload, model) { ... },

  // Optional: function that returns true if provider is configured (API key set, etc.)
  // If omitted, provider is always considered configured
  isConfigured: function() { return !!process.env.MY_API_KEY; },

  // Optional: default model string to use when no model is specified
  defaultModel: 'my-default-model'
};
```

## Registering a Plugin

Plugins are auto-loaded from this directory. Just create a new `.js` file and restart the server.

The plugin will:
- Appear in the AI provider auto-fallback chain (after built-in providers: claude → gemini → openrouter → your-plugin)
- Get health tracking (auto-degradation on failure, retry after 5min cooldown)
- Be usable via `AI_PROVIDER=your-plugin-name` env var
- Appear in `/health` and `/api/debug` endpoints
- Get logged at startup: `Provider plugin registered: your-plugin-name`

## Example

See `groq-example.js` for a complete working example.
