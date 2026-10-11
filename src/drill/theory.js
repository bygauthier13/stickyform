// Music theory for the UK Drill edition. Pure functions, no audio, no DOM.
//
// One key, one tempo, every layer compatible:
//   F natural minor  →  F G Ab Bb C Db Eb      140 BPM, 4/4, half-time feel
// Every tonal note the edition produces comes from that set (tests check it).
// Glides on the 808 travel between two notes of the set; drums are not tonal.

export const BPM = 140;
export const STEPS_PER_BAR = 16; // sixteenth notes
export const KEY = { tonic: 'F', mode: 'minor', name: 'F minor', short: 'F MIN' };

/** Pitch classes of F natural minor, from the tonic. */
export const SCALE_PCS = [5, 7, 8, 10, 0, 1, 3];
const PC_SET = new Set(SCALE_PCS);
const pcOf = (midi) => ((Math.round(midi) % 12) + 12) % 12;

export const inScale = (midi) => PC_SET.has(pcOf(midi));
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);
export const barSeconds = (bpm = BPM) => 240 / bpm;
export const stepSeconds = (bpm = BPM) => 60 / bpm / 4;

/** Every MIDI note of the scale, ascending. */
export const SCALE_MIDI = [];
for (let m = 0; m <= 127; m++) if (PC_SET.has(m % 12)) SCALE_MIDI.push(m);

const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (midi) => `${NOTE_NAMES[pcOf(midi)]}${Math.floor(Math.round(midi) / 12) - 1}`;

/** Scale notes between lo and hi (inclusive). */
export const scaleRange = (lo, hi) => SCALE_MIDI.filter((m) => m >= lo && m <= hi);

