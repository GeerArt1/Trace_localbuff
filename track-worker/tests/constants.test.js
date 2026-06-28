import { describe, it, expect } from 'vitest';
import { TARGET_ARTISTS, FALSE_POSITIVE_PATTERNS, TRIGGERS, ART_CONTEXT_KW, PAINTING_KW } from '../src/constants.js';

describe('TARGET_ARTISTS', () => {
  it('should include Rubens, Van Dyck and Jordaens', () => {
    expect(TARGET_ARTISTS).toContain('rubens');
    expect(TARGET_ARTISTS).toContain('van dyck');
    expect(TARGET_ARTISTS).toContain('jordaens');
  });

  it('should not be empty', () => expect(TARGET_ARTISTS.length).toBeGreaterThan(0));
});

describe('FALSE_POSITIVE_PATTERNS', () => {
  it('should include race car and toy patterns', () => {
    const hasF1 = FALSE_POSITIVE_PATTERNS.some((p) => p.includes('formule 1') || p.includes('schumacher'));
    expect(hasF1).toBe(true);
  });
});

describe('TRIGGERS', () => {
  it('should have misattribution triggers in all 5 languages', () => {
    expect(Object.keys(TRIGGERS.misattribution)).toEqual(['en', 'nl', 'fr', 'de', 'it']);
  });

  it('should have modelli triggers', () => {
    expect(TRIGGERS.modelli.en).toContain('bozzetto');
    expect(TRIGGERS.modelli.en).toContain('modello');
  });

  it('should have drawing triggers', () => {
    expect(TRIGGERS.drawing.en).toContain('red chalk');
  });

  it('should have plate triggers', () => {
    expect(TRIGGERS.plate.en).toContain('copper plate');
  });

  it('should have print triggers', () => {
    expect(TRIGGERS.print.en).toContain('etching');
  });
});

describe('PAINTING_KW', () => {
  it('should include Dutch and English oil painting phrases', () => {
    expect(PAINTING_KW).toContain('olieverf op doek');
    expect(PAINTING_KW).toContain('oil on canvas');
    expect(PAINTING_KW).toContain('huile sur toile');
  });
});

describe('ART_CONTEXT_KW', () => {
  it('should include art-related terms in multiple languages', () => {
    expect(ART_CONTEXT_KW).toContain('schilderij');
    expect(ART_CONTEXT_KW).toContain('painting');
    expect(ART_CONTEXT_KW).toContain('old master');
  });
});
