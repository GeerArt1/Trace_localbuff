import { describe, it, expect } from 'vitest';
import { hashString, clamp, levelRank, escapeMarkdown, stripHtml, decodeHtml } from '../src/utils.js';

describe('hashString', () => {
  it('should produce consistent 8-char hex for same input', () => {
    const h1 = hashString('test-url-123');
    const h2 = hashString('test-url-123');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(8);
  });

  it('should produce different hashes for different inputs', () => {
    const h1 = hashString('hello');
    const h2 = hashString('world');
    expect(h1).not.toBe(h2);
  });

  it('should handle empty strings', () => {
    const h = hashString('');
    expect(h).toHaveLength(8);
  });
});

describe('clamp', () => {
  it('should return value within range', () => expect(clamp(5, 1, 10)).toBe(5));
  it('should return min if below range', () => expect(clamp(0, 1, 10)).toBe(1));
  it('should return max if above range', () => expect(clamp(20, 1, 10)).toBe(10));
});

describe('levelRank', () => {
  it('should rank APEX as 4', () => expect(levelRank('APEX')).toBe(4));
  it('should rank CRITICAL as 3', () => expect(levelRank('CRITICAL')).toBe(3));
  it('should rank PRIORITY as 2', () => expect(levelRank('PRIORITY')).toBe(2));
  it('should rank WATCH as 1', () => expect(levelRank('WATCH')).toBe(1));
  it('should rank unknown as 0', () => expect(levelRank('CLEAR')).toBe(0));
});

describe('escapeMarkdown', () => {
  it('should escape special characters', () => {
    expect(escapeMarkdown('Hello *World*')).toBe('Hello \\*World\\*');
  });
  it('should handle empty string', () => expect(escapeMarkdown('')).toBe(''));
});

describe('stripHtml', () => {
  it('should remove HTML tags', () => expect(stripHtml('<p>Hello</p>')).toBe('Hello'));
  it('should handle empty', () => expect(stripHtml('')).toBe(''));
});

describe('decodeHtml', () => {
  it('should decode HTML entities', () => {
    expect(decodeHtml('Olijverf &amp; paneel')).toBe('Olijverf & paneel');
  });
});
