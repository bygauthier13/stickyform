// The typing instrument: every keystroke becomes a note that belongs to the music.
//
// Three rules make a typed note sound "composed" rather than triggered:
//   1. Time    – it lands on the next sixteenth-note slot of the live bar grid
//                (swing included), so typing plays rhythmically in time.
//   2. Pitch   – it comes from the key and the chord sounding at that moment:
//                chord tones on the beat, other scale tones between beats that
//                don't grate against the chord.
//   3. Company – it avoids a semitone or a tritone against whatever the melody
//                is playing at that instant, and it moves like a melody does
//                (mostly steps, the odd leap, never a long run of one pitch).
//
// The note choice and the slot choice are pure functions of their inputs, so
// they are tested in plain Node without any audio.

import * as S from './synth.js';
import { SCALE, clashes, hashString, midiToHz, mulberry32 } from './theory.js';

export const RANGE = { lo: 62, hi: 86, centre: 74 };

/** Interval class (0–6): how many semitones apart, ignoring octaves and direction. */
const ic = (a, b) => {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
};

/** When sixteenth-note `step` of a scheduled bar sounds (the same formula the layers use). */
export const slotTime = (entry, step) => entry.t0 + (step + (step & 1 ? entry.swing : 0)) * entry.stepDur;

/**
 * The next free sixteenth-note slot at least `minLead` seconds from now.
 * Returns null when none is free within `maxAhead` (very fast typing: the key is let go).
 *
 * @param {Array<{bar:number,t0:number,stepDur:number,swing:number}>} timeline  scheduled bars, ascending
 * @param {number} now   audio-clock time
 * @param {Set<string>} used  slots already taken
 */
export function nextSlot(timeline, now, used, { minLead = 0.03, maxAhead = 0.36 } = {}) {
  for (const entry of timeline) {
    for (let step = 0; step < 16; step++) {
      const time = slotTime(entry, step);
      if (time < now + minLead) continue;
      if (time > now + maxAhead) return null;
      const key = `${entry.bar}:${step}`;
      if (used.has(key)) continue;
      return { time, step, entry, key };
    }
  }
  return null;
}

/** Melody notes still sounding at `time`. */
export function soundingAt(timeline, time) {
  const out = [];
  for (const e of timeline) for (const n of e.sounding || []) if (n.t <= time + 0.005 && time < n.t + n.dur) out.push(n.midi);
  return out;
}

/**
 * Choose the pitch for one keystroke.
 *
 * @param {object} o
 * @param {object} o.chord      the chord sounding in the target slot
 * @param {boolean} o.strong    the slot is on a beat → chord tones only
 * @param {number|null} o.prev  the previous typed note, for melodic movement
 * @param {number} o.repeats    how many times in a row `prev` has already sounded
 * @param {number[]} o.sounding melody notes sounding in the slot
 * @param {string} o.char       the key pressed (it seeds the choice, so the same text plays the same tune)
 * @param {number} o.count      how many notes have been typed so far
 */
