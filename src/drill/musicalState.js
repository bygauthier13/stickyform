// MusicalState — what the music is, independent of how it was decided.
//
// A plain, serialisable object. The survey's answers never reach the audio
// engine: the mapper turns answers into this state, and the engine, the
// offline renderer and the visuals only ever read this.

import { BPM, KEY } from './theory.js';

export const MAIN_LAYERS = ['atmosphere', 'melody', 'bass', 'drums', 'vocals'];

/**
 * @typedef {object} MusicalState
 * @property {number} version
 * @property {{tonic:string, mode:string, name:string, short:string}} key
 * @property {number} bpm
 * @property {Record<string, boolean>} layers   main layers that are playing
 * @property {string} melody      Q1 variation (always set: the default sounds until Q1 is validated)
 * @property {string|null} texture   Q2 (null until validated)
 * @property {string} bass        Q3 pattern
 * @property {string} drums       Q4 pattern
 * @property {object|null} energy Q5 motif {source, notes}
 * @property {string} pace        Q6
 * @property {string|null} counter Q7
 * @property {object|null} signature Q8 vocal-chop motif {source, notes}
 * @property {string} transition  Q9 style
 * @property {string} ending      Q10
 * @property {string} title       sanitised Q8 text, '' when skipped
 * @property {number} seed        humanisation seed (from the choices, never from free text)
 */

/** The state before any answer: the atmosphere alone. */
export function initialState() {
  return {
    version: 1,
    key: { ...KEY },
    bpm: BPM,
    layers: { atmosphere: true, melody: false, bass: false, drums: false, vocals: false },
    melody: 'minimal',
    texture: null,
    bass: 'everyday',
    drums: 'hoodie',
    energy: null,
    pace: 'balanced',
    counter: null,
    signature: null,
    transition: 'sweep',
    ending: 'clean',
    title: '',
    seed: 0x5eed,
  };
}

/** Which main layers are audible. */
export const activeLayers = (state) => MAIN_LAYERS.filter((l) => state.layers[l]);

/** A short stable string: two states with the same signature sound the same. */
export function stateSignature(state) {
  const motif = (m) => (m ? m.notes.map((n) => `${n.step}.${n.dur}.${n.degree}.${n.vowel || ''}`).join(',') : '-');
  return [
    activeLayers(state).join('+'),
    state.melody, state.texture || '-', state.bass, state.drums, state.pace, state.counter || '-',
    state.transition, state.ending, motif(state.energy), motif(state.signature),
  ].join('|');
}
