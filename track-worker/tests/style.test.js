import { describe, it, expect } from 'vitest';
import { getStyleData, STYLE_DATABASE } from '../src/style.js';

describe('getStyleData', () => {
  it('should return error when artist param is missing', () => {
    const result = getStyleData('');
    expect(result.found).toBe(false);
    expect(result.error).toBe('artist param required');
  });

  it('should return Rubens style periods', () => {
    const result = getStyleData('Rubens');
    expect(result.found).toBe(true);
    expect(result.artist).toBe('Rubens');
    expect(result.periods.early.period).toBe('1600–1608');
    expect(result.periods.peak.period).toBe('1610–1628');
    expect(result.periods.late.period).toBe('1630–1640');
  });

  it('should be case-insensitive', () => {
    const lower = getStyleData('rubens');
    const upper = getStyleData('RUBENS');
    const mixed = getStyleData('rUbEnS');
    expect(lower.found).toBe(true);
    expect(upper.found).toBe(true);
    expect(mixed.found).toBe(true);
    expect(lower.artist).toBe('Rubens');
  });

  it('should handle "Van Dyck" with capital letters', () => {
    const result = getStyleData('Van Dyck');
    expect(result.found).toBe(true);
    expect(result.artist).toBe('Van Dyck');
    expect(result.periods.early.period).toBe('1615–1621');
    expect(result.periods.italian.period).toBe('1621–1627');
    expect(result.periods.english.period).toBe('1632–1641');
  });

  it('should handle lowercase "van dyck"', () => {
    const result = getStyleData('van dyck');
    expect(result.found).toBe(true);
    expect(result.artist).toBe('Van Dyck');
  });

  it('should return Jordaens style periods', () => {
    const result = getStyleData('jordaens');
    expect(result.found).toBe(true);
    expect(result.periods.mature.period).toBe('1625–1650');
    expect(result.periods.late.period).toBe('1650–1678');
  });

  it('should return not found for unknown artist', () => {
    const result = getStyleData('Rembrandt');
    expect(result.found).toBe(false);
    expect(result.available).toContain('Rubens');
    expect(result.available).toContain('Van Dyck');
    expect(result.available).toContain('Jordaens');
  });
});

describe('STYLE_DATABASE', () => {
  it('should have the three tracked artists', () => {
    expect(Object.keys(STYLE_DATABASE)).toEqual(['Rubens', 'Van Dyck', 'Jordaens']);
  });

  it('Rubens should have 3 periods', () => {
    expect(Object.keys(STYLE_DATABASE.Rubens)).toHaveLength(3);
  });

  it('Van Dyck should have 3 periods (early, italian, english)', () => {
    expect(Object.keys(STYLE_DATABASE['Van Dyck'])).toHaveLength(3);
  });

  it('Jordaens should have 3 periods (early, mature, late)', () => {
    expect(Object.keys(STYLE_DATABASE.Jordaens)).toHaveLength(3);
  });

  it('each period should have characteristics', () => {
    for (const [artist, periods] of Object.entries(STYLE_DATABASE)) {
      for (const [period, data] of Object.entries(periods)) {
        expect(data.characteristics.length).toBeGreaterThan(0);
      }
    }
  });
});
