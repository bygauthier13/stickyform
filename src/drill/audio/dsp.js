// Sound synthesis in plain JavaScript: every built-in sound of the drill edition
// is computed here into sample arrays, once, then played like a recorded sample.
//
// Why not live oscillators? Because then a synthesised sound and a real sample
// (the owner's 808, a recorded clap) go through exactly the same code path:
// the asset manifest swaps one for the other without touching the engine. It
// is also deterministic (seeded noise) and cheap on phones.
//
// Everything returns { channels: Float32Array[], sampleRate }. No Web Audio here,
// so the generators can be tested in Node.

import { midiToHz, mulberry32 } from '../theory.js';

export const SR = 44100;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ building blocks

/** RBJ biquad, processed sample by sample. type: lowpass | highpass | bandpass | peaking */
export function biquad(type, freq, q = 0.707, sr = SR, gainDb = 0) {
  const w = (TAU * Math.min(freq, sr * 0.49)) / sr;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'highpass':
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A;
      break;
    default: // lowpass
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  }
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    return y;
  };
}

/** Resonant state-variable low-pass whose cutoff can move every sample (for acid and sweeps). */
function svf(sr = SR) {
  let low = 0, band = 0;
  return (x, cutoff, res) => {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, sr * 0.2)) / sr);
    const q = 1 - res; // res 0–0.95
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    return low;
  };
}

const softClip = (x, drive = 1.5) => Math.tanh(drive * x) / Math.tanh(drive);

/** Band-limited sawtooth (PolyBLEP). */
function sawOsc(sr = SR) {
  let phase = 0;
  return (freq) => {
    const dt = freq / sr;
    phase += dt;
    if (phase >= 1) phase -= 1;
    let v = 2 * phase - 1;
    if (phase < dt) {
      const t = phase / dt;
      v -= t + t - t * t - 1;
    } else if (phase > 1 - dt) {
      const t = (phase - 1) / dt;
      v -= t * t + t + t + 1;
    }
    return v;
  };
}

function blank(seconds, channels = 1, sr = SR) {
  const n = Math.max(1, Math.round(seconds * sr));
  return Array.from({ length: channels }, () => new Float32Array(n));
}

/** Short fades so a cut never clicks; optional peak normalisation. */
function finish(chs, { fadeIn = 0.0005, fadeOut = 0.01, peak = 0, sr = SR } = {}) {
  const fi = Math.floor(fadeIn * sr);
  const fo = Math.floor(fadeOut * sr);
  let max = 0;
  for (const d of chs) {
    for (let i = 0; i < fi && i < d.length; i++) d[i] *= i / fi;
    for (let i = 0; i < fo && i < d.length; i++) d[d.length - 1 - i] *= i / fo;
    for (let i = 0; i < d.length; i++) {
      if (!Number.isFinite(d[i])) d[i] = 0;
      const a = Math.abs(d[i]);
      if (a > max) max = a;
    }
  }
  if (peak > 0 && max > 0) {
    const g = peak / max;
    for (const d of chs) for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return { channels: chs, sampleRate: sr };
}

// ------------------------------------------------------------------------ drums

/** Short, punchy kick that leaves room for the 808 underneath. */
export function kick({ seed = 1 } = {}) {
  const [d] = blank(0.42);
  const rnd = mulberry32(seed);
  const hp = biquad('highpass', 2800, 0.7);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 50 + 150 * Math.exp(-t / 0.026) + 22 * Math.exp(-t / 0.12);
    ph += (TAU * f) / SR;
    const body = Math.sin(ph) * Math.exp(-t / 0.15) * Math.min(1, t / 0.0012);
    const click = hp(rnd() * 2 - 1) * Math.exp(-t / 0.0022) * 0.5;
    d[i] = softClip(body * 1.1 + click, 1.8);
  }
  return finish([d], { fadeOut: 0.04, peak: 0.95 });
}

