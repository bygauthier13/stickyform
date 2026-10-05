// The final reveal: "You made this." — a waveform player for the rendered
// soundtrack, the layer timeline, a summary built from the user's own answers,
// and a real WAV download.

import { LAYER_NAMES } from '../audio/musicLayers.js';
import { encodeWav } from '../audio/wav.js';
import { clamp, h, ICONS, prefersReducedMotion } from './dom.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(bytes > 1.05e7 ? 0 : 1)} MB`;

const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();

/**
 * @param {HTMLElement} root
 * @param {object} o
 * @param {object} o.result   { buffer, duration, markers, peaks }
 * @param {object} o.player   TrackPlayer
 * @param {object} o.summary  from soundmap.summarise()
 * @param {()=>Promise<void>|void} o.ensureSound  switch sound on before playing
 * @param {()=>void} o.onRestart  "start over"
 * @param {(count:number)=>void} [o.onLayer]  how many layers are sounding at the playhead
 */
export function mountResults(root, { result, player, summary, ensureSound, onRestart, onLayer }) {
  const { buffer, duration, markers, peaks } = result;
  const reduced = prefersReducedMotion();

  // ---------------------------------------------------------------- markup
  const canvas = h('canvas', { 'aria-hidden': 'true' });
  const wave = h(
    'div',
    {
      class: 'wave',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Seek through your soundtrack',
      'aria-valuemin': '0',
      'aria-valuemax': String(Math.round(duration)),
      'aria-valuenow': '0',
      'aria-valuetext': `0:00 of ${fmt(duration)}`,
    },
    canvas,
  );

  const markerEls = markers.map((t, i) =>
    h(
      'li',
      { class: 'marker', style: `left:${(t / duration) * 100}%`, 'data-layer': String(i + 1) },
      h('i', { 'aria-hidden': 'true' }),
      h('span', { class: 'marker-n' }, String(i + 1)),
      h('span', { class: 'marker-name' }, LAYER_NAMES[i]),
    ),
  );
  const markersEl = h('ol', { class: 'markers', 'aria-label': 'When each layer enters' }, markerEls);

  const nowLayer = h('span', { class: 'now-layer' });
  const tCur = h('span', { class: 'time-cur' }, '0:00');
  const playBtn = h('button', { class: 'play', type: 'button', 'aria-label': 'Play soundtrack', disabled: player.silent ? '' : null, title: player.silent ? 'Audio playback isn’t available in this browser' : null }, ICONS.play());
  const restartBtn = h('button', { class: 'btn-ghost', type: 'button' }, ICONS.restart(), h('span', {}, 'Restart'));
  const sizeLabel = h('small', {}, `WAV · ${mb(buffer.length * 4)}`);
  const dlBtn = h('button', { class: 'btn-solid', type: 'button' }, ICONS.download(), h('span', {}, 'Download'), sizeLabel);

  const deck = h(
    'section',
    { class: 'deck reveal', style: '--d:5', 'aria-labelledby': 'deck-label' },
    h('p', { class: 'label', id: 'deck-label' }, 'Your soundtrack'),
    h(
      'div',
      { class: 'player' },
      wave,
      markersEl,
      h('p', { class: 'now', 'aria-live': 'off' }, nowLayer),
      h(
        'div',
        { class: 'controls' },
        playBtn,
        h('p', { class: 'time' }, tCur, h('span', { class: 'time-sep' }, ' / '), h('span', { class: 'time-dur' }, fmt(duration))),
        h('span', { class: 'grow' }),
        restartBtn,
        dlBtn,
      ),
    ),
  );

  const rows = [
    ['Energy', summary.energy],
    ['Mood', summary.mood],
    ['Style', summary.style],
    ['Atmosphere', summary.atmosphere],
    ['Tempo', summary.tempo],
    ['Key', summary.key],
  ];
  const words = summary.words.length
    ? h(
        'p',
        { class: 'words' },
        'Your melody was shaped by ',
        ...summary.words.flatMap((w, i) => [i ? ' and ' : '', h('em', {}, `“${w.length > 48 ? `${w.slice(0, 46)}…` : w}”`)]),
        '.',
      )
    : null;
  const summaryEl = h(
    'section',
    { class: 'summary reveal', style: '--d:7', 'aria-labelledby': 'sum-label' },
    h('p', { class: 'label', id: 'sum-label' }, 'Your sound'),
    h(
      'dl',
      { class: 'facts' },
      rows.map(([k, v], i) => h('div', { class: 'fact', style: `--i:${i}` }, h('dt', {}, k), h('dd', {}, v))),
    ),
    words,
  );

  const restartLink = h('button', { class: 'linklike', type: 'button' }, 'Start over');
  const foot = h(
    'footer',
    { class: 'results-foot reveal', style: '--d:9' },
    h('p', {}, 'Created with ', h('strong', {}, 'StickySound'), h('span', { class: 'sep' }, ' · '), 'Forms that sound different.'),
    restartLink,
  );

  const title = h(
    'h1',
    { class: 'results-title', id: 'results-title', tabindex: '-1' },
    h('span', { class: 'w', style: '--d:1' }, 'You'),
    ' ',
    h('span', { class: 'w', style: '--d:2' }, 'made'),
    ' ',
    h('span', { class: 'w em', style: '--d:3' }, 'this.'),
  );
  root.replaceChildren(
    h(
      'div',
      { class: 'results-inner' },
      h('header', { class: 'results-head' }, h('p', { class: 'eyebrow reveal', style: '--d:0' }, 'Your soundtrack is ready'), title, h('p', { class: 'results-sub reveal', style: '--d:4' }, 'Your answers became a soundtrack.')),
      deck,
      summaryEl,
      foot,
    ),
  );

  // ------------------------------------------------------------- waveform
  const g = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let grow = reduced ? 1 : 0; // reveal animation 0 → 1
  let lastProgress = -1;

  const style = () => getComputedStyle(document.documentElement);
  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wave.clientWidth;
    H = wave.clientHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    lastProgress = -1;
    paint();
  }

  function paint(force) {
    const progress = clamp(player.position / duration, 0, 1);
    if (!force && progress === lastProgress && grow >= 1) return;
    lastProgress = progress;
    if (!W) return;
    const s = style();
    const accent = s.getPropertyValue('--accent').trim() || '#d8bf8f';
    const fg = s.getPropertyValue('--fg').trim() || '#efe9df';
    g.clearRect(0, 0, W, H);
    const barW = W < 520 ? 2.5 : 3;
    const gap = W < 520 ? 2.5 : 3.5;
    const n = Math.floor(W / (barW + gap));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const src = peaks[Math.min(peaks.length - 1, Math.floor(f * peaks.length))];
      // gentle shaping so quiet intros are still visible
      const level = Math.pow(src, 0.75);
      const gi = clamp(grow * 2.2 - f * 1.2, 0, 1);
      const hgt = Math.max(2, level * H * 0.92 * gi);
      const x = i * (barW + gap);
      g.fillStyle = f <= progress ? accent : fg;
      g.globalAlpha = f <= progress ? 1 : 0.26;
      g.beginPath();
      g.roundRect(x, (H - hgt) / 2, barW, hgt, barW / 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  const ro = new ResizeObserver(sizeCanvas);
  ro.observe(wave);

  // reveal: bars rise from the centre, left to right
  let growRaf = 0;
  if (!reduced) {
    const t0 = performance.now() + 500;
    const step = (now) => {
      grow = clamp((now - t0) / 1700, 0, 1);
      grow = 1 - Math.pow(1 - grow, 3);
      paint(true);
      if (grow < 1) growRaf = requestAnimationFrame(step);
    };
    growRaf = requestAnimationFrame(step);
  }

  // ------------------------------------------------------------- playback UI
  let raf = 0;
  let lastCount = -1;
  function tick() {
    const pos = player.position;
    tCur.textContent = fmt(pos);
    wave.setAttribute('aria-valuenow', String(Math.round(pos)));
    wave.setAttribute('aria-valuetext', `${fmt(pos)} of ${fmt(duration)}`);
    paint();
    let layer = 0;
    markers.forEach((m, i) => {
      if (pos >= m - 0.05) layer = i;
    });
    const started = pos > 0.05 || player.playing;
    markerEls.forEach((el, i) => el.classList.toggle('on', i <= layer && started));
    const count = started ? layer + 1 : 8; // before playing, the whole stack is shown
    if (count !== lastCount) {
      lastCount = count;
      onLayer?.(count);
    }
    const text = pos > 0.05 || player.playing ? `Layer ${layer + 1} of 8 · ${LAYER_NAMES[layer]}` : 'Press play to hear what you made';
    if (nowLayer.textContent !== text) {
      nowLayer.textContent = text;
      nowLayer.classList.remove('swap');
      void nowLayer.offsetWidth;
      nowLayer.classList.add('swap');
    }
    if (player.playing) raf = requestAnimationFrame(tick);
  }

  const syncButton = () => {
    playBtn.replaceChildren(player.playing ? ICONS.pause() : ICONS.play());
    playBtn.setAttribute('aria-label', player.playing ? 'Pause soundtrack' : 'Play soundtrack');
    playBtn.classList.toggle('is-playing', player.playing);
    cancelAnimationFrame(raf);
    tick();
  };
  const offChange = player.onChange(syncButton);

  async function play() {
    await ensureSound?.();
    await player.toggle();
  }
  playBtn.addEventListener('click', play);
  restartBtn.addEventListener('click', async () => {
    await ensureSound?.();
    await player.restart();
  });

  // seeking: click, drag, or keyboard
  const seekFromEvent = (e) => {
    const r = wave.getBoundingClientRect();
    player.seek(clamp((e.clientX - r.left) / r.width, 0, 1) * duration);
    tick();
  };
  wave.addEventListener('pointerdown', (e) => {
    wave.setPointerCapture(e.pointerId);
    wave.classList.add('dragging');
    seekFromEvent(e);
  });
  wave.addEventListener('pointermove', (e) => {
    if (wave.hasPointerCapture(e.pointerId)) seekFromEvent(e);
  });
  const endDrag = (e) => {
    wave.classList.remove('dragging');
    if (wave.hasPointerCapture?.(e.pointerId)) wave.releasePointerCapture(e.pointerId);
  };
  wave.addEventListener('pointerup', endDrag);
  wave.addEventListener('pointercancel', endDrag);
  wave.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -5, ArrowRight: 5, PageDown: -15, PageUp: 15 }[e.key];
    if (step !== undefined) player.seek(player.position + step);
    else if (e.key === 'Home') player.seek(0);
    else if (e.key === 'End') player.seek(duration - 0.5);
    else if (e.key === ' ' || e.key === 'Enter') play();
    else return;
    e.preventDefault();
    tick();
  });

  // --------------------------------------------------------------- download
  let url = null;
  let sizeKnown = false;
  dlBtn.addEventListener('click', () => {
    if (!url) {
      const blob = encodeWav(buffer, {
        INAM: `${summary.mood} ${summary.style} — StickySound`,
        IART: 'You, with StickySound',
        ICMT: `${summary.tempo}, ${summary.key}. Composed from your answers.`,
        ISFT: 'StickySound',
      });
      url = URL.createObjectURL(blob);
      if (!sizeKnown) {
        sizeLabel.textContent = `WAV · ${mb(blob.size)}`;
        sizeKnown = true;
      }
    }
    const a = h('a', { href: url, download: `${safeName(`StickySound – ${summary.mood} ${summary.style}`)}.wav`, class: 'sr-only' });
    document.body.append(a);
    a.click();
    a.remove();
    dlBtn.classList.add('done');
    dlBtn.querySelector('span').textContent = 'Saved';
    setTimeout(() => {
      dlBtn.classList.remove('done');
      dlBtn.querySelector('span').textContent = 'Download';
    }, 2200);
  });

  restartLink.addEventListener('click', () => onRestart?.());

  // let the CSS entrance run once the DOM is in place
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-in')));
  tick();

  return {
    focus: () => title.focus({ preventScroll: true }),
    play,
    destroy() {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(growRaf);
      ro.disconnect();
      offChange();
      if (url) URL.revokeObjectURL(url);
      root.classList.remove('is-in');
    },
  };
}
