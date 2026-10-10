// The eight musical layers. Each layer is an independent generator that is
// asked, bar by bar, to schedule its notes on the shared timeline. They never
// talk to each other directly — they only read the same `env` (chord, groove,
// progress, profile) — which is what keeps them compatible.
//
//   0 Ambient     air, a D–A drone and sparse glass chimes
//   1 Pulse       a muted plucked ostinato
//   2 Bass        sub + bite, pattern follows the groove
//   3 Rhythm      kick → hats → clap → extras, staged by progress
//   4 Harmony     chord pad + electric-piano comping
//   5 Melody      a chord-aware motif, seeded by the user's own words
//   6 Texture     choir, sparkle arpeggio, vinyl / rain
//   7 Resolution  risers, arrivals and the final cadence

import * as S from './synth.js';
import { hit } from './drumBank.js';
import { bassMidi, chordLadder, melodyPitch, midiToHz, MOTIFS, settleNote } from './theory.js';

export const LAYER_NAMES = ['Ambient', 'Pulse', 'Bass', 'Rhythm', 'Harmony', 'Melody', 'Texture', 'Resolution'];
/** Progress (0–1) at which each layer first enters. Layer 8 only appears at the end. */
export const LAYER_ENTER = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (p, a, b) => {
  const x = clamp01((p - a) / (b - a));
  return x * x * (3 - 2 * x);
};

function makeLayer(name, buses) {
  return {
    name,
    buses,
    level: 0,
    meterBus: buses[0],
    init() {},
    bar() {},
    stop() {},
    setLevel(t, v, ramp) {
      this.level = v;
      for (const b of buses) b.setLevel(t, v, ramp);
    },
  };
}

// ---------------------------------------------------------------- 0 · ambient

function ambientLayer(ctx, mixer, live) {
  const bus = mixer.createBus({ reverb: 0.55, delay: 0.08, duck: 0.4, meter: live });
  const L = makeLayer('Ambient', [bus]);
  let bed = null;
  const stops = [];

  L.init = (t) => {
    const drone = ctx.createGain();
    drone.gain.value = 0.8;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    lp.connect(hp).connect(drone).connect(bus.input);

    const mkOsc = (type, freq, cents, dest, g) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = cents;
      const og = ctx.createGain();
      og.gain.value = g;
      o.connect(og).connect(dest);
      o.start(t);
      stops.push(o);
      return o;
    };
    // An open fifth (D–A) spread over three octaves: D3 saws and A3 / D4 triangles
    // through the lowpass, a quiet D2 sine underneath, and a soft A4 sine for air.
    mkOsc('sawtooth', midiToHz(50), -7, lp, 0.04);
    mkOsc('sawtooth', midiToHz(50), 7, lp, 0.04);
    mkOsc('triangle', midiToHz(57), 0, lp, 0.05);
    mkOsc('triangle', midiToHz(62), 4, lp, 0.045);
    mkOsc('sine', midiToHz(69), 0, drone, 0.02);
    mkOsc('sine', midiToHz(38), 0, drone, 0.035);

    const lfo = (rate, depth, param) => {
      const o = ctx.createOscillator();
      o.frequency.value = rate;
      const g = ctx.createGain();
      g.gain.value = depth;
      o.connect(g).connect(param);
      o.start(t);
      stops.push(o);
    };
    lfo(0.043, 260, lp.frequency); // filter breathing
    lfo(0.021, 0.2, drone.gain); // slow swell

    bed = S.loopBed(ctx, bus.input, t, S.pinkBuffer(ctx), { gain: 0.2, freq: 1500, q: 0.55, lfoRate: 0.031, lfoDepth: 800, hp: 400 });
  };

  L.stop = (t) => {
    stops.forEach((o) => o.stop(t));
    bed?.stop(t);
  };

  L.bar = (env) => {
    const { ctx: c, p, rnd, chord, at, bar, barDur } = env;
    // "very sparse" while alone; thins out further as the arrangement fills in.
    const prob = bar === 0 ? 1 : p < 0.15 ? 0.45 : 0.28;
    if (rnd() > prob) return;
    const ladder = chordLadder(chord, 72, 91);
    const note = ladder[Math.floor(rnd() * ladder.length)];
    const step = bar === 0 ? 3 : [0, 2, 3, 6, 8, 10][Math.floor(rnd() * 6)];
    const pan = (rnd() - 0.5) * 1.2;
    S.bell(c, bus.input, at(step), midiToHz(note), { vel: 0.075, decay: Math.min(5, barDur * 2.2), pan });
    if (rnd() < 0.35) {
      const low = ladder[Math.max(0, ladder.indexOf(note) - 2)];
      S.bell(c, bus.input, at(step + 3), midiToHz(low), { vel: 0.045, decay: 4, pan: -pan });
    }
  };
  return L;
}

