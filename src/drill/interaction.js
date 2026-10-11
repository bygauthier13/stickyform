// Interaction sounds: what a hover, a selection or a keystroke plays.
// Pure planning (no audio): the engine turns the returned events into sound,
// quantised to the next sixteenth note of the running track.
//
// Rules: every option has one stable note in its own instrument; nothing sounds
// on keyboard focus; typing and pasting are rate-limited; deletions are silent;
// the "would you explore" question is strictly neutral (same timbre, same level).

import { BASSLINES, DRUMS, MELODIES } from './patterns.js';
import { SCALE_MIDI, chordAt, degreeOfChar, degreeToMidi, isChordTone, nearestChordTone, settle, vowelOfChar } from './theory.js';

const ui = (inst, step, extra = {}) => ({ layer: 'ui', part: 'ui', inst, step, vel: 0.7, ...extra });

/** The chord's root in the 808 register (F1 … E2). */
const bassRoot = (ch) => 29 + ((ch.root - 5 + 12) % 12);

// ------------------------------------------------------------------ hover

/**
 * One short note for hovering option `index` of question `qid`, fitted to the
 * chord sounding at `bar`. Same option → same instrument and same note on a given chord.
 */
export function hoverEvents(qid, index, bar = 0) {
  const ch = chordAt(bar);
  const tone = (m, lo = 0, hi = 127) => nearestChordTone(ch, m, lo, hi);
  const rootBass = bassRoot(ch);
  switch (qid) {
    case 'style': {
      const spec = [['glock', 84], ['piano', 65], ['pluck', 72], ['flute', 68]][index] || ['pluck', 72];
      return [ui(spec[0], 0, { midi: tone(spec[1]), dur: 2, vel: 0.5 })];
    }
    case 'colour': {
      const spec = [['piano', 56, 3], ['bell', 89, 3], ['pulse', 60, 1], ['acid', 65, 1]][index] || ['bell', 89, 2];
      return [ui(spec[0], 0, { midi: tone(spec[1]), dur: spec[2], vel: 0.5 })];
    }
    case 'where':
      return [[
        ui('808', 0, { midi: rootBass, dur: 3, vel: 0.42 }),
        ui('808', 0, { midi: rootBass, dur: 4, vel: 0.34 }),
        ui('808', 0, { midi: rootBass + 12, dur: 2, vel: 0.4 }),
        ui('808', 0, { midi: rootBass + 12, glideFrom: rootBass, dur: 3, vel: 0.4 }),
      ][index] || ui('808', 0, { midi: rootBass, dur: 2, vel: 0.4 })];
    case 'piece':
      return [[ui('snare', 0, { vel: 0.4 }), ui('rim', 0, { vel: 0.55 }), ui('hat', 0, { vel: 0.6 }), ui('perc', 0, { vel: 0.5 })][index] || ui('rim', 0)];
    case 'pace':
      return [ui('hat', 0, { vel: [0.4, 0.5, 0.6][index] ?? 0.5 })];
    case 'drop': {
      const spec = [['stab', null], ['piano', 53], ['vox', 68], ['bell', 87]][index] || ['bell', 87];
      if (spec[0] === 'stab') return [ui('stab', 0, { midi: [tone(56), tone(60), tone(65)], dur: 1, vel: 0.45 })];
      if (spec[0] === 'vox') return [ui('vox', 0, { midi: tone(spec[1]), vowel: 'oo', dur: 3, vel: 0.4 })];
      return [ui(spec[0], 0, { midi: tone(spec[1]), dur: 3, vel: 0.45 })];
    }
    case 'explore':
      // neutral: one timbre, one level, the chord's tones in option order
      return [ui('bell', 0, { midi: tone([77, 80, 84][index] ?? 80, 72, 89), dur: 2, vel: 0.42 })];
    case 'finish':
      return [[ui('kick', 0, { vel: 0.45 }), ui('bell', 0, { midi: tone(84), dur: 4, vel: 0.35 }), ui('hat', 0, { vel: 0.55 })][index] || ui('rim', 0)];
    default:
      return [];
  }
}

// --------------------------------------------------------------- selection

