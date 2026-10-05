// Application wiring: screens, the form, the audio engine and the reveal.
// The audio engine and the form engine never reference each other — this file
// is the only place that connects them.

import { AudioEngine, layersForProgress } from './audio/audioEngine.js';
import { LAYER_NAMES } from './audio/musicLayers.js';
import { renderCards } from './components/cards.js';
import { renderChoice } from './components/choice.js';
import { h, isFinePointer, pad2, prefersReducedMotion } from './components/dom.js';
import { Field } from './components/field.js';
import { mountResults } from './components/results.js';
import { renderSlider } from './components/slider.js';
import { renderText } from './components/text.js';
import { FormEngine } from './form/formEngine.js';
import { QUESTIONS, labelOf, optionOf } from './form/questions.js';
import { buildProfile, summarise } from './soundmap.js';

const $ = (sel) => document.querySelector(sel);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_ACCENT = '#d8bf8f';
const TOTAL = QUESTIONS.length;

// ------------------------------------------------------------------ elements
const el = {
  sound: $('#sound'),
  soundLabel: $('#sound-label'),
  start: $('#start'),
  stage: $('#stage'),
  qform: $('#qform'),
  qcur: $('#qcur'),
  qtotal: $('#qtotal'),
  pfill: $('#pfill'),
  ptrack: $('#ptrack'),
  back: $('#back'),
  next: $('#next'),
  nextLabel: $('#next-label'),
  hint: $('#hint'),
  ticks: $('#layers .layers-ticks'),
  layersText: $('#layers-text'),
  live: $('#live'),
  composingLine: $('#composing-line'),
  composingFill: $('#composing-fill'),
  composingError: $('#composing-error'),
  results: $('#results'),
};

// -------------------------------------------------------------------- state
const engine = new AudioEngine();
const form = new FormEngine(QUESTIONS);
const field = new Field($('#field'), engine);
let profile = buildProfile({});
let view = null;
let busy = false;
let submitting = false;
let audioOk = true;
let uiLayers = 1;
let liftPlayed = false;
let resultsView = null;
let flashTimer = 0;

// Sound preference lives for the current session only.
const SOUND_KEY = 'stickysound.sound';
const store = {
  get() {
    try {
      return sessionStorage.getItem(SOUND_KEY);
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      sessionStorage.setItem(SOUND_KEY, v);
    } catch {
      /* private mode */
    }
  },
};
engine.enabled = store.get() !== 'off';

const sound = {
  select: (...a) => engine.cue('select', ...a),
  deselect: (...a) => engine.cue('deselect', ...a),
  slider: (...a) => engine.cue('slider', ...a),
  type: (...a) => engine.cue('type', ...a),
};

const announce = (msg) => {
  el.live.textContent = '';
  setTimeout(() => (el.live.textContent = msg), 60);
};

// ------------------------------------------------------------- sound switch
function paintSound() {
  const on = engine.enabled;
  el.sound.setAttribute('aria-checked', String(on));
  el.sound.classList.toggle('is-off', !on);
  el.soundLabel.textContent = audioOk ? (on ? 'Sound on' : 'Sound off') : 'Sound unavailable';
  el.sound.disabled = !audioOk;
}

el.sound.addEventListener('click', async () => {
  const on = !engine.enabled;
  store.set(on ? 'on' : 'off');
  if (on && engine.ready) {
    // inside the click, so browsers allow a suspended context to resume
    engine.ctx.resume().catch(() => {});
  }
  engine.setEnabled(on);
  paintSound();
  field.start();
});

// --------------------------------------------------------------- screens
function show(name) {
  document.body.dataset.screen = name;
  document.querySelectorAll('.screen').forEach((s) => {
    const on = s.dataset.screen === name;
    s.hidden = !on;
    if (on) {
      s.classList.remove('screen-in');
      void s.offsetWidth;
      s.classList.add('screen-in');
    }
  });
  window.scrollTo(0, 0);
}

// ------------------------------------------------------------- layer strip
for (let i = 0; i < 8; i++) el.ticks.append(h('li', { title: LAYER_NAMES[i] }));

function paintLayers(n, { flash = true } = {}) {
  const prev = uiLayers;
  uiLayers = n;
  [...el.ticks.children].forEach((li, i) => li.classList.toggle('on', i < n));
  field.setLayers(n);
  const base = `Layer ${n} of 8 · ${LAYER_NAMES[n - 1]}`;
  clearTimeout(flashTimer);
  if (n > prev && flash) {
    el.layersText.textContent = `+ ${LAYER_NAMES[n - 1]}`;
    el.layersText.classList.add('is-new');
    announce(`Soundtrack layer added: ${LAYER_NAMES[n - 1]}. ${n} of 8 layers.`);
    flashTimer = setTimeout(() => {
      el.layersText.classList.remove('is-new');
      el.layersText.textContent = base;
    }, 2600);
  } else {
    el.layersText.classList.remove('is-new');
    el.layersText.textContent = base;
  }
}

