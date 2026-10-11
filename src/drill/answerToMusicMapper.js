// AnswerToMusicMapper — survey answers → MusicalState. Pure and deterministic.
//
// Two rules:
//   • a choice is heard as soon as it is selected when its layer is already
//     playing (e.g. changing the pace re-shapes the hats from the next bar);
//   • a layer or part *enters* only when its question is validated (Continue).
// Nothing regresses: going back never removes a layer.
// Free text is turned into notes here and nowhere else; it never leaves the device.

import { initialState } from './musicalState.js';
import {
  BASSLINES, COLOUR_TEXTURE, COUNTERS, DEFAULT_ENERGY, DEFAULT_SIGNATURE, DEFAULT_TRANSITION, DROP_COUNTER, DRUMS, ENDINGS,
  EXPLORE_TRANSITION, MELODIES, PACES, SIGNATURE_RHYTHMS, TEXTURES, TRANSITIONS,
} from './patterns.js';
import { hashString, sanitizeText, textMotif } from './theory.js';

const pick = (table, key, fallback) => (key && Object.prototype.hasOwnProperty.call(table, key) ? key : fallback);

/** The motif for the energy words, or the default one (skipped / no letters). */
export function energyMotif(text) {
  return textMotif(sanitizeText(text, 60), { salt: 'energy' }) || DEFAULT_ENERGY;
}

/** The vocal-chop signature for the title, or the default one. */
export function signatureMotif(text) {
  return textMotif(sanitizeText(text, 32), { salt: 'signature', rhythms: SIGNATURE_RHYTHMS, maxNotes: 4 }) || DEFAULT_SIGNATURE;
}

/**
 * @param {Record<string, string>} answers   question id → option id or text
 * @param {Iterable<string>} validated       ids of questions submitted with Continue (or Skip)
 * @returns {import('./musicalState.js').MusicalState}
 */
export function mapAnswers(answers = {}, validated = []) {
  const done = new Set(validated);
  const s = initialState();

  s.melody = pick(MELODIES, answers.style, s.melody);
  s.bass = pick(BASSLINES, answers.where, s.bass);
  s.drums = pick(DRUMS, answers.piece, s.drums);
  s.pace = pick(PACES, answers.pace, s.pace);
  s.transition = pick(TRANSITIONS, EXPLORE_TRANSITION[answers.explore], DEFAULT_TRANSITION);
  s.ending = pick(ENDINGS, answers.finish, s.ending);

  s.layers.melody = done.has('style');
  s.layers.bass = done.has('where');
  s.layers.drums = done.has('piece');
  s.layers.vocals = done.has('title');

  if (done.has('colour')) s.texture = pick(TEXTURES, COLOUR_TEXTURE[answers.colour], null);
  if (done.has('energy')) s.energy = energyMotif(answers.energy);
  if (done.has('drop')) s.counter = pick(COUNTERS, DROP_COUNTER[answers.drop], null);
  if (done.has('title')) s.signature = signatureMotif(answers.title);
  s.title = sanitizeText(answers.title, 32);

  // humanisation seed: from the choices only — never from what people typed, and never from
  // the "would you explore" answer, so that answer changes nothing but the transition style
  const choices = ['style', 'colour', 'where', 'piece', 'pace', 'drop', 'finish'].map((k) => answers[k] || '-').join('|');
  s.seed = hashString(choices);
  return s;
}

/** Plain-language description of a finished state, for the results screen. */
export function describe(state) {
  return {
    key: 'F minor',
    tempo: `${state.bpm} BPM`,
    melody: MELODIES[state.melody].label,
    texture: state.texture ? TEXTURES[state.texture].label : '—',
    bass: BASSLINES[state.bass].label,
    drums: DRUMS[state.drums].label,
    pace: PACES[state.pace].label,
    counter: state.counter ? COUNTERS[state.counter].label : '—',
    motif: state.energy ? (state.energy.source === 'text' ? 'From your three words' : 'Default motif') : '—',
    vocals: state.signature ? (state.signature.source === 'text' ? 'Chop signature from your title' : 'Default chop signature') : '—',
    transition: TRANSITIONS[state.transition].label,
    ending: ENDINGS[state.ending].label,
  };
}
