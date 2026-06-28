/**
 * TRACK Worker v2.2 — Style Database
 *
 * Period characteristics for Flemish Old Masters (Rubens, Van Dyck, Jordaens).
 * Used for comparative style analysis and forensic attribution support.
 */

/**
 * @typedef {Object} StylePeriod
 * @property {string} period - Date range
 * @property {string} label - Human-readable label
 * @property {string[]} characteristics - Style descriptors
 */

/**
 * @type {Object<string, {early: StylePeriod, [key:string]: StylePeriod}>}
 */
export const STYLE_DATABASE = {
  Rubens: {
    early: {
      period: '1600–1608',
      label: 'Italiaanse periode',
      characteristics: [
        'Sterke Italiaanse invloed — Titiaan en Caravaggio',
        'Donkerdere achtergronden, koelere kleurtonen',
        'Strakker minder vrij penseelwerk',
        'Minder monumentale figuren dan later werk',
        'Invloed van de Contrareformatie iconografie',
      ],
    },
    peak: {
      period: '1610–1628',
      label: 'Antwerpse hoogtepunt',
      characteristics: [
        'Monumentale volle figuren, dramatisch licht',
        'Warm kleurpalet: karmijn, oker, ivoor vleestinten',
        'Virtuoos los penseelwerk in achtergronden',
        'Diagonale composities, dynamische energie',
        'Meest gekopieerd door atelier — goed onderscheiden',
      ],
    },
    late: {
      period: '1630–1640',
      label: 'Laat werk',
      characteristics: [
        'Vrijer, losser penseelwerk, atmosferischer',
        'Zachtere kleuren, meer grijstonen',
        'Landschappen dominanter, intiem karakter',
        "Kleinere formaten, persoonlijker thema's",
        'Minder contrast dan het hoogtepunt',
      ],
    },
  },
  'Van Dyck': {
    early: {
      period: '1615–1621',
      label: 'Rubens atelierperiode',
      characteristics: [
        'Rubens invloed duidelijk zichtbaar',
        'Donkerder, dramatischer, zware draperingen',
        'Hoge technische kwaliteit van jonge meester',
      ],
    },
    italian: {
      period: '1621–1627',
      label: 'Italiaanse periode',
      characteristics: [
        'Venetiaanse invloed — Titiaan en Giorgione',
        'Elegantere, slankere figuren',
        'Koelere, zilveren kleurtonen',
      ],
    },
    english: {
      period: '1632–1641',
      label: 'Engelse hofperiode',
      characteristics: [
        'Hoogste elegantie, aristocratische distantie',
        'Zijden draperingen, zilverige lichtval',
        'Portretkunst als psychologisch document',
      ],
    },
  },
  Jordaens: {
    early: {
      period: '1615–1625',
      label: 'Vroeg werk',
      characteristics: [
        'Caravaggio invloed, sterke tenebristische contrasten',
        'Volkse figuren, donkere achtergronden',
        'Hoge technische kwaliteit',
      ],
    },
    mature: {
      period: '1625–1650',
      label: 'Hoogtepunt',
      characteristics: [
        'Warme kleuren, uitbundige composities',
        'Mythologische en genre scènes, spreekwoorden',
        'Rijke details, humor en vitaliteit',
      ],
    },
    late: {
      period: '1650–1678',
      label: 'Laat werk',
      characteristics: [
        'Meer decoratief, minder kracht',
        'Herhaling van succesvolle composities',
        "Protestant geworden — allegorische thema's",
      ],
    },
  },
};

/**
 * Get style data for a given artist.
 * @param {string} artist - Artist name
 * @returns {{found: boolean, artist?: string, periods?: Object, available?: string[], note?: string}}
 */
export function getStyleData(artist) {
  if (!artist) return { found: false, error: 'artist param required' };

  // Normalize: capitalize first letter of each word, lowercase the rest
  // e.g. "van dyck" → "Van Dyck", "RUBENS" → "Rubens"
  const key = artist
    .split(/(\s+)/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
  const data = STYLE_DATABASE[key];

  if (!data) {
    return {
      found: false,
      available: Object.keys(STYLE_DATABASE),
      note: `Style database not available for "${artist}"`,
    };
  }

  return { found: true, artist: key, periods: data };
}
