import { describe, it, expect } from 'vitest';
import { analyzeDangerPeriods, lookupRkdArtist } from '../src/provenance.js';

describe('analyzeDangerPeriods', () => {
  it('should detect WWII risk from keywords', () => {
    const periods = analyzeDangerPeriods('Forced sale', 'Jewish collection 1938', 'DE');
    const wwii = periods.find((p) => p.period === 'WWII');
    expect(wwii).toBeDefined();
    expect(wwii.risk).toBe('HIGH');
  });

  it('should detect WWII risk from seller country', () => {
    const periods = analyzeDangerPeriods('Painting', 'Old master', 'DE');
    const wwii = periods.find((p) => p.period === 'WWII');
    expect(wwii).toBeDefined();
    expect(wwii.risk).toBe('MEDIUM');
  });

  it('should return empty for non-dangerous listings', () => {
    const periods = analyzeDangerPeriods('Modern painting', 'Contemporary art', 'BE');
    expect(periods.length).toBe(0);
  });

  it('should detect church provenance', () => {
    const periods = analyzeDangerPeriods('Ex-collection church', 'Monastery provenance', 'BE');
    const frenchRev = periods.find((p) => p.period === 'French Revolution');
    expect(frenchRev).toBeDefined();
  });

  it('should detect Communist nationalisation for Eastern Europe', () => {
    const periods = analyzeDangerPeriods('Antique painting', 'Family heirloom', 'PL');
    const comm = periods.find((p) => p.period === 'Communist Nationalisation');
    expect(comm).toBeDefined();
  });
});

describe('lookupRkdArtist', () => {
  it('should find Rubens', () => {
    const result = lookupRkdArtist('rubens');
    expect(result.found).toBe(true);
    expect(result.artist.name).toBe('Peter Paul Rubens');
    expect(result.artist.rkd_url).toContain('research.rkd.nl');
  });

  it('should find Van Dyck with full name', () => {
    const result = lookupRkdArtist('anthony van dyck');
    expect(result.found).toBe(true);
    expect(result.artist.id).toBe(32439);
  });

  it('should return not found for unknown artists', () => {
    const result = lookupRkdArtist('Unknown Artist');
    expect(result.found).toBe(false);
    expect(result.search_links).toBeDefined();
  });

  it('should handle empty input', () => {
    const result = lookupRkdArtist('');
    expect(result.found).toBe(false);
  });
});
