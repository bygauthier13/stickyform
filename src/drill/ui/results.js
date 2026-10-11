// The results screen: cover, "Your soundtrack is ready.", the player, the WAV
// download and what each answer did. The track is rendered offline while the
// live ending plays; what you hear in the player is exactly the downloaded file.

import { clamp, h } from '../../components/dom.js';
import { safeFilename } from '../theory.js';
import { QUESTIONS, optionOf } from '../surveyConfig.js';
import { trackToWav } from '../audio/trackRenderer.js';
import { ICON } from './art.js';
import { renderCover } from './cover.js';

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const SECTION_NAMES = { intro: 'Intro', build: 'Build', main: 'Main', breakdown: 'Break', mainB: 'Main', outro: 'Outro' };

/**
 * @param {HTMLElement} root
 * @param {object} o
 * @param {object} o.state          final MusicalState
 * @param {object} o.answers        survey answers (shown back to the participant only)
 * @param {object} o.facts          describe(state)
 * @param {string} o.title          sanitised title
 * @param {number} o.duration       expected length in seconds (before rendering)
 * @param {(onProgress:(f:number)=>void)=>Promise<object>} o.render
 * @param {(result:object)=>object} o.makePlayer
 * @param {()=>Promise<boolean>} o.ensureSound   turn sound on inside a click; false if impossible
 * @param {()=>void} o.onRestart
 * @param {object} o.analytics
 * @param {()=>boolean} o.reducedMotion
 */
