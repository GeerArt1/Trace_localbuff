import { describe, it, expect } from 'vitest';
import { checkOeuvreMatch, OEUVRE_DATA } from '../src/oeuvre.js';

describe('checkOeuvreMatch', () => {
  it('should return null for non-matching text', () => {
    const result = checkOeuvreMatch('Random furniture listing', 'A nice chair', 'other', null);
    expect(result).toBeNull();
  });

  it('should match on medium keywords (oil on canvas = +30)', () => {
    const result = checkOeuvreMatch('Antique oil on canvas', 'Massacre of biblical scene', 'painting', null);
    // Medium match (+30) + subject hype ('massacre'): = 30 + 5 = 35 → < 50 → null
    expect(result).toBeNull();
  });

  it('should reach 50+ with medium match and multiple subject keywords', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, Massacre of the Innocents',
      'Herod children mothers biblical scene',
      'painting',
      null,
    );
    // Medium match 'oil on canvas' (+30)
    // Subject hits: massacre, innocents, herod, children, mothers, biblical = 6 × 5 = 30, plus 10 for >= 3 hits
    // Total: 30 + 30 + 10 = 70
    expect(result).not.toBeNull();
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.work.title).toContain('Massacre of the Innocents');
  });

  it('should detect APEX at score >= 70', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, Massacre of the Innocents',
      'Herod children mothers biblical scene herod',
      'painting',
      null,
    );
    // Medium match 'oil on canvas' (+30) + subject hits (massacre, innocents, herod, children, mothers, biblical) = 6×5=30 + bonus 10 = 40
    // Total: 30 + 30 + 10 = 70
    expect(result.apex).toBe(true);
  });

  it('should boost score with dimension match', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, Massacre of the Innocents',
      'Herod children mothers biblical scene',
      'painting',
      { w: 200, h: 270 },
    );
    // Medium: 30 + Subject: 30 + Bonus: 10 = 70 base
    // Dimensions: 200 vs work.dimensions.w=210 (ratio=0.048 < 0.15), 270 vs 280 (ratio=0.036 < 0.15)
    // W and H both within 15% → +30
    // Total: 70 + 30 = 100
    expect(result.score).toBe(100);
    expect(result.apex).toBe(true);
  });

  it('should award partial dimension match (one axis only) +10', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, Massacre of the Innocents',
      'Herod children mothers biblical scene',
      'painting',
      { w: 200, h: 100 }, // h=100 is way off from 280
    );
    // w: 200 vs 210 = 4.8% OK, h: 100 vs 280 = 64% NOT OK → partial match +10
    // Total: 70 + 10 = 80
    expect(result.score).toBe(80);
  });

  it('should match Van Dyck equestrian portrait by subject keywords', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, Equestrian portrait',
      'Charles I king of England on horse',
      'painting',
      null,
    );
    // Medium match: oil on canvas (+30)
    // Subject hits: equestrian, charles, king, england, horse, portrait = 6 × 5 = 30 + 10 bonus = 40
    // Total: 30 + 40 = 70
    expect(result).not.toBeNull();
    expect(result.work.title).toContain('Equestrian Portrait of Charles I');
  });

  it('should pick the best match among multiple works', () => {
    const result = checkOeuvreMatch('Sketch modello', 'Portrait of Maria de Medici queen of France', 'sketch', null);
    // Best match should be vandyck_medici_sketch (sketch medium + maria/medici/queen/france/portrait/sketch keywords)
    expect(result).not.toBeNull();
    expect(result.work.id).toBe('vandyck_medici_sketch');
  });

  it('should return null with inadequate subject hit count', () => {
    const result = checkOeuvreMatch('Old painting', 'Some artwork', 'painting', null);
    // Medium match: painting type matches (+20), but no subject keyword hits
    // Total: 20 < 50 → null
    expect(result).toBeNull();
  });

  it('should handle null dimensions gracefully', () => {
    const result = checkOeuvreMatch(
      'Oil on canvas, The Massacre',
      'innocents herod children mothers biblical',
      'painting',
      null,
    );
    // 30 (medium) + 5×5=25 + 10 bonus = 65
    expect(result).not.toBeNull();
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('should match Jordaens fertility allegory', () => {
    const result = checkOeuvreMatch(
      'Large oil on canvas',
      'Allegory of fertility abundance fruit figures mythological',
      'painting',
      { w: 190, h: 270 },
    );
    // Medium: oil on canvas (+30)
    // Subject: allegory, fertility, abundance, fruit, mythological = 5 × 5 = 25 + 10 = 35
    // Dimensions: w=190 vs 200 (5% OK), h=270 vs 280 (3.6% OK) → +30
    // Total: 30 + 35 + 30 = 95
    expect(result).not.toBeNull();
    expect(result.work.id).toBe('jordaens_fertility_large');
    expect(result.apex).toBe(true);
  });
});

describe('OEUVRE_DATA', () => {
  it('should contain Rubens, Van Dyck and Jordaens', () => {
    expect(Object.keys(OEUVRE_DATA)).toEqual(['rubens', 'van dyck', 'jordaens']);
  });

  it('should have Rubens with 133 unlocated works', () => {
    expect(OEUVRE_DATA.rubens.unlocated).toBe(133);
  });

  it('should have missing works for each artist', () => {
    expect(OEUVRE_DATA.rubens.missing_works.length).toBeGreaterThan(0);
    expect(OEUVRE_DATA['van dyck'].missing_works.length).toBeGreaterThan(0);
    expect(OEUVRE_DATA.jordaens.missing_works.length).toBeGreaterThan(0);
  });
});
