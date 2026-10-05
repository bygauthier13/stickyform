// Pre-rendered drum hits.
//
// Drum voices are synthesised (see synth.js), but a hat built from a noise
// source, two filters and a panner costs six nodes per hit — thousands over a
// full track. So each hit is rendered once, through the same synth code, into
// a short AudioBuffer; during playback a hit is then just a buffer source and
// a gain. Same sound, a fraction of the CPU (which matters on phones).

import * as S from './synth.js';

const SLOT = 1.2; // seconds reserved per sample in the render

const RECIPES = [
  ['kick', (c, o, t) => S.kick(c, o, t, { vel: 1, decay: 0.32, end: 52, click: 0.5 }), 0.75],
  ['kickSoft', (c, o, t) => S.kick(c, o, t, { vel: 1, decay: 0.4, end: 52, click: 0.2 }), 0.85],
  ['kick808', (c, o, t) => S.kick(c, o, t, { vel: 1, decay: 0.5, end: 46, click: 0.45 }), 1.0],
  ['hat0', (c, o, t) => S.hat(c, o, t, { vel: 1, hp: 7400 }), 0.14],
  ['hat1', (c, o, t) => S.hat(c, o, t, { vel: 1, hp: 7900 }), 0.14],
  ['hat2', (c, o, t) => S.hat(c, o, t, { vel: 1, hp: 6900 }), 0.14],
  ['ohat0', (c, o, t) => S.hat(c, o, t, { vel: 1, open: true, hp: 6200 }), 0.6],
  ['ohat1', (c, o, t) => S.hat(c, o, t, { vel: 1, open: true, hp: 6800 }), 0.6],
  ['clap0', (c, o, t) => S.clap(c, o, t, { vel: 1, tone: 1500 }), 0.5],
  ['clap1', (c, o, t) => S.clap(c, o, t, { vel: 1, tone: 2100 }), 0.5],
  ['clapRoll', (c, o, t) => S.clap(c, o, t, { vel: 1, tone: 2000, tail: 0.02 }), 0.3],
  ['snare', (c, o, t) => S.snare(c, o, t, { vel: 1 }), 0.5],
  ['shaker0', (c, o, t) => S.shaker(c, o, t, { vel: 1 }), 0.25],
  ['shaker1', (c, o, t) => S.shaker(c, o, t, { vel: 1 }), 0.25],
  ['tick0', (c, o, t) => S.tick(c, o, t, { vel: 1, freq: 1500 }), 0.1],
  ['tick1', (c, o, t) => S.tick(c, o, t, { vel: 1, freq: 1640 }), 0.1],
  ['tick2', (c, o, t) => S.tick(c, o, t, { vel: 1, freq: 1780 }), 0.1],
  ['tick3', (c, o, t) => S.tick(c, o, t, { vel: 1, freq: 1920 }), 0.1],
];

let pending = null;

/** Resolves to { name: AudioBuffer }. Built once and shared by every context. */
export function getDrumBank(sampleRate = 44100) {
  if (pending) return pending;
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  pending = (async () => {
    const ctx = new Offline(1, Math.ceil(sampleRate * SLOT * RECIPES.length), sampleRate);
    RECIPES.forEach(([, fn], i) => fn(ctx, ctx.destination, i * SLOT + 0.02));
    const rendered = await ctx.startRendering();
    const data = rendered.getChannelData(0);
    const bank = {};
    RECIPES.forEach(([name, , dur], i) => {
      const from = Math.floor((i * SLOT + 0.02) * sampleRate);
      const len = Math.floor(dur * sampleRate);
      const buf = ctx.createBuffer(1, len, sampleRate);
      const out = buf.getChannelData(0);
      out.set(data.subarray(from, from + len));
      const fade = Math.floor(sampleRate * 0.01);
      for (let k = 0; k < fade; k++) out[len - 1 - k] *= k / fade; // no click at the cut
      bank[name] = buf;
    });
    return bank;
  })();
  return pending;
}

/** Play a banked hit: one buffer source and one gain. */
export function hit(ctx, out, t, buffer, vel, rate = 1) {
  if (!buffer || vel <= 0.001) return;
  const s = ctx.createBufferSource();
  s.buffer = buffer;
  if (rate !== 1) s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = vel;
  s.connect(g).connect(out);
  s.start(t);
}
