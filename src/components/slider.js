// Sliders. One accessible native <input type="range"> drives three distinct
// visual treatments, so no two sliders in the form look alike:
//   pace         a ruler with a point travelling at the chosen pace
//   energy       a bank of bars that fill and pulse
//   spontaneity  a line that goes from a perfect wave to a loose scribble

import { h, prefersReducedMotion } from './dom.js';

const wordFor = (words, v) => words[Math.min(words.length - 1, Math.floor((v / 100) * words.length))];

function paceVisual() {
  const ticks = Array.from({ length: 41 }, (_, i) => h('i', { class: i % 5 === 0 ? 'tick tick-major' : 'tick', style: `--p:${i / 40}` }));
  const el = h('div', { class: 'viz viz-pace', 'aria-hidden': 'true' }, h('div', { class: 'ruler' }, ticks), h('span', { class: 'traveller' }));
  return {
    el,
    update(v) {
      ticks.forEach((t, i) => t.classList.toggle('lit', i / 40 <= v / 100 + 0.001));
      // faster pace → shorter period for the travelling point
      el.style.setProperty('--period', `${(3.6 - 3.1 * (v / 100)).toFixed(2)}s`);
    },
  };
}

function energyVisual() {
  const N = 32;
  const bars = Array.from({ length: N }, (_, i) => {
    const t = i / (N - 1);
    return h('i', { class: 'bar', style: `--i:${i};--h:${(14 + 86 * Math.pow(t, 1.7)).toFixed(1)}%;--d:${((i * 137) % 11) / 11}` });
  });
  const el = h('div', { class: 'viz viz-energy', 'aria-hidden': 'true' }, bars);
  return {
    el,
    update(v) {
      bars.forEach((b, i) => b.classList.toggle('lit', i / (N - 1) <= v / 100 + 0.001));
      el.style.setProperty('--speed', `${(2.4 - 1.9 * (v / 100)).toFixed(2)}s`);
    },
  };
}

function spontaneityVisual() {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 600;
  const H = 120;
  const svgEl = document.createElementNS(NS, 'svg');
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('preserveAspectRatio', 'none');
  svgEl.setAttribute('class', 'viz viz-wild');
  svgEl.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  svgEl.append(path);
  // fixed random offsets so the scribble is stable, only its amount changes
  const rnd = (() => {
    let a = 0x9e3779b9;
    return () => ((a = (Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) + 0x297a2d39) | 0), ((a >>> 0) / 4294967296));
  })();
  const n = 140; // segments → n + 1 points
  const jitter = Array.from({ length: n + 1 }, () => rnd() * 2 - 1);
  const jitter2 = Array.from({ length: n + 1 }, () => rnd() * 2 - 1);

  function draw(v) {
    const t = v / 100;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * W;
      const wave = Math.sin((i / n) * Math.PI * 6);
      const wild = jitter[i] * 0.9 + Math.sin((i / n) * Math.PI * 13 + jitter2[i]) * 0.6;
      const amp = 12 + 36 * t;
      const y = H / 2 + amp * (wave * (1 - t) + wild * t);
      pts.push([x, y]);
    }
    // smooth through the points
    let d = `M${pts[0][0]},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const cx = (x0 + x1) / 2;
      d += ` Q${x0.toFixed(1)},${y0.toFixed(1)} ${cx.toFixed(1)},${((y0 + y1) / 2).toFixed(1)}`;
    }
    path.setAttribute('d', d);
  }
  return { el: svgEl, update: draw };
}

const VISUALS = { pace: paceVisual, energy: energyVisual, spontaneity: spontaneityVisual };

export function renderSlider(q, { value, onChange, sound }) {
  const viz = (VISUALS[q.variant] || paceVisual)();
  const word = h('span', { class: 'slider-word', 'aria-hidden': 'true' });
  const num = h('span', { class: 'slider-num', 'aria-hidden': 'true' });
  const input = h('input', {
    class: 'range',
    type: 'range',
    min: 0,
    max: 100,
    step: 1,
    value: value ?? q.default ?? 50,
    'aria-labelledby': 'qtitle',
  });

  const el = h(
    'div',
    { class: `slider slider-${q.variant}` },
    h('div', { class: 'slider-readout' }, word, num),
    viz.el,
    input,
    h('div', { class: 'slider-ends', 'aria-hidden': 'true' }, h('span', {}, q.low), h('span', {}, q.high)),
  );

  const paint = (v) => {
    const text = wordFor(q.words, v);
    word.textContent = text;
    num.textContent = String(Math.round(v)).padStart(2, '0');
    el.style.setProperty('--v', v / 100);
    input.setAttribute('aria-valuetext', `${text}, ${Math.round(v)} out of 100`);
    viz.update(v);
  };

  let raf = 0;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    sound?.slider(v, { low: 0, high: 100 });
    onChange(v);
    if (prefersReducedMotion()) return paint(v);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => paint(v));
  });

  paint(Number(input.value));
  return {
    el,
    focus: () => input.focus({ preventScroll: true }),
    nudge() {},
  };
}
