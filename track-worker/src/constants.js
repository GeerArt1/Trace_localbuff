/**
 * TRACK Worker v2.2 — Shared Constants
 *
 * Target artists, false-positive patterns, multilingual trigger phrases,
 * and media classification keywords.
 */

export const TOKEN_KEY = 'ebay_access_token';
export const TOKEN_TTL_BUFFER_S = 60;

export const TARGET_ARTISTS = [
  'rubens',
  'van dyck',
  'vandyck',
  'jordaens',
  'bruegel',
  'brueghel',
  'teniers',
  'snyders',
  'de vos',
  'jan brueghel',
  'david teniers',
  'peter paul',
  'pieter paul',
  'anthony van',
];

export const FALSE_POSITIVE_PATTERNS = [
  'barrichello',
  'schumacher',
  'formule 1',
  'formula 1',
  'formula one',
  'f2000',
  'grand prix',
  'coureur',
  'racepak',
  'fankaart',
  'f1 card',
  'honkbalpet',
  'handtekening foto',
  'handtekening kaart',
  'signed card',
  'helmets',
  'fornuis',
  'kookplaat',
  'oven',
  'ketel',
  'pop ',
  'poppen',
  'speelgoed',
  'toy store',
  'barn door',
  'showroom model',
  'machine onderdeel',
  'apparaat',
];

export const FALSE_POSITIVE_WORDS = [/\bf1\b/i, /\bpet\b/i, /\bcap\b/i, /\bhelm\b/i, /\bpop\b/i, /\btoy\b/i];

export const ART_CONTEXT_KW = [
  'schilderij',
  'doek',
  'paneel',
  'olieverf',
  'olio su',
  'canvas',
  'painting',
  'oil on',
  'artwork',
  'tekening',
  'drawing',
  'ets',
  'engraving',
  'gravure',
  'aquarel',
  'watercolour',
  'watercolor',
  'pastel',
  'gouache',
  'lithograph',
  'litho',
  'old master',
  'oud meester',
  'flemish',
  'vlaams',
  'baroque',
  'barok',
  'print',
  'sketch',
  'modello',
  'bozzetto',
  'dessin',
  'gravure',
];

export const NON_ART_CONTEXT_KW = [
  'fornuis',
  'kookplaat',
  'oven',
  'ketel',
  'pop',
  'poppen',
  'speelgoed',
  'toy',
  'barn',
  'showroom',
  'machine',
  'apparaat',
  'merk',
  'brand name',
  'modelnummer',
  'model nr',
];

export const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'nl,fr;q=0.9,en;q=0.8,de;q=0.7',
};

/**
 * Multilingual trigger phrases organised by category and language.
 * Used for misattribution detection, modelli/sketch classification,
 * drawing, print, and printing plate identification.
 */
export const TRIGGERS = {
  misattribution: {
    en: [
      'flemish school',
      'circle of',
      'attributed to',
      'workshop of',
      'follower of',
      'style of',
      'after',
      'old master',
      'manner of',
    ],
    nl: [
      'vlaamse school',
      'toegeschreven aan',
      'kring van',
      'atelier van',
      'oud meester',
      'navolger van',
      'olieverf op paneel',
      'olieverf op doek',
    ],
    fr: [
      'école flamande',
      'attribué à',
      'entourage de',
      'cercle de',
      'maître ancien',
      'suiveur de',
      'huile sur panneau',
      'huile sur toile',
    ],
    de: [
      'flämische schule',
      'kreis des',
      'werkstatt von',
      'zugeschrieben',
      'umkreis von',
      'alter meister',
      'nachfolger',
      'art des',
    ],
    it: [
      'scuola fiamminga',
      'cerchia di',
      'bottega di',
      'attribuito a',
      'seguace di',
      'antico maestro',
      'maniera di',
      'ambito di',
    ],
  },
  modelli: {
    en: [
      'oil sketch',
      'bozzetto',
      'modello',
      'compositional study',
      'study for',
      'sketch for',
      'preparatory sketch',
      'première pensée',
    ],
    nl: ['oliestudie', 'olieverfschets', 'compositiestudie', 'voorontwerp'],
    fr: ['esquisse', 'modello', 'étude préparatoire', 'esquisse pour', 'première pensée', 'bozzetto'],
    de: ['ölskizze', 'bozzetto', 'kompositionsstudie', 'vorstudie', 'entwurfsskizze'],
    it: ['bozzetto', 'modello', 'studio preparatorio', 'schizzo compositivo', 'prima idea'],
  },
  drawing: {
    en: ['chalk drawing', 'red chalk', 'black chalk', 'pen and ink', 'old master drawing', 'figure study'],
    nl: ['krijttekening', 'penseeltekening', 'studietekening', 'rode krijt', 'zwart krijt'],
    fr: ['dessin ancien', 'sanguine', 'lavis', 'crayon', 'dessin préparatoire'],
    de: ['zeichnung', 'kreidezeichnung', 'rötelzeichnung', 'alte zeichnung', 'handzeichnung'],
    it: ['disegno antico', 'sanguigna', 'matita rossa', 'disegno preparatorio'],
  },
  print: {
    en: ['etching', 'engraving', 'first state', 'early state', 'old master print'],
    nl: ['ets', 'gravure', 'prent', 'eerste staat', 'vroege druk'],
    fr: ['gravure', 'eau-forte', 'premier état', 'épreuve ancienne'],
    de: ['radierung', 'kupferstich', 'erster zustand', 'früher druck'],
    it: ['acquaforte', 'incisione', 'primo stato', 'prova antica'],
  },
  plate: {
    en: ['copper plate', 'printing plate', 'original plate', 'copperplate matrix', 'copper matrix'],
    nl: ['etsplaat', 'drukplaat', 'koperen plaat'],
    fr: ['planche originale', 'matrice', 'cuivre imprimé'],
    de: ['druckplatte', 'kupferplatte', 'originalplatte'],
    it: ['lastra originale', 'matrice in rame'],
  },
};

export const PAINTING_KW = [
  'olieverf op doek',
  'olieverf op paneel',
  'olieverf op koper',
  'oil on canvas',
  'oil on panel',
  'oil on copper',
  'huile sur toile',
  'huile sur panneau',
  'ölgemälde',
  'olio su tela',
  'olio su tavola',
];

export const TAPESTRY_KW = ['tapestry', 'tapisserie', 'wandtapijt', 'tapijt', 'gobelin'];

export const BOOK_KW = [
  'catalogue',
  'cataloog',
  'catalogus',
  'livro',
  'livre',
  'buch',
  'boek',
  'taschen',
  'english edition',
  'art book',
  'kunstboek',
  'kunsthistorische',
  'uitgave',
  'édition',
  'publication',
];

export const SKETCH_KW = ['schets', 'oliestudie'];
