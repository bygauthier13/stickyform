// Interface sounds. Deliberately tiny and tonal: every note comes from the
// same pentatonic set as the music, so tapping answers feels like playing
// the piece rather than triggering sound effects. Nothing here is gamified.

import { midiToHz } from './theory.js';

// D minor pentatonic (also F major pentatonic) across two octaves
const PENTA = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89];
// Option index → scale position, so neighbouring options sound related but distinct
const OPTION_MAP = [4, 6, 3, 7, 5, 8, 2, 9];

export class SoundEffects {
  /**
   * @param {BaseAudioContext} ctx
   * @param {{ ui: AudioNode, reverbIn: AudioNode }} mixer
   * @param {() => boolean} isOn  sound gate — nothing is scheduled while muted
   */
  constructor(ctx, mixer, isOn) {
    this.ctx = ctx;
    this.isOn = isOn;
    this.out = ctx.createGain();
    // Calibrated by measurement: the cues pass through the master and live fade, so
    // this puts a selection ~12 dB under the music's peaks — clearly there, never loud.
    this.out.gain.value = 4.5;
    this.out.connect(mixer.ui);
    const send = ctx.createGain();
    send.gain.value = 0.42;
    this.out.connect(send).connect(mixer.reverbIn);
    this.lastSlider = -1;
    this.lastSliderAt = 0;
    this.lastType = 0;
    this.noise = null;
  }

  _t(offset = 0.005) {
    return this.ctx.currentTime + offset;
  }

  _noise() {
    if (this.noise) return this.noise;
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (this.noise = buf);
  }

  /** Soft tonal pluck: sine + a whisper of octave, with a barely-there tick. */
  _tone(t, midi, { vel = 0.07, decay = 0.38, bright = 0.5, pan = 0, tick = 0.5 } = {}) {
    const ctx = this.ctx;
    const f = midiToHz(midi);
    const stop = t + decay * 2.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.setTargetAtTime(0, t + 0.004, decay / 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400 + bright * 4200;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    lp.connect(g).connect(p).connect(this.out);

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.16;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    o1.start(t);
    o2.start(t);
    o1.stop(stop);
    o2.stop(stop);

    if (tick > 0) {
      const n = ctx.createBufferSource();
      n.buffer = this._noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3400;
      bp.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vel * tick * 0.5, t);
      ng.gain.setTargetAtTime(0, t, 0.003);
      n.connect(bp).connect(ng).connect(this.out);
      n.start(t, Math.random() * 0.8);
      n.stop(t + 0.03);
    }
  }

  /** An answer chosen. `index` is the option's position so each option has its own pitch. */
  select(index = 0, { toggle = false } = {}) {
    if (!this.isOn()) return;
    const note = PENTA[OPTION_MAP[index % OPTION_MAP.length]];
    this._tone(this._t(), note, { vel: toggle ? 0.055 : 0.075, decay: 0.42, pan: ((index % 5) - 2) * 0.12 });
  }

  /** An answer un-chosen (multi-select): the same note, softer and lower. */
  deselect(index = 0) {
    if (!this.isOn()) return;
    this._tone(this._t(), PENTA[OPTION_MAP[index % OPTION_MAP.length]] - 12, { vel: 0.04, decay: 0.2, bright: 0.2, tick: 0.2 });
  }

  /** Slider movement: quantised to the scale, rate-limited so dragging ripples rather than chatters. */
  slider(value, { low = 0, high = 1 } = {}) {
    if (!this.isOn()) return;
    const v = (value - low) / (high - low);
    const idx = Math.max(0, Math.min(PENTA.length - 1, Math.round(v * (PENTA.length - 1))));
    const now = performance.now();
    if (idx === this.lastSlider || now - this.lastSliderAt < 55) return;
    this.lastSlider = idx;
    this.lastSliderAt = now;
    this._tone(this._t(), PENTA[idx] - 12 + 12, { vel: 0.025, decay: 0.3, bright: 0.3, pan: (v - 0.5) * 0.7, tick: 0.1 });
  }

  /** Typing: an almost subliminal tick-note, thinned out so fast typing stays calm. */
  type(char = 'a') {
    if (!this.isOn()) return;
    const now = performance.now();
    if (now - this.lastType < 85) return;
    this.lastType = now;
    const note = PENTA[(char.toLowerCase().charCodeAt(0) || 0) % 7 + 3];
    this._tone(this._t(), note, { vel: 0.017, decay: 0.16, bright: 0.2, tick: 0.3, pan: (Math.random() - 0.5) * 0.4 });
  }

  /** Moving forward: a soft air-swish and a low, rounded note. */
  next() {
    if (!this.isOn()) return;
    this._swish(true);
    this._tone(this._t(0.02), 50, { vel: 0.05, decay: 0.5, bright: 0.1, tick: 0 });
  }

  back() {
    if (!this.isOn()) return;
    this._swish(false);
  }

  _swish(up) {
    const ctx = this.ctx;
    const t = this._t();
    const n = ctx.createBufferSource();
    n.buffer = this._noise();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(up ? 500 : 1800, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 1900 : 450, t + 0.26);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(up ? 0.03 : 0.05, t + 0.09);
    g.gain.linearRampToValueAtTime(0.0001, t + 0.3);
    n.connect(bp).connect(g).connect(this.out);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.32);
  }

  /** The final answer is in: a gentle rising figure through the scale. */
  lift() {
    if (!this.isOn()) return;
    [0, 2, 4, 5, 7].forEach((deg, i) => {
      this._tone(this._t(0.02 + i * 0.075), PENTA[deg + 3], { vel: 0.028, decay: 0.9, bright: 0.7, pan: -0.3 + i * 0.15, tick: 0.2 });
    });
  }

  /** A single soft confirmation (e.g. sound switched back on). */
  chime() {
    if (!this.isOn()) return;
    this._tone(this._t(), PENTA[5], { vel: 0.05, decay: 0.8, bright: 0.6 });
  }
}