/** A short musical accent for selecting an option: a glimpse of what it adds. Steps from the next sixteenth. */
export function selectEvents(qid, optionId, bar = 0) {
  const ch = chordAt(bar);
  const fit = (m) => (isChordTone(ch, m) ? m : nearestChordTone(ch, m));
  switch (qid) {
    case 'style': {
      const mel = MELODIES[optionId];
      if (!mel) return [];
      return mel.notes.slice(0, 3).map(([step, dur, midi], i) => ui(mel.instrument, step - mel.notes[0][0], { midi: i === 0 ? fit(midi) : settle(ch, midi), dur: Math.min(dur, 3), vel: 0.62 }));
    }
    case 'colour': {
      const spec = { black: [['piano', 0, 56], ['piano', 2, 53]], ice: [['bell', 0, 89], ['bell', 3, 96]], blue: [['pulse', 0, 53], ['pulse', 2, 60], ['pulse', 4, 53]], lime: [['acid', 0, 65], ['acid', 3, 72], ['acid', 6, 68]] }[optionId] || [];
      return spec.map(([inst, step, midi]) => ui(inst, step, { midi: fit(midi), dur: 2, vel: 0.55 }));
    }
    case 'where': {
      const line = BASSLINES[optionId];
      if (!line) return [];
      const root = bassRoot(ch);
      const glide = line.notes.find((n) => n[3] != null);
      const up = glide ? glide[2] - glide[3] : 12;
      // the slide keeps the pattern's direction but always lands on a chord tone
      const target = nearestChordTone(ch, root + up, 29, 44);
      return [ui('kick', 0, { vel: 0.5 }), ui('808', 0, { midi: root, dur: 2, vel: 0.5 }), ui('808', 2, { midi: target === root ? root + 12 : target, glideFrom: root, dur: 3, vel: 0.5 })];
    }
    case 'piece': {
      const d = DRUMS[optionId];
      if (!d) return [];
      const second = { hoodie: 'snare', tee: 'rim', jacket: 'hat', cargo: 'perc' }[optionId];
      return [ui('kick', 0, { vel: 0.55 }), ui(second, 2, { vel: 0.55 }), ...(optionId === 'hoodie' ? [ui('clap', 2, { vel: 0.4 })] : [])];
    }
    case 'pace': {
      const n = { laidback: [0, 2], balanced: [0, 2 / 3, 4 / 3], high: [0, 0.5, 1, 1.5, 2, 2.5] }[optionId] || [0];
      return n.map((s, i) => ui('hat', s, { vel: 0.35 + 0.06 * i }));
    }
    case 'drop': {
      const spec = { design: ['stab'], comfort: ['piano', 53], quality: ['vox', 68], exclusivity: ['bell', 87] }[optionId];
      if (!spec) return [];
      if (spec[0] === 'stab') return [0, 3].map((s) => ui('stab', s, { midi: [fit(56), fit(60), fit(65)], dur: 1, vel: 0.5 }));
      if (spec[0] === 'vox') return [ui('vox', 0, { midi: fit(spec[1]), vowel: 'oo', dur: 4, vel: 0.45 })];
      return [ui(spec[0], 0, { midi: fit(spec[1]), dur: 3, vel: 0.5 }), ui(spec[0], 3, { midi: fit(spec[1] + 3), dur: 3, vel: 0.42 })];
    }
    case 'explore':
      // identical for every answer: no option is rewarded with a nicer sound
      return [ui('bell', 0, { midi: fit(80), dur: 2, vel: 0.45 })];
    case 'finish': {
      if (optionId === 'clean') return [ui('kick', 0, { vel: 0.55 }), ui('808', 0, { midi: bassRoot(ch), dur: 2, vel: 0.45 })];
      if (optionId === 'atmospheric') return [ui('swell', 0, { vel: 0.4, extra: { beats: 0.75 } }), ui('bell', 3, { midi: fit(84), dur: 4, vel: 0.35 })];
      if (optionId === 'high') return [0, 0.5, 1, 1.5].map((s, i) => ui('hat', s, { vel: 0.4 + 0.08 * i })).concat(ui('crash', 2, { vel: 0.3 }));
      return [];
    }
    default:
      return [];
  }
}