/** Nearest scale note to `midi` (ties go down, which keeps lines dark). */
export function snapToScale(midi) {
  let best = SCALE_MIDI[0];
  for (const m of SCALE_MIDI) if (Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  return best;
}

// ------------------------------------------------------------------ randomness

/** Small seedable PRNG: the same seed always gives the same humanisation. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit string hash (cyrb53 folded). */
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

// ---------------------------------------------------------------------- chords

const chord = (name, root, pcs) => ({ name, root, pcs });

/** The four chords of the loop, all diatonic to F minor. */
export const CHORDS = {
  Fm: chord('Fm7', 5, [5, 8, 0, 3]), // F Ab C Eb
  Db: chord('Dbmaj7', 1, [1, 5, 8, 0]), // Db F Ab C
  Cm: chord('Cm7', 0, [0, 3, 7, 10]), // C Eb G Bb
  Bbm: chord('Bbm7', 10, [10, 1, 5, 8]), // Bb Db F Ab
};

/**
 * Four bars, one chord each: two bars of home, then the dark b6 → v fall
 * (Db → Cm) that pulls back to F. The 808 follows these roots.
 */
export const PROGRESSION = ['Fm', 'Fm', 'Db', 'Cm'];
export const chordAt = (bar) => CHORDS[PROGRESSION[((bar % 4) + 4) % 4]];

export const isChordTone = (ch, midi) => ch.pcs.includes(pcOf(midi));

/** A scale tone a semitone away from a chord tone grates on a strong beat. */
export function clashes(ch, midi) {
  if (isChordTone(ch, midi)) return false;
  const pc = pcOf(midi);
  return ch.pcs.some((cp) => {
    const d = (pc - cp + 12) % 12;
    return d === 1 || d === 11;
  });
}

/** Nearest chord tone to `midi`, within [lo, hi]. */
export function nearestChordTone(ch, midi, lo = 0, hi = 127) {
  let best = null;
  for (let m = Math.max(lo, Math.round(midi) - 12); m <= Math.min(hi, Math.round(midi) + 12); m++) {
    if (!isChordTone(ch, m)) continue;
    if (best === null || Math.abs(m - midi) < Math.abs(best - midi)) best = m;
  }
  return best ?? snapToScale(midi);
}

/** Nudge a clashing scale tone to the nearest neighbour that doesn't clash. */
export function settle(ch, midi) {
  if (!clashes(ch, midi)) return midi;
  const i = SCALE_MIDI.indexOf(midi);
  for (const k of [-1, 1, -2, 2]) {
    const cand = SCALE_MIDI[i + k];
    if (cand !== undefined && !clashes(ch, cand)) return cand;
  }
  return nearestChordTone(ch, midi);
}

// ---------------------------------------------------------------- text → motif

/**
 * Letters → a fixed scale degree (0 = F … 6 = Eb, 7 = F an octave up). Vowels get
 * the chord-friendly degrees so most words sound settled; the same text always
 * gives the same shape. The text is never read, sung or interpreted — only its
 * letters are counted, like a cipher.
 */
const LETTER_DEGREE = {
  a: 2, b: 1, c: 4, d: 5, e: 4, f: 0, g: 1, h: 3, i: 7, j: 5, k: 6, l: 3, m: 2,
  n: 5, o: 0, p: 6, q: 3, r: 1, s: 4, t: 6, u: 2, v: 3, w: 5, x: 1, y: 6, z: 3,
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 4, 9: 2,
};

/** Lower-case letters and digits only, accents stripped. */
export function textKey(text) {
  return [...String(text ?? '').normalize('NFKD').toLowerCase()].filter((c) => (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')).join('');
}

/** Scale degree for one character (any character, so typing never goes silent). */
export function degreeOfChar(char) {
  const k = textKey(char);
  if (k) return LETTER_DEGREE[k[0]];
  return hashString(String(char)) % 7;
}

const VOWEL_OF = { a: 'ah', o: 'oh', u: 'oo', e: 'eh', i: 'eh', y: 'eh' };
/** Abstract syllable for a vocal chop: from the letter, never the word. */
export function vowelOfChar(char) {
  const k = textKey(char);
  if (!k) return 'ah';
  return VOWEL_OF[k[0]] || (k.charCodeAt(0) % 2 ? 'oh' : 'ah');
}

/** Degree (0–6, may exceed 6 for the next octave) → MIDI, starting from F at `base`. */
export function degreeToMidi(degree, base = 65) {
  const i = SCALE_MIDI.indexOf(base);
  return SCALE_MIDI[i + degree];
}

/**
 * Rhythm cells for text motifs (two bars, sixteenth steps): spaced, drill-like,
 * with room to breathe. [step, durationInSteps]
 */
export const MOTIF_RHYTHMS = [
  [[0, 3], [3, 3], [6, 4], [16, 2], [19, 3], [22, 6]],
  [[0, 2], [3, 3], [8, 4], [14, 2], [16, 3], [22, 2], [24, 6]],
  [[2, 2], [4, 4], [10, 2], [12, 4], [18, 2], [20, 2], [24, 6]],
  [[0, 4], [6, 2], [8, 2], [10, 4], [19, 3], [22, 2], [24, 4]],
];

/**
 * Turn text into a short motif. Deterministic: same text → same notes.
 * Returns null for text without letters or digits (the caller then uses a default).
 *
 * @param {string} text
 * @param {{ lo:number, hi:number, base:number, salt:string, rhythms?:Array, maxNotes?:number }} o
 * @returns {{ notes: Array<{step:number, dur:number, degree:number, vowel:string}>, source:'text' } | null}
 */
export function textMotif(text, { salt = '', rhythms = MOTIF_RHYTHMS, maxNotes = 7 } = {}) {
  const key = textKey(text);
  if (!key) return null;
  const h = hashString(salt + key);
  const rhythm = rhythms[h % rhythms.length].slice(0, maxNotes);
  const chars = [...key];
  let prev = 2;
  const notes = rhythm.map(([step, dur], i) => {
    const raw = LETTER_DEGREE[chars[(i + (h >>> 8)) % chars.length]];
    // choose the octave of this degree that is nearest the previous note: lines move by step
    const options = [raw - 7, raw, raw + 7].filter((d) => d >= -2 && d <= 9);
    const degree = options.reduce((b, d) => (Math.abs(d - prev) < Math.abs(b - prev) ? d : b), options[0]);
    prev = degree;
    return { step, dur, degree, vowel: vowelOfChar(chars[(i + (h >>> 8)) % chars.length]) };
  });
  return { notes, source: 'text' };
}

/**
 * Place a motif note over a chord: strong steps (on the beat) land on chord tones,
 * the rest avoid semitone clashes. Always returns a scale note within [lo, hi].
 */
export function placeOverChord(degree, ch, { base = 65, lo = 60, hi = 84, strong = false } = {}) {
  let m = degreeToMidi(degree, base);
  while (m > hi) m -= 12;
  while (m < lo) m += 12;
  if (strong) m = nearestChordTone(ch, m, lo, hi);
  else m = settle(ch, m);
  if (m > hi || m < lo) m = nearestChordTone(ch, Math.min(hi, Math.max(lo, m)), lo, hi);
  return m;
}

// ------------------------------------------------------------------- sanitising

// Control characters, zero-width and bidirectional overrides never reach the screen or a filename.
const INVISIBLE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u206f\\ufeff]', 'g');

/** Clean free text for display: no control or invisible characters, single spaces, at most `max` characters. */
export function sanitizeText(text, max = 60) {
  const s = String(text ?? '').normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  return [...s].slice(0, max).join('').trim();
}

/** A download-safe ASCII filename stem (some browsers drop names with anything else). */
export function safeFilename(text, fallback = 'Untitled') {
  const ascii = sanitizeText(text, 64)
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|#%&{}$!'@`=+^~[\]]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return ascii.slice(0, 40).trim() || fallback;
}
