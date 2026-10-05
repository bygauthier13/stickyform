// Synthesis voices. Every function schedules a self-terminating voice on any
// BaseAudioContext (live or offline) starting at time `t`, and connects it to
// `out`. Nothing here knows about the form, the layers or the UI.

import { mulberry32 } from './theory.js';

// ------------------------------------------------------------------- buffers

const cache = new WeakMap();
function cached(ctx, key, build) {
  let m = cache.get(ctx);
  if (!m) cache.set(ctx, (m = new Map()));
  if (!m.has(key)) m.set(key, build());
  return m.get(key);
}

/** 3 s of decorrelated stereo white noise — the raw material for hats, claps, risers. */
export function noiseBuffer(ctx) {
  return cached(ctx, 'white', () => {
    const buf = ctx.createBuffer(2, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const rnd = mulberry32(0x5eed + ch * 101);
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    }
    return buf;
  });
}

/** 8 s seamless-ish stereo pink noise (Kellet filter), looped for air and wind. */
export function pinkBuffer(ctx) {
  return cached(ctx, 'pink', () => {
    const len = Math.floor(ctx.sampleRate * 8);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const rnd = mulberry32(0xa11ce + ch * 313);
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = rnd() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
      // Cross-fade the loop point so the 8 s loop has no click.
      const xf = Math.floor(ctx.sampleRate * 0.25);
      for (let i = 0; i < xf; i++) {
        const k = i / xf;
        d[i] = d[i] * k + d[len - xf + i] * (1 - k);
      }
    }
    return buf;
  });
}

/** Sparse vinyl pops / fine rain, 6 s loop. kind: 'vinyl' | 'rain' */
export function crackleBuffer(ctx, kind = 'vinyl') {
  return cached(ctx, 'crackle-' + kind, () => {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 6);
    const buf = ctx.createBuffer(2, len, sr);
    const rate = kind === 'rain' ? 420 : 14; // events per second
    for (let ch = 0; ch < 2; ch++) {
      const rnd = mulberry32(0xc4ac + ch * 57 + (kind === 'rain' ? 9 : 0));
      const d = buf.getChannelData(ch);
      let tail = 0;
      for (let i = 0; i < len; i++) {
        if (rnd() < rate / sr) tail = (rnd() * 2 - 1) * (0.25 + rnd() * 0.75) ** (kind === 'rain' ? 2 : 3);
        d[i] = tail + (rnd() * 2 - 1) * (kind === 'rain' ? 0.02 : 0.004);
        tail *= kind === 'rain' ? 0.93 : 0.82;
      }
    }
    return buf;
  });
}

// ------------------------------------------------------------------- helpers

function osc(ctx, type, freq, t0, t1, cents = 0) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  if (cents) o.detune.value = cents;
  o.start(t0);
  o.stop(t1);
  return o;
}

function noiseSrc(ctx, t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.start(t, Math.random() * 2.2);
  s.stop(t + dur);
  return s;
}

function biquad(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gainNode(ctx, v) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function panner(ctx, p) {
  const n = ctx.createStereoPanner();
  n.pan.value = p;
  return n;
}

/** Quick percussive envelope: attack to `peak`, exponential-ish decay with time constant `tc`. */
function percEnv(g, t, peak, attack, tc) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, tc);
}

// --------------------------------------------------------------------- drums

/** Soft, round kick: pitch-dropped sine + a triangle "knock" so it reads on small speakers. */
export function kick(ctx, out, t, { vel = 1, decay = 0.34, start = 135, end = 52, click = 0.5 } = {}) {
  const o = osc(ctx, 'sine', start, t, t + decay * 1.8);
  o.frequency.setValueAtTime(start, t);
  o.frequency.exponentialRampToValueAtTime(end, t + 0.08);
  const g = ctx.createGain();
  percEnv(g, t, vel, 0.004, decay / 4.2);
  o.connect(g).connect(out);

  const k = osc(ctx, 'triangle', start * 0.8, t, t + 0.25);
  k.frequency.setValueAtTime(start * 0.8, t);
  k.frequency.exponentialRampToValueAtTime(end * 2.1, t + 0.05);
  const kg = ctx.createGain();
  percEnv(kg, t, vel * 0.26, 0.003, 0.03);
  k.connect(kg).connect(out);

  if (click > 0) {
    const n = noiseSrc(ctx, t, 0.04);
    const hp = biquad(ctx, 'highpass', 2400);
    const ng = ctx.createGain();
    percEnv(ng, t, vel * click * 0.1, 0.001, 0.005);
    n.connect(hp).connect(ng).connect(out);
  }
}

