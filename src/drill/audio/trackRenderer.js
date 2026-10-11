// TrackRenderer — the downloadable arrangement, rendered offline.
//
// Intro · build · main · breakdown · main · outro (32 bars at 140 BPM ≈ 55 s,
// plus the ending's tail), composed from the final MusicalState by the same
// composer and played by the same instruments and mix as the live experience.
// Then mastered (loudness + a soft ceiling, no digital clipping) and encoded as a
// 16-bit / 44.1 kHz stereo WAV.

import { encodeWav } from '../../audio/wav.js';
import { TOTAL_BARS, TAIL_SECONDS, buildArrangement, composeBar, sectionStarts } from '../composer.js';
import { barSeconds } from '../theory.js';
import { Instruments } from './instruments.js';
import { createDrillMixer } from './mixer.js';

const LEAD_IN = 0.05;
/** Hard limit on what can be rendered, whatever the arrangement says. */
export const MAX_SECONDS = 65;

export const trackSeconds = (bpm) => LEAD_IN + TOTAL_BARS * barSeconds(bpm) + TAIL_SECONDS;

/**
 * Loudness stage: the loud sections land around -13 dBFS RMS, a soft knee rounds
 * off the rare peak above -3 dBFS and nothing passes -1 dBFS. Quiet parts stay quiet.
 * Returns the measured result.
 */
export function master(buffer, { targetRms = -13, ceilingDb = -1 } = {}) {
  const sr = buffer.sampleRate;
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  const win = Math.floor(sr / 2);
  const levels = [];
  for (let from = 0; from + win <= buffer.length; from += win) {
    let sum = 0;
    for (const d of chans) for (let i = from; i < from + win; i += 2) sum += d[i] * d[i];
    levels.push(sum / ((win / 2) * chans.length));
  }
  levels.sort((a, b) => a - b);
  const ref = levels[Math.floor(levels.length * 0.85)] || 1e-9;
  const gain = Math.min(10 ** (24 / 20), 10 ** (targetRms / 20) / Math.sqrt(ref));
  const ceil = 10 ** (ceilingDb / 20);
  const knee = 10 ** ((ceilingDb - 2) / 20);
  const fadeIn = Math.floor(sr * 0.01);
  const fadeOut = Math.floor(sr * 0.25);
  let peak = 0;
  let sumAll = 0;
  for (const d of chans) {
    for (let i = 0; i < d.length; i++) {
      let v = d[i] * gain;
      const a = Math.abs(v);
      if (a > knee) v = Math.sign(v) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
      if (i < fadeIn) v *= i / fadeIn;
      if (i > d.length - fadeOut) v *= (d.length - i) / fadeOut;
      if (!Number.isFinite(v)) v = 0;
      d[i] = v;
      const av = Math.abs(v);
      if (av > peak) peak = av;
      sumAll += v * v;
    }
  }
  return { gain, peak, peakDb: 20 * Math.log10(peak || 1e-9), rmsDb: 10 * Math.log10(sumAll / (buffer.length * chans.length) || 1e-12) };
}

/** Waveform overview for the player. */
export function computePeaks(buffer, bins = 180) {
  const out = new Float32Array(bins);
  const a = buffer.getChannelData(0);
  const b = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : a;
  const per = Math.floor(buffer.length / bins);
  for (let i = 0; i < bins; i++) {
    let sum = 0;
    for (let j = i * per; j < (i + 1) * per; j += 16) sum += a[j] * a[j] + b[j] * b[j];
    out[i] = Math.sqrt(sum / (per / 16) / 2);
  }
  const max = Math.max(...out) || 1;
  return out.map((v) => v / max);
}

let busy = null;

/**
 * Render the track for a finished state. Only one render runs at a time: asking
 * again while one is running returns the same promise.
 *
 * @param {object} state  MusicalState (all questions answered)
 * @param {import('./assetManifest.js').AssetBank} bank
 * @param {{ onProgress?: (f:number)=>void, sampleRate?: number }} [o]
 */
export function renderTrack(state, bank, o = {}) {
  if (busy) return busy;
  busy = doRender(state, bank, o).finally(() => {
    busy = null;
  });
  return busy;
}

export const isRendering = () => !!busy;

async function doRender(state, bank, { onProgress, sampleRate = 44100 } = {}) {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Offline) throw new Error('Offline audio rendering is not supported in this browser');
  const barDur = barSeconds(state.bpm);
  const duration = trackSeconds(state.bpm);
  if (!(duration > 10 && duration <= MAX_SECONDS)) throw new Error(`Refusing to render ${duration.toFixed(1)} s`);

  const ctx = new Offline(2, Math.ceil(duration * sampleRate), sampleRate);
  const mixer = createDrillMixer(ctx);
  mixer.master.connect(ctx.destination);
  const inst = new Instruments(ctx, mixer, bank, { bpm: state.bpm });
  const plan = buildArrangement();
  mixer.setTone(0, 20000, 0.01);

  // Scheduling everything up front makes offline contexts crawl, so bars are
  // scheduled two at a time from suspend() callbacks — this also gives progress.
  const CHUNK = 2;
  const schedule = (from) => {
    for (let bar = from; bar < Math.min(from + CHUNK, plan.length); bar++) {
      const events = composeBar(state, bar, plan[bar], { stems: bank.stemKeys });
      for (const ev of events) inst.play(ev, LEAD_IN + bar * barDur, bar);
    }
  };
  let lazy = typeof ctx.suspend === 'function';
  if (lazy) {
    try {
      schedule(0);
      for (let bar = CHUNK; bar < plan.length; bar += CHUNK) {
        ctx
          .suspend(Math.max(0, LEAD_IN + bar * barDur - 0.4))
          .then(() => {
            schedule(bar);
            onProgress?.((bar / plan.length) * 0.92);
            return ctx.resume();
          })
          .catch(() => {});
      }
    } catch {
      lazy = false;
    }
  }
  if (!lazy) for (let bar = 0; bar < plan.length; bar += CHUNK) schedule(bar);

  const buffer = await ctx.startRendering();
  onProgress?.(0.96);
  const stats = master(buffer);
  onProgress?.(1);
  return {
    buffer,
    duration: buffer.duration,
    barDur,
    stats,
    sections: sectionStarts().map((s) => ({ ...s, time: LEAD_IN + s.bar * barDur })),
    peaks: computePeaks(buffer),
  };
}

/** WAV file for a rendered track, with RIFF INFO tags (title and a plain description). */
export function trackToWav(result, { title = 'Untitled' } = {}) {
  return encodeWav(result.buffer, {
    INAM: title,
    IART: 'Made with StickySounds (concept demo)',
    ICMT: 'UK drill arrangement generated from survey answers. F minor, 140 BPM.',
    ISFT: 'StickySounds — BLOCK / 01 drill demo',
  });
}
