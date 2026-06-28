import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// ── Mock fetchWithTimeout before any module loads ──
const mockFetch = vi.fn();
vi.mock('../src/utils.js', () => ({
  fetchWithTimeout: mockFetch,
}));

// Delay the module import until beforeAll so the mock is definitely registered
let callAI;
beforeAll(async () => {
  const mod = await import('../src/ai.js');
  callAI = mod.callAI;
});

// ── Helpers ──
function okResponse(body) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}
function errResponse(status, text) {
  return { ok: false, status, text: () => Promise.resolve(text), json: () => Promise.resolve({ error: text }) };
}

function anthropicResponse(text) {
  return okResponse({ content: [{ text }] });
}
function openRouterResponse(text) {
  return okResponse({ choices: [{ message: { content: text } }] });
}
function geminiResponse(text) {
  return okResponse({ candidates: [{ content: { parts: [{ text }] } }] });
}

function env(overrides = {}) {
  return {
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENROUTER_API_KEY: 'sk-or-test',
    GEMINI_API_KEY: 'gemini-test',
    GEMINI_MODEL: 'gemini-2.5-flash',
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ── No API keys ────────────────────────────────────────────────────────────

describe('callAI — no API keys', () => {
  it('should throw when no AI provider is configured', async () => {
    await expect(callAI('System', 'Hello', {}, 1024, 'economy')).rejects.toThrow('No AI provider configured');
  });

  it('should throw when all API keys are empty strings', async () => {
    await expect(
      callAI('System', 'Hello', { ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '', GEMINI_API_KEY: '' }, 1024, 'economy'),
    ).rejects.toThrow('No AI provider configured');
  });
});

// ── Anthropic success path ────────────────────────────────────────────────

describe('callAI — Anthropic success', () => {
  it('should return text from Anthropic with economy tier', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('St Pauls Church, attributed to Rubens'));

    const result = await callAI('Analyze', 'Describe this painting', env(), 1024, 'economy');

    expect(result).toEqual({
      text: 'St Pauls Church, attributed to Rubens',
      provider: 'anthropic',
      model: 'claude-haiku-3-5',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[0]).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(callArgs[1].body);
    expect(body.model).toBe('claude-haiku-3-5');
  });

  it('should use premium tier (Claude Sonnet)', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Deep analysis result'));

    const result = await callAI('System', 'Deep analysis', env(), 2048, 'premium');

    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-sonnet-4-6');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('claude-sonnet-4-6');
    expect(body.max_tokens).toBe(2048);
  });

  it('should pass system prompt and user content to Anthropic', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Result'));

    await callAI('You are an expert', 'Analyze this painting', env(), 1024, 'standard');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.system).toBe('You are an expert');
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toBe('Analyze this painting');
  });

  it('should handle empty response text from Anthropic', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse(''));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result.text).toBe('');
    expect(result.provider).toBe('anthropic');
  });

  it('should handle vision content array with Anthropic', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Vision analysis'));
    const visionContent = [
      { type: 'image', source: { type: 'url', url: 'https://img.jpg' } },
      { type: 'text', text: 'Describe this' },
    ];

    const result = await callAI('System', visionContent, env(), 1024, 'economy');

    expect(result.provider).toBe('anthropic');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toEqual(visionContent);
  });

  it('should default to economy tier when no tier specified', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Default'));

    const result = await callAI('System', 'Hello', env());

    expect(result.provider).toBe('anthropic');
    expect(result.model).toBe('claude-haiku-3-5');
  });

  it('should default max_tokens to 1024 when not specified', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Default'));

    await callAI('System', 'Hello', env(), undefined, 'economy');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_tokens).toBe(1024);
  });

  it('should accept a direct model string instead of a tier name', async () => {
    mockFetch.mockResolvedValueOnce(openRouterResponse('Custom model response'));

    const result = await callAI('System', 'Hello', { OPENROUTER_API_KEY: 'sk-or-test' }, 1024, 'custom/model-name');

    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('custom/model-name');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('custom/model-name');
  });
});