/** Clap: three quick noise bursts and a short body, band-limited so it stays soft. */
export function clap(ctx, out, t, { vel = 0.6, tone = 1500, tail = 0.05 } = {}) {
  const n = noiseSrc(ctx, t, 0.45);
  const bp = biquad(ctx, 'bandpass', tone, 0.9);
  const hp = biquad(ctx, 'highpass', 500);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 3; i++) {
    const ti = t + i * 0.011;
    g.gain.setValueAtTime(0.0001, ti);
    g.gain.linearRampToValueAtTime(vel * 0.7, ti + 0.0012);
    g.gain.setTargetAtTime(0, ti + 0.002, 0.006);
  }
  const tb = t + 0.033;
  g.gain.setValueAtTime(0.0001, tb);
  g.gain.linearRampToValueAtTime(vel, tb + 0.002);
  g.gain.setTargetAtTime(0, tb + 0.002, tail);
  n.connect(bp).connect(hp).connect(g).connect(out);
}

/** Snare-ish rim for hip-hop: short tone + noise. */
export function snare(ctx, out, t, { vel = 0.6, tune = 190 } = {}) {
  const o = osc(ctx, 'triangle', tune, t, t + 0.3);
  o.frequency.setValueAtTime(tune * 1.35, t);
  o.frequency.exponentialRampToValueAtTime(tune, t + 0.04);
  const og = ctx.createGain();
  percEnv(og, t, vel * 0.5, 0.002, 0.05);
  o.connect(og).connect(out);
  const n = noiseSrc(ctx, t, 0.4);
  const bp = biquad(ctx, 'bandpass', 2100, 0.7);
  const ng = ctx.createGain();
  percEnv(ng, t, vel * 0.75, 0.002, 0.07);
  n.connect(bp).connect(ng).connect(out);
}

export function hat(ctx, out, t, { vel = 0.4, open = false, pan = 0, hp = 7400 } = {}) {
  const dur = open ? 0.55 : 0.12;
  const n = noiseSrc(ctx, t, dur);
  const hpf = biquad(ctx, 'highpass', hp, 0.8);
  const lpf = biquad(ctx, 'lowpass', 14500, 0.5);
  const g = ctx.createGain();
  percEnv(g, t, vel, 0.0015, open ? 0.07 : 0.011);
  let node = n.connect(hpf).connect(lpf).connect(g);
  if (pan) node = node.connect(panner(ctx, pan));
  node.connect(out);
}

export function shaker(ctx, out, t, { vel = 0.2, pan = 0 } = {}) {
  const n = noiseSrc(ctx, t, 0.2);
  const bp = biquad(ctx, 'bandpass', 5600, 1.1);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.009);
  g.gain.setTargetAtTime(0, t + 0.009, 0.026);
  let node = n.connect(bp).connect(g);
  if (pan) node = node.connect(panner(ctx, pan));
  node.connect(out);
}

/** Tiny wooden tick — rim click / percussion accent. */
export function tick(ctx, out, t, { vel = 0.3, freq = 1750, pan = 0 } = {}) {
  const o = osc(ctx, 'sine', freq, t, t + 0.08);
  const g = ctx.createGain();
  percEnv(g, t, vel, 0.001, 0.009);
  let node = o.connect(g);
  if (pan) node = node.connect(panner(ctx, pan));
  node.connect(out);
}

// ---------------------------------------------------------------------- bass