export function mountResults(root, o) {
  const { state, answers, facts, title } = o;
  let result = null;
  let player = null;
  let url = null;
  let exporting = false;
  let destroyed = false;
  let raf = 0;
  const offs = [];

  // ------------------------------------------------------------------ markup
  const playBtn = h('button', { class: 'play-btn', type: 'button', 'aria-label': 'Play your track', disabled: '' }, ICON.play());
  const canvas = h('canvas', { class: 'wave-canvas', 'aria-hidden': 'true' });
  const seek = h('input', { class: 'wave-seek', type: 'range', min: '0', max: String(Math.round(o.duration * 10)), step: '1', value: '0', 'aria-label': 'Position in your track', disabled: '' });
  const markers = h('ol', { class: 'wave-markers', 'aria-hidden': 'true' });
  const tCur = h('span', { class: 'time-cur' }, '0:00');
  const tDur = h('span', { class: 'time-dur' }, fmt(o.duration));
  const status = h('p', { class: 'render-status', role: 'status' }, 'Mixing your track… 0%');
  const meter = h('span', { class: 'render-meter', 'aria-hidden': 'true' }, h('i', {}));
  const retryBtn = h('button', { class: 'btn btn-ghost', type: 'button', hidden: '' }, 'Try again');
  const dlLabel = h('span', {}, 'Download WAV');
  const dlSize = h('small', { class: 'btn-meta' }, 'preparing');
  const dlBtn = h('button', { class: 'btn btn-primary', type: 'button', disabled: '' }, ICON.download(), dlLabel, dlSize);
  const againBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, ICON.restart(), h('span', {}, 'Start again'));

  const factRows = [
    ['Key', facts.key],
    ['Tempo', facts.tempo],
    ['Length', fmt(o.duration)],
    ['Melody', facts.melody],
    ['808', facts.bass],
    ['Drums', facts.drums],
    ['Hi-hats', facts.pace],
    ['Second voice', facts.counter],
    ['Texture', facts.texture],
    ['Motif', facts.motif],
    ['Vocals', facts.vocals],
    ['Transition', facts.transition],
    ['Ending', facts.ending],
  ];

  const how = QUESTIONS.map((q, i) => {
    let answer;
    if (q.type === 'text') {
      const v = (answers[q.id] || '').trim();
      answer = v ? `“${v}”` : 'Skipped';
    } else answer = optionOf(q.id, answers[q.id])?.label || '—';
    return h('li', {}, h('span', { class: 'how-n' }, String(i + 1).padStart(2, '0')), h('span', { class: 'how-q' }, q.title), h('span', { class: 'how-a' }, answer), h('span', { class: 'how-m' }, `→ ${q.builds.label}`));
  });

  const cover = renderCover(state, { colour: answers.colour, title, duration: o.duration });
  // honest headline: it only says "ready" once the file really exists
  const headline = h('h1', { class: 'results-title', id: 'results-title', tabindex: '-1' }, 'Mixing your soundtrack…');
  const body = h(
    'div',
    { class: 'results-body' },
    h('p', { class: 'eyebrow' }, 'BLOCK / 01 — Drill Edition'),
    headline,
    h('p', { class: 'results-lede' }, 'Built from your ten answers — the same arrangement you can download.'),
    h(
      'section',
      { class: 'player', 'aria-label': 'Player' },
      h('div', { class: 'player-row' }, playBtn, h('div', { class: 'wave' }, canvas, seek, markers), h('p', { class: 'time' }, tCur, h('span', { class: 'time-sep' }, ' / '), tDur)),
      h('div', { class: 'render' }, meter, status, retryBtn),
    ),
    h('div', { class: 'results-actions' }, dlBtn, againBtn),
    h('section', { class: 'facts', 'aria-labelledby': 'facts-title' }, h('h2', { class: 'label', id: 'facts-title' }, 'Your track'), h('dl', {}, factRows.map(([k, v]) => h('div', { class: 'fact' }, h('dt', {}, k), h('dd', {}, v))))),
    h('details', { class: 'how' }, h('summary', {}, 'How your answers built it'), h('ol', {}, how), h('p', { class: 'how-note' }, 'These mappings are art direction, not a reading of your personality. Your words and title stayed on this device: they were turned into notes, never read, sung or sent.')),
    h(
      'footer',
      { class: 'results-foot' },
      h('p', {}, 'Powered by StickySounds'),
      h('p', { class: 'fine' }, 'Independent concept demo — not an official brand campaign. Piano, recorder, glockenspiel and clap samples: Versilian Community Sample Library (CC0). Every other sound, including the vocal chops, is synthesised in your browser.'),
    ),
  );
  root.replaceChildren(h('div', { class: 'results-inner' }, h('div', { class: 'results-cover' }, cover), body));

  // ---------------------------------------------------------------- waveform
  const g = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(W * dpr));
    canvas.height = Math.max(1, Math.floor(H * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  };
  const ro = new ResizeObserver(size);
  ro.observe(canvas);

  function draw() {
    if (!W || !H) return;
    const css = getComputedStyle(root);
    const accent = css.getPropertyValue('--accent').trim() || '#c8ff3e';
    const dim = 'rgba(241,241,236,0.22)';
    g.clearRect(0, 0, W, H);
    const peaks = result?.peaks;
    const pos = player && result ? clamp(player.position / result.duration, 0, 1) : 0;
    const bw = 2;
    const gap = 2;
    const n = Math.floor(W / (bw + gap));
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const v = peaks ? peaks[Math.min(peaks.length - 1, Math.floor(f * peaks.length))] : 0.08 + 0.04 * Math.sin(i * 0.7);
      const hh = Math.max(2, Math.pow(v, 0.8) * H * 0.9);
      g.fillStyle = peaks && f <= pos ? accent : dim;
      g.fillRect(i * (bw + gap), (H - hh) / 2, bw, hh);
    }
  }

  // ------------------------------------------------------------------ render
  const setProgress = (f) => {
    if (destroyed) return;
    const p = Math.round(clamp(f, 0, 1) * 100);
    status.textContent = `Mixing your track… ${p}%`;
    meter.firstChild.style.transform = `scaleX(${Math.max(0.02, f)})`;
  };

  function wirePlayer() {
    offs.push(
      player.onChange(() => {
        playBtn.replaceChildren(player.playing ? ICON.pause() : ICON.play());
        playBtn.setAttribute('aria-label', player.playing ? 'Pause your track' : 'Play your track');
        playBtn.classList.toggle('is-playing', player.playing);
        cancelAnimationFrame(raf);
        tick();
        o.onPlayerChange?.();
      }),
    );
  }

  function tick() {
    if (destroyed || !player || !result) return;
    const pos = player.position;
    tCur.textContent = fmt(pos);
    if (document.activeElement !== seek) seek.value = String(Math.round(pos * 10));
    seek.setAttribute('aria-valuetext', `${fmt(pos)} of ${fmt(result.duration)}`);
    draw();
    if (player.playing) raf = requestAnimationFrame(tick);
  }

  let attempt = 0;
  function startRender() {
    const mine = ++attempt;
    retryBtn.hidden = true;
    status.classList.remove('is-error');
    headline.textContent = 'Mixing your soundtrack…';
    setProgress(0);
    return o
      .render(setProgress)
      .then((res) => {
        if (destroyed || mine !== attempt) return res;
        result = res;
        player = o.makePlayer(res);
        wirePlayer();
        seek.max = String(Math.round(res.duration * 10));
        tDur.textContent = fmt(res.duration);
        markers.replaceChildren(...res.sections.map((s) => h('li', { style: `left:${(s.time / res.duration) * 100}%` }, SECTION_NAMES[s.kind] || s.kind)));
        playBtn.disabled = !!player.silent;
        if (player.silent) playBtn.title = 'Playback isn’t available in this browser — the download still works';
        seek.disabled = !!player.silent;
        dlBtn.disabled = false;
        dlSize.textContent = `${mb(res.buffer.length * res.buffer.numberOfChannels * 2 + 44)}`;
        root.classList.add('is-rendered');
        headline.textContent = 'Your soundtrack is ready.';
        status.textContent = player.silent ? 'Your track is ready to download.' : 'Ready.';
        meter.firstChild.style.transform = 'scaleX(1)';
        draw();
        return res;
      })
      .catch((err) => {
        if (destroyed) return null;
        console.error(err);
        headline.textContent = 'Your track couldn’t be mixed.';
        status.textContent = 'We couldn’t render the audio in this browser. Try again, or use a recent Chrome, Edge, Firefox or Safari.';
        status.classList.add('is-error');
        retryBtn.hidden = false;
        dlBtn.disabled = true;
        dlSize.textContent = 'unavailable';
        return null;
      });
  }
  let ready = startRender();
  retryBtn.addEventListener('click', () => {
    ready = startRender();
  });

  // ---------------------------------------------------------------- controls
  playBtn.addEventListener('click', async () => {
    if (!result || !player) return;
    if (!player.playing) {
      const ok = await o.ensureSound();
      if (!ok) {
        status.textContent = 'Sound couldn’t start in this browser — the download still works.';
        return;
      }
    }
    await player.toggle();
  });
  seek.addEventListener('input', () => {
    if (!player || !result) return;
    player.seek(Number(seek.value) / 10);
    tick();
  });

  dlBtn.addEventListener('click', async () => {
    if (exporting || !result) return;
    exporting = true;
    dlBtn.classList.add('is-busy');
    dlLabel.textContent = 'Preparing…';
    o.analytics.track('export_started', { seconds: result.duration });
    try {
      const blob = trackToWav(result, { title });
      if (!blob || blob.size < 1000) throw new Error('empty file');
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `${safeFilename(title)} - BLOCK 01 drill.wav`, class: 'sr-only' });
      document.body.append(a);
      a.click();
      a.remove();
      o.analytics.track('export_completed', { seconds: result.duration, bytes: blob.size });
      dlLabel.textContent = 'Saved';
      dlBtn.classList.add('is-done');
      setTimeout(() => {
        if (destroyed) return;
        dlLabel.textContent = 'Download WAV';
        dlBtn.classList.remove('is-done');
      }, 2400);
    } catch (err) {
      console.error(err);
      o.analytics.track('export_failed', { reason: String(err?.message || 'unknown').slice(0, 40) });
      dlLabel.textContent = 'Couldn’t save — try again';
    } finally {
      exporting = false;
      dlBtn.classList.remove('is-busy');
    }
  });
  againBtn.addEventListener('click', () => o.onRestart());

  return {
    get ready() {
      return ready;
    },
    get player() {
      return player;
    },
    focus: () => root.querySelector('#results-title')?.focus({ preventScroll: true }),
    /** Start playback (used once the live ending has rung out). */
    async autoplay() {
      if (destroyed || !player || player.silent || player.playing) return;
      await player.play();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      offs.forEach((off) => off());
      player?.dispose();
      if (url) URL.revokeObjectURL(url);
      url = null;
      result = null;
    },
  };
}
