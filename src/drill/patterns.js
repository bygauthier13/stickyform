// The musical material of the drill edition: every pattern an answer can pick.
// Pure data. Steps are sixteenth notes; tonal parts span the four-bar loop
// (64 steps, chords Fm · Fm · Db · Cm), drums span two bars (32 steps).
//
// All of it was written for this one key and tempo, so any combination of
// answers stays in key and in time. Fractional steps are triplets.

// --------------------------------------------------------------- 1 · melody

/**
 * Q1 — the main melodic variation. [step, durationInSteps, midi]
 * Strong beats sit on chord tones; the Db → C fall (b6 → 5) is the drill colour.
 */
export const MELODIES = {
  minimal: {
    label: 'Glass bell motif',
    instrument: 'glock',
    gain: 0.88,
    notes: [
      [0, 3, 84], [3, 3, 80], [6, 9, 77],
      [24, 2, 79], [26, 6, 80],
      [32, 3, 84], [35, 3, 80], [38, 9, 77],
      [56, 2, 79], [58, 6, 75],
    ],
  },
  bold: {
    label: 'Dark piano riff',
    instrument: 'piano',
    gain: 1,
    double: -12, // doubled an octave below, softer: weight without more notes
    notes: [
      [0, 3, 65], [3, 3, 68], [6, 2, 72], [8, 2, 73], [10, 6, 72],
      [16, 3, 68], [19, 3, 67], [22, 10, 65],
      [32, 3, 65], [35, 3, 68], [38, 2, 72], [40, 2, 73], [42, 6, 77],
      [48, 3, 75], [51, 3, 72], [54, 10, 67],
    ],
  },
  technical: {
    label: 'Pluck arpeggio',
    instrument: 'pluck',
    gain: 0.84,
    notes: [
      [0, 1, 65], [2, 1, 72], [3, 2, 68], [6, 1, 72], [8, 2, 77], [11, 1, 75], [12, 2, 72],
      [16, 1, 65], [18, 1, 72], [19, 2, 68], [22, 1, 72], [24, 2, 79], [27, 1, 77], [28, 2, 75],
      [32, 1, 61], [34, 1, 68], [35, 2, 65], [38, 1, 68], [40, 2, 73], [43, 1, 72], [44, 2, 68],
      [48, 1, 60], [50, 1, 67], [51, 2, 63], [54, 1, 67], [56, 2, 72], [59, 1, 70], [60, 2, 67],
    ],
  },
  vintage: {
    label: 'Recorder line',
    instrument: 'flute',
    gain: 0.9,
    notes: [
      [0, 6, 72], [6, 2, 73], [8, 4, 72], [12, 4, 68],
      [16, 3, 67], [19, 3, 68], [22, 10, 65],
      [32, 6, 77], [38, 2, 75], [40, 4, 73], [44, 4, 72],
      [48, 3, 70], [51, 3, 72], [54, 10, 67],
    ],
  },
};

// --------------------------------------------------------------- 2 · texture

/**
 * Q2 — a secondary texture on top of the atmosphere. Beds are continuous; the
 * note lists are [step, durationInSteps, midi] over the four-bar loop.
 */
export const TEXTURES = {
  tape: { label: 'Tape dust', bed: 'vinyl', bedGain: 0.85, notes: [] },
  frost: {
    label: 'Frost shimmer',
    bed: 'air',
    instrument: 'bell',
    gain: 0.45,
    notes: [[0, 8, 89], [10, 8, 96], [34, 8, 92], [44, 8, 89]],
  },
  pulse: {
    label: 'Cold pulse',
    bed: null,
    instrument: 'pulse',
    gain: 1,
    // eighth notes, root and fifth of each chord, accent on the beat
    notes: [
      [0, 1, 53], [2, 1, 60], [4, 1, 53], [6, 1, 60], [8, 1, 53], [10, 1, 60], [12, 1, 53], [14, 1, 60],
      [16, 1, 53], [18, 1, 60], [20, 1, 53], [22, 1, 60], [24, 1, 53], [26, 1, 60], [28, 1, 56], [30, 1, 60],
      [32, 1, 49], [34, 1, 56], [36, 1, 49], [38, 1, 56], [40, 1, 49], [42, 1, 56], [44, 1, 49], [46, 1, 56],
      [48, 1, 48], [50, 1, 55], [52, 1, 48], [54, 1, 55], [56, 1, 48], [58, 1, 55], [60, 1, 51], [62, 1, 55],
    ],
  },
  acid: {
    label: 'Acid blips',
    bed: null,
    instrument: 'acid',
    gain: 1,
    notes: [
      [0, 1, 65], [3, 1, 72], [6, 2, 68], [10, 1, 72], [13, 2, 75],
      [16, 1, 65], [19, 1, 72], [22, 2, 67], [26, 1, 68],
      [32, 1, 65], [35, 1, 73], [38, 2, 68], [42, 1, 72], [45, 2, 77],
      [48, 1, 67], [51, 1, 72], [54, 2, 70], [58, 1, 67],
    ],
  },
};

