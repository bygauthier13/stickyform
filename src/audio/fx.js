// Mixing infrastructure: buses, sends, reverb, delay, chorus and the master
// chain. Works identically on AudioContext and OfflineAudioContext, which is
// what lets the downloadable file sound exactly like the live experience.

import { mulberry32 } from './theory.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Procedural hall: decaying stereo noise that gets darker as it fades. */
export function createReverbIR(ctx, { seconds = 3.6, rt60 = 3.1, seed = 11 } = {}) {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = mulberry32(seed + ch * 977);
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp((-6.9 * t) / rt60);
      const fc = 9500 * Math.pow(1500 / 9500, Math.min(1, (t / seconds) * 1.25));
      const a = 1 - Math.exp((-2 * Math.PI * fc) / sr);
      lp += a * ((rnd() * 2 - 1) * env - lp);
      d[i] = lp * Math.min(1, t / 0.018); // soft onset avoids a harsh "slap"
    }
  }
  return buf;
}

function softClipCurve(k = 1.4, n = 2048) {
  const c = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / norm;
  }
  return c;
}

/** Stereo chorus: two modulated short delays, wide and slow — turns saws into strings. */
export function createChorus(ctx, { rate = 0.32, depth = 0.0035, mix = 0.55 } = {}) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 1 - mix * 0.35;
  input.connect(dry).connect(output);
  const lfos = [];
  [0.0165, 0.0255].forEach((base, i) => {
    const d = ctx.createDelay(0.06);
    d.delayTime.value = base;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate * (1 + i * 0.17);
    const lg = ctx.createGain();
    lg.gain.value = depth * (i ? -1 : 1);
    lfo.connect(lg).connect(d.delayTime);
    const p = ctx.createStereoPanner();
    p.pan.value = i ? 0.85 : -0.85;
    const wet = ctx.createGain();
    wet.gain.value = mix;
    input.connect(d).connect(p).connect(wet).connect(output);
    lfos.push(lfo);
  });
  let started = false;
  return {
    input,
    output,
    start(t) {
      if (started) return;
      started = true;
      lfos.forEach((l) => l.start(t));
    },
    stop(t) {
      if (started) lfos.forEach((l) => l.stop(t));
    },
  };
}

/**
 * A mixer channel. Voices connect to `input`. The chain is
 *   input → [saturation] → [chorus] → duck → level → [pan] → mixer.dry
 * with reverb / delay sends taken after `level` so a fading layer also fades its tails.
 */
export class Bus {
  constructor(ctx, mixer, { reverb = 0, delay = 0, pan = 0, duck = 0, level = 0, shaper = false, chorus = null, meter = false } = {}) {
    this.ctx = ctx;
    this.duckDepth = duck;
    this.input = ctx.createGain();
    let node = this.input;

    if (shaper) {
      const sh = ctx.createWaveShaper();
      sh.curve = softClipCurve(shaper === true ? 1.7 : shaper);
      sh.oversample = '2x';
      node = node.connect(sh);
    }
    if (chorus) {
      this.chorus = createChorus(ctx, chorus);
      node.connect(this.chorus.input);
      node = this.chorus.output;
    }
    this.duckGain = ctx.createGain();
    node = node.connect(this.duckGain);
    this.level = ctx.createGain();
    this.level.gain.value = level;
    this._v = level;
    node = node.connect(this.level);
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(mixer.dry);
    if (reverb) node.connect(this._send(reverb, mixer.reverbIn));
    if (delay) node.connect(this._send(delay, mixer.delayIn));
    if (meter) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0;
      node.connect(this.analyser);
    }
    if (duck > 0) mixer.duckBuses.push(this);
  }

  _send(amount, dest) {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    g.connect(dest);
    return g;
  }

  /** Ramp the channel level; call at bar boundaries. */
  setLevel(t, v, ramp = 0.5) {
    const g = this.level.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(this._v, t);
    g.linearRampToValueAtTime(v, t + Math.max(ramp, 0.005));
    this._v = v;
  }

  /** Sidechain-style pump: dip fast at `t`, swell back. Scaled by this bus's duck depth. */
  duck(t, amount, release = 0.17) {
    const depth = clamp(this.duckDepth * amount, 0, 0.9);
    if (depth < 0.02) return;
    const g = this.duckGain.gain;
    g.setTargetAtTime(1 - depth, t - 0.002, 0.005);
    g.setTargetAtTime(1, t + 0.05, release / 3);
  }
}

/**
 * Builds the full signal path and returns handles. Connect `mixer.master` to a
 * destination (live: through the user's sound gate; offline: ctx.destination).
 */
