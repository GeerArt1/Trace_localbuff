// TRACE Provider Plugin Example: Groq API
// Demonstrates how to add a new AI provider without editing trace_server.js
// Env var: GROQ_API_KEY — Get yours at https://console.groq.com/keys
//
// To enable: set GROQ_API_KEY and AI_PROVIDER=groq or AI_PROVIDER=auto

const https = require('https');

function httpsPostJson(hostname, path, headers, bodyJson) {
  var body = JSON.stringify(bodyJson);
  var allHeaders = {};
  Object.keys(headers).forEach(function(k) { allHeaders[k] = headers[k]; });
  allHeaders['Content-Type'] = 'application/json';
  allHeaders['Content-Length'] = Buffer.byteLength(body);

  return new Promise(function(resolve, reject) {
    var options = {
      hostname: hostname,
      path: path,
      method: 'POST',
      timeout: 60000,
      headers: allHeaders
    };

    var req = https.request(options, function(res) {
      var chunks = [];
      res.on('data', function(chunk) { chunks.push(chunk); });
      res.on('end', function() {
        var data = Buffer.concat(chunks).toString('utf8');
        var parsed;
        try { parsed = JSON.parse(data); } catch(e) {
          return reject(new Error('Invalid JSON from ' + hostname + ': ' + data.slice(0, 200)));
        }
        resolve({ statusCode: res.statusCode, body: parsed, raw: data });
      });
    });

    req.on('timeout', function() {
      req.destroy();
      reject(new Error('Upstream timeout from ' + hostname));
    });
    req.on('error', function(e) {
      reject(new Error('Upstream error from ' + hostname + ': ' + e.message));
    });
    req.write(body);
    req.end();
  });
}

// Convert Anthropic messages format → OpenAI-compatible format
function translateMessages(payload) {
  var messages = [];
  if (typeof payload.system === 'string' && payload.system.length > 0) {
    messages.push({ role: 'system', content: payload.system });
  }
  (payload.messages || []).forEach(function(msg) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      var parts = msg.content.map(function(block) {
        if (block.type === 'text') return { type: 'text', text: block.text };
        if (block.type === 'image' && block.source) {
          return {
            type: 'image_url',
            image_url: { url: 'data:' + (block.source.media_type || 'image/jpeg') + ';base64,' + (block.source.data || '') }
          };
        }
        return { type: 'text', text: '[unhandled content]' };
      });
      messages.push({ role: msg.role, content: parts });
    }
  });
  return messages;
}

// Convert OpenAI-compatible response → Anthropic format
function translateResponse(openaiResponse) {
  var text = '';
  try {
    if (openaiResponse.choices && openaiResponse.choices.length > 0) {
      text = openaiResponse.choices[0].message.content || '';
    }
  } catch(e) {
    // return empty text on parse failure
  }
  return {
    content: [{ type: 'text', text: text }],
    role: 'assistant'
  };
}

module.exports = {
  name: 'groq',

  defaultModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  isConfigured: function() {
    return !!process.env.GROQ_API_KEY;
  },

  call: async function(payload, model) {
    var apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not configured');

    var messages = translateMessages(payload);
    var requestBody = {
      model: model,
      messages: messages,
      max_tokens: payload.max_tokens || 1800,
      temperature: payload.temperature || 0.7
    };

    var result = await httpsPostJson('api.groq.com', '/openai/v1/chat/completions', {
      'Authorization': 'Bearer ' + apiKey
    }, requestBody);

    if (result.statusCode >= 400) {
      throw new Error('Groq API error ' + result.statusCode + ': ' + JSON.stringify(result.body).slice(0, 300));
    }

    return translateResponse(result.body);
  }
};
