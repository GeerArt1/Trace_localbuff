import { describe, it, expect } from 'vitest';
import { scoreProvenanceRisk } from '../src/saved-finds.js';

// ── Helper to build a partial result object ──
function result(overrides = {}) {
  return {
    risk_score: 0,
    risk_level: 'LOW',
    danger_period_overlaps: [],
    gaps: [],
    ...overrides,
  };
}

// ── Base / Empty inputs ─────────────────────────────────────────────────────

describe('scoreProvenanceRisk — base cases', () => {
  it('should return score 0 and unchanged LOW level with no signals', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(result(), 'A nice painting', 'Belgium');
    expect(risk_score).toBe(0);
    expect(risk_level).toBe('LOW');
  });

  it('should handle empty description and no seller location', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(result(), '', '');
    expect(risk_score).toBe(0);
    expect(risk_level).toBe('LOW');
  });

  it('should handle undefined seller location', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A painting');
    expect(risk_score).toBe(0);
  });

  it('should handle null result fields gracefully', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      { risk_score: 0, risk_level: 'LOW', danger_period_overlaps: null, gaps: null },
      'A painting',
      'France',
    );
    expect(risk_score).toBe(0);
    expect(risk_level).toBe('LOW');
  });

  it('should include baseline risk_score from AI', () => {
    const { risk_score } = scoreProvenanceRisk(result({ risk_score: 10 }), 'A painting', 'France');
    expect(risk_score).toBe(10);
  });
});

// ── Danger period overlaps ──────────────────────────────────────────────────

describe('scoreProvenanceRisk — danger period overlaps', () => {
  it('should add 25 points for a single danger period overlap', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({ danger_period_overlaps: ['WWII Nazi occupation 1940–1945'] }),
      'A painting described as Nazi loot',
      'Netherlands',
    );
    expect(risk_score).toBe(25);
    expect(risk_level).toBe('MEDIUM'); // 25 >= 25 and was LOW → MEDIUM
  });

  it('should add 50 points for two danger period overlaps', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945', 'Communist nationalisations 1945–1989'],
      }),
      'A painting',
      'Netherlands',
    );
    expect(risk_score).toBe(50);
    expect(risk_level).toBe('HIGH');
  });

  it('should add 75 points for three danger period overlaps', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: [
          'Napoleonic requisitions 1794–1815',
          'WWII Nazi occupation 1940–1945',
          'Communist nationalisations 1945–1989',
        ],
      }),
      'Oil on canvas',
      'Netherlands',
    );
    expect(risk_score).toBe(75);
    expect(risk_level).toBe('HIGH');
  });

  it('should handle empty danger_period_overlaps array', () => {
    const { risk_score } = scoreProvenanceRisk(result({ danger_period_overlaps: [] }), 'A painting', 'France');
    expect(risk_score).toBe(0);
  });
});

// ── Gaps ────────────────────────────────────────────────────────────────────

describe('scoreProvenanceRisk — gaps', () => {
  it('should add 10 points for a single gap', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({ gaps: ['No provenance between 1938 and 1945'] }),
      'A painting',
      'Netherlands',
    );
    expect(risk_score).toBe(10);
    expect(risk_level).toBe('LOW'); // 10 < 25, no upgrade
  });

  it('should add 20 points for two gaps', () => {
    const { risk_score } = scoreProvenanceRisk(
      result({
        gaps: ['Gap between 1940–1945', 'No records before 1950'],
      }),
      'A painting',
      'France',
    );
    expect(risk_score).toBe(20);
  });

  it('should combine gaps with danger periods', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
        gaps: ['No provenance 1938–1948'],
      }),
      'A painting',
      'Netherlands',
    );
    expect(risk_score).toBe(35); // 25 + 10
    expect(risk_level).toBe('MEDIUM'); // 35 >= 25 and was LOW → MEDIUM
  });
});

// ── Church / Monastery keywords ─────────────────────────────────────────────

