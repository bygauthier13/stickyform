// The live audio engine.
//
// Knows nothing about forms or the DOM. The host application feeds it
// progress (0–1) and a musical profile, and the engine turns that into a
// continuously evolving piece:
//
//   engine.init()            create the AudioContext (inside a user gesture)
//   engine.start(profile)    begin the composition
//   engine.setProfile(p)     answers reshape the music from the next bar on
//   engine.setProgress(x)    layers enter, quantised to the bar, led by a riser
//   engine.finale()          lift → closing cadence
//   engine.renderTrack(p)    render the downloadable track (offline)
//   engine.setEnabled(bool)  sound on / off — silences everything immediately
//
// Everything audible is produced by the same Composer used for the offline
// render, so what the user hears while answering is a preview of the file
// they will download.

import { Composer, defaultState } from './composer.js';
import { getDrumBank } from './drumBank.js';
import { createMixer } from './fx.js';
import { LAYER_ENTER, LAYER_NAMES } from './musicLayers.js';
import { renderTrack } from './render.js';
import { SoundEffects } from './soundEffects.js';
import { TypingInstrument } from './typing.js';
import { SilentPlayer, TrackPlayer } from './trackPlayer.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const db = (x) => 10 ** (x / 20);

/** Number of layers audible at a given progress (layer 1 is always there). */
export function layersForProgress(p) {
  let n = 1;
  for (let i = 1; i <= 6; i++) if (p >= LAYER_ENTER[i]) n = i + 1;
  return n;
}

/**
 * Live loudness: the intro is lifted a little and the full arrangement is
 * held back, so the form is comfortable to fill in at any stage — never
 * overpowering the interface, never so quiet the first layer is lost.
 */