// ------------------------------------------------------------------ 1 · pulse

const PULSE_STEPS = {
  default: [0, 3, 6, 8, 11, 14],
  sparse: [0, 6, 10],
  broken: [0, 3, 5, 8, 11, 13],
};
const PULSE_SEQ = [1, 3, 2, 4, 2, 3];

function pulseLayer(ctx, mixer, live) {
  const bus = mixer.createBus({ reverb: 0.32, delay: 0.5, duck: 0.5, meter: live });
  const L = makeLayer('Pulse', [bus]);
  L.bar = (env) => {
    const { ctx: c, profile, chord, at, rnd } = env;
    const steps = profile.groove === 'ambient' ? PULSE_STEPS.sparse : profile.groove === 'broken' ? PULSE_STEPS.broken : PULSE_STEPS.default;
    const ladder = chordLadder(chord, 55, 79);
    const cutoff = 1000 + 2400 * (0.3 + 0.7 * profile.bright);
    const decay = profile.groove === 'ambient' ? 0.5 : 0.2;
    steps.forEach((step, i) => {
      const idx = (PULSE_SEQ[i % PULSE_SEQ.length] + (env.cycleBar % 2 ? 1 : 0)) % ladder.length;
      const accent = i === 0 ? 1 : i % 3 === 0 ? 0.8 : 0.62;
      const vel = 0.11 * accent * (0.85 + rnd() * 0.3);
      S.pluckTick(c, bus.input, at(step) + (rnd() - 0.5) * 0.004, midiToHz(ladder[idx]), {
        vel,
        decay,
        cutoff,
        pan: i % 2 ? 0.32 : -0.32,
      });
    });
  };
  return L;
}

// ------------------------------------------------------------------- 2 · bass

// [step, lengthInSteps, semitones above root, velocity]
const BASS = {
  house: [[2, 2, 0, 0.9], [6, 2, 0, 0.9], [10, 2, 0, 0.9], [11, 1, 12, 0.42], [14, 2, 7, 0.75]],
  pop: [[0, 3, 0, 1], [3, 2, 0, 0.62], [6, 2, 7, 0.75], [8, 3, 0, 0.9], [11, 2, 0, 0.62], [14, 2, 7, 0.7]],
  hiphop: [[0, 6, 0, 1], [7, 2, 0, 0.62], [10, 5, 0, 0.88]],
  electro: [[0, 2, 0, 0.9], [2, 1, 0, 0.55], [3, 2, 12, 0.55], [6, 2, 0, 0.8], [8, 2, 0, 0.9], [10, 1, 0, 0.55], [11, 2, 12, 0.55], [14, 2, 7, 0.75]],
  ambient: [[0, 15, 0, 0.85]],
  broken: [[0, 3, 0, 1], [3, 2, 0, 0.55], [8, 3, 0, 0.88], [11, 2, 7, 0.75], [14, 1, 12, 0.55]],
};