/** Crisp drill snare: two-tone body, bright noise and a crack. */
export function snare({ seed = 2 } = {}) {
  const [d] = blank(0.38);
  const rnd = mulberry32(seed);
  const hp = biquad('highpass', 1400, 0.7);
  const pk = biquad('peaking', 5200, 0.9, SR, 5);
  const bp = biquad('bandpass', 2300, 1.1);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const drop = 1 + 0.25 * Math.exp(-t / 0.012);
    p1 += (TAU * 190 * drop) / SR;
    p2 += (TAU * 330 * drop) / SR;
    const tone = (Math.sin(p1) * 0.65 + Math.sin(p2) * 0.35) * Math.exp(-t / 0.055);
    const n = rnd() * 2 - 1;
    const noise = pk(hp(n)) * (Math.exp(-t / 0.09) * 0.85 + 0.15 * Math.exp(-t / 0.02));
    const crack = bp(n) * Math.exp(-t / 0.01) * 1.6;
    d[i] = softClip((tone * 0.55 + noise * 0.75 + crack * 0.5) * Math.min(1, t / 0.0008), 1.4);
  }
  return finish([d], { fadeOut: 0.05, peak: 0.95 });
}

/** Synthetic clap: four quick bursts and a short room. */
export function clap({ seed = 3 } = {}) {
  const [d] = blank(0.4);
  const rnd = mulberry32(seed);
  const bp = biquad('bandpass', 1250, 0.9);
  const hp = biquad('highpass', 750, 0.7);
  const bursts = [0, 0.0095, 0.019, 0.029];
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let env = 0;
    for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) / (b === 0.029 ? 0.075 : 0.0045)));
    d[i] = hp(bp(rnd() * 2 - 1)) * env * 2.2;
  }
  return finish([d], { fadeOut: 0.06, peak: 0.95 });
}

// the classic six-square metal of analogue hats
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800].map((f) => f * 1.72);

function metal(seconds, decay, { seed = 4, bright = 1 } = {}) {
  const [d] = blank(seconds);
  const rnd = mulberry32(seed);
  const bp = biquad('bandpass', 9800 * bright, 0.8);
  const hp = biquad('highpass', 7200 * bright, 0.7);
  const hp2 = biquad('highpass', 6000, 0.6);
  const phases = METAL.map(() => rnd());
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let sq = 0;
    for (let k = 0; k < METAL.length; k++) {
      phases[k] += METAL[k] / SR;
      if (phases[k] >= 1) phases[k] -= 1;
      sq += phases[k] < 0.5 ? 1 : -1;
    }
    const env = Math.min(1, t / 0.0004) * Math.exp(-t / decay);
    const n = hp2(rnd() * 2 - 1) * 0.35;
    d[i] = hp(bp(sq / 6 + n)) * env;
  }
  return d;
}

export function hat({ seed = 4, decay = 0.022 } = {}) {
  return finish([metal(0.1, decay, { seed })], { fadeOut: 0.02, peak: 0.9 });
}

export function openHat({ seed = 5 } = {}) {
  return finish([metal(0.55, 0.13, { seed, bright: 0.95 })], { fadeOut: 0.1, peak: 0.9 });
}

export function crash({ seed = 6 } = {}) {
  const sec = 2.2;
  const L = metal(sec, 0.55, { seed, bright: 0.85 });
  const R = metal(sec, 0.6, { seed: seed + 9, bright: 0.88 });
  const rnd = mulberry32(seed + 3);
  const hpL = biquad('highpass', 4200, 0.6);
  const hpR = biquad('highpass', 4200, 0.6);
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    const env = Math.exp(-t / 0.5) * Math.min(1, t / 0.002);
    L[i] = L[i] * 0.7 + hpL(rnd() * 2 - 1) * env * 0.45;
    R[i] = R[i] * 0.7 + hpR(rnd() * 2 - 1) * env * 0.45;
  }
  return finish([L, R], { fadeOut: 0.4, peak: 0.85 });
}

