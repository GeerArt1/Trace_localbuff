import { describe, it, expect } from 'vitest';
import { savedFindId } from '../src/saved-finds.js';

describe('savedFindId', () => {
  it('should produce consistent IDs for same URL', () => {
    const id1 = savedFindId('https://ebay.com/item/123');
    const id2 = savedFindId('https://ebay.com/item/123');
    expect(id1).toBe(id2);
  });

  it('should produce different IDs for different URLs', () => {
    const id1 = savedFindId('https://ebay.com/item/123');
    const id2 = savedFindId('https://ebay.com/item/456');
    expect(id1).not.toBe(id2);
  });

  it('should return 8-char hex strings', () => {
    const id = savedFindId('https://2dehands.be/art/12345');
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  it('should handle URLs with special characters', () => {
    const id = savedFindId('https://example.com/q=Rubens & Van Dyck');
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });
});
