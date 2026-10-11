// Instruments: turn composed events into sound on any BaseAudioContext.
//
// The live engine and the offline renderer both call `play()` with the same
// events, the same asset bank and the same trims — one implementation of the
// music, two clocks.

import { midiToHz, stepSeconds, BPM } from '../theory.js';
import { BUS_OF } from './mixer.js';

/**
 * Level trims per instrument (linear). Set by rendering each part alone and
 * measuring it against the full mix: drums punch, the 808 is felt, the melody
 * leads, textures and the second voice sit underneath.
 */
export const TRIM = {
  kick: 0.215,
  snare: 0.41,
  clap: 0.34,
  hat: 0.55,
  ohat: 0.4,
  crash: 0.3,
  rim: 0.55,
  perc: 0.45,
  shaker: 0.3,
  808: 0.65,
  piano: 0.72,
  flute: 0.6,
  glock: 0.62,
  pluck: 0.55,
  bell: 0.34,
  pulse: 0.23,
  acid: 0.22,
  stab: 0.56,
  choir: 0.11,
  pad: 0.155,
  vox: 0.27,
  bed: 0.22,
  riser: 0.36,
  reverse: 0.4,
  swell: 0.3,
  impact: 0.75,
};

const SNARE_BUS = new Set(['snare', 'clap']);

/** Which bus an event plays on. */
export function busFor(ev) {
  if (ev.layer === 'drums') return SNARE_BUS.has(ev.inst) || ev.part === 'transition' ? 'snare' : 'kit';
  return BUS_OF[ev.layer] || 'fx';
}

export class Instruments {
  /**
   * @param {BaseAudioContext} ctx
   * @param {object} mixer  from createDrillMixer
   * @param {import('./assetManifest.js').AssetBank} bank
   */
  constructor(ctx, mixer, bank, { bpm = BPM } = {}) {
    this.ctx = ctx;
    this.mixer = mixer;
    this.bank = bank;
    this.stepDur = stepSeconds(bpm);
    this.barDur = this.stepDur * 16;
    this.last808 = null;
    this.openHats = [];
    /** How many events each instrument has played (diagnostics and tests). */
    this.counts = {};
  }

  /**
   * Schedule one event.
   * @param {object} ev        composed event
   * @param {number} barTime   context time at which the event's bar starts
   * @param {number} bar       global bar index (beds and stems loop on it)
   * @param {{ bus?: string, gain?: number }} [o]  interface sounds use the 'ui' bus
   * @returns {number} time at which the sound has ended
   */
  play(ev, barTime, bar = 0, o = {}) {
    const t = Math.max(0, barTime + ev.step * this.stepDur + (ev.nudge || 0));
    const bus = this.mixer.bus(o.bus || busFor(ev));
    const vel = Math.max(0, Math.min(2.5, ev.vel ?? 0.8)) * (o.gain ?? 1);
    const trim = (TRIM[ev.inst] ?? 0.4) * this.bank.gain(ev.inst);
    const dur = (ev.dur ?? 1) * this.stepDur;
    const tally = ev.layer === 'ui' ? `ui.${ev.inst}` : ev.inst;
    this.counts[tally] = (this.counts[tally] || 0) + 1;
    switch (ev.inst) {
      case 'kick':
        if (!o.bus) this.mixer.pump(t, Math.min(1, vel));
        return this._oneshot('kick', t, bus, vel * trim);
      case 'hat':
        this._chokeOpenHats(t);
        return this._oneshot('hat', t, bus, vel * trim, 1 + (vel - 0.6) * 0.05, ev.pan ?? (ev.step % 2 ? 0.16 : -0.12));
      case 'ohat': {
        const end = this._oneshot('ohat', t, bus, vel * trim, 1, 0.2, true);
        return end;
      }
      case 'snare':
      case 'clap':
      case 'rim':
      case 'perc':
      case 'shaker':
      case 'crash':
        return this._oneshot(ev.inst, t, bus, vel * trim, 1, ev.inst === 'shaker' ? 0.3 : ev.inst === 'perc' ? -0.25 : 0);
      case 'impact': {
        const buf = this.bank.fx('impact');
        return this._buffer(buf, t, bus, { vel: vel * trim });
      }
      case '808':
        return this._808(ev, t, dur, bus, vel * trim);
      case 'piano':
      case 'flute':
      case 'glock':
      case 'pluck':
      case 'bell':
      case 'pulse':
      case 'acid':
        return this._tonal(ev, t, dur, bus, vel * trim);
      case 'stab':
        return this._buffer(this.bank.stab([].concat(ev.midi)), t, bus, { vel: vel * trim, dur, attack: 0.002, release: 0.12 });
      case 'vox':
        return this._vox(ev, t, dur, bus, vel * trim);
      case 'pad':
        return this._pad(t, [].concat(ev.midi), dur, bus, vel * trim);
      case 'choir':
        return this._choir(t, [].concat(ev.midi), dur, bus, vel * trim);
      case 'bed':
        return this._loopSlice(this.bank.bed(ev.extra?.bed || 'room'), t, bar, bus, vel * trim, 4);
      case 'stem': {
        const stem = this.bank.stem(ev.extra?.key);
        if (!stem) return t;
        return this._loopSlice(stem.buffer, t, bar, bus, vel * stem.gain, stem.bars);
      }
      case 'riser':
      case 'reverse':
      case 'swell': {
        // these end on the bar line: their length is measured in beats from their step
        const seconds = (ev.extra?.seconds ?? (ev.extra?.beats ?? 1) * this.stepDur * 4);
        const buf = this.bank.fx(ev.inst, Math.max(this.stepDur, Math.round(seconds / this.stepDur) * this.stepDur));
        return this._buffer(buf, t, bus, { vel: vel * trim });
      }
      case 'tone':
        this.mixer.setTone(t, ev.extra?.hz ?? 20000, (ev.extra?.rampBars ?? 1) * this.barDur);
        return t;
      default:
        return t;
    }
  }