describe('scoreProvenanceRisk — church/monastery detection', () => {
  it('should detect "church" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A painting from a church in Brugge', 'Belgium');
    expect(risk_score).toBe(15);
  });

  it('should detect "monastery" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'Monastery inventory, 17th century', 'Italy');
    expect(risk_score).toBe(15);
  });

  it('should detect "klooster" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'Uit het klooster van Sint-Bernardus', 'Belgium');
    expect(risk_score).toBe(15);
  });

  it('should detect "abdij" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'Afkomstig uit abdij van Grimbergen', 'Belgium');
    expect(risk_score).toBe(15);
  });

  it('should detect "kerk" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'De kerk van Antwerpen, 18e eeuw', 'Belgium');
    expect(risk_score).toBe(15);
  });

  it('should be case insensitive', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A Monastery painting from 1640', 'Austria');
    expect(risk_score).toBe(15);
  });

  it('should NOT trigger on non-matching words', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'Painting purchaser was very happy', 'France');
    expect(risk_score).toBe(0);
  });
});

// ── Eastern Europe / German signals ─────────────────────────────────────────

describe('scoreProvenanceRisk — Eastern Europe / German signals', () => {
  it('should detect "germany" in seller location', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A painting', 'Berlin, Germany');
    expect(risk_score).toBe(15);
  });

  it('should detect "poland" in seller location', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A painting', 'Warsaw, Poland');
    expect(risk_score).toBe(15);
  });

  it('should detect "czech" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'From a Czech private collection, Prague 1920s', '');
    expect(risk_score).toBe(15);
  });

  it('should detect "hungary" in seller location', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A painting', 'Budapest, Hungary');
    expect(risk_score).toBe(15);
  });

  it('should detect "romania" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'Romanian princely collection, 19th century', '');
    expect(risk_score).toBe(15);
  });

  it('should detect "eastern europe" in description', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'Acquired from an Eastern European noble family', '');
    expect(risk_score).toBe(15);
  });

  it('should be case insensitive for German signals', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A painting', 'Munich, GERMANY');
    expect(risk_score).toBe(15);
  });

  it('should NOT add eastern europe bonus for neutral locations like France', () => {
    const { risk_score } = scoreProvenanceRisk(result(), 'A painting', 'Paris, France');
    expect(risk_score).toBe(0);
  });
});

// ── Risk level upgrades ────────────────────────────────────────────────────

describe('scoreProvenanceRisk — risk level upgrades', () => {
  it('should upgrade LOW to MEDIUM at score >= 25', () => {
    const { risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
      }),
      'A painting',
      'Netherlands',
    );
    expect(risk_level).toBe('MEDIUM');
  });

  it('should upgrade LOW to HIGH at score >= 50', () => {
    const { risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945', 'Communist nationalisations 1945–1989'],
      }),
      'A painting',
      'Netherlands',
    );
    expect(risk_level).toBe('HIGH');
  });

  it('should keep MEDIUM at score 25-49 (no upgrade needed)', () => {
    const { risk_level } = scoreProvenanceRisk(
      {
        risk_score: 0,
        risk_level: 'MEDIUM',
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
        gaps: [],
      },
      'A painting',
      'Netherlands',
    );
    // 25 points from danger period, was MEDIUM already → stays MEDIUM
    expect(risk_level).toBe('MEDIUM');
  });

  it('should keep HIGH at score >= 50 when already HIGH', () => {
    const { risk_level } = scoreProvenanceRisk(
      {
        risk_score: 0,
        risk_level: 'HIGH',
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
        gaps: [],
      },
      'A painting',
      'Netherlands',
    );
    // 25 points, was HIGH already → stays HIGH (HIGH guard: score >= 50 check fails)
    expect(risk_level).toBe('HIGH');
  });

  it('should keep HIGH at score >= 50 when already HIGH (at or above 50)', () => {
    const { risk_level } = scoreProvenanceRisk(
      {
        risk_score: 0,
        risk_level: 'HIGH',
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945', 'Communist nationalisations 1945–1989'],
      },
      'A painting',
      'Netherlands',
    );
    // 50 points, was HIGH already → stays HIGH (risk_level !== 'HIGH' guard)
    expect(risk_level).toBe('HIGH');
  });

  it('should keep LOW at score < 25', () => {
    const { risk_level } = scoreProvenanceRisk(result({ gaps: ['Single gap'] }), 'A painting', 'France');
    expect(risk_level).toBe('LOW'); // 10 < 25, no upgrade
  });

  it('should handle undefined risk_level defaulting to LOW', () => {
    const { risk_level } = scoreProvenanceRisk(
      {
        risk_score: 0,
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
        gaps: [],
      },
      'A painting',
      'Netherlands',
    );
    expect(risk_level).toBe('MEDIUM');
  });
});

