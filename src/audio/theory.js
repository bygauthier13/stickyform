// Music theory for the StickySound composition.
//
// Every layer shares one key so any combination of layers is always compatible:
//   D natural minor ≡ F major  →  D E F G A Bb C
// All chords below are diatonic to that scale. "Minor" vs "major" moods are
// achieved through chord order and which chord feels like home (Dm vs F),
// never by changing the pitch set — so answers can change the mood mid-form
// without ever producing a clash.

export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------------------------------------------------------------- randomness

/** Small, fast, seedable PRNG so a given seed always sounds the same. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit string hash (cyrb53, folded). Used to turn typed answers into a seed. */
export function hashString(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

// --------------------------------------------------------------------- scale

const SCALE_PCS = new Set([0, 2, 4, 5, 7, 9, 10]); // C D E F G A Bb
export const SCALE = [];
for (let m = 24; m <= 108; m++) if (SCALE_PCS.has(m % 12)) SCALE.push(m);

/** Nearest MIDI note with pitch class `pc` to `target`, optionally clamped to [lo, hi]. */
export function nearestPc(pc, target, lo = -Infinity, hi = Infinity) {
  let best = null;
  for (let m = Math.max(0, Math.floor(target) - 12); m <= target + 12; m++) {
    if (m % 12 !== pc || m < lo || m > hi) continue;
    if (best === null || Math.abs(m - target) < Math.abs(best - target)) best = m;
  }
  if (best === null) {
    // Range excluded everything near target — fall back to the nearest inside the range.
    for (let m = lo; m <= hi; m++) if (m % 12 === pc) return m;
  }
  return best;
}

// -------------------------------------------------------------------- chords

const def = (name, root, tones) => ({
  name,
  root,
  tones,
  pcs: [...new Set(tones.map((t) => (root + t) % 12))],
});

export const CHORDS = {
  Dm7: def('Dm7', 2, [0, 3, 7, 10]),
  Dm9: def('Dm9', 2, [0, 3, 7, 10, 14]),
  Gm7: def('Gm7', 7, [0, 3, 7, 10]),
  Gm9: def('Gm9', 7, [0, 3, 7, 10, 14]),
  Am7: def('Am7', 9, [0, 3, 7, 10]),
  Bbmaj7: def('Bbmaj7', 10, [0, 4, 7, 11]),
  Bbmaj9: def('Bbmaj9', 10, [0, 4, 7, 11, 14]),
  Fmaj7: def('Fmaj7', 5, [0, 4, 7, 11]),
  Fmaj9: def('Fmaj9', 5, [0, 4, 7, 11, 14]),
  Cadd9: def('Cadd9', 0, [0, 4, 7, 14]),
};

/**
 * Four-bar progressions, one chord per bar. `alt` is the "second half of the
 * form" variant — same harmonic home, one chord swapped for a lift — so the
 * music audibly develops at the 50% mark.
 */
export const PROGRESSIONS = {
  reverie: {
    mode: 'minor',
    chords: ['Dm9', 'Bbmaj9', 'Fmaj9', 'Cadd9'],
    alt: ['Dm9', 'Bbmaj9', 'Gm9', 'Cadd9'],
  },
  midnight: {
    mode: 'minor',
    chords: ['Dm9', 'Gm9', 'Bbmaj9', 'Am7'],
    alt: ['Dm9', 'Gm9', 'Bbmaj9', 'Cadd9'],
  },
  noir: {
    mode: 'minor',
    chords: ['Dm7', 'Bbmaj7', 'Gm7', 'Am7'],
    alt: ['Dm9', 'Bbmaj9', 'Gm9', 'Am7'],
  },
  cinematic: {
    mode: 'minor',
    chords: ['Dm9', 'Bbmaj9', 'Gm9', 'Cadd9'],
    alt: ['Dm9', 'Bbmaj9', 'Cadd9', 'Cadd9'],
  },
  euphoria: {
    mode: 'major',
    chords: ['Fmaj9', 'Cadd9', 'Dm9', 'Bbmaj9'],
    alt: ['Fmaj9', 'Cadd9', 'Dm9', 'Cadd9'],
  },
  goldenHour: {
    mode: 'major',
    chords: ['Fmaj9', 'Am7', 'Bbmaj9', 'Cadd9'],
    alt: ['Fmaj9', 'Dm9', 'Bbmaj9', 'Cadd9'],
  },
};

/** The four-bar closing cadence. Both land home; "major" resolves to F, "minor" to D. */
export const CADENCE = {
  minor: ['Bbmaj9', 'Cadd9', 'Dm9', 'Dm9'], // VI – VII – i
  major: ['Bbmaj9', 'Cadd9', 'Fmaj9', 'Fmaj9'], // IV – V – I
};

/** Bass root, always inside A1–G2 so it stays audible on laptop speakers. */
export function bassMidi(pc) {
  let m = 36 + pc;
  if (m >= 45) m -= 12;
  return m;
}

/**
 * Pad voicing: root low, upper structure nearest to the previous voicing so
 * chords glide rather than jump (basic voice-leading).
 */
export function padVoicing(chord, prev = null) {
  const upperPrev = prev && prev.length > 1 ? prev.slice(1) : null;
  const center = upperPrev ? upperPrev.reduce((a, b) => a + b, 0) / upperPrev.length : 66;
  const rootNote = nearestPc(chord.root, 52, 47, 58);
  const upper = chord.pcs
    .filter((pc) => pc !== chord.root)
    .map((pc) => nearestPc(pc, center, 57, 77))
    .sort((a, b) => a - b);
  return [rootNote, ...upper];
}

/** Every chord tone between lo and hi, ascending — used for arpeggios and sparkle. */
export function chordLadder(chord, lo, hi) {
  const out = [];
  for (let m = lo; m <= hi; m++) if (chord.pcs.includes(m % 12)) out.push(m);
  return out;
}

// ------------------------------------------------------------------- melody

/**
 * Melodic motifs, two bars each (32 sixteenth-steps).
 * Notes are [step, degree, durationInSteps] where `degree` counts diatonic
 * steps above the *current chord's root*: 0 root · 1 ninth · 2 third · 4 fifth
 * · 5 sixth · 6 seventh · 7 octave … so the same hook transposes itself over
 * every chord and strong beats land on chord tones.
 */
export const MOTIFS = [
  { name: 'Sunlit', notes: [[0, 4, 3], [3, 5, 1], [4, 4, 4], [10, 2, 2], [12, 4, 3], [16, 4, 3], [19, 5, 1], [20, 7, 4], [26, 5, 2], [28, 4, 4]] },
  { name: 'Cascade', notes: [[0, 7, 3], [3, 6, 1], [4, 4, 3], [7, 2, 1], [8, 4, 4], [14, 2, 2], [16, 7, 3], [19, 6, 1], [20, 5, 3], [23, 4, 1], [24, 2, 6]] },
  { name: 'Questions', notes: [[0, 2, 6], [8, 4, 2], [10, 2, 2], [12, 1, 4], [16, 2, 6], [24, 5, 2], [26, 4, 2], [28, 2, 4]] },
  { name: 'Climb', notes: [[0, 0, 3], [3, 2, 3], [6, 4, 2], [8, 7, 4], [12, 6, 2], [14, 4, 2], [16, 2, 3], [19, 4, 3], [22, 7, 2], [24, 9, 4], [28, 7, 4]] },
  { name: 'Pendulum', notes: [[0, 4, 2], [2, 7, 2], [4, 4, 2], [6, 2, 2], [8, 4, 4], [12, 5, 2], [14, 4, 2], [16, 4, 2], [18, 7, 2], [20, 9, 2], [22, 7, 2], [24, 4, 8]] },
  { name: 'Breath', notes: [[0, 7, 8], [8, 6, 4], [12, 4, 4], [16, 5, 6], [22, 4, 2], [24, 2, 8]] },
];

/** A motif's centre of gravity (duration-weighted mean degree): lets the whole hook sit in one register. */
function motifCenter(notes) {
  let sum = 0;
  let weight = 0;
  for (const [, degree, len] of notes) {
    sum += degree * len;
    weight += len;
  }
  return Math.round(sum / weight);
}
for (const m of MOTIFS) m.center = motifCenter(m.notes);

// ----------------------------------------------------------- a hook from a name

// One scale degree per letter (0 root · 1 ninth · 2 third · 3 fourth · 4 fifth · 5 sixth · 6 seventh · 7 octave · 9 tenth).
// The vowels each get their own chord tone, so every name has a different colour.
const LETTER_DEGREE = {
  a: 4, b: 1, c: 3, d: 5, e: 2, f: 6, g: 1, h: 3, i: 7, j: 5, k: 6, l: 1, m: 3,
  n: 5, o: 0, p: 6, q: 3, r: 1, s: 5, t: 6, u: 9, v: 3, w: 5, x: 1, y: 6, z: 3,
};
const NAME_CHORD_TONES = [0, 2, 4, 7, 9]; // root · third · fifth · octave · tenth
// long–short–short–long, twice: the shape of a call and its answer
const NAME_SLOTS = [[0, 3], [4, 2], [6, 2], [8, 6], [16, 3], [20, 2], [22, 2], [24, 6]];
const NAME_RESTS = new Set([3, 7]); // where each phrase comes to rest: a chord tone

/**
 * A two-bar hook spelled with the letters of a name: every letter always means the
 * same scale degree, so "Maya" sounds like Maya and "Mia" doesn't. Short names repeat;
 * each note takes the octave nearest the one before it, so the line moves by steps;
 * each phrase ends on a chord tone. Returns null if the name has fewer than two letters.
 */
export function nameMotif(name) {
  const letters = [...String(name).toLowerCase().normalize('NFD')].filter((c) => c >= 'a' && c <= 'z');
  if (letters.length < 2) return null;
  let prev = 4;
  const nearest = (cands, to) => cands.reduce((best, c) => (Math.abs(c - to) < Math.abs(best - to) ? c : best));
  const notes = NAME_SLOTS.map(([step, len], i) => {
    const degree = LETTER_DEGREE[letters[i % letters.length]];
    let d = nearest([degree, degree + 7].filter((c) => c <= 9), prev);
    if (NAME_RESTS.has(i) && !NAME_CHORD_TONES.includes(d)) d = nearest(NAME_CHORD_TONES, d);
    prev = d;
    return [step, d, len];
  });
  return { name: `Name: ${String(name).trim()}`, notes, center: motifCenter(notes) };
}

/**
 * Pitch for a chord-relative scale degree.
 *
 * The chord root's octave is chosen so the *centre of the motif* sits nearest
 * `target`. That keeps every note of the hook in the same register over every
 * chord — folding notes into a range one at a time would break its contour.
 * `lo`/`hi` are only a safety net.
 */
export function melodyPitch(chord, degree, { center = 4, target = 72, lo = 55, hi = 94 } = {}) {
  let best = null;
  for (let r = 36; r <= 90; r++) {
    if (r % 12 !== chord.root) continue;
    const c = SCALE[SCALE.indexOf(r) + center];
    const dist = Math.abs(c - target);
    if (best === null || dist < best.dist) best = { r, dist };
  }
  let m = SCALE[SCALE.indexOf(best.r) + degree];
  while (m > hi) m -= 12;
  while (m < lo) m += 12;
  return m;
}

/** A non-chord tone a semitone from a chord tone grates. Chord tones never clash. */
export function clashes(chord, midi) {
  const pc = midi % 12;
  if (chord.pcs.includes(pc)) return false;
  return chord.pcs.some((cp) => {
    const d = (pc - cp + 12) % 12;
    return d === 1 || d === 11;
  });
}

/** Nudge a clashing note to the nearest scale tone that doesn't. */
export function settleNote(chord, midi) {
  if (!clashes(chord, midi)) return midi;
  const i = SCALE.indexOf(midi);
  for (const k of [1, -1, 2, -2]) {
    const cand = SCALE[i + k];
    if (cand !== undefined && !clashes(chord, cand)) return cand;
  }
  return midi;
}