/**
 * Bass voices.
 *   pluck — sine sub + filtered saw "bite", house / pop / electronic.
 *   808   — pitch-dropping sine with a long tail, hip-hop.
 *   sub   — clean sustained sine + triangle, ambient.
 */
export function bassNote(ctx, out, t, dur, freq, { vel = 0.8, kind = 'pluck', cutoff = 520 } = {}) {
  const end = t + dur;
  const rel = kind === '808' ? 0.22 : kind === 'sub' ? 0.5 : 0.09;
  const stop = end + rel * 7;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vel, t + (kind === 'sub' ? 0.06 : 0.008));
  if (kind === '808') amp.gain.setTargetAtTime(vel * 0.45, t + 0.01, Math.max(0.15, dur * 0.55));
  amp.gain.setTargetAtTime(0, end, rel / 2.2);
  amp.connect(out);

  const sub = osc(ctx, 'sine', freq, t, stop);
  if (kind === '808') {
    sub.frequency.setValueAtTime(freq * 2.1, t);
    sub.frequency.exponentialRampToValueAtTime(freq, t + 0.045);
  }
  sub.connect(amp);

  if (kind === 'pluck') {
    const saw = osc(ctx, 'sawtooth', freq, t, stop);
    const lp = biquad(ctx, 'lowpass', cutoff * 1.9, 2.2);
    lp.frequency.setValueAtTime(cutoff * 1.9, t);
    lp.frequency.setTargetAtTime(cutoff * 0.55, t + 0.008, 0.09);
    const sg = gainNode(ctx, 0.34);
    saw.connect(lp).connect(sg).connect(amp);
  } else {
    const tri = osc(ctx, 'triangle', freq * 2, t, stop);
    const tg = gainNode(ctx, kind === '808' ? 0.12 : 0.18);
    tri.connect(tg).connect(amp);
  }
}

// ------------------------------------------------------------------- harmony

/**
 * Sustained pad chord: three detuned oscillators per note, spread across the
 * stereo field, through a slowly opening lowpass with its own gentle drift.
 */
export function padChord(
  ctx, out, t, dur, freqs,
  { vel = 0.1, cutoff = 1500, attack = 0.55, release = 1, detune = 9, wave = 'sawtooth', spread = 0.75, drift = 0.12 } = {},
) {
  const end = t + dur;
  const stop = end + release * 1.6;
  const amp = ctx.createGain();
  const v = vel / Math.sqrt(freqs.length);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(v, t + attack);
  amp.gain.setValueAtTime(v, end);
  amp.gain.linearRampToValueAtTime(0.0001, end + release);

  const lp = biquad(ctx, 'lowpass', cutoff, 0.6);
  lp.frequency.setValueAtTime(cutoff * 0.42, t);
  lp.frequency.linearRampToValueAtTime(cutoff, t + attack * 1.4);
  lp.frequency.setTargetAtTime(cutoff * 0.7, end, release * 0.5);
  amp.connect(lp).connect(out);

  // slow cutoff drift keeps a held chord from sounding static
  const lfo = osc(ctx, 'sine', drift + Math.random() * 0.06, t, stop);
  const lfoG = gainNode(ctx, cutoff * 0.16);
  lfo.connect(lfoG).connect(lp.frequency);

  // two detuned voices per note, panned apart, make a wide, slowly beating chord
  const groups = [-1, 1].map((d) => {
    const g = gainNode(ctx, 0.85);
    g.connect(panner(ctx, d * spread)).connect(amp);
    return { g, cents: d * detune };
  });
  for (const f of freqs) {
    for (const { g, cents } of groups) osc(ctx, wave, f, t, stop, cents + (Math.random() - 0.5) * 3).connect(g);
  }
}

/**
 * Soft FM electric piano (Rhodes-style): warm body plus a short "tine" on the
 * attack. A stab is voiced as a chord so its notes share one filter and pan.
 */