/** Rim click: two short partials and a tick of noise. */
export function rim({ seed = 7 } = {}) {
  const [d] = blank(0.09);
  const rnd = mulberry32(seed);
  const bp = biquad('bandpass', 3200, 1.4);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const env = Math.exp(-t / 0.011) * Math.min(1, t / 0.0003);
    d[i] = (Math.sin(TAU * 1720 * t) * 0.6 + Math.sin(TAU * 820 * t) * 0.4) * env + bp(rnd() * 2 - 1) * Math.exp(-t / 0.004) * 0.8;
  }
  return finish([d], { fadeOut: 0.01, peak: 0.9 });
}

/** Woody percussion blip, tuned to C (the fifth of F) so it never fights the key. */
export function perc() {
  const [d] = blank(0.22);
  let ph = 0;
  let mp = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = 523.25;
    mp += (TAU * f * 2.01) / SR;
    ph += (TAU * f) / SR + Math.sin(mp) * 0.9 * Math.exp(-t / 0.01) * ((TAU * f) / SR);
    d[i] = Math.sin(ph) * Math.exp(-t / 0.045) * Math.min(1, t / 0.0006);
  }
  return finish([d], { fadeOut: 0.03, peak: 0.85 });
}

export function shaker({ seed = 8 } = {}) {
  const [d] = blank(0.13);
  const rnd = mulberry32(seed);
  const bp = biquad('bandpass', 7200, 1.1);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.008) * Math.exp(-Math.max(0, t - 0.008) / 0.028);
    d[i] = bp(rnd() * 2 - 1) * env;
  }
  return finish([d], { fadeOut: 0.02, peak: 0.85 });
}

// ------------------------------------------------------------------------- 808

/**
 * The 808: a sine with a fast pitch punch and a long tail, saturated so it is
 * heard on phone speakers. Rendered at F1 (MIDI 29); the sampler transposes it
 * and slides between notes, like a producer's 808 sample.
 */
export const EIGHT_O_EIGHT_ROOT = 29;
export function bass808() {
  const [d] = blank(3.4);
  const f0 = midiToHz(EIGHT_O_EIGHT_ROOT);
  const lp = biquad('lowpass', 1600, 0.6);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const f = f0 * (1 + 0.85 * Math.exp(-t / 0.014));
    ph += (TAU * f) / SR;
    const env = Math.min(1, t / 0.0025) * (0.72 * Math.exp(-t / 2.2) + 0.28 * Math.exp(-t / 0.25));
    const x = Math.sin(ph) * env;
    d[i] = lp(0.62 * x + 0.38 * softClip(x * 2.4, 2.2));
  }
  return finish([d], { fadeOut: 0.3, peak: 0.95 });
}

// ------------------------------------------------------------------ pitched one-shots

/** Plucked string (additive): bright attack, harmonics fading faster than the fundamental. Exact pitch. */
export function pluck(midi, { seconds = 1.3 } = {}) {
  const [d] = blank(seconds);
  const f = midiToHz(midi);
  const H = Math.max(3, Math.min(14, Math.floor(9000 / f)));
  const amps = [];
  for (let k = 1; k <= H; k++) amps.push((1 / k ** 1.15) * (k % 2 ? 1 : 0.7));
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 1; k <= H; k++) v += amps[k - 1] * Math.exp(-t * (2.6 + k * 2.1)) * Math.sin(TAU * f * k * t * (1 + 0.0004 * k));
    d[i] = v * Math.min(1, t / 0.0015);
  }
  return finish([d], { fadeOut: 0.05, peak: 0.8 });
}

/** Glassy FM bell with an inharmonic shimmer partial. */
export function bell(midi, { seconds = 2.4 } = {}) {
  const [d] = blank(seconds);
  const f = midiToHz(midi);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const index = 1.6 * Math.exp(-t / 0.18) + 0.25;
    const mod = Math.sin(TAU * f * 3 * t) * index;
    const car = Math.sin(TAU * f * t + mod);
    const shimmer = Math.sin(TAU * f * 2.76 * t) * 0.18 * Math.exp(-t / 0.35);
    d[i] = (car * Math.exp(-t / 0.9) + shimmer) * Math.min(1, t / 0.002);
  }
  return finish([d], { fadeOut: 0.2, peak: 0.8 });
}