function bassLayer(ctx, mixer, live) {
  const bus = mixer.createBus({ duck: 0.3, shaper: 1.6, meter: live });
  const L = makeLayer('Bass', [bus]);
  L.bar = (env) => {
    const { ctx: c, profile, chord, at, stepDur, st, cycleBar, barDur } = env;
    const root = bassMidi(chord.root);
    const kind = profile.groove === 'hiphop' ? '808' : profile.groove === 'ambient' ? 'sub' : 'pluck';
    const cutoff = 360 + 520 * profile.bright + 240 * profile.energy;

    if (st.resolve >= 2) {
      // The final long note: a clean sub that lets the chord bloom.
      S.bassNote(c, bus.input, at(0), barDur * (st.resolve === 2 ? 1.8 : 0.9), midiToHz(root), { vel: 0.8, kind: 'sub' });
      return;
    }
    const pattern = BASS[profile.groove] || BASS.electro;
    pattern.forEach(([step, len, interval, v], i) => {
      // turnaround: lift the last hit of a cycle an octave for movement
      const oct = cycleBar === 3 && i === pattern.length - 1 && profile.groove !== 'ambient' ? 12 : 0;
      S.bassNote(c, bus.input, at(step), len * stepDur * 0.94, midiToHz(root + interval + oct), {
        vel: 0.62 * v * (0.8 + 0.2 * profile.drive),
        kind,
        cutoff,
      });
    });
  };
  return L;
}

// ---------------------------------------------------------------- 3 · rhythm

const evenly = (vel, from = 0, to = 15, every = 2) => {
  const o = {};
  for (let s = from; s <= to; s += every) o[s] = vel;
  return o;
};

const DRUMS = {
  house: {
    kick: { 0: 1, 4: 1, 8: 1, 12: 1 },
    clap: { 4: 0.85, 12: 0.85 },
    ohat: { 2: 0.55, 6: 0.55, 10: 0.55, 14: 0.55 },
    chat: { 1: 0.16, 3: 0.2, 5: 0.16, 7: 0.2, 9: 0.16, 11: 0.2, 13: 0.16, 15: 0.2 },
    xtra: { ...evenly(0.12, 0, 15, 1) },
  },
  pop: {
    kick: { 0: 1, 8: 0.9, 10: 0.5 },
    clap: { 4: 0.85, 12: 0.85 },
    ohat: { 14: 0.4 },
    chat: { 0: 0.36, 2: 0.26, 4: 0.36, 6: 0.26, 8: 0.36, 10: 0.26, 12: 0.36, 14: 0.26 },
    xtra: { 1: 0.1, 3: 0.1, 5: 0.1, 7: 0.1, 9: 0.1, 11: 0.1, 13: 0.1, 15: 0.1 },
  },
  hiphop: {
    snare: true,
    kick: { 0: 1, 7: 0.62, 10: 0.88 },
    clap: { 4: 0.9, 12: 0.9 },
    ohat: {},
    chat: { 0: 0.42, 2: 0.28, 4: 0.42, 6: 0.28, 8: 0.42, 10: 0.28, 12: 0.42, 14: 0.28, 15: 0.16 },
    xtra: {},
  },
  electro: {
    kick: { 0: 1, 4: 1, 8: 1, 12: 1 },
    clap: { 4: 0.8, 12: 0.8 },
    ohat: { 6: 0.35, 14: 0.35 },
    chat: { 0: 0.26, 1: 0.12, 2: 0.32, 3: 0.12, 4: 0.26, 5: 0.12, 6: 0.32, 7: 0.12, 8: 0.26, 9: 0.12, 10: 0.32, 11: 0.12, 12: 0.26, 13: 0.12, 14: 0.32, 15: 0.14 },
    xtra: { 3: 0.5, 7: 0.34, 11: 0.5, 15: 0.3 },
    tickXtra: true,
  },
  ambient: {
    kick: { 0: 0.55, 8: 0.32 },
    clap: {},
    ohat: {},
    chat: { 4: 0.12, 12: 0.12 },
    xtra: { 2: 0.16, 6: 0.14, 10: 0.16, 14: 0.12 },
  },
  broken: {
    snare: true,
    kick: { 0: 1, 3: 0.55, 8: 0.85, 11: 0.6 },
    clap: { 6: 0.7, 12: 0.85 },
    ohat: { 14: 0.45 },
    chat: { 2: 0.34, 5: 0.24, 7: 0.34, 10: 0.24, 13: 0.34, 15: 0.2 },
    xtra: { 5: 0.34, 9: 0.44 },
    tickXtra: true,
  },
};

