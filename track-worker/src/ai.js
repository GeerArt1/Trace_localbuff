/**
 * TRACK Worker v2.2 — AI Provider Layer
 *
 * Multi-provider AI abstraction with cost-tiered model routing.
 * Supports Anthropic Claude, OpenRouter (GPT-4.1, DeepSeek V4 Flash, Gemini),
 * with automatic fallback and model selection by task complexity.
 *
 * Pricing tiers (per 1M tokens, June 2026):
 *   ECONOMY  (screening):   DeepSeek V4 Flash $0.14/$0.28
 *   STANDARD (analysis):    GPT-4.1 Nano       $0.10/$0.40
 *   PREMIUM  (deep review): Claude Sonnet 4-6   $3.00/$15.00
 */

import { fetchWithTimeout } from './utils.js';

/** @typedef {'economy'|'standard'|'premium'} ModelTier */

/**
 * Model configuration by tier.
 * Each entry: { openRouterModel, anthropicModel, costNote }
 */
const MODEL_TIERS = {
  economy: {
    openRouterModel: 'deepseek/deepseek-v4-flash',
    anthropicModel: 'claude-haiku-3-5',
    costNote: '~$0.14/$0.28 per 1M tokens — best for high-volume screening',
  },
  standard: {
    openRouterModel: 'openai/gpt-4.1-nano',
    anthropicModel: 'claude-haiku-3-5',
    costNote: '~$0.10/$0.40 per 1M tokens — balanced quality/cost',
  },
  premium: {
    openRouterModel: 'anthropic/claude-sonnet-4-6',
    anthropicModel: 'claude-sonnet-4-6',
    costNote: '~$3.00/$15.00 per 1M tokens — deep forensic analysis',
  },
};

/**
 * Build Anthropic-format vision content array.
 * @param {string} text - The text prompt
 * @param {string|null} [imageUrl] - Optional image URL for vision
 * @returns {string|Array} Plain string or Anthropic vision content array
 */
export function buildVisionContent(text, imageUrl) {
  if (!imageUrl) return text;
  return [
    { type: 'image', source: { type: 'url', url: imageUrl } },
    { type: 'text', text },
  ];
}

/**
 * Convert Anthropic vision blocks to OpenAI-format for OpenRouter fallback.
 * @param {string|Array} content - Anthropic-format content
 * @returns {string|Array} OpenAI-format content
 */
export function toOpenAIFormat(content) {
  if (typeof content === 'string') return content;
  return content.map((block) => {
    if (block.type === 'image') {
      const url = block.source?.url || block.source?.data || '';
      return { type: 'image_url', image_url: { url } };
    }
    return { type: 'text', text: block.text ?? '' };
  });
}

/**
 * Call an AI model with automatic multi-provider fallback.
 * Tries Anthropic first (if key configured), falls back to OpenRouter, then Gemini.
 *
 * @param {string} systemPrompt - System message
 * @param {string|Array} userContent - User message string or vision content array
 * @param {Object} env - Environment bindings (ANTHROPIC_API_KEY, OPENROUTER_API_KEY)
 * @param {number} [maxTokens=1024] - Max output tokens
 * @param {ModelTier|string} [tier='economy'] - Model tier or direct OpenRouter model name
 * @returns {Promise<{text: string, provider: string, model: string}>}
 */
export async function callAI(systemPrompt, userContent, env, maxTokens = 1024, tier = 'economy') {
  const hasAnthropic = !!env.ANTHROPIC_API_KEY;
  const hasOpenRouter = !!env.OPENROUTER_API_KEY;
  const hasGemini = !!env.GEMINI_API_KEY;

  if (!hasAnthropic && !hasOpenRouter && !hasGemini) {
    throw new Error('No AI provider configured (ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY required)');
  }

  // Allow direct model string or tier name
  const config = MODEL_TIERS[tier] || { openRouterModel: tier, anthropicModel: tier };

  // ── Try Anthropic first (lowest latency for vision) ──────────────────
  if (hasAnthropic) {
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'anthropic-version': '2023-06-01',
            'x-api-key': env.ANTHROPIC_API_KEY,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: config.anthropicModel,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
          }),
        },
        30000,
      );

      if (res.ok) {
        const data = await res.json();
        return { text: data.content?.[0]?.text?.trim() || '', provider: 'anthropic', model: config.anthropicModel };
      }

      // On 5xx, throw so we fall through. On 4xx, consume body and fall through.
      if (res.status >= 500) {
        const err = await res.text();
        throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
      }
      await res.text(); // consume 4xx
    } catch (e) {
      // If OpenRouter is available, fall through. Otherwise re-throw.
      if (!hasOpenRouter && !hasGemini) throw e;
    }
  }

  // ── Try OpenRouter as primary or fallback ───────────────────────────
  if (hasOpenRouter) {
    const orContent = toOpenAIFormat(userContent);
    const messages = systemPrompt
      ? [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: orContent },
        ]
      : [{ role: 'user', content: orContent }];

    const orRes = await fetchWithTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: config.openRouterModel,
          max_tokens: maxTokens,
          messages,
        }),
      },
      30000,
    );

    if (orRes.ok) {
      const orData = await orRes.json();
      return {
        text: orData.choices?.[0]?.message?.content?.trim() || '',
        provider: 'openrouter',
        model: config.openRouterModel,
      };
    }

    const err = await orRes.text();
    if (!hasGemini) throw new Error(`OpenRouter ${orRes.status}: ${err.slice(0, 200)}`);
  }

  // ── Gemini fallback (cheapest, best for simple vision tasks) ─────────
  if (hasGemini) {
    const geminiModel = env.GEMINI_MODEL || 'gemini-2.5-flash';
    // Convert user content to Gemini format
    let geminiContent;
    if (typeof userContent === 'string') {
      geminiContent = [{ text: userContent }];
    } else {
      geminiContent = userContent.map((block) => {
        if (block.type === 'image') {
          return { inlineData: { mimeType: 'image/jpeg', data: block.source?.data || '' } };
        }
        return { text: block.text ?? '' };
      });
    }

    const geminiRes = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: geminiContent }],
          systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
          generationConfig: { maxOutputTokens: maxTokens },
        }),
      },
      30000,
    );

    if (geminiRes.ok) {
      const geminiData = await geminiRes.json();
      const text = geminiData?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
      return { text: text.trim(), provider: 'gemini', model: geminiModel };
    }

    const err = await geminiRes.text();
    throw new Error(`Gemini ${geminiRes.status}: ${err.slice(0, 200)}`);
  }

  throw new Error('All AI providers failed');
}

/**
 * Get the recommended model tier for a given task type.
 * @param {'screening'|'analysis'|'deep_analysis'} taskType
 * @returns {ModelTier}
 */
export function getTierForTask(taskType) {
  switch (taskType) {
    case 'screening':
      return 'economy'; // DeepSeek V4 Flash
    case 'analysis':
      return 'standard'; // GPT-4.1 Nano
    case 'deep_analysis':
      return 'premium'; // Claude Sonnet 4-6
    default:
      return 'economy';
  }
}