/** Dark keys: a soft piano-like tone (fallback when the piano samples are missing). */
export function keys(midi, { seconds = 2 } = {}) {
  const [d] = blank(seconds);
  const f = midiToHz(midi);
  const rnd = mulberry32(midi * 31);
  const lp = biquad('lowpass', 2400, 0.7);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    let v = 0;
    for (let k = 1; k <= 8; k++) v += (1 / k ** 1.4) * Math.exp(-t * (1.1 + k * 0.9)) * Math.sin(TAU * f * k * t * (1 + 0.0006 * k * k));
    const hammer = (rnd() * 2 - 1) * Math.exp(-t / 0.004) * 0.08;
    d[i] = lp(v + hammer) * Math.min(1, t / 0.002);
  }
  return finish([d], { fadeOut: 0.15, peak: 0.8 });
}

/** Breathy flute-like tone with delayed vibrato (fallback for the recorder samples). */
export function flute(midi, { seconds = 2 } = {}) {
  const [d] = blank(seconds);
  const f = midiToHz(midi);
  const rnd = mulberry32(midi * 17);
  const bp = biquad('bandpass', f * 2, 1.2);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const vib = 1 + 0.004 * Math.sin(TAU * 5.2 * t) * Math.min(1, Math.max(0, (t - 0.25) / 0.4));
    ph += (TAU * f * vib) / SR;
    const tone = Math.sin(ph) + 0.22 * Math.sin(2 * ph) + 0.08 * Math.sin(3 * ph);
    const breath = bp(rnd() * 2 - 1) * 0.25;
    d[i] = (tone + breath) * Math.min(1, t / 0.04) * (0.9 + 0.1 * Math.exp(-t / 0.3));
  }
  return finish([d], { fadeIn: 0.01, fadeOut: 0.15, peak: 0.8 });
}

/** Cold filtered square pulse (the "Electric Blue" texture). */
export function pulse(midi, { seconds = 0.32 } = {}) {
  const [d] = blank(seconds);
  const f = midiToHz(midi);
  const lp = biquad('lowpass', 1100, 0.9);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    ph += f / SR;
    if (ph >= 1) ph -= 1;
    const sq = ph < 0.5 ? 1 : -1;
    d[i] = lp(sq) * Math.min(1, t / 0.003) * Math.exp(-t / 0.09);
  }
  return finish([d], { fadeOut: 0.04, peak: 0.75 });
}

/** Squelchy resonant saw blip (the "Acid Lime" texture), kept short and in key. */
export function acid(midi, { seconds = 0.42 } = {}) {
  const [d] = blank(seconds);
  const f = midiToHz(midi);
  const saw = sawOsc();
  const filt = svf();
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const cutoff = 380 + 3200 * Math.exp(-t / 0.07);
    d[i] = softClip(filt(saw(f), cutoff, 0.82) * 1.4, 1.3) * Math.min(1, t / 0.002) * Math.exp(-t / 0.16);
  }
  return finish([d], { fadeOut: 0.05, peak: 0.75 });
}

/** Short string-section stab: detuned saws through a closing low-pass. Stereo. */
export function stab(midis, { seconds = 0.6 } = {}) {
  const [L, R] = blank(seconds, 2);
  const voices = [];
  for (const m of midis) for (const det of [-0.11, 0, 0.12]) voices.push({ f: midiToHz(m) * 2 ** (det / 12), osc: sawOsc(), pan: det < 0 ? 0.25 : det > 0 ? 0.75 : 0.5 });
  const lpL = biquad('lowpass', 2600, 0.8);
  const lpR = biquad('lowpass', 2600, 0.8);
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    let l = 0, r = 0;
    for (const v of voices) {
      const s = v.osc(v.f);
      l += s * (1 - v.pan);
      r += s * v.pan;
    }
    const env = Math.min(1, t / 0.004) * (0.7 * Math.exp(-t / 0.09) + 0.3 * Math.exp(-t / 0.3));
    L[i] = lpL(l) * env;
    R[i] = lpR(r) * env;
  }
  return finish([L, R], { fadeOut: 0.08, peak: 0.75 });
}