engine.on('layer', ({ index }) => paintLayers(Math.max(uiLayers, index + 1)));
engine.on('milestone', () => {
  el.ptrack.classList.remove('glow');
  void el.ptrack.offsetWidth;
  el.ptrack.classList.add('glow');
});

/** Layers follow audio when audible (so the label lands with the sound); otherwise they follow progress. */
function syncLayersToProgress() {
  const target = layersForProgress(form.progress);
  if (!engine.audible) paintLayers(Math.max(uiLayers, target));
  else setTimeout(() => uiLayers < target && paintLayers(target), 5000);
}

// -------------------------------------------------------------------- form
const RENDERERS = {
  single: renderChoice,
  multi: renderChoice,
  binary: renderChoice,
  swatch: renderCards,
  mood: renderCards,
  slider: renderSlider,
  text: renderText,
  textarea: renderText,
};

function applyAccent(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  field.setColors({ accent: hex });
}

function updateNext() {
  const ok = form.canContinue();
  el.next.setAttribute('aria-disabled', String(!ok));
  el.next.classList.toggle('is-disabled', !ok);
  el.hint.classList.toggle('is-visible', ok && isFinePointer());
}

form.addEventListener('answer', ({ detail }) => {
  profile = buildProfile(form.answers);
  engine.setProfile(profile);
  updateNext();
  const q = form.current;
  if (q.type === 'swatch') applyAccent(optionOf(q.id, detail.value)?.accent || DEFAULT_ACCENT);
  // completing the final question: a small musical lift
  if (q.final && !liftPlayed) {
    liftPlayed = true;
    engine.cue('lift');
  }
});

async function renderCurrent({ direction = 1, initial = false } = {}) {
  const q = form.current;
  const stage = el.stage;
  if (!initial && !prefersReducedMotion()) {
    stage.classList.add('leaving');
    await wait(170);
  }
  stage.classList.remove('leaving', 'enter');

  const handle = RENDERERS[q.type](q, {
    value: form.answerOf(q.id),
    onChange: (v, meta) => form.setAnswer(q.id, v, meta),
    sound,
  });
  view = handle;
  liftPlayed = form.answerOf(q.id) !== undefined && q.final ? true : liftPlayed;

  const title = h('h2', { class: 'q-title', id: 'qtitle', tabindex: '-1' }, q.title);
  stage.dataset.type = q.type;
  stage.dataset.dir = String(direction);
  stage.replaceChildren(...[title, q.help && h('p', { class: 'q-help' }, q.help), h('div', { class: 'q-body' }, handle.el)].filter(Boolean));
  void stage.offsetWidth;
  stage.classList.add('enter');

  // chrome
  const n = form.index + 1;
  el.qcur.textContent = pad2(n);
  el.qtotal.textContent = pad2(TOTAL);
  el.pfill.style.transform = `scaleX(${n / TOTAL})`;
  el.ptrack.setAttribute('aria-valuenow', String(n));
  el.back.hidden = form.isFirst;
  el.nextLabel.textContent = form.isLast ? 'Create my soundtrack' : 'Continue';
  el.next.classList.toggle('is-final', form.isLast);
  updateNext();
  announce(`Question ${n} of ${TOTAL}. ${q.title}`);

  // focus: type-in and slider questions take the keyboard straight away on
  // desktop; everything else focuses the heading so screen readers read the question.
  if (['text', 'textarea', 'slider'].includes(q.type) && isFinePointer()) handle.focus();
  else title.focus({ preventScroll: true });
}

async function go(direction) {
  if (busy) return;
  busy = true;
  try {
    if (direction > 0) {
      if (!form.next()) return;
      engine.cue('next');
      engine.setProgress(form.progress);
      syncLayersToProgress();
    } else {
      if (!form.back()) return;
      engine.cue('back');
    }
    await renderCurrent({ direction });
  } finally {
    busy = false;
  }
}

function attemptContinue() {
  if (busy || submitting) return;
  if (!form.canContinue()) {
    view?.nudge?.();
    announce('Choose an answer to continue.');
    el.next.classList.remove('shake');
    void el.next.offsetWidth;
    el.next.classList.add('shake');
    return;
  }
  if (form.isLast) submit();
  else go(1);
}