// ------------------------------------------------------------------ typing

/** What kind of change an input event made. */
export function classifyInput({ inputType = '', isComposing = false, before = '', after = '' }) {
  const added = after.length - before.length;
  if (inputType.startsWith('delete') || added <= 0) return { kind: 'silent', chars: '' };
  const fresh = after.slice(after.length - added);
  if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop' || inputType === 'insertReplacementText' || added > 2) return { kind: 'paste', chars: fresh };
  if (isComposing || inputType === 'insertCompositionText') return { kind: 'compose', chars: fresh.slice(-1) };
  return { kind: 'type', chars: fresh };
}

export const TYPING_RANGES = {
  energy: { inst: 'pluck', lo: 65, hi: 84 },
  energyTechnical: { inst: 'bell', lo: 72, hi: 89 },
  title: { inst: 'vox', lo: 63, hi: 77 },
};

/**
 * The musical decision for each keystroke: a free sixteenth-note slot and a note.
 * Deterministic: a character always maps to the same scale degree; on a beat the
 * note becomes the nearest chord tone, between beats it avoids a semitone clash.
 * At most one note per slot and `maxPerSecond` per second; pastes play a short
 * phrase (three notes at most) instead of a burst.
 */
export class TypingPlanner {
  constructor({ maxPerSecond = 8 } = {}) {
    this.maxPerSecond = maxPerSecond;
    this.reset();
  }

  reset() {
    this.used = new Set();
    this.times = [];
    this.prev = null;
  }

  _allowed(now) {
    this.times = this.times.filter((t) => t > now - 1);
    return this.times.length < this.maxPerSecond;
  }

  /**
   * @param {string} chars          characters to voice (one per note)
   * @param {'type'|'paste'|'compose'} kind
   * @param {(fromTime:number)=>{time:number, bar:number, step:number}|null} nextSlot  sixteenth-note grid of the transport
   * @param {number} now            audio-clock time
   * @param {{lo:number, hi:number}} range
   * @returns {Array<{time:number, bar:number, step:number, midi:number, vowel:string}>}
   */
  plan(chars, kind, nextSlot, now, range) {
    const letters = [...chars].filter((c) => c.trim());
    if (!letters.length) return [];
    const take = kind === 'paste' ? letters.slice(0, 3) : letters.slice(-1);
    const out = [];
    let from = now + 0.025;
    for (const c of take) {
      if (!this._allowed(now)) break;
      let slot = nextSlot(from);
      // the next free slot within ~0.3 s; a key with no free slot simply rests
      while (slot && this.used.has(`${slot.bar}:${slot.step}`) && slot.time < now + 0.32) slot = nextSlot(slot.time + 0.001);
      if (!slot || slot.time > now + 0.33) break;
      this.used.add(`${slot.bar}:${slot.step}`);
      if (this.used.size > 128) this.used = new Set([...this.used].slice(-64));
      const midi = this.noteFor(c, chordAt(slot.bar), slot.step % 4 === 0, range);
      this.times.push(now);
      out.push({ time: slot.time, bar: slot.bar, step: slot.step, midi, vowel: vowelOfChar(c) });
      from = slot.time + 0.001;
    }
    return out;
  }

  /** The note for one character over a chord. */
  noteFor(char, ch, strong, { lo, hi }) {
    const degree = degreeOfChar(char);
    // the octave of this degree nearest the previous typed note: typing moves like a melody
    const centre = this.prev ?? Math.round((lo + hi) / 2);
    let best = null;
    for (const base of [41, 53, 65, 77, 89]) {
      const m = degreeToMidi(degree, base);
      if (m < lo || m > hi) continue;
      if (best === null || Math.abs(m - centre) < Math.abs(best - centre)) best = m;
    }
    if (best === null) best = SCALE_MIDI.find((m) => m >= lo) ?? lo;
    let midi = strong ? nearestChordTone(ch, best, lo, hi) : settle(ch, best);
    if (midi < lo || midi > hi) midi = nearestChordTone(ch, Math.min(hi, Math.max(lo, midi)), lo, hi);
    this.prev = midi;
    return midi;
  }
}