export function epChord(ctx, out, t, dur, freqs, { vel = 0.1, bright = 0.5, pan = 0 } = {}) {
  const lp = biquad(ctx, 'lowpass', 2600 + bright * 4200, 0.5);
  let node = lp;
  if (pan) node = lp.connect(panner(ctx, pan));
  node.connect(out);
  const idx = 0.9 + bright * 1.6;

  freqs.forEach((freq, i) => {
    const tt = t + i * 0.006 + Math.random() * 0.003;
    const stop = tt + dur + 0.9;
    const car = osc(ctx, 'sine', freq, tt, stop);
    const mod = osc(ctx, 'sine', freq, tt, stop);
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(freq * idx, tt);
    modG.gain.setTargetAtTime(freq * idx * 0.16, tt, 0.3);
    mod.connect(modG).connect(car.frequency);

    const tine = osc(ctx, 'sine', freq * 14, tt, tt + 0.12);
    const tg = ctx.createGain();
    percEnv(tg, tt, vel * 0.1 * (0.4 + bright), 0.002, 0.018);
    tine.connect(tg).connect(lp);

    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, tt);
    amp.gain.linearRampToValueAtTime(vel, tt + 0.004);
    amp.gain.setTargetAtTime(vel * 0.4, tt + 0.004, 0.5);
    amp.gain.setTargetAtTime(0, tt + dur, 0.1);
    car.connect(amp).connect(lp);
  });
}

/** Vowel-ish choir pad: detuned saws through parallel formant filters. */
export function choirChord(ctx, out, t, dur, freqs, { vel = 0.1, vowel = 'ah', attack = 0.9, release = 1.4 } = {}) {
  const FORMANTS = {
    ah: [[730, 1], [1090, 0.5], [2440, 0.22]],
    oo: [[310, 1], [870, 0.35], [2250, 0.12]],
    eh: [[530, 1], [1840, 0.45], [2480, 0.2]],
  };
  const end = t + dur;
  const stop = end + release * 1.6;
  const sum = ctx.createGain();
  const v = vel / Math.sqrt(freqs.length);
  sum.gain.setValueAtTime(0.0001, t);
  sum.gain.linearRampToValueAtTime(v, t + attack);
  sum.gain.setValueAtTime(v, end);
  sum.gain.linearRampToValueAtTime(0.0001, end + release);

  const vib = osc(ctx, 'sine', 4.6 + Math.random() * 0.5, t, stop);
  const vibG = ctx.createGain();
  vibG.gain.setValueAtTime(0, t);
  vibG.gain.linearRampToValueAtTime(7, t + 1.2);
  vib.connect(vibG);

  for (const f of freqs) {
    for (const cents of [-9, 9]) {
      const o = osc(ctx, 'sawtooth', f, t, stop, cents);
      vibG.connect(o.detune);
      o.connect(sum);
    }
  }
  for (const [freq, g] of FORMANTS[vowel] || FORMANTS.ah) {
    const bp = biquad(ctx, 'bandpass', freq, 7);
    const fg = gainNode(ctx, g * 2.6);
    sum.connect(bp).connect(fg).connect(out);
  }
}

// ----------------------------------------------------------------- melodic

/** Glassy FM mallet / bell. Used for chimes, sparkle and the "glass" lead. */
export function bell(ctx, out, t, freq, { vel = 0.08, decay = 3, pan = 0, bright = 1, ratio = 3.5, shimmer = true } = {}) {
  const stop = t + decay * 1.7;
  const car = osc(ctx, 'sine', freq, t, stop);
  const mod = osc(ctx, 'sine', freq * ratio, t, stop);
  const modG = ctx.createGain();
  modG.gain.setValueAtTime(freq * 1.1 * bright, t);
  modG.gain.setTargetAtTime(freq * 0.04, t, 0.12);
  mod.connect(modG).connect(car.frequency);

  const amp = ctx.createGain();
  percEnv(amp, t, vel, 0.004, decay / 5);
  car.connect(amp);

  let node = amp;
  if (shimmer) {
    // an octave partial that dies faster than the fundamental — the "glass"
    const up = osc(ctx, 'sine', freq * 2, t, stop);
    const ug = ctx.createGain();
    percEnv(ug, t, vel * 0.18, 0.004, decay / 11);
    up.connect(ug);
    node = ctx.createGain();
    amp.connect(node);
    ug.connect(node);
  }
  if (pan) node = node.connect(panner(ctx, pan));
  node.connect(out);
}

