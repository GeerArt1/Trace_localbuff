/**
 * TRACK Worker v2.2 — Alert Scoring Engine
 *
 * Media type classification, alert scoring (WATCH/PRIORITY/CRITICAL/APEX),
 * false-positive filtering, and item enrichment pipeline.
 */

import {
  TARGET_ARTISTS,
  FALSE_POSITIVE_PATTERNS,
  FALSE_POSITIVE_WORDS,
  ART_CONTEXT_KW,
  NON_ART_CONTEXT_KW,
  TRIGGERS,
  PAINTING_KW,
  TAPESTRY_KW,
  BOOK_KW,
  SKETCH_KW,
} from './constants.js';
import { levelRank } from './utils.js';
import { checkOeuvreMatch } from './oeuvre.js';
import { analyzeDangerPeriods } from './provenance.js';

/** Flatten all trigger phrases for a category across languages */
function flatTriggers(category) {
  return Object.values(TRIGGERS[category]).flat();
}

/**
 * Classify the media type of an item based on title, description, and aspects.
 * @param {string} title - Item title
 * @param {string} description - Item description
 * @param {Array} [aspects] - eBay localized aspects
 * @returns {string} Media type: 'plate'|'book'|'sketch'|'drawing'|'print'|'painting'|'tapestry'|'other'
 */
export function classifyMedia(title, description, aspects) {
  const text = [title, description, ...(aspects || []).map((a) => `${a.name} ${a.value}`)].join(' ').toLowerCase();

  if (flatTriggers('plate').some((kw) => text.includes(kw))) return 'plate';
  if (BOOK_KW.some((kw) => text.includes(kw))) return 'book'; // book before sketch — "esquisses de Rubens" is a catalogue
  if (flatTriggers('modelli').some((kw) => text.includes(kw))) return 'sketch';
  if (SKETCH_KW.some((kw) => text.includes(kw))) return 'sketch';
  if (flatTriggers('drawing').some((kw) => text.includes(kw))) return 'drawing';
  if (flatTriggers('print').some((kw) => text.includes(kw))) return 'print';
  if (PAINTING_KW.some((kw) => text.includes(kw))) return 'painting';
  if (TAPESTRY_KW.some((kw) => text.includes(kw))) return 'tapestry';
  return 'other';
}

/**
 * Score an item's alert level based on content analysis.
 * @param {string} mediaType - Classified media type
 * @param {string} title - Item title
 * @param {string} description - Item description
 * @param {Array} [aspects] - eBay localized aspects
 * @returns {{level: string, reasons: string[]}} Alert level and reasons
 */
