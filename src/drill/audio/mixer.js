// The drill edition's mix: one bus per layer, a short dark room, a tempo-synced
// delay, and a master chain that keeps headroom and never clips.
// Built the same way on a live AudioContext and on the OfflineAudioContext used
// for the download. Reuses the original edition's Bus (ducking, sends, meters).

import { Bus, createReverbIR } from '../../audio/fx.js';
import { BPM } from '../theory.js';

/**
 * Bus settings. `level` is the static mix trim; calibrated from solo renders of each
 * layer so the melody leads, the 808 is felt and the hats sit back.
 */
const BUSES = {
  atmosphere: { reverb: 0.32, delay: 0.04, duck: 0.18, level: 0.9 },
  melody: { reverb: 0.2, delay: 0.16, duck: 0.12, level: 1 },
  bass: { duck: 0.42, level: 0.24, shaper: 1.25 },
  kit: { reverb: 0.035, level: 1 },
  snare: { reverb: 0.2, level: 1 },
  vocals: { reverb: 0.34, delay: 0.28, duck: 0.15, level: 1 },
  fx: { reverb: 0.25, delay: 0.05, level: 1 },
  ui: { reverb: 0.22, delay: 0.14, level: 1 },
};

/** Which bus each layer's events go to (drums split into kit + snare for different room sends). */
export const BUS_OF = { atmosphere: 'atmosphere', melody: 'melody', bass: 'bass', drums: 'kit', vocals: 'vocals', fx: 'fx' };

export function createDrillMixer(ctx, { meters = false } = {}) {
  const mk = (v = 1) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const mixer = { ctx, duckBuses: [] };
  mixer.dry = mk(1);
  mixer.sum = mk(1);
  mixer.dry.connect(mixer.sum);

  // ---- room: short and dark, so the low end stays tight
  mixer.reverbIn = mk(1);
  const pre = ctx.createDelay(0.1);
  pre.delayTime.value = 0.018;
  const conv = ctx.createConvolver();
  conv.buffer = createReverbIR(ctx, { seconds: 2.4, rt60: 1.7, seed: 140 });
  const rhp = ctx.createBiquadFilter();
  rhp.type = 'highpass';
  rhp.frequency.value = 320;
  const rlp = ctx.createBiquadFilter();
  rlp.type = 'lowpass';
  rlp.frequency.value = 5200;
  mixer.reverbReturn = mk(0.55);
  mixer.reverbIn.connect(pre).connect(conv).connect(rhp).connect(rlp).connect(mixer.reverbReturn).connect(mixer.sum);

  // ---- delay: a dotted eighth at 140 BPM, ping-pong, filtered
  mixer.delayIn = mk(1);
  const dotted = (60 / BPM) * 0.75;
  const dL = ctx.createDelay(1);
  const dR = ctx.createDelay(1);
  dL.delayTime.value = dR.delayTime.value = dotted;
  const fbL = mk(0.3);
  const fbR = mk(0.3);
  const lp = (f) => {
    const n = ctx.createBiquadFilter();
    n.type = 'lowpass';
    n.frequency.value = f;
    return n;
  };
  const dhp = ctx.createBiquadFilter();
  dhp.type = 'highpass';
  dhp.frequency.value = 400;
  const pL = ctx.createStereoPanner();
  pL.pan.value = -0.6;
  const pR = ctx.createStereoPanner();
  pR.pan.value = 0.6;
  mixer.delayReturn = mk(0.6);
  mixer.delayIn.connect(dhp).connect(dL);
  dL.connect(lp(3200)).connect(fbL).connect(dR);
  dR.connect(lp(3200)).connect(fbR).connect(dL);
  dL.connect(pL).connect(mixer.delayReturn);
  dR.connect(pR).connect(mixer.delayReturn);
  mixer.delayReturn.connect(mixer.sum);

  // ---- buses
  mixer.buses = {};
  for (const [name, opts] of Object.entries(BUSES)) mixer.buses[name] = new Bus(ctx, mixer, { ...opts, meter: meters && name !== 'ui' });

  // ---- master: tone → low cut → gentle glue saturation → safety limiter → level
  mixer.tone = ctx.createBiquadFilter();
  mixer.tone.type = 'lowpass';
  mixer.tone.frequency.value = 20000;
  mixer.tone.Q.value = 0.6;
  const lowcut = ctx.createBiquadFilter();
  lowcut.type = 'highpass';
  lowcut.frequency.value = 27;
  lowcut.Q.value = 0.7;
  const mud = ctx.createBiquadFilter();
  mud.type = 'peaking';
  mud.frequency.value = 280;
  mud.Q.value = 0.9;
  mud.gain.value = -1.5;
  const sat = ctx.createWaveShaper();
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.1 * x) / Math.tanh(1.1);
  }
  sat.curve = curve;
  sat.oversample = '2x';
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  mixer.limiter = limiter;
  mixer.master = mk(0.62);
  mixer.sum.connect(mixer.tone).connect(lowcut).connect(mud).connect(sat).connect(limiter).connect(mixer.master);

  mixer.bus = (name) => mixer.buses[name] || mixer.buses.fx;
  mixer.setTone = (t, hz, seconds = 0.5) => {
    mixer.tone.frequency.setTargetAtTime(Math.min(20000, Math.max(300, hz)), t, Math.max(0.005, seconds / 3));
  };
  /** Sidechain: the kick dips the 808 and, a little, the pads — the low end stays clean. */
  mixer.pump = (t, amount) => {
    for (const b of mixer.duckBuses) b.duck(t, amount, 0.11);
  };
  return mixer;
}