// --------------------------------------------------------------- synthetic voice

/** Formant tables (Hz, relative gain, bandwidth Q) for abstract vowels. */
const VOWELS = {
  ah: [[730, 1, 9], [1090, 0.55, 11], [2440, 0.25, 14], [3400, 0.1, 16]],
  oh: [[570, 1, 9], [840, 0.5, 10], [2410, 0.18, 14], [3300, 0.08, 16]],
  oo: [[300, 1, 8], [870, 0.35, 10], [2240, 0.12, 14], [3200, 0.05, 16]],
  eh: [[530, 1, 9], [1840, 0.5, 12], [2480, 0.25, 14], [3500, 0.1, 16]],
};
export const VOWEL_NAMES = Object.keys(VOWELS);

/**
 * A synthetic vocal chop (formant synthesis — not a recorded voice): a glottal-like
 * saw through four vowel formants, a small scoop into the note, light vibrato and breath.
 */
export function voxChop(midi, vowel = 'ah', { seconds = 1.1, seed = 9 } = {}) {
  const [d] = blank(seconds);
  const f = midiToHz(midi);
  const rnd = mulberry32(seed + midi * 7 + vowel.length);
  const saw = sawOsc();
  const forms = (VOWELS[vowel] || VOWELS.ah).map(([fr, g, q]) => ({ f: biquad('bandpass', fr, q), g }));
  const breathF = biquad('bandpass', 2600, 0.8);
  const tilt = biquad('lowpass', 3800, 0.6);
  for (let i = 0; i < d.length; i++) {
    const t = i / SR;
    const scoop = 2 ** ((-0.45 * Math.exp(-t / 0.035)) / 12);
    const vib = 1 + 0.005 * Math.sin(TAU * 5.4 * t) * Math.min(1, Math.max(0, (t - 0.18) / 0.3));
    const src = saw(f * scoop * vib);
    let v = 0;
    for (const fm of forms) v += fm.f(src) * fm.g;
    const breath = breathF(rnd() * 2 - 1) * 0.06;
    const env = Math.min(1, t / 0.012) * (0.85 + 0.15 * Math.exp(-t / 0.2));
    d[i] = tilt(v * 3 + breath) * env;
  }
  return finish([d], { fadeIn: 0.004, fadeOut: 0.12, peak: 0.8 });
}

// ------------------------------------------------------------------ transitions

/** Noise riser that ends exactly at its last sample (play it to land on the bar line). */
export function riser(seconds, { seed = 10 } = {}) {
  const [L, R] = blank(seconds, 2);
  const rnd = mulberry32(seed);
  const fl = svf();
  const fr = svf();
  for (let i = 0; i < L.length; i++) {
    const x = i / L.length;
    const cutoff = 500 * (24 ** x);
    const env = x ** 1.8;
    const tone = Math.sin(TAU * (196 * (1 + x)) * (i / SR)) * 0.12 * env;
    L[i] = fl(rnd() * 2 - 1, cutoff, 0.6) * env + tone;
    R[i] = fr(rnd() * 2 - 1, cutoff * 1.05, 0.6) * env + tone;
  }
  return finish([L, R], { fadeIn: 0.01, fadeOut: 0.012, peak: 0.8 });
}

/** Reverse cymbal: a crash played backwards, swelling into the bar line. */
export function reverseCymbal(seconds, { seed = 11 } = {}) {
  const src = crash({ seed });
  const n = Math.round(seconds * SR);
  const chs = src.channels.map((c) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = c[Math.min(c.length - 1, n - 1 - i)] * (i / n) ** 0.6;
    return out;
  });
  return finish(chs, { fadeIn: 0.02, fadeOut: 0.008, peak: 0.8 });
}