// ── Fallback: Anthropic 5xx → OpenRouter ──────────────────────────────────

describe('callAI — Anthropic 5xx fallback to OpenRouter', () => {
  it('should fall back to OpenRouter when Anthropic returns 500', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Internal Server Error'))
      .mockResolvedValueOnce(openRouterResponse('Fallback result'));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result).toEqual({
      text: 'Fallback result',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should fall back to OpenRouter when Anthropic returns 502', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(502, 'Bad Gateway'))
      .mockResolvedValueOnce(openRouterResponse('Gateway fallback'));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result.text).toBe('Gateway fallback');
    expect(result.provider).toBe('openrouter');
  });

  it('should fall back to OpenRouter when Anthropic throws a network error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(openRouterResponse('Network fallback'));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result.text).toBe('Network fallback');
    expect(result.provider).toBe('openrouter');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should use standard tier model in OpenRouter fallback', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(openRouterResponse('Standard result'));

    const result = await callAI('System', 'Hello', env(), 1024, 'standard');

    expect(result.model).toBe('openai/gpt-4.1-nano');
    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(body.model).toBe('openai/gpt-4.1-nano');
  });

  it('should convert Anthropic vision blocks to OpenAI format on fallback', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(openRouterResponse('Vision fallback'));

    const visionContent = [
      { type: 'image', source: { type: 'url', url: 'https://img.jpg' } },
      { type: 'text', text: 'Describe this image' },
    ];

    const result = await callAI('System', visionContent, env(), 1024, 'economy');

    expect(result.text).toBe('Vision fallback');
    const body = JSON.parse(mockFetch.mock.calls[1][1].body);
    // Should be OpenAI format
    expect(body.messages[1].content[0].type).toBe('image_url');
    expect(body.messages[1].content[0].image_url.url).toBe('https://img.jpg');
    expect(body.messages[1].content[1].type).toBe('text');
  });
});

// ── Fallback: Anthropic 4xx → OpenRouter ──────────────────────────────────

describe('callAI — Anthropic 4xx fallback to OpenRouter', () => {
  it('should fall through to OpenRouter on Anthropic 401', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(401, 'Unauthorized'))
      .mockResolvedValueOnce(openRouterResponse('OpenRouter result'));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result.text).toBe('OpenRouter result');
    expect(result.provider).toBe('openrouter');
  });

  it('should fall through to OpenRouter on Anthropic 429 (rate limited)', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(429, 'Too Many Requests'))
      .mockResolvedValueOnce(openRouterResponse('Rate limit fallback'));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result.text).toBe('Rate limit fallback');
    expect(result.provider).toBe('openrouter');
  });

  it('should fall through to OpenRouter on Anthropic 400 (bad request)', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(400, 'Bad Request'))
      .mockResolvedValueOnce(openRouterResponse('Bad request fallback'));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result.text).toBe('Bad request fallback');
    expect(result.provider).toBe('openrouter');
  });
});

// ── OpenRouter success (no Anthropic) ─────────────────────────────────────