/** The colour answer → texture. */
export const COLOUR_TEXTURE = { black: 'tape', ice: 'frost', blue: 'pulse', lime: 'acid' };

// ------------------------------------------------------------------- 3 · 808

/**
 * Q3 — 808 patterns over the four-bar loop. [step, durationInSteps, midi, glideFrom?]
 * A glide starts the note at `glideFrom` and slides into `midi` (both in key).
 * F1 = 29 · Ab1 = 32 · Bb1 = 34 · C2 = 36 · Db2 = 37 · Eb2 = 39 · F2 = 41 · G2 = 43 · Ab2 = 44
 */
export const BASSLINES = {
  everyday: {
    label: 'Classic 808 slide',
    notes: [
      [0, 10, 29], [11, 5, 29],
      [18, 6, 29], [24, 8, 36, 29],
      [32, 11, 37], [43, 5, 37],
      [48, 8, 36], [56, 8, 41, 36],
    ],
  },
  afterdark: {
    label: 'Low, sparse 808',
    notes: [
      [0, 14, 29],
      [22, 10, 29],
      [32, 14, 37],
      [48, 8, 36], [56, 8, 32, 36],
    ],
  },
  onthemove: {
    label: 'Bouncing 808',
    notes: [
      [0, 3, 29], [3, 3, 29], [6, 4, 41, 29], [10, 6, 29],
      [16, 3, 29], [19, 3, 32], [22, 6, 34], [28, 4, 36],
      [32, 3, 37], [35, 3, 37], [38, 4, 44, 37], [42, 6, 37],
      [48, 3, 36], [51, 3, 36], [54, 6, 39], [60, 4, 41, 39],
    ],
  },
  events: {
    label: 'Octave-slide 808',
    notes: [
      [0, 8, 29], [8, 8, 41, 29],
      [16, 6, 41], [22, 10, 29, 41],
      [32, 8, 37], [40, 8, 44, 37],
      [48, 8, 36], [56, 8, 43, 36],
    ],
  },
};

// ----------------------------------------------------------------- 4 · drums

/**
 * Q4 — the main drum pattern (two bars, 32 steps): kick, snare (+ layered clap),
 * rim, perc and open hat as { step: velocity }. `hats` names the hi-hat grid.
 * The snare sits on beat three (half-time); counter-snares give the drill skip.
 */
export const DRUMS = {
  hoodie: {
    label: 'Classic drill groove',
    hats: 'skip',
    kick: { 0: 1, 11: 0.72, 18: 0.84, 26: 0.7 },
    snare: { 8: 1, 24: 1, 30: 0.5 },
    clap: { 8: 0.75, 24: 0.75 },
    rim: {},
    perc: {},
    ohat: { 31: 0.28 },
  },
  tee: {
    label: 'Laid-back bounce',
    hats: 'triplet',
    kick: { 0: 1, 7: 0.55, 16: 0.88, 27: 0.6 },
    snare: { 8: 1, 23: 0.3, 24: 1 },
    clap: { 8: 0.8, 24: 0.8 },
    rim: { 12: 0.42, 28: 0.38 },
    perc: {},
    ohat: {},
  },
  jacket: {
    label: 'Tight, technical kit',
    hats: 'eighths',
    kick: { 0: 1, 3: 0.58, 10: 0.78, 16: 0.9, 19: 0.55, 29: 0.68 },
    snare: { 8: 1, 13: 0.42, 24: 1 },
    clap: { 8: 0.6, 24: 0.6 },
    rim: { 4: 0.46, 14: 0.4, 20: 0.46, 30: 0.42 },
    perc: {},
    ohat: {},
  },
  cargo: {
    label: 'Heavy stomp',
    hats: 'skipLate',
    kick: { 0: 1, 6: 0.78, 16: 1, 22: 0.6, 27: 0.7 },
    snare: { 8: 1, 24: 1, 29: 0.58 },
    clap: { 8: 0.78, 24: 0.78 },
    rim: {},
    perc: { 14: 0.5, 30: 0.6, 31: 0.38 },
    ohat: { 15: 0.3 },
  },
};