// ── Combined / Realistic scenarios ──────────────────────────────────────────

describe('scoreProvenanceRisk — realistic scenarios', () => {
  it('Nazi-looted painting from church in Poland — should be HIGH', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945'],
        gaps: ['Missing provenance 1939–1946'],
      }),
      'Church painting from Polish monastery, 15th century',
      'Krakow, Poland',
    );
    // 25 (danger) + 10 (gap) + 15 (monastery) + 15 (poland in location) = 65
    expect(risk_score).toBe(65);
    expect(risk_level).toBe('HIGH');
  });

  it('French painting with no red flags — should stay LOW', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result(),
      'Portrait of a lady, signed by the artist, framed, from a French estate',
      'Paris, France',
    );
    expect(risk_score).toBe(0);
    expect(risk_level).toBe('LOW');
  });

  it('Two danger periods + eastern europe without gaps — should be HIGH', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: ['WWII Nazi occupation 1940–1945', 'Communist nationalisations 1945–1989'],
      }),
      'Family heirloom from a Romanian collection',
      'Bucharest',
    );
    // 50 (2× danger) + 15 (romania in desc) = 65
    expect(risk_score).toBe(65);
    expect(risk_level).toBe('HIGH');
  });

  it('Baseline 20 plus one gap — should upgrade LOW→MEDIUM at score 30', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({ risk_score: 20, gaps: ['Unverified 19th century history'] }),
      'Beautiful landscape',
      'Italy',
    );
    // 20 (baseline) + 10 (gap) = 30, was LOW → MEDIUM
    expect(risk_score).toBe(30);
    expect(risk_level).toBe('MEDIUM');
  });

  it('Baseline 5 plus one gap — stays LOW at score 15', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({ risk_score: 5, gaps: ['Unverified 19th century history'] }),
      'Beautiful landscape',
      'Italy',
    );
    // 5 (baseline) + 10 (gap) = 15
    expect(risk_score).toBe(15);
    expect(risk_level).toBe('LOW');
  });

  it('Single danger period plus neutral location — should be MEDIUM', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: ['French Revolution 1789–1799'],
      }),
      'Abbey inventory from French Revolution period',
      'Lyon, France',
    );
    // 25 (danger) — "Abbey" doesn't match church/monastery/klooster/abdij/kerk pattern
    expect(risk_score).toBe(25);
    expect(risk_level).toBe('MEDIUM');
  });

  it('All signals combined — maximum risk scenario', () => {
    const { risk_score, risk_level } = scoreProvenanceRisk(
      result({
        danger_period_overlaps: [
          'Napoleonic requisitions 1794–1815',
          'WWII Nazi occupation 1940–1945',
          'Communist nationalisations 1945–1989',
        ],
        gaps: ['Missing records 1794–1815', 'Lost provenance 1939–1950'],
      }),
      'Monastery painting from a klooster in Czech Republic, abbey collections',
      'Prague, Germany',
    );
    // 75 (3× danger) + 20 (2× gaps) + 15 (monastery/klooster) + 15 (czech/germany) = 125
    expect(risk_score).toBe(125);
    expect(risk_level).toBe('HIGH');
  });
});