export function createMixer(ctx) {
  const mixer = { ctx, duckBuses: [] };
  const mk = (v = 1) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };

  mixer.dry = mk(1);
  mixer.mix = mk(1);
  mixer.dry.connect(mixer.mix);

  // ---- reverb (hall) -------------------------------------------------------
  mixer.reverbIn = mk(1);
  const pre = ctx.createDelay(0.2);
  pre.delayTime.value = 0.024;
  const conv = ctx.createConvolver();
  conv.buffer = createReverbIR(ctx);
  const rhp = ctx.createBiquadFilter();
  rhp.type = 'highpass';
  rhp.frequency.value = 260;
  const rlp = ctx.createBiquadFilter();
  rlp.type = 'lowpass';
  rlp.frequency.value = 6200;
  mixer.reverbReturn = mk(0.6);
  mixer.reverbIn.connect(pre).connect(conv).connect(rhp).connect(rlp).connect(mixer.reverbReturn).connect(mixer.mix);

  // ---- ping-pong delay (tempo-synced to a dotted eighth) --------------------
  mixer.delayIn = mk(1);
  const dL = ctx.createDelay(2);
  const dR = ctx.createDelay(2);
  dL.delayTime.value = dR.delayTime.value = 0.4;
  const fbL = mk(0.36);
  const fbR = mk(0.36);
  const tone = (f) => {
    const l = ctx.createBiquadFilter();
    l.type = 'lowpass';
    l.frequency.value = f;
    return l;
  };
  const dhp = ctx.createBiquadFilter();
  dhp.type = 'highpass';
  dhp.frequency.value = 280;
  const lpL = tone(3000);
  const lpR = tone(3000);
  const pL = ctx.createStereoPanner();
  pL.pan.value = -0.7;
  const pR = ctx.createStereoPanner();
  pR.pan.value = 0.7;
  mixer.delayReturn = mk(0.75);
  mixer.delayIn.connect(dhp).connect(dL);
  dL.connect(lpL).connect(fbL).connect(dR);
  dR.connect(lpR).connect(fbR).connect(dL);
  dL.connect(pL).connect(mixer.delayReturn);
  dR.connect(pR).connect(mixer.delayReturn);
  mixer.delayReturn.connect(mixer.mix);
  mixer.delayL = dL;
  mixer.delayR = dR;

  // ---- master chain ---------------------------------------------------------
  // tone (brightness that opens as the piece develops) → soft saturation →
  // low cut / EQ → safety limiter → master gain
  mixer.tone = ctx.createBiquadFilter();
  mixer.tone.type = 'lowpass';
  mixer.tone.frequency.value = 4000;
  mixer.tone.Q.value = 0.5;
  const sat = ctx.createWaveShaper();
  sat.curve = softClipCurve(1.15);
  sat.oversample = '2x';
  const lowcut = ctx.createBiquadFilter();
  lowcut.type = 'highpass';
  lowcut.frequency.value = 30;
  lowcut.Q.value = 0.6;
  const mud = ctx.createBiquadFilter();
  mud.type = 'peaking';
  mud.frequency.value = 320;
  mud.Q.value = 0.9;
  mud.gain.value = -1.6;
  const air = ctx.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 8500;
  air.gain.value = 1.4;
  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 0.8;
  presence.gain.value = 2;

  // UI sounds join after the tone filter so they stay crisp
  mixer.ui = mk(1);
  // Safety limiter only: transparent unless a peak would clip. (Chrome's
  // compressors add automatic makeup gain, so heavier settings turn into a
  // loudness maximiser — final loudness is handled in the render step instead.)
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -1.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.09;
  mixer.master = mk(0.34);
  mixer.limiter = limiter;

  mixer.mix.connect(mixer.tone).connect(sat).connect(lowcut).connect(mud).connect(presence).connect(air).connect(limiter);
  mixer.ui.connect(limiter);
  limiter.connect(mixer.master);

  // ---- helpers ---------------------------------------------------------------
  mixer.createBus = (opts) => new Bus(ctx, mixer, opts);

  /** Keep the delay locked to the tempo: dotted eighth = 3 sixteenths. */
  mixer.setTempo = (t, bpm) => {
    const dotted = (60 / bpm) * 0.75;
    mixer.delayL.delayTime.setTargetAtTime(dotted, t, 0.15);
    mixer.delayR.delayTime.setTargetAtTime(dotted, t, 0.15);
  };
  mixer.setSpace = (t, v, ramp = 1) => {
    mixer.reverbReturn.gain.setTargetAtTime(v, t, ramp / 3);
  };
  mixer.setTone = (t, hz, ramp = 1) => {
    mixer.tone.frequency.setTargetAtTime(clamp(hz, 700, 20000), t, ramp / 3);
  };
  /** Sidechain pump on every ducking bus at the kick time. */
  mixer.pump = (t, amount, release) => {
    for (const b of mixer.duckBuses) b.duck(t, amount, release);
  };

  return mixer;
}
