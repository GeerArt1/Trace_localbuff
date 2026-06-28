import { describe, it, expect, vi } from 'vitest';
import { getTierForTask, buildVisionContent } from '../src/ai.js';

describe('getTierForTask boundary cases', () => {
  it('should return economy for empty string', () => expect(getTierForTask('')).toBe('economy'));
  it('should return economy for nullish', () => expect(getTierForTask(undefined)).toBe('economy'));
  it('should differentiate between analysis and deep_analysis', () => {
    expect(getTierForTask('analysis')).not.toBe(getTierForTask('deep_analysis'));
  });
});

describe('buildVisionContent edge cases', () => {
  it('should handle empty text with valid image URL', () => {
    const result = buildVisionContent('', 'https://example.com/img.jpg');
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].type).toBe('image');
  });

  it('should handle null image URL gracefully', () => {
    const result = buildVisionContent('Just text', null);
    expect(typeof result).toBe('string');
    expect(result).toBe('Just text');
  });

  it('should handle undefined image URL', () => {
    const result = buildVisionContent('Text only', undefined);
    expect(typeof result).toBe('string');
  });
});