export function pickTypedNote({ chord, strong, prev = null, repeats = 0, sounding = [], char = 'a', count = 0, lo = RANGE.lo, hi = RANGE.hi }) {
  const inRange = SCALE.filter((m) => m >= lo && m <= hi);
  const fits = (m) => (strong ? chord.pcs.includes(m % 12) : !clashes(chord, m));
  let pool = inRange.filter(fits);
  const polite = pool.filter((m) => sounding.every((s) => ic(m, s) !== 1 && ic(m, s) !== 6));
  if (polite.length) pool = polite;
  if (!pool.length) pool = inRange.filter((m) => chord.pcs.includes(m % 12));

  const weight = (m) => {
    let w = 1;
    if (prev !== null) {
      const steps = Math.abs(SCALE.indexOf(m) - SCALE.indexOf(prev));
      w = [repeats >= 2 ? 0 : 0.2, 1, 0.9, 0.5, 0.3, 0.12][steps] ?? 0.04;
    }
    const z = (m - RANGE.centre) / 9;
    return w * Math.exp((-z * z) / 2) * (chord.pcs.includes(m % 12) ? 1.15 : 1);
  };

  const rnd = mulberry32((hashString(String(char).toLowerCase()) ^ Math.imul(count + 1, 2654435761)) >>> 0);
  const weights = pool.map(weight);
  let r = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * The musical decision for each keystroke, with no audio in it: which slot, which note.
 * Keeps the little bit of state a melody needs (the previous note, how often it repeated).
 */
// Levels, set by measurement: the typed notes rendered alone, against the loudness of the
// live mix at the same stage. The aim is ~6.5–8 dB under the mix at every stage of the form:
// always clearly audible, never competing with the melody.
const KIND_TRIM = { glass: 1, pluck: 1.12, felt: 0.9, kalimba: 1.18 };

/** Softer at the very start (the bed is quiet), a touch firmer at the end (the arrangement is dense). */
export function stageGain(p) {
  const db = p < 0.4 ? -4.5 * (1 - Math.max(0, p) / 0.4) : 1.7 * Math.min(1, (p - 0.4) / 0.46);
  return 10 ** (db / 20);
}

export class TypingPlanner {
  constructor() {
    this.used = new Set();
    this.prev = null;
    this.repeats = 0;
    this.count = 0;
  }

  /** @returns {{ midi:number, time:number, step:number, strong:boolean, entry:object }|null} */
  plan(char, timeline, now) {
    const slot = nextSlot(timeline, now, this.used);
    if (!slot) return null;

    this.used.add(slot.key);
    if (this.used.size > 96) {
      const first = timeline[0]?.bar ?? 0;
      for (const k of this.used) if (Number(k.split(':')[0]) < first) this.used.delete(k);
    }

    const strong = slot.step % 4 === 0;
    const midi = pickTypedNote({
      chord: slot.entry.chord,
      strong,
      prev: this.prev,
      repeats: this.repeats,
      sounding: soundingAt(timeline, slot.time),
      char,
      count: this.count++,
    });
    this.repeats = midi === this.prev ? this.repeats + 1 : 1;
    this.prev = midi;
    return { midi, time: slot.time, step: slot.step, strong, entry: slot.entry };
  }
}

export class TypingInstrument {
  /**
   * @param {BaseAudioContext} ctx
   * @param {object} mixer
   * @param {{ getTimeline: () => Array, isOn: () => boolean }} hooks
   */
  constructor(ctx, mixer, { getTimeline, isOn }) {
    this.ctx = ctx;
    this.getTimeline = getTimeline;
    this.isOn = isOn;
    // its own channel: a little air and echo, like the melody, and a light sidechain duck
    this.bus = mixer.createBus({ reverb: 0.42, delay: 0.3, duck: 0.12, level: 1.6 });
    this.planner = new TypingPlanner();
    this.last = null;
  }

  /** True while the music is running and typed notes can be placed in it. */
  get live() {
    return this.isOn();
  }

  /**
   * Play the note for one keystroke. Returns what was played, or null if nothing was
   * (a space, or no free slot while typing very fast).
   */
  play(char, profile, now = this.ctx.currentTime) {
    if (!this.live || !char || !char.trim()) return null;
    const note = this.planner.plan(char, this.getTimeline(), now);
    if (!note) return null;
    const { midi, time, step, strong, entry } = note;
    S.lead(this.ctx, this.bus.input, time, entry.stepDur * (strong ? 2.6 : 1.7), midiToHz(midi), {
      kind: profile?.lead || 'glass',
      vel: (strong ? 0.14 : 0.11) * (KIND_TRIM[profile?.lead] ?? 1) * stageGain(entry.p),
      bright: profile?.bright ?? 0.5,
      pan: ((midi - RANGE.centre) / 24) * 0.5,
    });
    this.last = { midi, time, step, bar: entry.bar, chord: entry.chord.name };
    return this.last;
  }
}