/** One-bar hi-hat grids [step, velocity]. 3-3-2 "skip" is the grime/drill backbone. */
export const HAT_GRIDS = {
  skip: [[0, 0.85], [3, 0.55], [6, 0.7], [8, 0.8], [11, 0.55], [14, 0.66]],
  skipLate: [[0, 0.85], [3, 0.5], [6, 0.7], [10, 0.6], [12, 0.75], [14, 0.5]],
  triplet: [[0, 0.8], [8 / 3, 0.5], [16 / 3, 0.62], [8, 0.76], [32 / 3, 0.5], [40 / 3, 0.6]],
  eighths: [[0, 0.8], [2, 0.48], [4, 0.66], [6, 0.48], [8, 0.76], [10, 0.48], [12, 0.66], [14, 0.52]],
};

/** Hi-hat rolls [step, velocity]; a roll replaces the grid hits inside its span. */
export const ROLLS = {
  trip: [[12, 0.42], [12 + 2 / 3, 0.5], [12 + 4 / 3, 0.6]],
  tripEnd: [[14, 0.45], [14 + 2 / 3, 0.55], [14 + 4 / 3, 0.66]],
  r32: [[14, 0.4], [14.5, 0.48], [15, 0.56], [15.5, 0.66]],
  r32long: [[12, 0.32], [12.5, 0.36], [13, 0.4], [13.5, 0.46], [14, 0.5], [14.5, 0.56], [15, 0.62], [15.5, 0.7]],
};

/**
 * Q6 — pace: density of hats and percussion. The tempo never changes.
 *   keep     drop grid hits quieter than this (laid-back thins the grid out)
 *   ghosts   extra quiet hats on these steps
 *   rolls    which roll, by bar position in the four-bar loop (index 0–3)
 *   shaker   sixteenth-note shaker level (0 = none)
 *   percs    extra percussion hits per bar
 */
export const PACES = {
  laidback: { label: 'Sparse hats', keep: 0.6, gain: 0.9, ghosts: [], rolls: [null, null, null, 'tripEnd'], shaker: 0, percs: [] },
  balanced: { label: 'Skippy hats, a roll or two', keep: 0, gain: 1, ghosts: [], rolls: [null, 'tripEnd', null, 'r32'], shaker: 0, percs: [] },
  high: {
    label: 'Dense hats, rolls, percussion',
    keep: 0,
    gain: 1,
    ghosts: [[2, 0.3], [5, 0.26], [10, 0.3], [13, 0.26]],
    rolls: ['trip', 'r32', 'tripEnd', 'r32long'],
    shaker: 0.2,
    percs: [[5, 0.34], [13, 0.3]],
  },
};

// ---------------------------------------------------------- 7 · second voice

/**
 * Q7 — the second instrumental voice, placed in the gaps of the melody and
 * kept in a different register so it never covers it.
 *   notes  [step, durationInSteps, midi | midi[]]
 */
export const COUNTERS = {
  stabs: {
    label: 'String stabs',
    instrument: 'stab',
    gain: 1,
    notes: [
      [14, 1, [56, 60, 65]],
      [16, 1, [56, 60, 65]], [19, 1, [56, 60, 65]], [22, 2, [56, 60, 63]],
      [46, 1, [56, 61, 65]],
      [48, 1, [55, 60, 63]], [51, 1, [55, 60, 63]], [54, 2, [55, 58, 63]],
    ],
  },
  keys: {
    label: 'Soft piano counter-line',
    instrument: 'piano',
    gain: 1,
    notes: [
      [0, 8, 56], [8, 8, 55], [16, 16, 53],
      [32, 8, 53], [40, 8, 56], [48, 16, 55],
    ],
  },
  choir: {
    label: 'Choir swells',
    instrument: 'choir',
    gain: 0.68,
    notes: [
      [0, 30, [60, 65, 68]],
      [32, 14, [61, 65, 68]],
      [48, 14, [60, 63, 67]],
    ],
  },
  bells: {
    label: 'High bell answers',
    instrument: 'bell',
    gain: 0.5,
    notes: [[26, 2, 84], [28, 4, 89], [58, 2, 82], [60, 4, 87]],
  },
};