  // ------------------------------------------------------------------ voices

  _out(node, bus, pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p).connect(bus.input);
    } else node.connect(bus.input);
  }

  /** Play a buffer: whole (one-shot) or for `dur` seconds with an attack/release envelope. */
  _buffer(buffer, t, bus, { vel = 1, rate = 1, dur = null, attack = 0.002, release = 0.05, pan = 0, offset = 0 } = {}) {
    if (!buffer || vel <= 0.0005) return t;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (rate !== 1) src.playbackRate.setValueAtTime(rate, t);
    const g = ctx.createGain();
    let end;
    if (dur == null) {
      g.gain.value = vel;
      end = t + (buffer.duration - offset) / rate;
      src.start(t, offset);
    } else {
      const hold = Math.max(attack, Math.min(dur, buffer.duration / rate - release - 0.01));
      end = t + hold + release;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vel, t + attack);
      g.gain.setValueAtTime(vel, t + hold);
      g.gain.linearRampToValueAtTime(0, end);
      src.start(t, offset);
      src.stop(end + 0.02);
    }
    src.connect(g);
    this._out(g, bus, pan);
    return end;
  }

  _oneshot(name, t, bus, vel, rate = 1, pan = 0, isOpenHat = false) {
    const buffer = this.bank.oneshot(name);
    if (!buffer || vel <= 0.0005) return t;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (rate !== 1) src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel, t);
    src.connect(g);
    this._out(g, bus, pan);
    src.start(t);
    const end = t + buffer.duration / rate;
    if (isOpenHat) this.openHats.push({ g, t, end });
    return end;
  }

  /** A closed hat cuts any open hat still ringing (like on a real kit). */
  _chokeOpenHats(t) {
    this.openHats = this.openHats.filter((h) => h.end > t - 0.01);
    for (const h of this.openHats) {
      if (h.t < t && h.end > t) {
        h.g.gain.setTargetAtTime(0, t, 0.008);
        h.end = t;
      }
    }
  }

  /**
   * The 808: one voice. A glide that follows straight on from the previous note
   * bends that same voice into the new pitch (no new attack), like a producer's
   * slide; any other note starts a fresh voice.
   */
  _808(ev, t, dur, bus, vel) {
    const ctx = this.ctx;
    const { buffer, rootMidi } = this.bank.tonal('808');
    if (!buffer) return t;
    const rate = (m) => 2 ** ((m - rootMidi) / 12);
    const glideTime = Math.max(0.05, (ev.extra?.glideSteps ?? 1.4) * this.stepDur);
    const release = 0.035;
    const last = this.last808;
    if (ev.glideFrom != null && last && Math.abs(last.end - t) < 0.012 && last.ctx === ctx) {
      // legato slide: keep the voice, move its pitch, extend its envelope
      const r = last.src.playbackRate;
      r.setValueAtTime(rate(ev.glideFrom), t);
      r.exponentialRampToValueAtTime(rate(ev.midi), t + glideTime);
      const g = last.g.gain;
      g.cancelScheduledValues(last.releaseAt);
      g.setValueAtTime(last.vel, last.releaseAt);
      g.linearRampToValueAtTime(vel, t + 0.02);
      const end = t + dur;
      g.setValueAtTime(vel, end - release);
      g.linearRampToValueAtTime(0, end);
      Object.assign(last, { end, releaseAt: end - release, vel });
      return end;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (ev.glideFrom != null) {
      src.playbackRate.setValueAtTime(rate(ev.glideFrom), t);
      src.playbackRate.exponentialRampToValueAtTime(rate(ev.midi), t + glideTime);
    } else src.playbackRate.setValueAtTime(rate(ev.midi), t);
    const g = ctx.createGain();
    const end = t + Math.min(dur, buffer.duration / rate(ev.midi) - 0.05);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.003);
    g.gain.setValueAtTime(vel, end - release);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g).connect(bus.input);
    // no stop(): the source runs to the end of its buffer (silent after the release), so a
    // following slide can keep this very voice going without calling stop() twice
    src.start(t);
    this.last808 = { ctx, src, g, end, releaseAt: end - release, vel };
    return end;
  }

  _tonal(ev, t, dur, bus, vel) {
    const def = this.bank.def(ev.inst);
    let end = t;
    for (const midi of [].concat(ev.midi)) {
      const n = this.bank.note(ev.inst, midi);
      if (!n) continue;
      const pan = ev.pan ?? (ev.part === 'double' ? -0.18 : ev.part === 'counter' ? 0.22 : ev.part === 'energy' ? (ev.step % 2 ? 0.35 : -0.35) : ev.part === 'texture' ? (midi % 2 ? 0.45 : -0.45) : 0);
      end = Math.max(end, this._buffer(n.buffer, t, bus, { vel, rate: n.rate, dur, attack: def.attack ?? 0.003, release: def.release ?? 0.2, pan }));
    }
    return end;
  }

  _vox(ev, t, dur, bus, vel) {
    const { buffer, rate } = this.bank.vox(ev.midi, ev.vowel);
    const pan = ev.pan ?? [0, -0.25, 0.25, -0.1][Math.floor(ev.step) % 4];
    return this._buffer(buffer, t, bus, { vel, rate, dur, attack: 0.006, release: this.bank.def('vox').release ?? 0.12, pan });
  }

  /**
   * Play `secondsOfBar` of a looping buffer, aligned to the musical position of
   * `bar`. Consecutive bars overlap by a few milliseconds with complementary
   * fades over identical audio, so the joins are inaudible.
   */
  _loopSlice(buffer, t, bar, bus, vel, loopBars) {
    if (!buffer || vel <= 0.0005) return t;
    const ctx = this.ctx;
    const xf = 0.006;
    const loopLen = Math.min(buffer.duration, loopBars * this.barDur);
    const offset = (((bar % loopBars) + loopBars) % loopBars) * this.barDur;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = loopLen;
    const g = ctx.createGain();
    const start = Math.max(0, t - xf);
    const end = t + this.barDur + xf;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vel, t + xf);
    g.gain.setValueAtTime(vel, t + this.barDur - xf);
    g.gain.linearRampToValueAtTime(0, end);
    src.connect(g).connect(bus.input);
    src.start(start, (((offset - (t - start)) % loopLen) + loopLen) % loopLen);
    src.stop(end + 0.01);
    return end;
  }

  /** Sustained pad: two detuned saws per note, slow-breathing low-pass, wide. */
  _pad(t, midis, dur, bus, vel) {
    const ctx = this.ctx;
    const attack = 0.4;
    const release = 1.1;
    const end = t + dur;
    const stop = end + release + 0.05;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(vel, t + attack);
    amp.gain.setValueAtTime(vel, end);
    amp.gain.linearRampToValueAtTime(0, end + release);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1150;
    lp.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 320;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start(t);
    lfo.stop(stop);
    amp.connect(lp).connect(bus.input);
    midis.forEach((m, i) => {
      const f = midiToHz(m);
      const pan = midis.length > 1 ? (i / (midis.length - 1) - 0.5) * 0.8 : 0;
      const sum = ctx.createGain();
      sum.gain.value = 1 / Math.sqrt(midis.length);
      this._out(sum, { input: amp }, pan);
      for (const [type, cents, lvl] of [['sawtooth', -8, 0.5], ['sawtooth', 8, 0.5], ['triangle', 0, 0.6]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = cents;
        const og = ctx.createGain();
        og.gain.value = lvl;
        o.connect(og).connect(sum);
        o.start(t);
        o.stop(stop);
      }
    });
    return end + release;
  }

  /** Synthetic choir (formant-filtered saws with vibrato) for the "Quality" second voice. */
  _choir(t, midis, dur, bus, vel) {
    const ctx = this.ctx;
    const attack = 0.6;
    const release = 1;
    const end = t + dur;
    const stop = end + release + 0.05;
    const sum = ctx.createGain();
    sum.gain.setValueAtTime(0, t);
    sum.gain.linearRampToValueAtTime(vel / Math.sqrt(midis.length), t + attack);
    sum.gain.setValueAtTime(vel / Math.sqrt(midis.length), end);
    sum.gain.linearRampToValueAtTime(0, end + release);
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.8;
    const vibG = ctx.createGain();
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(8, t + 0.9);
    vib.connect(vibG);
    vib.start(t);
    vib.stop(stop);
    for (const m of midis) {
      for (const cents of [-10, 10]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToHz(m);
        o.detune.value = cents;
        vibG.connect(o.detune);
        o.connect(sum);
        o.start(t);
        o.stop(stop);
      }
    }
    for (const [freq, gain] of [[320, 1], [880, 0.4], [2300, 0.14]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = 6;
      const fg = ctx.createGain();
      fg.gain.value = gain * 3;
      sum.connect(bp).connect(fg).connect(bus.input);
    }
    return end + release;
  }
}