/** Short filtered pluck used by the pulse layer — a muted, marimba-ish tick. */
export function pluckTick(ctx, out, t, freq, { vel = 0.1, decay = 0.2, cutoff = 1800, pan = 0 } = {}) {
  const stop = t + decay * 2.8;
  const a = osc(ctx, 'triangle', freq, t, stop);
  const b = osc(ctx, 'sine', freq * 2, t, stop);
  const bg = gainNode(ctx, 0.22);
  const lp = biquad(ctx, 'lowpass', cutoff, 0.5);
  lp.frequency.setValueAtTime(cutoff * 1.7, t);
  lp.frequency.setTargetAtTime(cutoff * 0.55, t, decay * 0.4);
  const g = ctx.createGain();
  percEnv(g, t, vel, 0.003, decay / 4);
  a.connect(lp);
  b.connect(bg).connect(lp);
  let node = lp.connect(g);
  if (pan) node = node.connect(panner(ctx, pan));
  node.connect(out);
}

/**
 * Lead voices for the melodic motif.
 *   glass   — FM mallet, airy and bright
 *   pluck   — filtered saw pluck, classic electronic
 *   felt    — soft sine/triangle with late vibrato, ambient / cinematic
 *   kalimba — thumb-piano, organic
 */
export function lead(ctx, out, t, dur, freq, { kind = 'glass', vel = 0.14, pan = 0, bright = 0.5 } = {}) {
  switch (kind) {
    case 'pluck': {
      const stop = t + Math.max(dur, 0.3) + 0.6;
      const lp = biquad(ctx, 'lowpass', 3600, 2.4);
      lp.frequency.setValueAtTime(900 + bright * 5000, t);
      lp.frequency.setTargetAtTime(500 + bright * 600, t + 0.004, 0.13);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * 0.8, t + 0.005);
      g.gain.setTargetAtTime(vel * 0.25, t + 0.005, 0.12);
      g.gain.setTargetAtTime(0, t + dur, 0.07);
      osc(ctx, 'sawtooth', freq, t, stop, -7).connect(lp);
      osc(ctx, 'sawtooth', freq, t, stop, 7).connect(lp);
      let node = lp.connect(g);
      if (pan) node = node.connect(panner(ctx, pan));
      node.connect(out);
      return;
    }
    case 'felt': {
      const stop = t + dur + 1.2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * 0.9, t + 0.03);
      g.gain.setTargetAtTime(vel * 0.62, t + 0.03, 0.4);
      g.gain.setTargetAtTime(0, t + dur, 0.16);
      const lp = biquad(ctx, 'lowpass', 1800 + bright * 2400, 0.5);
      const vib = osc(ctx, 'sine', 5.1, t, stop);
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(0, t);
      vg.gain.linearRampToValueAtTime(0, t + 0.28);
      vg.gain.linearRampToValueAtTime(8, t + 0.8);
      vib.connect(vg);
      const o1 = osc(ctx, 'triangle', freq, t, stop);
      const o2 = osc(ctx, 'sine', freq * 2, t, stop);
      const g2 = gainNode(ctx, 0.2);
      vg.connect(o1.detune);
      vg.connect(o2.detune);
      o1.connect(lp);
      o2.connect(g2).connect(lp);
      let node = lp.connect(g);
      if (pan) node = node.connect(panner(ctx, pan));
      node.connect(out);
      return;
    }
    case 'kalimba': {
      const decay = Math.min(1.3, 0.35 + dur * 0.12);
      const stop = t + decay * 2.2;
      const g = ctx.createGain();
      percEnv(g, t, vel * 1.05, 0.002, decay / 4);
      const o1 = osc(ctx, 'sine', freq, t, stop);
      const o2 = osc(ctx, 'sine', freq * 5.4, t, t + 0.3);
      const g2 = ctx.createGain();
      percEnv(g2, t, vel * 0.16, 0.001, 0.035);
      o1.connect(g);
      o2.connect(g2).connect(g);
      const th = noiseSrc(ctx, t, 0.03);
      const bp = biquad(ctx, 'bandpass', 2200, 1.4);
      const tg = ctx.createGain();
      percEnv(tg, t, vel * 0.1, 0.001, 0.004);
      th.connect(bp).connect(tg).connect(g);
      let node = g;
      if (pan) node = node.connect(panner(ctx, pan));
      node.connect(out);
      return;
    }
    case 'glass':
    default:
      bell(ctx, out, t, freq, { vel: vel * 1.1, decay: Math.min(2.6, 0.9 + dur * 0.16), pan, bright: 0.55 + bright * 0.5, ratio: 3 });
  }
}

