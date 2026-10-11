// The studio strip: five layers (atmosphere, melody, bass, drums, vocals), each
// with its state (off · entering · on), a level meter and the sixteen steps of
// the bar that is playing. The cells are the notes the engine actually
// scheduled, lit on the audio clock — the picture *is* the music.

import { h } from '../../components/dom.js';
import { LAYERS } from '../surveyConfig.js';

export class Studio {
  /**
   * @param {HTMLElement} root
   * @param {{ engine: import('../audio/audioEngine.js').AudioEngine, reducedMotion: () => boolean }} o
   */
  constructor(root, { engine, reducedMotion }) {
    this.engine = engine;
    this.reducedMotion = reducedMotion;
    this.state = Object.fromEntries(LAYERS.map((l) => [l.id, 'off']));
    this.rows = LAYERS.map((layer) => {
      const cells = Array.from({ length: 16 }, (_, i) => h('i', { class: i % 4 === 0 ? 'cell beat' : 'cell' }));
      const meter = h('span', { class: 'row-meter', 'aria-hidden': 'true' });
      const status = h('span', { class: 'row-status' }, 'Off');
      const row = h(
        'li',
        { class: 'row', 'data-layer': layer.id, 'data-state': 'off' },
        h('span', { class: 'row-name' }, h('span', { class: 'row-short', 'aria-hidden': 'true' }, layer.short), h('span', { class: 'row-full' }, layer.label)),
        status,
        h('span', { class: 'row-cells', 'aria-hidden': 'true' }, cells),
        meter,
      );
      return { layer: layer.id, row, cells, meter, status, lit: new Float32Array(16), shown: new Float32Array(16) };
    });
    root.replaceChildren(h('ol', { class: 'rows', 'aria-label': 'Layers of your track' }, this.rows.map((r) => r.row)));
    this.playhead = -1;
    this.raf = 0;
    this.lastPaint = 0;
  }

  /** off | entering | on */
  setLayer(id, state) {
    const r = this.rows.find((x) => x.layer === id);
    if (!r || this.state[id] === state) return;
    this.state[id] = state;
    r.row.dataset.state = state;
    r.status.textContent = state === 'on' ? 'On' : state === 'entering' ? 'Next bar' : 'Off';
  }

  layerState(id) {
    return this.state[id];
  }

  start() {
    if (this.raf) return;
    const loop = (t) => {
      this.raf = requestAnimationFrame(loop);
      // reduced motion: a calm 4 updates per second, no moving playhead
      if (this.reducedMotion() && t - this.lastPaint < 250) return;
      this.lastPaint = t;
      this.paint();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Static pattern (no audio): show which steps each active layer plays, without motion. */
  showPattern(gridByLayer) {
    this.rows.forEach((r, i) => {
      const g = gridByLayer?.[i];
      r.cells.forEach((c, s) => {
        const v = this.state[r.layer] === 'on' && g ? g[s] : 0;
        c.style.setProperty('--v', v.toFixed(2));
        c.classList.toggle('has', v > 0);
        c.classList.remove('hit');
      });
    });
  }

  paint() {
    const f = this.engine.frame();
    if (!f) return; // no audio: keep the static pattern
    const levels = this.engine.layerLevels();
    const reduced = this.reducedMotion();
    const step = f && f.live ? Math.floor(f.step) : -1;
    this.rows.forEach((r, i) => {
      const g = f?.grid?.[i];
      const active = this.state[r.layer] !== 'off';
      r.meter.style.setProperty('--level', active ? (reduced ? 0 : levels[i]).toFixed(3) : '0');
      for (let s = 0; s < 16; s++) {
        const v = g ? g[s] : 0;
        if (v !== r.shown[s]) {
          r.shown[s] = v;
          r.cells[s].style.setProperty('--v', v.toFixed(2));
          r.cells[s].classList.toggle('has', v > 0);
        }
        const hit = !reduced && s === step && v > 0;
        if (hit !== (r.lit[s] === 1)) {
          r.lit[s] = hit ? 1 : 0;
          r.cells[s].classList.toggle('hit', hit);
        }
      }
    });
    if (step !== this.playhead) {
      this.playhead = step;
      this.rows.forEach((r) => r.cells.forEach((c, s) => c.classList.toggle('now', !reduced && s === step)));
    }
  }

  reset() {
    LAYERS.forEach((l) => this.setLayer(l.id, l.id === 'atmosphere' ? 'on' : 'off'));
    this.rows.forEach((r) => {
      r.shown.fill(-1);
      r.lit.fill(0);
      r.cells.forEach((c) => c.classList.remove('has', 'hit', 'now'));
    });
  }
}
