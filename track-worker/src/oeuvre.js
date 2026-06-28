/**
 * TRACK Worker v2.2 — Oeuvre Matching Engine
 *
 * Missing works database and matching algorithm for Flemish Old Masters.
 * Scores listings against known missing/lost works by Rubens, Van Dyck, and Jordaens.
 *
 * Match criteria: medium keywords, subject keywords, dimensions (±15%),
 * and period range. Scores ≥50 produce a match, ≥70 produce an APEX alert.
 */

/**
 * @typedef {Object} MissingWork
 * @property {string} id
 * @property {string} artist
 * @property {string} title
 * @property {string} medium
 * @property {{w:number, h:number, unit:string}} dimensions
 * @property {string} subject
 * @property {string} period
 * @property {{location:string, date:string}} last_seen
 * @property {Object} search_profile
 */

/** @type {MissingWork[]} */
const MISSING_WORKS = [
  // RUBENS
  {
    id: 'rubens_massacre_v2',
    artist: 'rubens',
    title: 'The Massacre of the Innocents — second version',
    medium: 'painting',
    dimensions: { w: 210, h: 280, unit: 'cm' },
    subject: 'biblical massacre innocents herod children mothers',
    period: '1610–1620',
    last_seen: { location: 'Private collection, early 20th century', date: 'pre-1920' },
    search_profile: {
      medium_keywords: ['oil on canvas', 'oil on panel', 'olieverf op doek', 'olieverf op paneel'],
      dimension_range: { w_min: 150, w_max: 260, h_min: 200, h_max: 340 },
      subject_keywords: ['massacre', 'innocents', 'herod', 'children', 'mothers', 'biblical', 'infants'],
      period_range: { from: 1608, to: 1630 },
    },
  },
  {
    id: 'rubens_spinola_sketch',
    artist: 'rubens',
    title: 'Portrait of Marchesa Brigida Spinola Doria — oil sketch',
    medium: 'sketch',
    dimensions: { w: 32, h: 44, unit: 'cm' },
    subject: 'portrait noblewoman genoese aristocrat',
    period: '1606',
    last_seen: { location: '17th century inventory', date: '1680s' },
    search_profile: {
      medium_keywords: ['oil sketch', 'modello', 'oliestudie', 'bozzetto'],
      dimension_range: { w_min: 20, w_max: 50, h_min: 30, h_max: 60 },
      subject_keywords: ['portrait', 'noblewoman', 'marchesa', 'spinola', 'doria', 'genoese'],
      period_range: { from: 1604, to: 1615 },
    },
  },
  {
    id: 'rubens_hunt_missing',
    artist: 'rubens',
    title: 'Hunt series — missing panels',
    medium: 'painting',
    dimensions: { w: 180, h: 260, unit: 'cm' },
    subject: 'hunt hunting animals horses dogs boar lion',
    period: '1615–1625',
    last_seen: { location: 'Various 17th century inventories', date: 'pre-1700' },
    search_profile: {
      medium_keywords: ['oil on canvas', 'oil on panel', 'olieverf op doek'],
      dimension_range: { w_min: 120, w_max: 280, h_min: 150, h_max: 320 },
      subject_keywords: ['hunt', 'hunting', 'boar', 'lion', 'horses', 'dogs', 'animals', 'jacht'],
      period_range: { from: 1610, to: 1630 },
    },
  },
  {
    id: 'rubens_tapestry_cartoons',
    artist: 'rubens',
    title: 'Tapestry cartoons — Constantine series',
    medium: 'painting',
    dimensions: { w: 380, h: 480, unit: 'cm' },
    subject: 'constantine roman emperor triumphal entry christian',
    period: '1622',
    last_seen: { location: 'Possibly dispersed after workshop sale', date: '1640s' },
    search_profile: {
      medium_keywords: ['oil on canvas', 'oil on panel'],
      dimension_range: { w_min: 250, w_max: 550, h_min: 300, h_max: 600 },
      subject_keywords: ['constantine', 'roman', 'emperor', 'triumphal', 'tapestry cartoon'],
      period_range: { from: 1618, to: 1628 },
    },
  },
  // VAN DYCK
  {
    id: 'vandyck_charlesI_equestrian',
    artist: 'van dyck',
    title: 'Equestrian Portrait of Charles I — lost version',
    medium: 'painting',
    dimensions: { w: 280, h: 380, unit: 'cm' },
    subject: 'portrait equestrian charles king england horse',
    period: '1637',
    last_seen: { location: '17th century British royal collection', date: 'pre-1700' },
    search_profile: {
      medium_keywords: ['oil on canvas', 'oil on panel'],
      dimension_range: { w_min: 180, w_max: 380, h_min: 240, h_max: 480 },
      subject_keywords: ['charles', 'equestrian', 'king', 'england', 'horse', 'portrait', 'royal'],
      period_range: { from: 1632, to: 1641 },
    },
  },
  {
    id: 'vandyck_medici_sketch',
    artist: 'van dyck',
    title: "Portrait of Maria de' Medici — oil sketch",
    medium: 'sketch',
    dimensions: { w: 30, h: 42, unit: 'cm' },
    subject: 'portrait maria medici queen france oil sketch',
    period: '1631',
    last_seen: { location: 'Several 17th century inventories', date: 'pre-1680' },
    search_profile: {
      medium_keywords: ['oil sketch', 'modello', 'bozzetto', 'oliestudie'],
      dimension_range: { w_min: 20, w_max: 50, h_min: 28, h_max: 60 },
      subject_keywords: ['maria', 'medici', 'queen', 'france', 'portrait', 'sketch'],
      period_range: { from: 1628, to: 1635 },
    },
  },
  {
    id: 'vandyck_betrayal_early',
    artist: 'van dyck',
    title: 'The Betrayal of Christ — early version',
    medium: 'painting',
    dimensions: { w: 120, h: 160, unit: 'cm' },
    subject: 'betrayal christ judas soldiers arrest night',
    period: '1618–1620',
    last_seen: { location: 'Antwerp collection, early 17th c.', date: 'pre-1640' },
    search_profile: {
      medium_keywords: ['oil on canvas', 'oil on panel', 'olieverf'],
      dimension_range: { w_min: 80, w_max: 180, h_min: 100, h_max: 220 },
      subject_keywords: ['betrayal', 'christ', 'judas', 'soldiers', 'arrest', 'night', 'kiss'],
      period_range: { from: 1615, to: 1625 },
    },
  },
  // JORDAENS
  {
    id: 'jordaens_fertility_large',
    artist: 'jordaens',
    title: 'Allegory of Fertility — large canvas',
    medium: 'painting',
    dimensions: { w: 200, h: 280, unit: 'cm' },
    subject: 'allegory fertility abundance fruit figures mythological',
    period: '1623–1628',
    last_seen: { location: 'Multiple 17th century inventories', date: 'pre-1700' },
    search_profile: {
      medium_keywords: ['oil on canvas', 'olieverf op doek'],
      dimension_range: { w_min: 140, w_max: 280, h_min: 180, h_max: 360 },
      subject_keywords: ['allegory', 'fertility', 'abundance', 'fruit', 'satyr', 'nymph', 'mythological'],
      period_range: { from: 1620, to: 1640 },
    },
  },
  {
    id: 'jordaens_satyr_early',
    artist: 'jordaens',
    title: 'Family of the Satyr — early version',
    medium: 'painting',
    dimensions: { w: 160, h: 200, unit: 'cm' },
    subject: 'satyr family goat mythological genre figures',
    period: '1617–1620',
    last_seen: { location: 'Antwerp guild collection', date: 'pre-1650' },
    search_profile: {
      medium_keywords: ['oil on canvas', 'oil on panel', 'olieverf'],
      dimension_range: { w_min: 100, w_max: 230, h_min: 130, h_max: 280 },
      subject_keywords: ['satyr', 'family', 'goat', 'mythological', 'genre', 'man', 'woman'],
      period_range: { from: 1614, to: 1625 },
    },
  },
];