// Hats, claps and shakers are far quieter than a kick for the same velocity,
// so they get a fixed boost to sit ~6 dB under it.
const PERC = 4.7;

function rhythmLayer(ctx, mixer, live) {
  const kickBus = mixer.createBus({ meter: live });
  const hatL = mixer.createBus({ reverb: 0.08, delay: 0.06, pan: -0.22 });
  const hatR = mixer.createBus({ reverb: 0.08, delay: 0.06, pan: 0.22 });
  const clapBus = mixer.createBus({ reverb: 0.4 });
  const L = makeLayer('Rhythm', [kickBus, hatL, hatR, clapBus]);
  L.meterBus = kickBus;

  L.bar = (env) => {
    const { ctx: c, profile, p, at, rnd, st, bank: B, bar, mixer: m } = env;
    const g = DRUMS[profile.groove] || DRUMS.electro;
    const e = 0.55 + 0.45 * profile.energy;
    const hiphop = profile.groove === 'hiphop';
    const kickKey = hiphop ? 'kick808' : profile.groove === 'ambient' ? 'kickSoft' : 'kick';
    const j = () => (rnd() - 0.5) * 0.005;
    const rate = () => 1 + (rnd() - 0.5) * 0.035;

    const kickVoice = (time, vel) => {
      hit(c, kickBus.input, time, B[kickKey], 0.66 * vel);
      m.pump(time, vel * profile.duck, 0.17);
    };

    if (st.breakdown) {
      // all that remains of the beat is the fill that leads back in
      if (st.lift) for (let s = 8; s < 16; s++) hit(c, clapBus.input, at(s), B.clapRoll, PERC * (0.1 + 0.3 * ((s - 8) / 7)));
      return;
    }
    if (st.resolve === 2) return kickVoice(at(0), 1);
    if (st.resolve === 3) return;

    // Staged entry: kick first, then hats, then clap, then the extras.
    let kAmt = smooth(p, 0.45, 0.5);
    let hAmt = smooth(p, 0.5, 0.6);
    let cAmt = smooth(p, 0.55, 0.65);
    let xAmt = smooth(p, 0.62, 0.76);
    if (st.resolve >= 0 || st.drop) kAmt = hAmt = cAmt = xAmt = 1;
    if (st.drop) hit(c, hatL.input, at(0), B.ohat0, 0.5 * PERC); // land the drop with an open hat

    for (let s = 0; s < 16; s++) {
      const time = at(s);
      const hats = s % 2 ? hatR : hatL;
      // lift bar: the last beat drops out so the riser takes over
      if (g.kick[s] && kAmt > 0.02 && !(st.lift && s >= 12)) kickVoice(time + j(), g.kick[s] * kAmt * (0.5 + 0.5 * e));
      if (g.chat[s] && hAmt > 0.02) {
        hit(c, hats.input, time + j(), B['hat' + ((s * 7 + bar) % 3)], g.chat[s] * hAmt * e * 0.32 * PERC * (0.85 + rnd() * 0.3), rate());
      }
      if (g.ohat[s] && hAmt > 0.35) hit(c, hatR.input, time + j(), B['ohat' + (s % 2)], g.ohat[s] * hAmt * e * 0.3 * PERC, rate());
      if (g.clap[s] && cAmt > 0.02) {
        const vel = g.clap[s] * cAmt * (0.6 + 0.4 * e);
        if (g.snare) hit(c, clapBus.input, time + j(), B.snare, vel * 0.55 * PERC, rate());
        else hit(c, clapBus.input, time + j(), profile.bright > 0.55 ? B.clap1 : B.clap0, vel * 0.5 * PERC, rate());
      }
      if (g.xtra[s] && xAmt > 0.02) {
        const vel = g.xtra[s] * xAmt * e;
        if (g.tickXtra) hit(c, hats.input, time + j(), B['tick' + (s % 4)], vel * 0.18 * PERC);
        else hit(c, hats.input, time + j(), B['shaker' + (s % 2)], vel * 0.2 * PERC, rate());
      }
    }
    if (st.lift) for (let s = 8; s < 16; s++) hit(c, clapBus.input, at(s), B.clapRoll, PERC * (0.1 + 0.3 * ((s - 8) / 7)));
    else if (env.cycleBar === 3 && (bar >> 2) % 2 === 1 && p >= 0.6 && st.resolve < 0) {
      // turnaround fill every eight bars: a short rising roll into the next phrase
      [13, 14, 15].forEach((s, i) => hit(c, clapBus.input, at(s), B.clapRoll, PERC * (0.08 + 0.07 * i) * e));
      hit(c, hatR.input, at(14), B.ohat1, 0.3 * PERC * e);
    }
  };
  return L;
}