el.qform.addEventListener('submit', (e) => {
  e.preventDefault();
  attemptContinue();
});
el.back.addEventListener('click', () => go(-1));

document.addEventListener('keydown', (e) => {
  if (document.body.dataset.screen !== 'form' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const typing = t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && t.type === 'text');
  if (e.key === 'Enter') {
    if (t.tagName === 'BUTTON' || t.tagName === 'A') return; // let focused buttons behave normally
    if (t.tagName === 'TEXTAREA' && e.shiftKey) return; // newline
    e.preventDefault();
    attemptContinue();
    return;
  }
  if (typing || !view?.selectIndex) return;
  // 1–9 / A–J pick an option
  const i = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : 'abcdefghij'.indexOf(e.key.toLowerCase());
  if (i >= 0 && e.key.length === 1 && view.selectIndex(i)) e.preventDefault();
});

// -------------------------------------------------------------- start / end
el.start.addEventListener('click', async () => {
  if (el.start.classList.contains('is-loading')) return;
  el.start.classList.add('is-loading');
  try {
    await engine.init(); // the user's click is what unlocks audio
  } catch (err) {
    console.warn('Audio unavailable:', err);
    audioOk = false;
    paintSound();
  }
  if (audioOk) engine.start(profile);
  field.start();
  form.reset();
  uiLayers = 0;
  paintLayers(1, { flash: false });
  show('form');
  await renderCurrent({ initial: true });
  el.start.classList.remove('is-loading');
});

const PHRASES = ['Arranging eight layers', 'Balancing the mix', 'Adding space and air', 'Mastering'];

async function submit() {
  if (submitting) return;
  submitting = true;
  const answers = { ...form.answers };
  profile = buildProfile(answers);
  engine.setProfile(profile);
  engine.cue('next');

  show('composing');
  $('#composing-title').focus({ preventScroll: true });
  paintLayers(8, { flash: false });
  el.composingError.hidden = true;
  el.composingFill.style.transform = 'scaleX(0.02)';
  el.composingLine.textContent = PHRASES[0];
  announce('Composing your soundtrack.');

  const started = performance.now();
  const landed = engine.finale(); // lift, then the closing cadence
  let shown = 0;
  const setProgress = (p) => {
    const i = Math.min(PHRASES.length - 1, Math.floor(p * PHRASES.length));
    if (i !== shown) {
      shown = i;
      el.composingLine.textContent = PHRASES[i];
    }
    el.composingFill.style.transform = `scaleX(${Math.max(0.02, p)})`;
  };

  let result;
  try {
    result = await engine.renderTrack(profile, { onProgress: setProgress });
  } catch (err) {
    console.error(err);
    el.composingError.textContent = 'Your browser couldn’t render the audio. Please try again in a recent version of Chrome, Edge, Firefox or Safari.';
    el.composingError.hidden = false;
    submitting = false;
    return;
  }
  setProgress(1);
  // let the closing chord land and the "composing" moment breathe
  await Promise.all([landed, wait(Math.max(0, 4800 - (performance.now() - started)))]);

  const player = engine.createPlayer(result);
  const summary = summarise(answers, profile, labelOf);
  show('results');
  resultsView = mountResults(el.results, {
    result,
    player,
    summary,
    ensureSound: async () => {
      if (!engine.enabled) {
        store.set('on');
        engine.setEnabled(true);
        paintSound();
      }
      await engine.init();
    },
    onLayer: (n) => field.setLayers(n),
    onRestart: restart,
  });
  field.setLayers(8);
  resultsView.focus();
  announce('Your soundtrack is ready. You made this.');
  // the track begins on its own once the closing chord has had a moment to ring
  if (engine.audible && !player.silent) setTimeout(() => resultsView?.play(), 1600);
  submitting = false;
}

async function restart() {
  resultsView?.destroy();
  resultsView = null;
  await engine.dispose();
  form.reset();
  profile = buildProfile({});
  liftPlayed = false;
  applyAccent(DEFAULT_ACCENT);
  uiLayers = 0;
  paintLayers(1, { flash: false });
  field.setLayers(1);
  show('landing');
  el.start.classList.remove('is-loading');
  el.start.focus({ preventScroll: true });
}

// --------------------------------------------------------------------- boot
paintSound();
paintLayers(1, { flash: false });
el.qtotal.textContent = pad2(TOTAL);
field.setLayers(1);
field.start();
engine.preload(); // renders the drum samples while the visitor reads the landing page

// Handy for testing and demos: ?debug exposes the engine on window.
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { stickysound: { engine, form, field } });