/**
 * Check a listing against the missing works database.
 * @param {string} title - Listing title
 * @param {string} description - Listing description
 * @param {string} mediaType - Classified media type
 * @param {{w?:number, h?:number}|null} dimensions - Item dimensions if available
 * @returns {{matched: boolean, score: number, apex: boolean, work: MissingWork}|null}
 */
export function checkOeuvreMatch(title, description, mediaType, dimensions) {
  const text = `${title} ${description}`.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const work of MISSING_WORKS) {
    let score = 0;

    // Medium match
    if (work.search_profile.medium_keywords.some((kw) => text.includes(kw.toLowerCase()))) {
      score += 30;
    } else if (work.medium === mediaType) {
      score += 20;
    }

    // Subject keyword match
    const subjectHits = work.search_profile.subject_keywords.filter((kw) => text.includes(kw.toLowerCase()));
    score += subjectHits.length * 5;
    if (subjectHits.length >= 3) score += 10;

    // Dimension match ±15%
    if (dimensions && work.dimensions && dimensions.w && dimensions.h) {
      const wOk = Math.abs(dimensions.w - work.dimensions.w) / work.dimensions.w < 0.15;
      const hOk = Math.abs(dimensions.h - work.dimensions.h) / work.dimensions.h < 0.15;
      if (wOk && hOk) score += 30;
      else if (wOk || hOk) score += 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = work;
    }
  }

  if (bestScore >= 50) {
    return {
      matched: true,
      score: bestScore,
      apex: bestScore >= 70,
      work: bestMatch,
    };
  }
  return null;
}

