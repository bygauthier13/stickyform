// Plays the rendered soundtrack through the engine's output gate, so the
// Sound on / off switch governs it exactly like the live music.

export class TrackPlayer {
  /**
   * @param {{ ctx: AudioContext, playerBus: AudioNode }} engine
   * @param {{ buffer: AudioBuffer, duration: number }} result
   */
  constructor(engine, result) {
    this.engine = engine;
    this.buffer = result.buffer;
    this.duration = result.duration;
    this.offset = 0;
    this.startedAt = 0;
    this.source = null;
    this.playing = false;
    this.listeners = new Set();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit() {
    this.listeners.forEach((fn) => fn(this));
  }

  get ctx() {
    return this.engine.ctx;
  }

  /** Current position in seconds. Freezes with the clock when sound is switched off. */
  get position() {
    if (!this.playing) return this.offset;
    return Math.min(this.duration, Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  async play() {
    if (this.playing || !this.ctx) return;
    if (this.offset >= this.duration - 0.05) this.offset = 0;
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.engine.playerBus);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.playing = false;
      this.offset = this.position >= this.duration - 0.2 ? this.duration : this.offset;
      this._emit();
    };
    this.startedAt = this.ctx.currentTime - this.offset;
    src.start(0, this.offset);
    this.source = src;
    this.playing = true;
    this._emit();
  }

  pause() {
    if (!this.playing) return;
    this.offset = this.position;
    this._stop();
    this.playing = false;
    this._emit();
  }

  toggle() {
    return this.playing ? this.pause() : this.play();
  }

  seek(seconds) {
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this._stop();
      this.playing = false;
    }
    this.offset = Math.min(Math.max(0, seconds), this.duration);
    if (wasPlaying) return this.play();
    this._emit();
  }

  async restart() {
    this.seek(0);
    if (!this.playing) await this.play();
  }

  _stop() {
    const src = this.source;
    this.source = null;
    if (src) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      src.disconnect();
    }
  }

  dispose() {
    this._stop();
    this.playing = false;
    this.listeners.clear();
  }
}

/** Stand-in when the browser has no usable Web Audio: results still work, minus playback. */
export class SilentPlayer {
  constructor(result) {
    this.duration = result.duration;
    this.silent = true;
    this.playing = false;
    this.position = 0;
  }
  onChange() {
    return () => {};
  }
  async play() {}
  pause() {}
  async toggle() {}
  seek() {}
  async restart() {}
  dispose() {}
}