describe('callAI — OpenRouter only (no Anthropic key)', () => {
  it('should call OpenRouter directly when only OpenRouter is configured', async () => {
    mockFetch.mockResolvedValueOnce(openRouterResponse('OpenRouter only'));

    const result = await callAI('System', 'Hello', env({ ANTHROPIC_API_KEY: '' }), 1024, 'economy');

    expect(result).toEqual({
      text: 'OpenRouter only',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('should include system message in OpenRouter call', async () => {
    mockFetch.mockResolvedValueOnce(openRouterResponse('Result'));

    await callAI('You are an art expert', 'Hello', env({ ANTHROPIC_API_KEY: '' }), 1024, 'economy');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toBe('You are an art expert');
  });

  it('should skip system message if empty', async () => {
    mockFetch.mockResolvedValueOnce(openRouterResponse('Result'));

    await callAI('', 'Hello', env({ ANTHROPIC_API_KEY: '' }), 1024, 'economy');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages.length).toBe(1);
    expect(body.messages[0].role).toBe('user');
  });
});

// ── Full fallback chain: Anthropic → OpenRouter → Gemini ─────────────────

describe('callAI — full fallback chain to Gemini', () => {
  it('should fall back to Gemini when Anthropic and OpenRouter both fail', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Anthropic down'))
      .mockResolvedValueOnce(errResponse(500, 'OpenRouter down'))
      .mockResolvedValueOnce(geminiResponse('Gemini result'));

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result).toEqual({
      text: 'Gemini result',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should convert vision content for Gemini', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Anthropic down'))
      .mockResolvedValueOnce(errResponse(500, 'OpenRouter down'))
      .mockResolvedValueOnce(geminiResponse('Gemini vision'));

    const visionContent = [
      { type: 'image', source: { type: 'url', url: 'https://img.jpg' } },
      { type: 'text', text: 'What is this?' },
    ];

    const result = await callAI(
      'System',
      visionContent,
      { GEMINI_API_KEY: 'key', ANTHROPIC_API_KEY: 'key', OPENROUTER_API_KEY: 'key' },
      1024,
      'economy',
    );

    expect(result.text).toBe('Gemini vision');
    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.contents[0].parts[0]).toHaveProperty('inlineData');
    expect(body.contents[0].parts[1].text).toBe('What is this?');
  });

  it('should use custom GEMINI_MODEL when set', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Anthropic down'))
      .mockResolvedValueOnce(errResponse(500, 'OpenRouter down'))
      .mockResolvedValueOnce(geminiResponse('Custom model'));

    const result = await callAI('System', 'Hello', env({ GEMINI_MODEL: 'gemini-2.0-flash' }), 1024, 'economy');

    expect(result.model).toBe('gemini-2.0-flash');
    expect(mockFetch.mock.calls[2][0]).toContain('gemini-2.0-flash');
  });

  it('should default to gemini-2.5-flash when GEMINI_MODEL not set', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(geminiResponse('Default model'));

    const result = await callAI('System', 'Hello', env({ GEMINI_MODEL: undefined }), 1024, 'economy');

    expect(result.model).toBe('gemini-2.5-flash');
    expect(mockFetch.mock.calls[2][0]).toContain('gemini-2.5-flash');
  });

  it('should pass system instruction to Gemini', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(geminiResponse('Result'));

    await callAI('You are an art provenance analyst', 'Hello', env(), 1024, 'economy');

    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('You are an art provenance analyst');
  });

  it('should set maxOutputTokens in Gemini call', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(geminiResponse('Result'));

    await callAI('System', 'Hello', env(), 800, 'economy');

    const body = JSON.parse(mockFetch.mock.calls[2][1].body);
    expect(body.generationConfig.maxOutputTokens).toBe(800);
  });

  it('should handle multi-part Gemini response', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(
        okResponse({
          candidates: [
            {
              content: { parts: [{ text: 'Part 1' }, { text: 'Part 2' }] },
            },
          ],
        }),
      );

    const result = await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(result.text).toBe('Part 1Part 2');
  });
});

// ── Gemini only (no other providers) ──────────────────────────────────────

describe('callAI — Gemini only (no Anthropic or OpenRouter)', () => {
  it('should call Gemini directly when it is the only key', async () => {
    mockFetch.mockResolvedValueOnce(geminiResponse('Gemini direct'));

    const result = await callAI(
      'System',
      'Hello',
      { GEMINI_API_KEY: 'key', ANTHROPIC_API_KEY: '', OPENROUTER_API_KEY: '' },
      1024,
      'economy',
    );

    expect(result.text).toBe('Gemini direct');
    expect(result.provider).toBe('gemini');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toContain('generativelanguage.googleapis.com');
  });
});

// ── All providers fail ───────────────────────────────────────────────────