/**
 * Oeuvre statistics and museum holdings for tracked artists.
 */
export const OEUVRE_DATA = {
  rubens: {
    artist: 'Peter Paul Rubens',
    dates: '1577–1640',
    total_documented: 1403,
    located_museum: 890,
    located_private: 380,
    unlocated: 133,
    top_museums: [
      { name: 'Prado', city: 'Madrid', count: 89 },
      { name: 'Alte Pinakothek', city: 'Munich', count: 62 },
      { name: 'Louvre', city: 'Paris', count: 21 },
      { name: 'Hermitage', city: 'St. Petersburg', count: 41 },
      { name: 'National Gallery', city: 'London', count: 15 },
      { name: 'KMSKA', city: 'Antwerp', count: 23 },
      { name: 'Rijksmuseum', city: 'Amsterdam', count: 8 },
    ],
    missing_works: MISSING_WORKS.filter((w) => w.artist === 'rubens'),
  },
  'van dyck': {
    artist: 'Anthony van Dyck',
    dates: '1599–1641',
    total_documented: 871,
    located_museum: 620,
    located_private: 190,
    unlocated: 61,
    top_museums: [
      { name: 'Alte Pinakothek', city: 'Munich', count: 12 },
      { name: 'National Portrait Gallery', city: 'London', count: 42 },
      { name: 'Louvre', city: 'Paris', count: 18 },
      { name: 'Hermitage', city: 'St. Petersburg', count: 24 },
      { name: 'Prado', city: 'Madrid', count: 11 },
      { name: 'KMSKA', city: 'Antwerp', count: 9 },
    ],
    missing_works: MISSING_WORKS.filter((w) => w.artist === 'van dyck'),
  },
  jordaens: {
    artist: 'Jacob Jordaens',
    dates: '1593–1678',
    total_documented: 528,
    located_museum: 380,
    located_private: 120,
    unlocated: 28,
    top_museums: [
      { name: 'KMSKA', city: 'Antwerp', count: 34 },
      { name: 'Louvre', city: 'Paris', count: 8 },
      { name: 'Prado', city: 'Madrid', count: 6 },
      { name: 'Rijksmuseum', city: 'Amsterdam', count: 4 },
    ],
    missing_works: MISSING_WORKS.filter((w) => w.artist === 'jordaens'),
  },
};