// --------------------------------------------------------------- 4 · harmony

const PADS = {
  warm: { wave: 'sawtooth', cutoff: 1500, attack: 0.6, release: 1.1, detune: 9, vel: 0.12 },
  strings: { wave: 'sawtooth', cutoff: 2300, attack: 1.0, release: 1.5, detune: 13, vel: 0.13, octave: true },
  glass: { wave: 'triangle', cutoff: 3600, attack: 0.4, release: 0.9, detune: 6, vel: 0.17 },
  dream: { wave: 'sawtooth', cutoff: 1050, attack: 1.3, release: 2.0, detune: 15, vel: 0.11, shimmer: true },
  velvet: { wave: 'sawtooth', cutoff: 880, attack: 0.8, release: 1.4, detune: 10, vel: 0.13 },
};

// step → [velocity, lengthInSteps]
const COMPING = {
  house: { 3: [0.9, 2], 6: [0.55, 1], 10: [0.8, 2] },
  pop: { 0: [1, 5], 6: [0.55, 2], 8: [0.8, 5] },
  hiphop: { 0: [1, 6], 7: [0.55, 2], 10: [0.8, 5] },
  electro: { 0: [0.9, 2], 3: [0.65, 2], 6: [0.75, 2], 10: [0.65, 2], 13: [0.55, 2] },
  ambient: { 0: [0.9, 13] },
  broken: { 0: [1, 3], 5: [0.55, 2], 9: [0.7, 3], 14: [0.5, 2] },
};

function harmonyLayer(ctx, mixer, live) {
  const padBus = mixer.createBus({ reverb: 0.55, delay: 0.1, duck: 0.6, chorus: { rate: 0.3, depth: 0.0035, mix: 0.6 }, meter: live });
  const epBus = mixer.createBus({ reverb: 0.38, delay: 0.32, duck: 0.45 });
  const L = makeLayer('Harmony', [padBus, epBus]);
  L.init = (t) => padBus.chorus?.start(t);
  L.stop = (t) => padBus.chorus?.stop(t);

  L.bar = (env) => {
    const { ctx: c, profile, voicing, at, stepDur, barDur, rnd, st } = env;
    const style = PADS[profile.pad] || PADS.warm;
    const bright = 0.6 + 0.8 * profile.bright;
    const freqs = voicing.map(midiToHz);
    S.padChord(c, padBus.input, env.t0, barDur + 0.04, freqs, {
      vel: style.vel,
      cutoff: style.cutoff * bright,
      attack: style.attack,
      release: style.release,
      detune: style.detune,
      wave: style.wave,
    });
    if (style.octave) {
      // strings: add a lower octave of the root + fifth for weight
      S.padChord(c, padBus.input, env.t0, barDur + 0.04, [midiToHz(voicing[0] - 12), midiToHz(voicing[0] - 5)], {
        vel: style.vel * 0.7, cutoff: style.cutoff * 0.5 * bright, attack: style.attack, release: style.release, detune: 8, wave: 'sawtooth',
      });
    }
    if (style.shimmer) {
      const top = voicing[voicing.length - 1] + 12;
      S.bell(c, padBus.input, at(rnd() < 0.5 ? 0 : 8), midiToHz(top), { vel: 0.035, decay: 5, pan: (rnd() - 0.5) * 1.4, bright: 0.4 });
    }

    // Electric-piano comping (rootless upper structure).
    if (st.resolve >= 2) return;
    const comp = COMPING[profile.groove] || COMPING.electro;
    const upper = voicing.slice(1);
    let n = 0;
    for (const [stepStr, [v, len]] of Object.entries(comp)) {
      const notes = len >= 5 ? upper : upper.slice(0, 3);
      S.epChord(c, epBus.input, at(Number(stepStr)) + (rnd() - 0.5) * 0.004, len * stepDur * 0.95, notes.map(midiToHz), {
        vel: (0.12 * v * (0.85 + rnd() * 0.3)) / Math.sqrt(notes.length),
        bright: 0.25 + 0.6 * profile.bright,
        pan: n++ % 2 ? 0.2 : -0.2,
      });
    }
    if (profile.groove === 'ambient') {
      const m = upper[Math.floor(rnd() * upper.length)] + 12;
      S.epChord(c, epBus.input, at(10), 1.2, [midiToHz(m)], { vel: 0.05, bright: 0.4, pan: 0.3 });
    }
  };
  return L;
}

