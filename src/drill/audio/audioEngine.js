// AudioEngine — the one live engine of the drill edition.
//
//   one AudioContext, created only inside the user's "Start with sound" click
//   one transport: bars at 140 BPM, timed on the audio clock; a timer merely
//       wakes the scheduler, which composes each bar just before it starts
//   one composer: composeBar(state, bar) — the same code the download uses
//
// The host feeds it MusicalState (never answers) and interaction gestures; it
// reports which layers are entering, and exposes levels and the step grid for the
// visuals. It knows nothing about the DOM beyond page visibility.

import { composeBar, finalBarEvents, transitionEvents } from '../composer.js';
import { TYPING_RANGES, TypingPlanner, hoverEvents, selectEvents } from '../interaction.js';
import { MAIN_LAYERS } from '../musicalState.js';
import { BPM, barSeconds, stepSeconds } from '../theory.js';
import { Instruments } from './instruments.js';
import { createDrillMixer } from './mixer.js';

const LOOKAHEAD = 0.3; // a bar is composed and scheduled this long before its first beat
const TICK_MS = 25;
export const VISUAL_ROWS = MAIN_LAYERS; // atmosphere · melody · bass · drums · vocals

/** The parts whose arrival is announced (a layer, or a part added to one). */
const partsOf = (s) => ({
  atmosphere: true,
  melody: !!s.layers.melody,
  bass: !!s.layers.bass,
  drums: !!s.layers.drums,
  vocals: !!s.layers.vocals,
  texture: !!s.texture,
  energy: !!s.energy,
  counter: !!s.counter,
});
const PART_LAYER = { texture: 'atmosphere', energy: 'melody', counter: 'melody' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class AudioEngine {
  constructor({ bank = null } = {}) {
    this.bank = bank;
    this.ctx = null;
    this.state = null;
    this.running = false;
    this.muted = false;
    this.userPaused = false;
    this.autoPaused = false;
    this.finishing = null;
    this.timeline = [];
    this.listeners = new Map();
    this.planner = new TypingPlanner();
    this.uiVoices = [];
    this.lastHoverAt = -1;
    this.lastSelectAt = -1;
    this.fillBar = -1;
    this.levels = new Float32Array(VISUAL_ROWS.length);
    this.debug = { typed: [], hovers: 0, selects: 0, fills: 0, timers: () => (this._timer ? 1 : 0), barsScheduled: 0, lastBarEvents: 0 };
    this._buf = new Float32Array(512);
    this._onVisibility = () => this._visibility();
    this._revive = () => {
      if (this.ctx && !this.userPaused && !this.autoPaused && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
    };
  }

  // ------------------------------------------------------------------ events

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  _emit(type, detail) {
    this.listeners.get(type)?.forEach((fn) => {
      try {
        fn(detail);
      } catch (e) {
        console.error(e);
      }
    });
  }

  /** Run `fn` when the audio clock reaches `time` (what you hear, not what is scheduled). */
  _at(time, fn) {
    if (!this.ctx) return;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    setTimeout(fn, Math.max(0, (time - this.ctx.currentTime + lat) * 1000));
  }

  // --------------------------------------------------------------- lifecycle

  get enabled() {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  /** True when sound is actually coming out. */
  get audible() {
    return this.enabled && !this.muted && this.ctx.state === 'running';
  }

  get playing() {
    return this.running && this.enabled && this.ctx.state === 'running' && !this.userPaused;
  }

  setBank(bank) {
    this.bank = bank;
    if (this.instruments) this.instruments.bank = bank;
  }

  /**
   * Create (or resume) the AudioContext. Call it from a click or key press: that
   * gesture is the consent. Throws when Web Audio is unavailable.
   */
  async enable() {
    if (this.enabled) {
      if (!this.userPaused) await this.ctx.resume().catch(() => {});
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not supported in this browser');
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback'; // iOS: play even with the ringer off
    } catch {
      /* optional */
    }
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const resumed = ctx.resume().catch(() => {}); // iOS wants this inside the gesture, before any await
    this.mixer = createDrillMixer(ctx, { meters: true });
    this.fade = ctx.createGain();
    this.gate = ctx.createGain();
    this.gate.gain.value = this.muted ? 0 : 1;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.mixer.master.connect(this.fade).connect(this.gate).connect(ctx.destination);
    this.fade.connect(this.analyser);
    // the finished track is already mastered: it skips the mix and only passes the mute gate
    this.playerBus = ctx.createGain();
    this.playerBus.gain.value = 0.8; // the mastered file is ~3 dB louder than the live mix: keep the switch smooth
    this.playerBus.connect(this.gate);
    this.playerBus.connect(this.analyser);
    this.instruments = new Instruments(ctx, this.mixer, this.bank);
    ctx.addEventListener?.('statechange', () => this._emit('status', this.status()));
    document.addEventListener('visibilitychange', this._onVisibility);
    ['pointerdown', 'keydown', 'touchend'].forEach((e) => document.addEventListener(e, this._revive, { passive: true }));
    await resumed;
    this._emit('status', this.status());
  }

  /** Start the transport at bar 0 with the current state. */
  start(state) {
    if (!this.enabled || this.running) return;
    if (state) this.state = state;
    this.running = true;
    this.finishing = null;
    this.timeline = [];
    this.nextBar = 0;
    this.nextBarTime = this.ctx.currentTime + 0.12;
    this.lastParts = partsOf(this.state);
    this.fade.gain.cancelScheduledValues(this.ctx.currentTime);
    this.fade.gain.setValueAtTime(0, this.ctx.currentTime);
    this.fade.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 0.6); // no click on the first note
    this.mixer.setTone(this.ctx.currentTime, 20000, 0.01);
    clearInterval(this._timer);
    this._timer = setInterval(() => this._tick(), TICK_MS);
    this._tick();
    this._emit('status', this.status());
  }

  status() {
    return {
      enabled: this.enabled,
      context: this.ctx?.state || 'none',
      running: this.running,
      playing: this.playing,
      paused: this.userPaused,
      muted: this.muted,
    };
  }

  /** Pause everything (the music and the interface sounds); resume picks up where it left off. */
  async pause() {
    if (!this.enabled || this.userPaused) return;
    this.userPaused = true;
    await this._suspend();
    this._emit('status', this.status());
  }

  async resume() {
    if (!this.enabled) return;
    this.userPaused = false;
    this.autoPaused = false;
    await this._resumeCtx();
    this._emit('status', this.status());
  }

  async _suspend() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(this.fade.gain.value, t);
    this.fade.gain.linearRampToValueAtTime(0, t + 0.06);
    await wait(80);
    if (ctx.state === 'running') await ctx.suspend().catch(() => {});
  }

  async _resumeCtx() {
    const ctx = this.ctx;
    await ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(0, t);
    this.fade.gain.linearRampToValueAtTime(1, t + 0.12);
  }

  /** Background tab: pause quietly; back on the page: carry on (unless the user had paused). */
  async _visibility() {
    if (!this.enabled) return;
    if (document.hidden) {
      if (!this.userPaused && this.ctx.state === 'running') {
        this.autoPaused = true;
        await this._suspend();
        this._emit('status', this.status());
      }
    } else if (this.autoPaused && !this.userPaused) {
      this.autoPaused = false;
      await this._resumeCtx();
      this._emit('status', this.status());
    }
  }

  /** Mute keeps the music running in time, silently; unmuting brings it straight back. */
  setMuted(on) {
    this.muted = !!on;
    if (this.enabled) {
      const t = this.ctx.currentTime;
      this.gate.gain.cancelScheduledValues(t);
      this.gate.gain.setTargetAtTime(on ? 0 : 1, t, on ? 0.012 : 0.04);
    }
    this._emit('status', this.status());
  }

  /** Stop the transport and release the AudioContext: nothing keeps running after a reset. */
  async reset() {
    clearInterval(this._timer);
    this._timer = null;
    this.running = false;
    this.finishing = null;
    this.timeline = [];
    this.state = null;
    this.planner.reset();
    this.uiVoices = [];
    this.fillBar = -1;
    document.removeEventListener('visibilitychange', this._onVisibility);
    ['pointerdown', 'keydown', 'touchend'].forEach((e) => document.removeEventListener(e, this._revive));
    const ctx = this.ctx;
    this.ctx = null;
    this.instruments = null;
    this.mixer = null;
    if (ctx && ctx.state !== 'closed') {
      try {
        this.fade.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
        await wait(90);
        await ctx.close();
      } catch {
        /* already closed */
      }
    }
    this.userPaused = false;
    this.autoPaused = false;
    this._emit('status', this.status());
  }

  // ------------------------------------------------------------------ state

  /**
   * New musical state. Changes are heard from the next bar line; a layer or part
   * that is new is announced now ('entering', with the time it will be heard),
   * led in by a short transition, and confirmed when it sounds ('entered').
   */
  setState(state) {
    this.state = state;
    if (!this.running || this.finishing) return;
    const now = partsOf(state);
    const fresh = Object.keys(now).filter((k) => now[k] && !this.lastParts?.[k]);
    this.lastParts = now;
    if (!fresh.length) return;
    const at = this.nextBarTime;
    for (const part of fresh) {
      const detail = { part, layer: PART_LAYER[part] || part, at, inSeconds: Math.max(0, at - this.ctx.currentTime) };
      this._emit('entering', detail);
      this._at(at, () => this._emit('entered', detail));
    }
    this._leadInto(this.nextBar, at);
  }

  /** A transition into the bar starting at `at`: a swell from the next sixteenth, hits in the last beat. */
  _leadInto(bar, at) {
    if (this.fillBar === bar || !this.instruments) return;
    this.fillBar = bar;
    this.debug.fills++;
    const step = stepSeconds(BPM);
    const now = this.ctx.currentTime;
    const barStart = at - barSeconds(BPM);
    for (const ev of transitionEvents(this.state)) {
      if (ev.layer === 'fx') {
        // the swell starts on the next free sixteenth (immediate feedback) and ends on the bar line
        const steps = Math.min(16, Math.floor((at - (now + 0.03)) / step));
        if (steps < 1) continue;
        this.instruments.play({ ...ev, step: 16 - steps, extra: { seconds: steps * step } }, barStart, bar - 1);
      } else if (barStart + ev.step * step > now + 0.03) {
        this.instruments.play(ev, barStart, bar - 1);
      }
    }
  }

  /** A short fill into the next bar line (used when an answer changes a pattern without adding a layer). */
  fill() {
    if (!this.running || this.finishing || !this.instruments) return false;
    this._leadInto(this.nextBar, this.nextBarTime);
    return true;
  }

  // -------------------------------------------------------------- scheduling

  _tick() {
    if (!this.running || !this.enabled) return;
    const now = this.ctx.currentTime;
    if (this.nextBarTime < now - 0.05) {
      // the timer was starved (busy page): skip to the next bar line rather than play late notes
      const late = Math.ceil((now + 0.05 - this.nextBarTime) / barSeconds(BPM));
      this.nextBar += late;
      this.nextBarTime += late * barSeconds(BPM);
    }
    while (this.running && this.nextBarTime < now + LOOKAHEAD) this._scheduleBar();
  }

  _scheduleBar() {
    const bar = this.nextBar;
    const t0 = this.nextBarTime;
    const final = this.finishing && bar === this.finishing.bar;
    const events = final ? finalBarEvents(this.state) : composeBar(this.state, bar, { kind: 'live' }, { stems: this.bank?.stemKeys });
    for (const ev of events) this.instruments.play(ev, t0, bar);

    // visual grid of this bar: strongest hit per layer and sixteenth
    const grid = VISUAL_ROWS.map(() => new Float32Array(16));
    for (const ev of events) {
      const row = VISUAL_ROWS.indexOf(ev.layer === 'fx' ? 'drums' : ev.layer);
      if (row < 0 || ev.inst === 'tone') continue;
      if (ev.inst === 'bed') {
        // a continuous bed reads as a faint, steady line
        for (let k = 0; k < 16; k++) grid[row][k] = Math.max(grid[row][k], 0.12);
        continue;
      }
      const s = Math.min(15, Math.floor(ev.step));
      const v = Math.min(1, ev.vel ?? 0.5);
      grid[row][s] = Math.max(grid[row][s], v);
      // a held note (pad, 808, long melody note) stays faintly lit while it sounds
      for (let k = s + 1; k < Math.min(16, s + Math.round(ev.dur || 0)); k++) grid[row][k] = Math.max(grid[row][k], v * 0.32);
    }
    this.timeline.push({ bar, t0, grid, count: events.length });
    if (this.timeline.length > 6) this.timeline.shift();
    this.debug.barsScheduled++;
    this.debug.lastBarEvents = events.length;
    this._emit('bar', { bar, t0 });

    this.nextBar++;
    this.nextBarTime += barSeconds(BPM);
    if (final) {
      this.running = false;
      clearInterval(this._timer);
      this._timer = null;
      const done = this.finishing;
      this._at(t0, () => done.resolve());
      this._at(t0 + barSeconds(BPM) * 2.2, () => this._emit('status', this.status()));
    }
  }

  /**
   * End the live session musically: a fill, then the chosen ending's last bar on
   * the next bar line. Resolves when that final hit sounds.
   */
  finish() {
    if (!this.running || this.finishing) return this.finishing?.promise || Promise.resolve();
    // the bar after next if the next one is about to be scheduled anyway (a fill needs a moment)
    const bar = this.nextBarTime - this.ctx.currentTime > 0.62 ? this.nextBar : this.nextBar + 1;
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    this.finishing = { bar, resolve, promise };
    const at = this.nextBarTime + (bar - this.nextBar) * barSeconds(BPM);
    if (this.state.ending !== 'atmospheric') this._leadInto(bar, at);
    setTimeout(resolve, 12000); // never leave the interface waiting on a stalled clock
    return promise;
  }

  // ------------------------------------------------------------ interaction

  /** The next sixteenth-note slot of the running track at or after `from`. */
  nextSlot(from) {
    const ref = this.timeline[this.timeline.length - 1];
    if (!ref) return null;
    const step = stepSeconds(BPM);
    const k = Math.ceil((from - ref.t0) / step - 1e-9);
    return { time: ref.t0 + k * step, bar: ref.bar + Math.floor(k / 16), step: ((k % 16) + 16) % 16 };
  }

  /** Interface sounds are limited by gesture: at most `max` hover/select/typing gestures ringing at once. */
  _uiReady(max = 4) {
    if (!this.audible || !this.running || this.finishing) return false;
    const now = this.ctx.currentTime;
    this.uiVoices = this.uiVoices.filter((end) => end > now);
    return this.uiVoices.length < max;
  }

  _playUi(events, slot, gain) {
    let end = slot.time;
    for (const ev of events) end = Math.max(end, this.instruments.play(ev, slot.time, slot.bar, { bus: 'ui', gain }));
    this.uiVoices.push(Math.min(end, slot.time + 1.2));
  }

  /** First hover over an option: one short note, in time, rate- and voice-limited. */
  hover(qid, index) {
    if (!this._uiReady(3)) return false;
    const now = this.ctx.currentTime;
    if (now - this.lastHoverAt < 0.09) return false;
    this.lastHoverAt = now;
    const slot = this.nextSlot(now + 0.02);
    if (!slot) return false;
    this._playUi(hoverEvents(qid, index, slot.bar), slot, 0.55);
    this.debug.hovers++;
    return true;
  }

  /** An option chosen: a short accent from the instrument it brings in. */
  select(qid, optionId) {
    if (!this._uiReady(4)) return false;
    const now = this.ctx.currentTime;
    if (now - this.lastSelectAt < 0.1) return false;
    this.lastSelectAt = now;
    const slot = this.nextSlot(now + 0.025);
    if (!slot) return false;
    this._playUi(selectEvents(qid, optionId, slot.bar), slot, 0.8);
    this.debug.selects++;
    return true;
  }

  /**
   * Text typed into question `qid` ('energy' or 'title'). `input` comes from
   * classifyInput(): deletions are silent, pastes become a three-note phrase at most.
   */
  typed(qid, input) {
    if (!input || input.kind === 'silent' || !this._uiReady(6)) return [];
    const now = this.ctx.currentTime;
    const title = qid === 'title';
    const range = title ? TYPING_RANGES.title : this.state?.melody === 'technical' ? TYPING_RANGES.energyTechnical : TYPING_RANGES.energy;
    const notes = this.planner.plan(input.chars, input.kind, (from) => this.nextSlot(from), now, range);
    for (const n of notes) {
      const ev = title
        ? { layer: 'ui', part: 'ui', inst: 'vox', step: 0, dur: 2, midi: n.midi, vowel: n.vowel, vel: 0.62 }
        : { layer: 'ui', part: 'ui', inst: range.inst, step: 0, dur: 2, midi: n.midi, vel: 0.6 };
      this._playUi([ev], { time: n.time, bar: n.bar }, 0.85);
      this.debug.typed.push({ qid, midi: n.midi, bar: n.bar, step: n.step });
      if (this.debug.typed.length > 200) this.debug.typed.shift();
    }
    return notes;
  }

  // ----------------------------------------------------------------- visuals

  /** The bar that is sounding now, the playhead (in sixteenths) and its grid. */
  frame() {
    if (!this.enabled || !this.timeline.length) return null;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    const now = this.ctx.currentTime - lat;
    let entry = this.timeline[0];
    for (const e of this.timeline) if (e.t0 <= now) entry = e;
    const pos = (now - entry.t0) / stepSeconds(BPM);
    return { bar: entry.bar, step: Math.max(0, Math.min(15.999, pos)), grid: entry.grid, live: this.playing && pos >= 0 && pos < 16 };
  }

  /** Smoothed 0–1 level of each layer, from its bus meter. */
  layerLevels() {
    if (!this.audible || !this.mixer) {
      this.levels.fill(0);
      return this.levels;
    }
    const b = this.mixer.buses;
    const sources = [[b.atmosphere], [b.melody], [b.bass], [b.kit, b.snare], [b.vocals]];
    sources.forEach((list, i) => {
      let sum = 0;
      let n = 0;
      for (const bus of list) {
        if (!bus?.analyser) continue;
        bus.analyser.getFloatTimeDomainData(this._buf);
        for (let k = 0; k < this._buf.length; k++) sum += this._buf[k] * this._buf[k];
        n += this._buf.length;
      }
      const v = n ? Math.min(1, Math.sqrt(sum / n) * 6) : 0;
      this.levels[i] = Math.max(v, this.levels[i] * 0.88);
    });
    return this.levels;
  }
}