/** A reversed "oh" swell made with the synthetic voice (no recorded vocal). */
export function voxSwell(seconds) {
  const v = voxChop(60, 'oh', { seconds: seconds + 0.2 }).channels[0];
  const n = Math.round(seconds * SR);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = v[Math.min(v.length - 1, n - 1 - i)] * (i / n) ** 1.2;
    L[i] = s;
    R[i] = v[Math.min(v.length - 1, n - 1 - i + 220)] * (i / n) ** 1.2;
  }
  return finish([L, R], { fadeIn: 0.02, fadeOut: 0.008, peak: 0.8 });
}

/** A soft sub drop for the final hit. */
export function impact({ seed = 12 } = {}) {
  const [L, R] = blank(1.8, 2);
  const rnd = mulberry32(seed);
  const lp = biquad('lowpass', 900, 0.6);
  let ph = 0;
  for (let i = 0; i < L.length; i++) {
    const t = i / SR;
    ph += (TAU * (40 + 50 * Math.exp(-t / 0.35))) / SR;
    const sub = Math.sin(ph) * Math.exp(-t / 0.5);
    const n = lp(rnd() * 2 - 1) * Math.exp(-t / 0.25) * 0.6;
    L[i] = (sub + n) * Math.min(1, t / 0.003);
    R[i] = (sub + n * 0.9) * Math.min(1, t / 0.003);
  }
  return finish([L, R], { fadeOut: 0.3, peak: 0.85 });
}

// -------------------------------------------------------------------------- beds

/**
 * Looping beds, exactly `seconds` long and seamless (the end is cross-faded into
 * the start). kind: room (always under the pad) | vinyl (Black) | air (Ice Grey).
 */
export function bed(kind, seconds, { seed = 13 } = {}) {
  const xf = Math.floor(0.4 * SR);
  const n = Math.round(seconds * SR);
  const [L, R] = blank((n + xf) / SR, 2);
  const rnd = mulberry32(seed + kind.length * 101);
  const chans = [L, R];
  chans.forEach((d, ch) => {
    const lp = biquad('lowpass', kind === 'air' ? 9000 : kind === 'vinyl' ? 5200 : 900, 0.6);
    const hp = biquad('highpass', kind === 'air' ? 4200 : kind === 'vinyl' ? 1800 : 120, 0.6);
    let pop = 0;
    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / SR;
      const w = rnd() * 2 - 1;
      if (kind === 'vinyl') {
        if (rnd() < 9 / SR) pop = (rnd() * 2 - 1) * (0.3 + rnd() * 0.7);
        pop *= 0.86;
        const hiss = hp(lp(w)) * 0.18;
        const wob = 1 + 0.0018 * Math.sin(TAU * 0.35 * t + ch);
        p1 += (TAU * midiToHz(53) * wob) / SR;
        p2 += (TAU * midiToHz(60) * wob) / SR;
        const drone = (Math.sin(p1) * 0.5 + Math.sin(p2) * 0.32 + Math.sin(2 * p1) * 0.08) * 0.42 * (0.85 + 0.15 * Math.sin(TAU * 0.11 * t));
        d[i] = hiss + pop * 0.5 + drone;
      } else if (kind === 'air') {
        d[i] = hp(lp(w)) * (0.6 + 0.4 * Math.sin(TAU * 0.07 * t + ch * 1.7));
      } else {
        d[i] = hp(lp(w)) * (0.75 + 0.25 * Math.sin(TAU * 0.05 * t + ch));
      }
    }
  });
  // seamless loop: fade the overhang into the start
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    out[c].set(chans[c].subarray(0, n));
    for (let i = 0; i < xf; i++) {
      const k = i / xf;
      out[c][i] = out[c][i] * k + chans[c][n + i] * (1 - k);
    }
  }
  return finish(out, { fadeIn: 0, fadeOut: 0, peak: 0.6 });
}