// ---------------------------------------------------------------- 5 · melody

// centre of the melody's register per timbre (MIDI): bells shine higher, soft leads sit lower
const LEAD_TARGET = { glass: 77, pluck: 72, felt: 69, kalimba: 74 };

function melodyLayer(ctx, mixer, live) {
  const bus = mixer.createBus({ reverb: 0.45, delay: 0.5, duck: 0.2, meter: live });
  const L = makeLayer('Melody', [bus]);
  let prevCentre = null; // where the previous bar's hook sat — the next bar aims near it

  L.bar = (env) => {
    const { ctx: c, profile, chord, cycleBar, st, stepDur, at, rnd, barDur } = env;
    const kind = profile.lead;
    const target = LEAD_TARGET[kind] ?? 69;
    const motif = profile.customMotif || MOTIFS[profile.motif % MOTIFS.length]; // a hook spelled from a name, if there is one
    const half = cycleBar % 2; // bars alternate between the motif's two halves
    const base = half * 16;
    const energyGain = 0.9 + 0.25 * profile.energy;
    const pan = kind === 'kalimba' ? -0.12 : 0.1;

    // aim halfway between the home register and the previous bar: a smooth line, never an octave hop
    const aim = prevCentre === null ? target : (prevCentre + target) / 2;
    prevCentre = melodyPitch(chord, motif.center, { target: aim, center: motif.center });

    const play = (step, degree, len, accent = 1) => {
      const midi = settleNote(chord, melodyPitch(chord, degree, { target: aim, center: motif.center }));
      // let anything played alongside (typed notes) know what is sounding
      env.entry?.sounding.push({ t: at(step), dur: len * stepDur + 0.3, midi });
      S.lead(c, bus.input, at(step) + (rnd() - 0.5) * 0.006, len * stepDur * (kind === 'pluck' ? 0.9 : 1), midiToHz(midi), {
        kind,
        vel: 0.15 * accent * energyGain * (0.88 + rnd() * 0.24),
        bright: profile.bright,
        pan: pan * (rnd() < 0.5 ? 1 : -1),
      });
      if (lift) {
        // development: the hook doubled an octave above, softly, for a lift
        S.lead(c, bus.input, at(step) + 0.004, len * stepDur, midiToHz(midi + 12), { kind: 'glass', vel: 0.05 * accent, bright: 0.7, pan: -pan });
      }
    };
    const lift = env.p >= 0.95 && st.resolve < 0 && (env.bar >> 2) % 4 === 3;

    if (st.resolve === 3) return;
    if (st.resolve === 2) {
      // Final phrase: the tonic, left to ring.
      const midi = melodyPitch(chord, 7, { target: 74, center: 7 });
      S.lead(c, bus.input, at(2), barDur * 1.5, midiToHz(midi), { kind: kind === 'pluck' ? 'felt' : kind, vel: 0.17, bright: 0.5 });
      return;
    }

    const notes = motif.notes.filter(([s]) => s >= base && s < base + 16);
    const density = profile.density;
    notes.forEach(([s, degree, len], i) => {
      const step = s - base;
      // thin out the weak short notes when density is low
      if (density < 0.5 && step % 4 !== 0 && len <= 1) return;
      if (density < 0.3 && step % 4 !== 0 && i % 2) return;
      if (cycleBar === 3 && step >= 12) return; // leave space for the turnaround
      let d = degree;
      if (cycleBar === 2 && i >= notes.length - 2) d += 1; // answer phrase
      play(step, d, len, step % 4 === 0 ? 1 : 0.8);
      // spontaneous players decorate with a grace note
      if (rnd() < profile.variation * 0.25 && step > 0 && len >= 2) play(step - 1, d - 1, 1, 0.5);
    });
    if (cycleBar === 3) {
      // turnaround: settle on a chord tone that leads into the next bar
      play(12, 4, 3, 0.85);
    }
  };
  return L;
}