describe('callAI — all providers fail', () => {
  it('should throw when Anthropic fails and no OpenRouter or Gemini key', async () => {
    mockFetch.mockResolvedValueOnce(errResponse(500, 'Anthropic error'));

    await expect(callAI('System', 'Hello', { ANTHROPIC_API_KEY: 'key' }, 1024, 'economy')).rejects.toThrow('Anthropic');
  });

  it('should re-throw Anthropic network error when no fallback keys', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

    await expect(callAI('System', 'Hello', { ANTHROPIC_API_KEY: 'key' }, 1024, 'economy')).rejects.toThrow(
      'Network timeout',
    );
  });

  it('should throw when Anthropic and OpenRouter fail and no Gemini key', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Anthropic error'))
      .mockResolvedValueOnce(errResponse(502, 'OpenRouter error'));

    await expect(
      callAI('System', 'Hello', { ANTHROPIC_API_KEY: 'key', OPENROUTER_API_KEY: 'key' }, 1024, 'economy'),
    ).rejects.toThrow('OpenRouter');
  });

  it('should throw Gemini error when all three providers fail', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Anthropic down'))
      .mockResolvedValueOnce(errResponse(500, 'OpenRouter down'))
      .mockResolvedValueOnce(errResponse(503, 'Gemini down'));

    await expect(callAI('System', 'Hello', env(), 1024, 'economy')).rejects.toThrow('Gemini');
  });

  it('should throw generic error when Gemini is the only provider and fails', async () => {
    mockFetch.mockResolvedValueOnce(errResponse(500, 'Gemini error'));

    await expect(callAI('System', 'Hello', { GEMINI_API_KEY: 'key' }, 1024, 'economy')).rejects.toThrow('Gemini');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────

describe('callAI — edge cases', () => {
  it('should handle truncated Anthropic response content array', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ content: [] }));

    const result = await callAI(
      'System',
      'Hello',
      env({ OPENROUTER_API_KEY: '', GEMINI_API_KEY: '' }),
      1024,
      'economy',
    );

    expect(result.text).toBe('');
    expect(result.provider).toBe('anthropic');
  });

  it('should handle Anthropic response without content array', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}));

    const result = await callAI(
      'System',
      'Hello',
      env({ OPENROUTER_API_KEY: '', GEMINI_API_KEY: '' }),
      1024,
      'economy',
    );

    expect(result.text).toBe('');
    expect(result.provider).toBe('anthropic');
  });

  it('should handle OpenRouter response without choices array', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}));

    const result = await callAI('System', 'Hello', env({ ANTHROPIC_API_KEY: '' }), 1024, 'economy');

    expect(result.text).toBe('');
    expect(result.provider).toBe('openrouter');
  });

  it('should handle Gemini empty candidates', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ candidates: [] }));

    const result = await callAI('System', 'Hello', { GEMINI_API_KEY: 'key' }, 1024, 'economy');

    expect(result.text).toBe('');
    expect(result.provider).toBe('gemini');
  });

  it('should handle Gemini missing content in candidates', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ candidates: [{}] }));

    const result = await callAI('System', 'Hello', { GEMINI_API_KEY: 'key' }, 1024, 'economy');

    expect(result.text).toBe('');
    expect(result.provider).toBe('gemini');
  });

  it('should use correct OpenRouter API URL', async () => {
    mockFetch.mockResolvedValueOnce(openRouterResponse('Result'));

    await callAI('System', 'Hello', env({ ANTHROPIC_API_KEY: '' }), 1024, 'economy');

    expect(mockFetch.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('should use correct Anthropic API URL', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Result'));

    await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(mockFetch.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
  });

  it('should use correct Gemini API URL', async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(errResponse(500, 'Error'))
      .mockResolvedValueOnce(geminiResponse('Result'));

    await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(mockFetch.mock.calls[2][0]).toContain('generativelanguage.googleapis.com/v1beta/models/');
  });

  it('should use 30s timeout for all provider calls', async () => {
    mockFetch.mockResolvedValueOnce(anthropicResponse('Result'));

    await callAI('System', 'Hello', env(), 1024, 'economy');

    expect(mockFetch.mock.calls[0][2]).toBe(30000);
  });
});