export function scoreAlert(mediaType, title, description, aspects) {
  const text = [title, description, ...(aspects || []).map((a) => `${a.name} ${a.value}`)].join(' ').toLowerCase();

  // False-positive check
  if (FALSE_POSITIVE_PATTERNS.some((p) => text.includes(p)) || FALSE_POSITIVE_WORDS.some((r) => r.test(text))) {
    return { level: 'CLEAR', reasons: ['False positive — non-art item'] };
  }

  if (mediaType === 'book') {
    return { level: 'CLEAR', reasons: ['Book or catalogue — excluded from alert scoring'] };
  }

  const reasons = [];
  let score = 0;

  if (mediaType === 'plate') {
    return { level: 'CRITICAL', reasons: ['Original printing plate — highest value category'] };
  }

  const artistHit = TARGET_ARTISTS.find((a) => text.includes(a));
  if (artistHit) {
    const hasArtKw = ART_CONTEXT_KW.some((kw) => text.includes(kw));
    if (!hasArtKw && NON_ART_CONTEXT_KW.some((kw) => text.includes(kw))) {
      return { level: 'CLEAR', reasons: ['False positive — artist name in non-art context'] };
    }
    if (mediaType === 'other' && !hasArtKw) {
      return { level: 'CLEAR', reasons: ['No art context keywords — classified as non-art'] };
    }
    score = Math.max(score, 1);
    reasons.push(`Artist mention: ${artistHit}`);
  }

  if (mediaType === 'sketch') {
    score = Math.max(score, 1);
    reasons.push('Modello/oil sketch — highest per-cm value');
    if (artistHit) {
      score = 2;
      reasons.push('Modello attributed to target artist — CRITICAL');
    }
  }

  if (mediaType === 'drawing') {
    const flemish = ['flemish', 'vlaams', 'flamand', 'flämisch', 'fiammingo', 'vlaamse'].some((kw) =>
      text.includes(kw),
    );
    if (flemish) {
      score = Math.max(score, 1);
      reasons.push('Flemish drawing');
    }
  }

  if (mediaType === 'print') {
    const firstState = ['first state', 'eerste staat', 'premier état', 'erster zustand', 'primo stato'].some((kw) =>
      text.includes(kw),
    );
    if (firstState) {
      score = Math.max(score, 1);
      reasons.push('First state print');
    }
  }

  const misattrMatches = flatTriggers('misattribution').filter((kw) => text.includes(kw));
  if (misattrMatches.length > 0) {
    reasons.push(`Misattribution signal: ${misattrMatches.slice(0, 2).join(', ')}`);
    if (score < 1 && artistHit) score = 1;
  }

  const allTriggers = Object.values(TRIGGERS).flatMap((cat) => Object.values(cat).flat());
  const anyHit = allTriggers.find((kw) => text.includes(kw));
  if (anyHit && reasons.length === 0) {
    reasons.push(`Trigger phrase: "${anyHit}"`);
  }

  if (reasons.length === 0) reasons.push('Search term match');

  const levels = ['WATCH', 'PRIORITY', 'CRITICAL'];
  return { level: levels[score], reasons };
}

/**
 * Enrich a raw marketplace item with media type, alert level, danger periods,
 * and oeuvre match data.
 * @param {Object} item - Raw item from any marketplace source
 * @returns {Object} Enriched item with alert, media_type, danger_periods, oeuvre_match
 */
export function enrichItem(item) {
  const searchText = [item.title, item.description].join(' ').toLowerCase();
  const has_art_context = ART_CONTEXT_KW.some((kw) => searchText.includes(kw));
  let mediaType = classifyMedia(item.title, item.description, item.localizedAspects);

  // eBay category override: "Books" category always beats text classification
  const ebayCategories = (item.categories || []).join(' ').toLowerCase();
  if (mediaType !== 'plate' && /\bbooks?\b/.test(ebayCategories)) {
    mediaType = 'book';
  }

  let alert = scoreAlert(mediaType, item.title, item.description, item.localizedAspects);

  const priceNum = parseFloat(item.price?.value) || null;
  if (alert.level !== 'CLEAR' && priceNum !== null && priceNum < 50 && !has_art_context) {
    alert = { level: 'CLEAR', reasons: ['Price below €50 with no art context'] };
  }

  const danger_periods = analyzeDangerPeriods(item.title, item.description, item.location);

  // Oeuvre match check
  let oeuvre_match = null;
  if (alert.level !== 'CLEAR') {
    oeuvre_match = checkOeuvreMatch(item.title, item.description || '', mediaType, null);
    if (oeuvre_match?.apex) {
      alert = {
        level: 'APEX',
        reasons: [
          `⚡ POSSIBLE MISSING WORK MATCH (score ${oeuvre_match.score}) — ${oeuvre_match.work.title}`,
          ...alert.reasons,
        ],
      };
    } else if (oeuvre_match) {
      alert.reasons.push(`Oeuvre match possible (score ${oeuvre_match.score}): ${oeuvre_match.work.title}`);
    }
  }

  return {
    ...item,
    media_type: mediaType,
    has_art_context,
    alert,
    danger_periods,
    oeuvre_match,
  };
}