/** The drop answer → second voice. */
export const DROP_COUNTER = { design: 'stabs', comfort: 'keys', quality: 'choir', exclusivity: 'bells' };

// ------------------------------------------------------- 5 & 8 · from text

/** Played when the energy question is skipped (or has no letters): a musically valid motif. */
export const DEFAULT_ENERGY = {
  source: 'default',
  notes: [
    { step: 0, dur: 3, degree: 4, vowel: 'ah' },
    { step: 3, dur: 3, degree: 2, vowel: 'ah' },
    { step: 6, dur: 4, degree: 0, vowel: 'oh' },
    { step: 16, dur: 2, degree: 1, vowel: 'ah' },
    { step: 19, dur: 3, degree: 2, vowel: 'ah' },
    { step: 22, dur: 6, degree: -1, vowel: 'oh' },
  ],
};

/** Signature rhythms for the title's vocal chop (bar-relative steps, second half of a bar). */
export const SIGNATURE_RHYTHMS = [
  [[8, 2], [10, 2], [12, 4]],
  [[8, 3], [11, 1], [12, 2], [14, 2]],
  [[8, 2], [11, 3], [14, 2]],
  [[9, 2], [11, 1], [12, 4]],
];

/** Used when the title is skipped. */
export const DEFAULT_SIGNATURE = {
  source: 'default',
  notes: [
    { step: 8, dur: 2, degree: 4, vowel: 'ah' },
    { step: 10, dur: 2, degree: 3, vowel: 'oh' },
    { step: 12, dur: 4, degree: 1, vowel: 'ah' },
  ],
};

// ---------------------------------------------------------- 9 · transitions

/**
 * Q9 — transition styles. They were built to be equivalent: each is one beat
 * long, has the same number of sound events and the same total level; only the
 * colour differs. Which answer maps to which style is arbitrary on purpose.
 *   events  [step (bar-relative), instrument, velocity, extra]
 */
export const TRANSITIONS = {
  lift: {
    label: 'Snare roll lift',
    events: [
      [12, 'snare', 0.21], [13, 'snare', 0.27], [14, 'snare', 0.32], [14.5, 'snare', 0.36], [15, 'snare', 0.42], [15.5, 'snare', 0.48],
      [11, 'riser', 0.43, { beats: 1.25 }],
    ],
  },
  sweep: {
    label: 'Reverse cymbal sweep',
    events: [
      [12, 'rim', 0.6], [13, 'rim', 0.65], [14, 'rim', 0.7], [14.5, 'hat', 0.7], [15, 'hat', 0.8], [15.5, 'hat', 0.9],
      [11, 'reverse', 0.9, { beats: 1.25 }],
    ],
  },
  stutter: {
    label: 'Stutter drop',
    events: [
      [12, 'clap', 0.58], [12.5, 'clap', 0.49], [13, 'clap', 0.61], [14, 'perc', 0.72], [15, 'perc', 0.81], [15.5, 'perc', 0.9],
      [11, 'swell', 0.9, { beats: 1.25 }],
    ],
  },
};

/** The explore answer → transition style. Arbitrary on purpose: no answer gets a "better" sound. */
export const EXPLORE_TRANSITION = { definitely: 'lift', maybe: 'sweep', notforme: 'stutter' };

/** Before Q9 is answered, layer entrances use this. */
export const DEFAULT_TRANSITION = 'sweep';

// ------------------------------------------------------------- 10 · endings

export const ENDINGS = {
  clean: { label: 'Hard stop on the one' },
  atmospheric: { label: 'Drums fall away into reverb' },
  high: { label: 'Rolls and one last hit' },
};

// --------------------------------------------------------------- atmosphere

/** Pad voicings for the four chords, voice-led (no voice moves more than a third). */
export const PAD_VOICINGS = [
  [56, 60, 63, 65], // Fm7    Ab3 C4 Eb4 F4
  [56, 60, 63, 65],
  [56, 60, 61, 65], // Dbmaj7 Ab3 C4 Db4 F4
  [55, 58, 60, 63], // Cm7    G3 Bb3 C4 Eb4
];
