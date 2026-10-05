// The "field": eight hairlines along the bottom of the page, one per musical
// layer. A line appears when its layer enters and moves with that layer's
// actual output — so the page visibly shows the soundtrack being assembled.
// It is the only decoration in the interface, and it is honest: silent when
// muted, still when the user prefers reduced motion.

import { prefersReducedMotion } from './dom.js';

const hexToRgb = (hex) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [239, 233, 223];
};

export class Field {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.engine = engine;
    this.layers = 1;
    this.act = new Float32Array(8);
    this.fg = [239, 233, 223];
    this.accent = [216, 191, 143];
    this.t = 0;
    this.last = 0;
    this.raf = 0;
    this.reduced = prefersReducedMotion();
    this.resize = this.resize.bind(this);
    this.frame = this.frame.bind(this);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.pause() : this.start()));
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
      this.reduced = e.matches;
      this.start();
    });
    this.resize();
  }

  setLayers(n) {
    this.layers = Math.max(0, Math.min(8, n));
    if (this.reduced) {
      for (let i = 0; i < 8; i++) this.act[i] = i < this.layers ? 1 : 0;
      this.draw();
    }
  }

  setColors({ fg, accent }) {
    if (fg) this.fg = hexToRgb(fg);
    if (accent) this.accent = hexToRgb(accent);
    if (this.reduced) this.draw();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * dpr);
    this.canvas.height = Math.floor(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  start() {
    cancelAnimationFrame(this.raf);
    if (this.reduced || document.hidden) return this.draw();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  pause() {
    cancelAnimationFrame(this.raf);
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  }

  draw() {
    const { g, w, h } = this;
    if (!w || !h) return;
    g.clearRect(0, 0, w, h);
    const levels = this.engine?.ready ? this.engine.getLevels() : null;
    // layers stack upward from the base: layer 1 sits lowest, each new one above it
    const base = h * 0.9;
    const span = h * 0.58;
    const [fr, fg, fb] = this.fg;
    const [ar, ag, ab] = this.accent;

    for (let i = 0; i < 8; i++) {
      const target = i < this.layers ? 1 : 0;
      this.act[i] += (target - this.act[i]) * (this.reduced ? 1 : 0.04);
      const a = this.act[i];
      if (a < 0.015) continue;

      const level = levels ? levels[i] : 0;
      const y0 = base - (span * i) / 7;
      const amp = a * (1.2 + 3.5 + 30 * level);
      const f1 = 0.0032 + i * 0.0006;
      const f2 = f1 * 2.37;
      const s1 = 0.45 + i * 0.11;
      const s2 = 0.7 + i * 0.07;
      const newest = i === this.layers - 1;
      const alpha = (0.05 + 0.2 * a) * (0.55 + 0.45 * Math.min(1, level * 3 + 0.2));

      g.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const env = Math.pow(Math.sin((Math.PI * x) / w), 0.7);
        const y =
          y0 +
          amp * env * (0.65 * Math.sin(x * f1 + this.t * s1 + i * 1.7) + 0.35 * Math.sin(x * f2 - this.t * s2 + i));
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.lineWidth = newest ? 1.3 : 1;
      g.strokeStyle = newest ? `rgba(${ar},${ag},${ab},${0.18 + 0.4 * a * Math.min(1, level * 2.5 + 0.3)})` : `rgba(${fr},${fg},${fb},${alpha})`;
      g.stroke();
    }
  }
}