// --------------------------------------------------------------- 6 · texture

// priority order in which sparkle steps are filled as `sparkle` rises
const SPARKLE_ORDER = [0, 6, 3, 10, 8, 13, 2, 5, 11, 14, 1, 7, 9, 12, 4, 15];

function textureLayer(ctx, mixer, live) {
  const choirBus = mixer.createBus({ reverb: 0.7, delay: 0.1, duck: 0.5, chorus: { rate: 0.24, depth: 0.004, mix: 0.6 }, meter: live });
  const sparkBus = mixer.createBus({ reverb: 0.5, delay: 0.62, duck: 0.4 });
  const bedBus = mixer.createBus({ reverb: 0.12 });
  const L = makeLayer('Texture', [choirBus, sparkBus, bedBus]);
  let bed = null;
  let bedKind = null;

  const startBed = (t, profile) => {
    bedKind = profile.texture;
    if (bedKind === 'rain') {
      bed = S.loopBed(ctx, bedBus.input, t, S.crackleBuffer(ctx, 'rain'), { gain: 0.55, type: 'highpass', freq: 1800, q: 0.4, lfoRate: 0.02, lfoDepth: 0, hp: 1500 });
    } else if (bedKind === 'vinyl') {
      bed = S.loopBed(ctx, bedBus.input, t, S.crackleBuffer(ctx, 'vinyl'), { gain: 0.9, type: 'highpass', freq: 1200, q: 0.4, lfoRate: 0.02, lfoDepth: 0, hp: 900 });
    } else {
      bed = S.loopBed(ctx, bedBus.input, t, S.pinkBuffer(ctx), { gain: 0.12, freq: 5200, q: 0.5, lfoRate: 0.05, lfoDepth: 2200, hp: 2400 });
    }
  };

  L.init = (t, profile) => {
    choirBus.chorus?.start(t);
    startBed(t, profile);
  };
  L.stop = (t) => {
    choirBus.chorus?.stop(t);
    bed?.stop(t);
  };

  L.bar = (env) => {
    const { ctx: c, profile, voicing, at, rnd, chord, st, barDur } = env;
    // the bed follows the user's texture choice even if it changes mid-form
    if (profile.texture !== bedKind) {
      bed?.stop(env.t0);
      startBed(env.t0, profile);
    }

    if (st.resolve < 3) {
      const wide = profile.pad === 'dream' || profile.pad === 'strings';
      const upper = voicing.slice(1, 4).map((m) => m + 12);
      S.choirChord(c, choirBus.input, env.t0, barDur + 0.04, upper.map(midiToHz), {
        vel: wide ? 0.13 : 0.085,
        vowel: profile.mode === 'minor' && profile.bright < 0.4 ? 'oo' : 'ah',
      });
    }

    if (st.resolve >= 2) return;
    const ladder = chordLadder(chord, 79, 96);
    const count = Math.max(2, Math.round(2 + profile.sparkle * 9 + (((env.bar >> 2) % 3) - 1) * 1.6));
    const steps = SPARKLE_ORDER.slice(0, count).sort((a, b) => a - b);
    steps.forEach((step, i) => {
      const note = ladder[(i * 2 + env.cycleBar) % ladder.length];
      S.bell(c, sparkBus.input, at(step) + (rnd() - 0.5) * 0.004, midiToHz(note), {
        vel: 0.032 * (0.7 + rnd() * 0.5),
        decay: 0.9,
        pan: i % 2 ? 0.55 : -0.55,
        bright: 0.5,
        ratio: 4.1,
        shimmer: false,
      });
    });
  };
  return L;
}