// ------------------------------------------------------ transitions & impact

/** Filtered-noise swell with a rising sine underneath, ending exactly at t + dur. */
export function riser(ctx, out, t, dur, { vel = 0.2, from = 400, to = 9000, tone = 220, pan = 0 } = {}) {
  const d = Math.min(dur, 2.8);
  const t0 = t + dur - d;
  const end = t0 + d;
  const n = noiseSrc(ctx, t0, d + 0.1);
  const bp = biquad(ctx, 'bandpass', from, 1.2);
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(to, end);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vel, end - 0.04);
  g.gain.linearRampToValueAtTime(0.0001, end + 0.06);
  let node = n.connect(bp).connect(g);
  if (pan) node = node.connect(panner(ctx, pan));
  node.connect(out);

  const o = osc(ctx, 'sine', tone, t0, end + 0.1);
  o.frequency.setValueAtTime(tone, t0);
  o.frequency.exponentialRampToValueAtTime(tone * 2, end);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, t0);
  og.gain.exponentialRampToValueAtTime(vel * 0.5, end - 0.04);
  og.gain.linearRampToValueAtTime(0.0001, end + 0.06);
  o.connect(og).connect(out);
}

/** Soft sub "whump" — an arrival, not an explosion. */
export function impact(ctx, out, t, { vel = 0.4, freq = 62, length = 2.4 } = {}) {
  const o = osc(ctx, 'sine', freq * 1.5, t, t + length * 1.6);
  o.frequency.setValueAtTime(freq * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.62, t + 0.9);
  const g = ctx.createGain();
  percEnv(g, t, vel, 0.006, length / 5);
  o.connect(g).connect(out);

  const n = noiseSrc(ctx, t, length);
  const lp = biquad(ctx, 'lowpass', 900, 0.6);
  lp.frequency.setValueAtTime(1800, t);
  lp.frequency.setTargetAtTime(220, t, 0.4);
  const ng = ctx.createGain();
  percEnv(ng, t, vel * 0.45, 0.004, length / 7);
  n.connect(lp).connect(ng).connect(out);
}

/** Looping noise bed (air / wind / rain / vinyl). Returns { gain, stop(t) }. */
export function loopBed(ctx, out, t, buffer, { gain = 0.2, type = 'bandpass', freq = 1400, q = 0.5, lfoRate = 0.04, lfoDepth = 600, hp = 200 } = {}) {
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  s.loop = true;
  s.start(t, Math.random() * 3);
  const f = biquad(ctx, type, freq, q);
  const hpf = biquad(ctx, 'highpass', hp, 0.6);
  const g = gainNode(ctx, gain);
  const lfo = osc(ctx, 'sine', lfoRate, t, t + 3600);
  const lg = gainNode(ctx, lfoDepth);
  lfo.connect(lg).connect(f.frequency);
  s.connect(f).connect(hpf).connect(g).connect(out);
  return {
    gain: g,
    stop(at) {
      s.stop(at);
      lfo.stop(at);
    },
  };
}
