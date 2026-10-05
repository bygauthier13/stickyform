// Offline rendering of the finished track.
//
// The arrangement replays the journey the user just took — the same eight
// layers entering in the same order — and then goes one step further: a
// breakdown, a drop and a closing cadence, so it plays as a complete piece
// rather than a loop. It runs through the very same Composer as the live
// experience, so the file sounds like what they were hearing.

import { Composer, defaultState } from './composer.js';
import { getDrumBank } from './drumBank.js';
import { createMixer } from './fx.js';

export const TRACK_BARS = 52;
const LEAD_IN = 0.12;
const TAIL = 6.5;

/** The bar-by-bar plan: virtual "progress" plus structural flags. */
export function buildPlan() {
  const plan = [];
  const add = (n, p, extra = {}) => {
    for (let i = 0; i < n; i++) plan.push({ ...defaultState(), p, ...extra });
  };
  add(4, 0.05); //  0–3   ambient alone
  add(4, 0.2); //   4–7   + pulse
  add(4, 0.34); //  8–11  + bass
  add(1, 0.47); //  12    + kick
  add(1, 0.52); //  13
  add(1, 0.56); //  14    + hats
  add(1, 0.58); //  15    + clap
  add(4, 0.68); //  16–19 + harmony
  add(4, 0.8); //   20–23 + melody
  add(8, 0.95); //  24–31 + texture · full arrangement
  add(3, 0.95, { breakdown: true }); // 32–34 breakdown
  add(1, 0.95, { breakdown: true, lift: true }); // 35 lift into the drop
  add(11, 1); //   36–46 peak
  add(1, 1, { lift: true }); // 47 lift into the resolution
  for (let r = 0; r < 4; r++) plan.push({ ...defaultState(), p: 1, resolve: r }); // 48–51
  plan[12].milestone = 'half';
  plan[20].milestone = 'q3';
  plan[24].milestone = 'full';
  plan[36].drop = true;
  return plan;
}

/** Bar at which each of the eight layers is first heard in the track. */
const LAYER_BARS = [0, 4, 8, 12, 16, 20, 24, 47];

/**
 * Final loudness stage. The mix has ~11 dB of natural crest, so instead of
 * pushing peaks to full scale it is set by *loudness*: the loud sections land
 * around -14 dBFS RMS (present, not shouty) and only the rare peak that would
 * pass the ceiling is rounded off with a soft knee. Quiet intros stay quiet.
 */
function master(buffer, { targetRms = -14, peakDb = -1.2 } = {}) {
  const sr = buffer.sampleRate;
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));

  // loudness reference = the 85th-percentile one-second window
  const win = sr;
  const levels = [];
  for (let from = 0; from + win <= buffer.length; from += win) {
    let sum = 0;
    for (const d of chans) for (let i = from; i < from + win; i += 4) sum += d[i] * d[i];
    levels.push(sum / ((win / 4) * chans.length));
  }
  levels.sort((a, b) => a - b);
  const ref = levels[Math.floor(levels.length * 0.85)] || 1e-6;
  const gain = 10 ** (targetRms / 20) / Math.sqrt(ref);

  const ceil = 10 ** (peakDb / 20);
  const knee = ceil * 0.7;
  const fadeIn = Math.floor(sr * 0.012);
  const fadeOut = Math.floor(sr * 0.05);
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) {
      let v = d[i] * gain;
      const a = Math.abs(v);
      if (a > knee) v = Math.sign(v) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
      if (i < fadeIn) v *= i / fadeIn; // no click at the start
      if (i > d.length - fadeOut) v *= (d.length - i) / fadeOut;
      d[i] = v;
    }
  }
}

/** Min/max-free peak envelope for the waveform display. */
export function computePeaks(buffer, bins = 240) {
  const out = new Float32Array(bins);
  const a = buffer.getChannelData(0);
  const b = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : a;
  const per = Math.floor(buffer.length / bins);
  for (let i = 0; i < bins; i++) {
    let sum = 0;
    const from = i * per;
    for (let j = from; j < from + per; j += 8) sum += a[j] * a[j] + b[j] * b[j];
    out[i] = Math.sqrt(sum / (per / 8) / 2);
  }
  const max = Math.max(...out) || 1;
  return out.map((v) => v / max);
}

/**
 * Render the soundtrack.
 * @param {object} profile  musical profile (see soundmap.js)
 * @param {{ onProgress?: (fraction:number)=>void, sampleRate?: number }} [opts]
 */
export async function renderTrack(profile, { onProgress, sampleRate = 44100 } = {}) {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const barDur = 240 / profile.tempo;
  const plan = buildPlan();
  const duration = LEAD_IN + plan.length * barDur + TAIL;

  const ctx = new Offline(2, Math.ceil(duration * sampleRate), sampleRate);
  const mixer = createMixer(ctx);
  mixer.master.connect(ctx.destination);
  globalThis.__tweak?.(mixer); // test hook for mix experiments

  const composer = new Composer(ctx, mixer, { bank: await getDrumBank(sampleRate) });
  composer.init(0, profile);
  composer.stop(duration);

  // The closing chord rings, then fades into the reverb tail.
  const fadeStart = LEAD_IN + (plan.length - 1) * barDur + barDur * 0.6;
  mixer.master.gain.setValueAtTime(mixer.master.gain.value, fadeStart);
  mixer.master.gain.linearRampToValueAtTime(0.0001, duration - 0.05);

  // Scheduling every note up front puts tens of thousands of pending nodes in
  // the graph, which makes an offline context crawl. Instead the arrangement is
  // scheduled a couple of bars at a time, from inside suspend() callbacks, so
  // only a handful of voices ever exist at once. It also gives us progress.
  const CHUNK = 2;
  const scheduleBars = (from) => {
    for (let bar = from; bar < Math.min(from + CHUNK, plan.length); bar++) {
      composer.scheduleBar({ bar, t0: LEAD_IN + bar * barDur, barDur, st: plan[bar], profile });
    }
  };

  let lazy = typeof ctx.suspend === 'function';
  if (lazy) {
    try {
      scheduleBars(0);
      for (let bar = CHUNK; bar < plan.length; bar += CHUNK) {
        ctx
          .suspend(LEAD_IN + bar * barDur - 0.35)
          .then(() => {
            scheduleBars(bar);
            onProgress?.(bar / plan.length);
            return ctx.resume();
          })
          .catch(() => {});
      }
    } catch {
      lazy = false; // older engines: fall back to scheduling everything at once
    }
  }
  if (!lazy) for (let bar = 0; bar < plan.length; bar += CHUNK) scheduleBars(bar);

  const buffer = await ctx.startRendering();
  onProgress?.(1);
  if (!globalThis.__noMaster) master(buffer);

  return {
    buffer,
    duration: buffer.duration,
    barDur,
    bars: plan.length,
    markers: LAYER_BARS.map((bar) => LEAD_IN + bar * barDur),
    peaks: computePeaks(buffer),
  };
}