// ------------------------------------------------------------- 7 · resolution

function resolutionLayer(ctx, mixer, live) {
  const bus = mixer.createBus({ reverb: 0.8, delay: 0.22, meter: live });
  const L = makeLayer('Resolution', [bus]);
  L.level = 1;
  bus.setLevel(0, 1, 0.01);

  const harp = (c, t, notes, { vel = 0.06, spacing = 0.075, decay = 2.6 } = {}) => {
    notes.forEach((m, i) => {
      S.bell(c, bus.input, t + i * spacing, midiToHz(m), { vel, decay, pan: -0.6 + (1.2 * i) / Math.max(1, notes.length - 1), ratio: 2.76, bright: 0.6 });
    });
  };
  L.harp = harp;

  /** A riser that lands exactly at `endTime` (used for layer entrances and lifts). */
  L.riserInto = (c, endTime, dur, vel = 0.14) => {
    S.riser(c, bus.input, endTime - dur, dur, { vel, from: 500, to: 9000, tone: 196 });
  };

  /** Milestone flourish: a rising arpeggio over the chord. */
  L.flourish = (c, t, chord, { vel = 0.055 } = {}) => {
    harp(c, t, chordLadder(chord, 69, 93).slice(0, 8), { vel, spacing: 0.09, decay: 3 });
  };
  L.impact = (c, t, vel) => S.impact(c, bus.input, t, { vel });

  L.bar = (env) => {
    const { ctx: c, st, chord, t0, barDur } = env;
    if (st.lift) {
      S.riser(c, bus.input, t0, barDur, { vel: 0.2, from: 450, to: 11000, tone: 196 });
    }
    if (st.drop) {
      S.impact(c, bus.input, t0, { vel: 0.4 });
      harp(c, t0, chordLadder(chord, 69, 93).slice(0, 7), { vel: 0.06, spacing: 0.06 });
    }
    if (st.milestone) {
      // plain entrances get a whisper of sparkle; the 50% / 75% / 90% marks get an arrival
      const mark = st.milestone !== 'enter';
      if (mark) S.impact(c, bus.input, t0, { vel: st.milestone === 'full' ? 0.2 : 0.28, length: 2 });
      L.flourish(c, t0 + 0.02, chord, { vel: mark ? 0.06 : 0.04 });
    }
    if (st.resolve === 0) {
      S.impact(c, bus.input, t0, { vel: 0.3 });
      L.flourish(c, t0 + 0.02, chord);
    }
    if (st.resolve === 2) {
      const final = chordLadder(chord, 62, 98);
      S.impact(c, bus.input, t0 + 0.005, { vel: 0.55, freq: 58, length: 4 });
      // the final chord opens up across three octaves
      final.forEach((m, i) => {
        S.bell(c, bus.input, t0 + 0.02 + i * 0.012, midiToHz(m), { vel: 0.05 * (m > 86 ? 0.7 : 1), decay: 7, pan: ((i * 7) % 11) / 5 - 1, ratio: 2.76, bright: 0.5 });
      });
      harp(c, t0 + barDur * 0.35, chordLadder(chord, 74, 100).slice(0, 7), { vel: 0.04, spacing: 0.11, decay: 5 });
    }
    if (st.resolve === 3) {
      S.bell(c, bus.input, t0 + barDur * 0.25, midiToHz(chord.root + 12 * 7), { vel: 0.05, decay: 8, pan: 0.2, ratio: 2.76 });
    }
  };
  return L;
}

export function createLayers(ctx, mixer, { live = false } = {}) {
  return [
    ambientLayer(ctx, mixer, live),
    pulseLayer(ctx, mixer, live),
    bassLayer(ctx, mixer, live),
    rhythmLayer(ctx, mixer, live),
    harmonyLayer(ctx, mixer, live),
    melodyLayer(ctx, mixer, live),
    textureLayer(ctx, mixer, live),
    resolutionLayer(ctx, mixer, live),
  ];
}

