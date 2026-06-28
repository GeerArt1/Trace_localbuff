import { describe, it, expect } from 'vitest';
import { buildVisionContent, getTierForTask, toOpenAIFormat } from '../src/ai.js';

describe('buildVisionContent', () => {
  it('should return plain text when no image URL', () => {
    const result = buildVisionContent('Analyze this', null);
    expect(result).toBe('Analyze this');
  });

  it('should return array with image and text when URL provided', () => {
    const result = buildVisionContent('Analyze this', 'https://example.com/img.jpg');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('image');
    expect(result[0].source.url).toBe('https://example.com/img.jpg');
    expect(result[1].text).toBe('Analyze this');
  });

  it('should handle empty text', () => {
    const result = buildVisionContent('', 'https://example.com/img.jpg');
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].type).toBe('image');
  });
});

describe('getTierForTask', () => {
  it('should return economy for screening', () => expect(getTierForTask('screening')).toBe('economy'));
  it('should return standard for analysis', () => expect(getTierForTask('analysis')).toBe('standard'));
  it('should return premium for deep_analysis', () => expect(getTierForTask('deep_analysis')).toBe('premium'));
  it('should default to economy for unknown tasks', () => expect(getTierForTask('unknown')).toBe('economy'));
});

describe('toOpenAIFormat', () => {
  it('should return plain text as-is', () => {
    const result = toOpenAIFormat('Just text');
    expect(result).toBe('Just text');
  });

  it('should convert Anthropic image blocks to OpenAI format', () => {
    const input = [
      { type: 'image', source: { type: 'url', url: 'https://img.jpg' } },
      { type: 'text', text: 'Analyze this' },
    ];
    const result = toOpenAIFormat(input);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('image_url');
    expect(result[0].image_url.url).toBe('https://img.jpg');
    expect(result[1].type).toBe('text');
    expect(result[1].text).toBe('Analyze this');
  });

  it('should handle empty array', () => {
    expect(toOpenAIFormat([])).toEqual([]);
  });

  it('should handle blocks with missing source', () => {
    const input = [{ type: 'image', source: {} }];
    const result = toOpenAIFormat(input);
    expect(result[0].image_url.url).toBe('');
  });

  it('should handle mixed content types', () => {
    const input = [
      { type: 'text', text: 'Hello' },
      { type: 'image', source: { url: 'img.jpg' } },
      { type: 'text', text: 'World' },
    ];
    const result = toOpenAIFormat(input);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('text');
    expect(result[1].type).toBe('image_url');
    expect(result[2].type).toBe('text');
  });
});
