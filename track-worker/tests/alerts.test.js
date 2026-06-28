import { describe, it, expect } from 'vitest';
import { classifyMedia, scoreAlert, enrichItem } from '../src/alerts.js';

describe('classifyMedia', () => {
  const emptyAspects = [];

  it('should classify oil paintings', () => {
    expect(classifyMedia('Oil on canvas', 'Beautiful painting', emptyAspects)).toBe('painting');
  });

  it('should classify sketches', () => {
    expect(classifyMedia('Oil sketch', 'Modello of composition', emptyAspects)).toBe('sketch');
    expect(classifyMedia('Bozzetto', 'Italian sketch', emptyAspects)).toBe('sketch');
  });

  it('should classify prints', () => {
    expect(classifyMedia('Old master print', 'Engraving 17th century', emptyAspects)).toBe('print');
  });

  it('should classify plates', () => {
    expect(classifyMedia('Copper plate', 'Original printing plate', emptyAspects)).toBe('plate');
  });

  it('should classify books', () => {
    expect(classifyMedia('Rubens catalogue', '', emptyAspects)).toBe('book');
  });

  it('should return other for unknown', () => {
    expect(classifyMedia('Random item', 'Some description', emptyAspects)).toBe('other');
  });

  it('should classify drawings', () => {
    expect(classifyMedia('Red chalk drawing', 'Figure study', emptyAspects)).toBe('drawing');
  });

  it('should classify tapestries', () => {
    expect(classifyMedia('Flemish tapestry', 'Wandtapijt 17e eeuw', emptyAspects)).toBe('tapestry');
  });
});

describe('scoreAlert', () => {
  const emptyAspects = [];

  it('should return CLEAR for false positive patterns', () => {
    const result = scoreAlert('other', 'F1 race car helmet', '', emptyAspects);
    expect(result.level).toBe('CLEAR');
  });

  it('should return WATCH or higher for artist mentions with art context', () => {
    const result = scoreAlert('painting', 'Rubens oil on canvas', 'Beautiful Flemish painting', emptyAspects);
    expect(result.level).not.toBe('CLEAR');
  });

  it('should return CRITICAL for plates', () => {
    const result = scoreAlert('plate', 'Copper printing plate', '', emptyAspects);
    expect(result.level).toBe('CRITICAL');
  });

  it('should return CLEAR for books', () => {
    const result = scoreAlert('book', 'Art catalogue', 'Rubens publication', emptyAspects);
    expect(result.level).toBe('CLEAR');
  });

  it('should include reasons', () => {
    const result = scoreAlert('plate', 'Copper plate', 'Original 17th century', emptyAspects);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

describe('enrichItem', () => {
  it('should add media_type, alert, and danger_periods', () => {
    const item = {
      title: 'Oil on canvas, attributed to Rubens',
      description: 'Flemish old master painting',
      price: { value: '15000', currency: 'EUR' },
      source: 'ebay',
      categories: ['Art'],
    };
    const enriched = enrichItem(item);
    expect(enriched).toHaveProperty('media_type');
    expect(enriched).toHaveProperty('alert');
    expect(enriched).toHaveProperty('danger_periods');
    expect(enriched).toHaveProperty('has_art_context');
    expect(enriched.media_type).toBe('painting');
  });

  it('should handle items with no description', () => {
    const item = {
      title: 'Vintage chair',
      description: '',
      price: { value: '100', currency: 'EUR' },
      source: '2dehands',
    };
    const enriched = enrichItem(item);
    expect(enriched.media_type).toBe('other');
  });

  it('should detect misattribution signals', () => {
    const item = {
      title: 'Circle of Rubens',
      description: 'Flemish school 17th century oil on panel',
      price: { value: '5000', currency: 'EUR' },
      source: 'ebay',
    };
    const enriched = enrichItem(item);
    expect(enriched.alert.reasons.some((r) => r.toLowerCase().includes('misattrib'))).toBe(true);
  });
});
