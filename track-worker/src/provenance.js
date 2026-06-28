/**
 * TRACK Worker v2.2 — Provenance Analysis
 *
 * Danger period detection (WWII, French Revolution, Napoleonic, Communist)
 * and RKD (Netherlands Institute for Art History) artist lookup.
 */

/**
 * Analyze potential provenance risk periods based on listing text and seller location.
 * @param {string} title - Item title
 * @param {string} description - Item description
 * @param {string} sellerCountry - Seller's country code
 * @returns {Array<{period: string, risk: string, note: string, links?: string[]}>}
 */
export function analyzeDangerPeriods(title, description, sellerCountry) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  const cc = (sellerCountry || '').toUpperCase();
  const periods = [];

  const wwiiKw = [
    'forced sale',
    'jewish collection',
    'zwangsverkauf',
    'err looting',
    '1933',
    '1940',
    '1941',
    '1942',
    '1943',
    '1944',
    '1945',
  ];
  const wwiiCC = ['DE', 'AT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG'];
  if (wwiiKw.some((k) => text.includes(k)) || wwiiCC.includes(cc)) {
    periods.push({
      period: 'WWII',
      risk: wwiiKw.some((k) => text.includes(k)) ? 'HIGH' : 'MEDIUM',
      note: 'Provenance gap risk: Nazi occupation 1940–1945. Check: Art Loss Register · ERR database (errproject.org) · lostart.de',
      links: ['https://www.artloss.com', 'https://errproject.org', 'https://www.lostart.de'],
    });
  }

  const revolKw = [
    'church provenance',
    'monastery',
    'religious house',
    'ex-collection church',
    'chapelle',
    'abdij',
    'klooster',
    'abbaye',
  ];
  if (revolKw.some((k) => text.includes(k))) {
    periods.push({
      period: 'French Revolution',
      risk: 'MEDIUM',
      note: 'Provenance gap risk: French Revolutionary confiscations 1789–1799. Many Flemish church works dispersed.',
    });
  }

  if (
    cc === 'FR' &&
    ['flemish', 'vlaams', 'flamand', 'antwerp', 'brussels', 'bruges', 'gent', 'brugge'].some((k) => text.includes(k))
  ) {
    periods.push({
      period: 'Napoleonic',
      risk: 'LOW',
      note: 'Possible Napoleonic requisition 1794–1815. Verify pre-1794 Belgian provenance.',
    });
  }

  const eastCC = ['PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'LT', 'LV', 'EE'];
  if (eastCC.includes(cc)) {
    periods.push({
      period: 'Communist Nationalisation',
      risk: 'MEDIUM',
      note: 'Possible post-war nationalisation 1945–1989. Verify pre-1945 private ownership chain.',
    });
  }

  return periods;
}

/**
 * Built-in RKD artist reference data for known Flemish Old Masters.
 */
const RKD_KNOWN_ARTISTS = {
  rubens: {
    id: 64180,
    name: 'Peter Paul Rubens',
    born: '1577',
    died: '1640',
    nationality: 'Flemish',
    wikidata: 'Q5599',
  },
  'peter paul rubens': {
    id: 64180,
    name: 'Peter Paul Rubens',
    born: '1577',
    died: '1640',
    nationality: 'Flemish',
    wikidata: 'Q5599',
  },
  'van dyck': {
    id: 32439,
    name: 'Anthony van Dyck',
    born: '1599',
    died: '1641',
    nationality: 'Flemish',
    wikidata: 'Q150679',
  },
  'anthony van dyck': {
    id: 32439,
    name: 'Anthony van Dyck',
    born: '1599',
    died: '1641',
    nationality: 'Flemish',
    wikidata: 'Q150679',
  },
  jordaens: {
    id: 40767,
    name: 'Jacob Jordaens',
    born: '1593',
    died: '1678',
    nationality: 'Flemish',
    wikidata: 'Q335882',
  },
  'jacob jordaens': {
    id: 40767,
    name: 'Jacob Jordaens',
    born: '1593',
    died: '1678',
    nationality: 'Flemish',
    wikidata: 'Q335882',
  },
  bruegel: {
    id: 2655,
    name: 'Pieter Bruegel de Oude',
    born: 'c.1525',
    died: '1569',
    nationality: 'Flemish',
    wikidata: 'Q43270',
  },
  'jan brueghel': {
    id: 2656,
    name: 'Jan Brueghel de Oude',
    born: '1568',
    died: '1625',
    nationality: 'Flemish',
    wikidata: 'Q439189',
  },
  teniers: {
    id: 75897,
    name: 'David Teniers de Jonge',
    born: '1610',
    died: '1690',
    nationality: 'Flemish',
    wikidata: 'Q335979',
  },
  snyders: {
    id: 72920,
    name: 'Frans Snyders',
    born: '1579',
    died: '1657',
    nationality: 'Flemish',
    wikidata: 'Q556906',
  },
};

/**
 * Look up an artist in the built-in RKD reference data.
 * @param {string} name - Artist name
 * @returns {{found: boolean, artist?: Object, note?: string, search_links?: Object}}
 */
export function lookupRkdArtist(name) {
  const key = (name || '').toLowerCase().trim();
  const known = RKD_KNOWN_ARTISTS[key];

  if (known) {
    return {
      found: true,
      artist: {
        ...known,
        rkd_url: `https://research.rkd.nl/en/detail/https://data.rkd.nl/artists/${known.id}`,
        wikidata_url: `https://www.wikidata.org/wiki/${known.wikidata}`,
        search_url: `https://research.rkd.nl/en/search/artists?q=${encodeURIComponent(name)}`,
      },
    };
  }

  return {
    found: false,
    note: 'Artist not in primary target list.',
    search_links: {
      rkd: `https://research.rkd.nl/en/search/artists?q=${encodeURIComponent(name)}`,
      wikidata: `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(name)}`,
      getty_ulan: `https://www.getty.edu/vow/ULANServlet?english=N&find=${encodeURIComponent(name)}&role=&page=1`,
    },
  };
}