const liveGain = (p) => db(4 * (1 - p)) * 0.62;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.started = false;
    this.finished = false;
    this.profile = null;
    this.tempo = 112;
    this.nextBar = 0;
    this.nextTime = 0;
    this.pHigh = 0;
    this.pChanges = [];
    this.entries = new Map();
    this.finaleInfo = null;
    this.listeners = new Map();
    this.levels = new Float32Array(8);
    this._buf = null;
    this._timer = null;
    this._finaleWaiters = [];
  }

  // ------------------------------------------------------------------ events

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type).delete(fn);
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

  // --------------------------------------------------------------- lifecycle

  /** Start rendering drum samples ahead of time. Needs no user gesture. */
  preload() {
    return getDrumBank().catch(() => {});
  }

  get ready() {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  /** True when sound would actually come out of the speakers right now. */
  get audible() {
    return this.ready && this.enabled && this.ctx.state === 'running';
  }

  /** Create the AudioContext. Must be called from a user gesture (click / key). */
  async init() {
    if (this.ready) {
      await this._resume();
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Web Audio is not supported in this browser');
    try {
      // iOS: let Web Audio play even with the ringer switch on silent
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* optional */
    }
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    // iOS only honours resume() made synchronously inside the user's gesture,
    // so ask for it before awaiting anything.
    const resumed = this.enabled ? ctx.resume().catch(() => {}) : Promise.resolve();
    const mixer = (this.mixer = createMixer(ctx));

    // master → programme fade → user's sound gate → speakers
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.gate = ctx.createGain();
    this.gate.gain.value = this.enabled ? 1 : 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    mixer.master.connect(this.fade);
    this.fade.connect(this.gate);
    this.fade.connect(this.analyser);
    this.gate.connect(ctx.destination);
    // The rendered track bypasses the mixer (it is already mastered)
    this.playerBus = ctx.createGain();
    this.playerBus.gain.value = 0.85;
    this.playerBus.connect(this.gate);
    this.playerAnalyser = ctx.createAnalyser();
    this.playerAnalyser.fftSize = 512;
    this.playerBus.connect(this.playerAnalyser);

    const bank = await getDrumBank(ctx.sampleRate);
    this.composer = new Composer(ctx, mixer, { live: true, bank });
    this.sfx = new SoundEffects(ctx, mixer, () => this.audible);
    this.typing = new TypingInstrument(ctx, mixer, {
      getTimeline: () => this.composer.timeline,
      isOn: () => this.audible && this.started && !this.finished,
    });
    this._buf = new Float32Array(512);

    ctx.addEventListener('statechange', () => this._emit('state', ctx.state));
    // Browsers can suspend audio (tab switch, phone call). Recover on the next touch.
    const revive = () => {
      if (this.enabled && this.ready && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    };
    this._revive = revive;
    ['pointerdown', 'keydown', 'touchend'].forEach((e) => document.addEventListener(e, revive, { passive: true }));

    await resumed;
    await this._resume();
    if (!this.enabled) this._silence();
  }

  async _resume() {
    if (!this.ready) return;
    if (this.enabled && this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* needs a gesture; revive() will retry */
      }
    }
  }

  _silence() {
    const ctx = this.ctx;
    setTimeout(() => {
      if (!this.enabled && ctx.state === 'running') ctx.suspend().catch(() => {});
    }, 160);
  }

  /** Sound on / off. Takes effect within milliseconds and keeps the form fully usable. */
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.gate.gain.cancelScheduledValues(t);
    if (on) {
      this.ctx.resume().catch(() => {});
      this.gate.gain.setTargetAtTime(1, t, 0.06);
      this.sfx?.chime();
    } else {
      this.gate.gain.setTargetAtTime(0, t, 0.012);
      this._silence();
    }
  }

  setProfile(profile) {
    this.profile = profile;
  }

  /** Begin the composition. Safe to call once per session. */
  start(profile) {
    if (!this.ready || this.started) return;
    if (profile) this.profile = profile;
    this.started = true;
    this.tempo = this.profile.tempo > 0 ? clamp(this.profile.tempo, 90, 126) : 110;
    this.barDur = 240 / this.tempo;
    const t = this.ctx.currentTime + 0.25;
    this.nextTime = t;
    this.nextBar = 0;
    this.composer.init(t, this.profile);
    this.fade.gain.setTargetAtTime(liveGain(0), this.ctx.currentTime, 0.9); // gentle fade-in
    this._timer = setInterval(() => this._tick(), 40);
    this._tick();
  }

  /** Fade out and release the AudioContext. */
  async dispose() {
    clearInterval(this._timer);
    this._timer = null;
    if (!this.ready) return;
    const ctx = this.ctx;
    if (this._revive) ['pointerdown', 'keydown', 'touchend'].forEach((e) => document.removeEventListener(e, this._revive));
    this.player?.dispose();
    this.player = null;
    this.fade.gain.cancelScheduledValues(ctx.currentTime);
    this.fade.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    await new Promise((r) => setTimeout(r, 300));
    try {
      this.composer.stop(ctx.currentTime + 0.05);
      await ctx.close();
    } catch {
      /* already closed */
    }
    this.ctx = null;
    this.started = false;
    this.finished = false;
    this.pHigh = 0;
    this.pChanges = [];
    this.entries.clear();
    this.finaleInfo = null;
  }

  // -------------------------------------------------------------- scheduling

  _tick() {
    if (!this.started || this.finished || !this.ready) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.nextTime < now - 0.1) this.nextTime = now + 0.1; // fell behind (throttled tab): resync
    const horizon = typeof document !== 'undefined' && document.hidden ? 2.4 : 0.7;
    while (this.nextTime < now + horizon && !this.finished) this._scheduleNextBar();
  }

  _stateFor(bar) {
    const st = defaultState();
    for (const c of this.pChanges) if (c.bar <= bar) st.p = c.p;
    // forget changes that can no longer matter
    while (this.pChanges.length > 1 && this.pChanges[1].bar <= bar) this.pChanges.shift();
    const entry = this.entries.get(bar);
    if (entry) {
      st.milestone = entry.milestone;
      this.entries.delete(bar);
    }
    if (this.finaleInfo) {
      const k = bar - this.finaleInfo.startBar;
      if (k === 0) st.lift = true;
      else if (k > 0) st.resolve = k - 1;
    }
    return { st, entry };
  }

  _scheduleNextBar() {
    const bar = this.nextBar;
    const t0 = this.nextTime;
    const { st, entry } = this._stateFor(bar);
    const barDur = 240 / this.tempo;
    this.barDur = barDur;

    this.composer.scheduleBar({ bar, t0, barDur, st, profile: this.profile });

    // live loudness follows progress; the finale fades itself out
    if (!this.finaleInfo || st.resolve < 3) this.fade.gain.setTargetAtTime(liveGain(st.p), t0, 0.9);

    // UI notifications, timed to when the sound actually arrives
    if (entry) {
      const delay = Math.max(0, (t0 - this.ctx.currentTime) * 1000);
      setTimeout(() => entry.layers.forEach((l) => this._emit('layer', l)), delay);
      if (entry.milestone && entry.milestone !== 'enter') setTimeout(() => this._emit('milestone', { name: entry.milestone }), delay);
    }
    if (this.finaleInfo) {
      const k = bar - this.finaleInfo.startBar;
      if (k === 3) {
        // the final chord sounds at the start of this bar
        const delay = Math.max(0, (t0 - this.ctx.currentTime) * 1000);
        setTimeout(() => {
          this._finaleWaiters.splice(0).forEach((r) => r());
          this._emit('finale', {});
        }, delay);
        this.fade.gain.setTargetAtTime(0, t0 + barDur * 0.7, 1.6);
      }
      if (k >= 4) {
        this.finished = true;
        clearInterval(this._timer);
        this._timer = null;
        this.composer.stop(t0 + 6);
      }
    }

    // tempo glides toward the profile's target, so answers never jolt the groove
    const target = clamp(this.profile.tempo, 90, 126);
    this.tempo += clamp(target - this.tempo, -1.5, 1.5);

    this.nextBar++;
    this.nextTime += barDur;
  }

  /** The first bar whose scheduling hasn't happened yet, and when it starts. */
  _upcoming() {
    const remain = this.nextTime - this.ctx.currentTime;
    return remain < 0.9
      ? { bar: this.nextBar + 1, time: this.nextTime + this.barDur }
      : { bar: this.nextBar, time: this.nextTime };
  }

  /**
   * Feed form progress (0–1). The music never regresses (going back a question
   * doesn't un-play layers). New layers arrive on the next bar line, led into by a riser.
   */
  setProgress(p) {
    p = clamp(p, 0, 1);
    if (!this.started || this.finaleInfo || p <= this.pHigh) {
      this.pHigh = Math.max(this.pHigh, p);
      return;
    }
    const prev = this.pHigh;
    this.pHigh = p;
    const { bar, time } = this._upcoming();
    this.pChanges.push({ bar, p });

    const crossed = (th) => prev < th && p >= th;
    const layers = [];
    for (let i = 1; i <= 6; i++) if (crossed(LAYER_ENTER[i])) layers.push({ index: i, name: LAYER_NAMES[i] });
    const milestone = crossed(0.5) ? 'half' : crossed(0.75) ? 'q3' : crossed(0.9) ? 'full' : layers.length ? 'enter' : null;
    if (!layers.length && !milestone) return;

    const prior = this.entries.get(bar);
    this.entries.set(bar, {
      milestone: prior?.milestone === 'half' || prior?.milestone === 'q3' ? prior.milestone : milestone,
      layers: [...(prior?.layers || []), ...layers],
    });
    // The riser swells into the bar line where the new material lands.
    const lead = clamp(time - this.ctx.currentTime - 0.03, 0.4, 2.2);
    this.composer.layers[7].riserInto(this.ctx, time, lead, milestone === 'enter' ? 0.1 : 0.15);
  }

  /**
   * Final lift and closing cadence. Resolves when the final chord begins to
   * sound (or after a short delay if nothing is audible).
   */
  finale() {
    if (!this.started || this.finaleInfo || this.finished) return Promise.resolve();
    this.pHigh = 1;
    const { bar } = this._upcoming();
    this.pChanges.push({ bar, p: 1 });
    this.finaleInfo = { startBar: bar };
    if (!this.audible) return new Promise((r) => setTimeout(r, 1600));
    return new Promise((resolve) => {
      this._finaleWaiters.push(resolve);
      // safety net so the UI can never hang on a stalled audio clock
      setTimeout(resolve, 16000);
    });
  }

  // -------------------------------------------------------------- UI sounds

  cue(name, ...args) {
    if (!this.sfx || typeof this.sfx[name] !== 'function') return;
    this.sfx[name](...args);
  }

  /**
   * A key was typed. While the music is playing the keystroke becomes a note in
   * time and in key with it; otherwise it falls back to the quiet interface tick.
   * Returns the note played (for tests and debugging), or null.
   */
  typed(char) {
    const last = typeof char === 'string' ? [...char].pop() : '';
    if (!last || !last.trim()) return null;
    if (this.typing?.live) return this.typing.play(last, this.profile); // fast typing may skip a key: that is fine
    this.cue('type', last); // music not running yet: the quiet interface tick
    return null;
  }

  // ----------------------------------------------------------------- visuals

  /** Smoothed 0–1 level per layer, for the on-screen visual. */
  getLevels() {
    if (!this.ready || !this.composer) return this.levels;
    const buf = this._buf;
    const player = this.player?.playing && this.playerMarkers ? this.player : null;
    let master = 0;
    if (player && this.audible) {
      this.playerAnalyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
      master = clamp(Math.sqrt(sum / buf.length) * 7, 0, 1);
    }
    const pos = player ? player.position : 0;
    const now = performance.now() / 1000;
    this.composer.layers.forEach((layer, i) => {
      let v = 0;
      if (player) {
        // the rendered track is one stereo file, so each active layer borrows the
        // master level with its own gentle motion
        if (this.audible && pos >= this.playerMarkers[i] - 0.05) v = clamp(master * (0.75 + 0.45 * Math.sin(now * (1.3 + i * 0.41) + i * 2)), 0, 1);
      } else {
        const an = layer.meterBus?.analyser;
        if (an && this.audible) {
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
          v = clamp(Math.sqrt(sum / buf.length) * 9, 0, 1);
        }
      }
      this.levels[i] = Math.max(v, this.levels[i] * 0.9);
    });
    return this.levels;
  }

  /** Overall output level 0–1. */
  getLevel() {
    if (!this.ready || !this.audible) return 0;
    this.analyser.getFloatTimeDomainData(this._buf);
    let sum = 0;
    for (let k = 0; k < this._buf.length; k++) sum += this._buf[k] * this._buf[k];
    return clamp(Math.sqrt(sum / this._buf.length) * 6, 0, 1);
  }

  // ---------------------------------------------------------- track + player

  /** Render the finished soundtrack. Works whether or not sound is enabled. */
  renderTrack(profile, opts) {
    return renderTrack(profile, opts);
  }

  createPlayer(result) {
    this.player?.dispose();
    this.player = this.ready ? new TrackPlayer(this, result) : new SilentPlayer(result);
    this.playerMarkers = result.markers;
    return this.player;
  }
}
