// BUILD YOUR SOUND — the drill edition's application: screens, survey flow,
// the audio engine and the results. The only file that knows all of them.
//
//   answers ──(AnswerToMusicMapper)──► MusicalState ──► AudioEngine (live)
//                                                   └──► TrackRenderer (download)
//
// Nothing is sent anywhere and nothing is stored: answers live in memory for
// this visit and "Start again" clears them.

import { SilentPlayer, TrackPlayer } from '../audio/trackPlayer.js';
import { h, isFinePointer, prefersReducedMotion } from '../components/dom.js';
import { createAnalytics } from './analyticsAdapter.js';
import { describe, mapAnswers } from './answerToMusicMapper.js';
import { AssetBank, BUILT_IN_MANIFEST, loadAssets, prewarmList } from './audio/assetManifest.js';
import { AudioEngine } from './audio/audioEngine.js';
import { renderTrack, trackSeconds } from './audio/trackRenderer.js';
import { classifyInput } from './interaction.js';
import { composeBar } from './composer.js';
import { initialState } from './musicalState.js';
import { BRAND, LAYERS, QUESTIONS } from './surveyConfig.js';
import { sanitizeText } from './theory.js';
import { ICON } from './ui/art.js';
import { renderQuestion } from './ui/questions.js';
import { mountResults } from './ui/results.js';
import { Studio } from './ui/studio.js';

const $ = (sel) => document.querySelector(sel);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const hoverCapable = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const DEFAULT_ACCENT = '#c8ff3e';
const LAYER_LABEL = { atmosphere: 'Atmosphere', melody: 'Melody', bass: '808 bass', drums: 'Drums', vocals: 'Vocal chops', texture: 'Texture', energy: 'Motif', counter: 'Second voice' };

export function createDrillApp() {
  const params = new URLSearchParams(location.search);
  const debug = params.has('debug');
  const analytics = createAnalytics({ debug });
  const engine = new AudioEngine({ bank: new AssetBank(BUILT_IN_MANIFEST) });

  const el = {
    body: document.body,
    start: $('#start-sound'),
    silent: $('#start-silent'),
    assetStatus: $('#asset-status'),
    play: $('#t-play'),
    mute: $('#t-mute'),
    muteLabel: $('#t-mute-label'),
    audioState: $('#audio-state'),
    studio: $('#studio'),
    stage: $('#stage'),
    form: $('#q-form'),
    qcur: $('#q-cur'),
    qtotal: $('#q-total'),
    pfill: $('#p-fill'),
    ptrack: $('#p-track'),
    back: $('#q-back'),
    next: $('#q-next'),
    nextLabel: $('#q-next-label'),
    skip: $('#q-skip'),
    entry: $('#entry'),
    live: $('#live'),
    results: $('#results'),
    reset: $('#q-reset'),
  };

  // ------------------------------------------------------------------- state
  let run = 0;
  let index = 0;
  let answers = {};
  const validated = new Set();
  let state = initialState();
  let view = null;
  let busy = false;
  let soundWanted = false;
  let audioFailed = false;
  let resultsView = null;
  let bank = null;
  let navSeq = 0;
  let entryTimer = 0;
  const studio = new Studio(el.studio, { engine, reducedMotion: prefersReducedMotion });

  const announce = (msg) => {
    el.live.textContent = '';
    setTimeout(() => (el.live.textContent = msg), 50);
  };

  // ------------------------------------------------------------------ assets
  // Decoding needs no AudioContext, so the sounds load while the landing page is read.
  const assetsReady = loadAssets({
    onProgress: (done, total) => {
      if (total) el.assetStatus.textContent = `Loading sounds… ${done}/${total}`;
    },
  }).then((b) => {
    bank = b;
    engine.setBank(b);
    const r = b.report;
    const missing = r.failed.length + r.rejected.length;
    el.assetStatus.dataset.state = missing ? 'partial' : 'ready';
    el.assetStatus.textContent = missing ? 'Sounds ready — some samples were unavailable, synthesised versions are used instead' : 'Sounds ready';
    if (missing) console.warn('[assets] fallback to synthesis for:', r.failed, r.rejected);
    // render the synthesised palette in the background, a few sounds at a time
    setTimeout(() => b.prewarm(prewarmList()).catch(() => {}), 200);
    return b;
  });

  // -------------------------------------------------------------- transport
  function paintTransport() {
    const st = engine.status();
    const screen = el.body.dataset.screen;
    const player = resultsView?.player;
    let available = false;
    let playing = false;
    if (screen === 'results') {
      available = !!player && !player.silent && st.enabled;
      playing = !!player?.playing;
    } else if (screen === 'survey') {
      available = st.enabled && st.running;
      playing = available && !st.paused && st.context === 'running';
    }
    el.play.disabled = !available;
    el.play.replaceChildren(playing ? ICON.pause() : ICON.play());
    el.play.setAttribute('aria-label', playing ? 'Pause music' : 'Play music');
    const on = st.enabled && !engine.muted;
    el.mute.setAttribute('aria-checked', String(!on));
    el.mute.replaceChildren(on ? ICON.soundOn() : ICON.soundOff());
    el.mute.setAttribute('aria-label', on ? 'Mute sound' : st.enabled ? 'Unmute sound' : 'Turn sound on');
    const mode = audioFailed ? 'failed' : !st.enabled ? 'off' : engine.muted ? 'muted' : st.paused ? 'paused' : st.context === 'running' ? 'on' : 'suspended';
    el.body.dataset.audio = mode;
    el.muteLabel.textContent = { failed: 'Sound unavailable', off: 'Sound off', on: 'Sound on', muted: 'Muted', paused: 'Paused', suspended: 'Tap to resume' }[mode];
    el.audioState.textContent = { failed: 'Audio unavailable', off: 'Audio off', on: 'Audio on', muted: 'Muted', paused: 'Paused', suspended: 'Audio waiting' }[mode];
  }
  engine.on('status', paintTransport);

  /** Turn sound on inside a click: create the context, start the music with the current state. */
  async function enableSound() {
    if (audioFailed) return false;
    try {
      const fresh = !engine.enabled;
      await engine.enable();
      if (engine.userPaused) await engine.resume();
      if (fresh) analytics.track('audio_enabled', { run: String(run) }, { onceKey: `run${run}` });
      soundWanted = true;
      if (el.body.dataset.screen === 'survey' && !engine.running) {
        engine.start(state);
        studio.start();
      }
      paintTransport();
      return true;
    } catch (err) {
      console.warn('Audio unavailable:', err);
      audioFailed = true;
      paintTransport();
      announce('Sound is not available in this browser. You can continue without sound.');
      return false;
    }
  }

  el.mute.addEventListener('click', async () => {
    if (!engine.enabled) {
      await enableSound();
      return;
    }
    engine.setMuted(!engine.muted);
    announce(engine.muted ? 'Sound muted' : 'Sound on');
  });
  el.play.addEventListener('click', async () => {
    const player = resultsView?.player;
    if (el.body.dataset.screen === 'results' && player && !player.silent) {
      await player.toggle();
      paintTransport();
      return;
    }
    if (!engine.enabled) return;
    if (engine.userPaused) await engine.resume();
    else await engine.pause();
    announce(engine.userPaused ? 'Music paused' : 'Music playing');
  });

  // ---------------------------------------------------------------- screens
  function show(name) {
    el.body.dataset.screen = name;
    document.querySelectorAll('[data-screen-section]').forEach((s) => {
      s.hidden = s.dataset.screenSection !== name;
    });
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------------ layers
  function syncLayers({ entering = null } = {}) {
    for (const l of LAYERS) {
      const on = state.layers[l.id];
      const cur = studio.layerState(l.id);
      if (on && cur === 'off') studio.setLayer(l.id, engine.playing ? 'entering' : 'on');
      if (!on && cur !== 'off') studio.setLayer(l.id, 'off');
    }
    if (entering) studio.setLayer(entering, 'entering');
  }

  engine.on('entering', ({ part, inSeconds }) => {
    if (LAYERS.some((l) => l.id === part)) studio.setLayer(part, 'entering');
    showEntry(`+ ${LAYER_LABEL[part] || part}`, inSeconds);
    announce(`${LAYER_LABEL[part] || part} joins on the next bar.`);
  });
  engine.on('entered', ({ part }) => {
    if (LAYERS.some((l) => l.id === part)) studio.setLayer(part, 'on');
  });

  function showEntry(text, inSeconds = 0) {
    clearTimeout(entryTimer);
    el.entry.textContent = inSeconds > 0.15 ? `${text} · next bar` : text;
    el.entry.classList.remove('is-on');
    void el.entry.offsetWidth;
    el.entry.classList.add('is-on');
    entryTimer = setTimeout(() => el.entry.classList.remove('is-on'), Math.max(1800, inSeconds * 1000 + 1400));
  }

  // --------------------------------------------------------------- survey
  const current = () => QUESTIONS[index];

  function updateState() {
    state = mapAnswers(answers, validated);
    engine.setState(state);
    if (!engine.playing) studio.showPattern(patternOf(state));
  }

  /** Without sound the grid still shows what each layer would play (one bar, no motion). */
  function patternOf(st) {
    const grid = LAYERS.map(() => new Float32Array(16));
    for (const ev of composeBar(st, 1, { kind: 'live' })) {
      const row = LAYERS.findIndex((l) => l.id === (ev.layer === 'fx' ? 'drums' : ev.layer));
      if (row < 0 || ev.inst === 'tone') continue;
      if (ev.inst === 'bed') {
        for (let k = 0; k < 16; k++) grid[row][k] = Math.max(grid[row][k], 0.12);
        continue;
      }
      const s = Math.min(15, Math.floor(ev.step));
      const v = Math.min(1, ev.vel ?? 0.5);
      grid[row][s] = Math.max(grid[row][s], v);
      for (let k = s + 1; k < Math.min(16, s + Math.round(ev.dur || 0)); k++) grid[row][k] = Math.max(grid[row][k], v * 0.32);
    }
    return grid;
  }

  function canContinue() {
    const q = current();
    if (q.type === 'text') return true; // optional: empty text = skip
    return typeof answers[q.id] === 'string' && answers[q.id].length > 0;
  }

  function paintNav() {
    const q = current();
    const ok = canContinue();
    el.next.setAttribute('aria-disabled', String(!ok));
    el.next.classList.toggle('is-disabled', !ok);
    el.skip.hidden = q.type !== 'text';
    el.back.hidden = index === 0;
    el.nextLabel.textContent = index === QUESTIONS.length - 1 ? 'Finish my track' : 'Continue';
  }

  function applyAccent(colourId) {
    const opt = QUESTIONS.find((q) => q.id === 'colour').options.find((o) => o.id === colourId);
    document.documentElement.style.setProperty('--accent', opt?.accent || DEFAULT_ACCENT);
    document.documentElement.style.setProperty('--accent-ink', opt?.ink || '#0b0c0d');
  }

  async function renderCurrent({ direction = 1, initial = false } = {}) {
    const q = current();
    const stage = el.stage;
    // the leaving question can't be clicked any more (a quick tap must not change the previous answer)
    stage.inert = true;
    if (!initial && !prefersReducedMotion()) {
      stage.classList.add('is-leaving');
      await wait(140);
    }
    stage.classList.remove('is-leaving', 'is-entering');
    stage.inert = false;
    view = renderQuestion(q, {
      value: answers[q.id],
      hoverSounds: hoverCapable(),
      onSelect: (optionId) => {
        const changed = answers[q.id] !== optionId;
        answers[q.id] = optionId;
        if (q.id === 'colour') applyAccent(optionId);
        updateState();
        if (changed) engine.select(q.id, optionId);
        paintNav();
      },
      onHover: (i) => engine.hover(q.id, i),
      onText: (value, info) => {
        answers[q.id] = value;
        engine.typed(q.id, classifyInput(info));
        paintNav();
      },
    });
    const n = index + 1;
    const builds = h('p', { class: 'q-builds' }, h('span', { class: 'q-builds-k' }, 'Builds'), h('span', { class: 'q-builds-v' }, q.builds.label));
    const title = h('h2', { class: 'q-title', id: 'q-title', tabindex: '-1' }, q.title);
    const help = q.help ? h('p', { class: 'q-help', id: 'q-help' }, q.help) : h('p', { class: 'sr-only', id: 'q-help' }, '');
    stage.dataset.type = q.type;
    stage.dataset.dir = String(direction);
    stage.replaceChildren(builds, title, help, h('div', { class: 'q-body' }, view.el));
    void stage.offsetWidth;
    stage.classList.add('is-entering');

    el.qcur.textContent = pad2(n);
    el.qtotal.textContent = pad2(QUESTIONS.length);
    el.pfill.style.transform = `scaleX(${n / QUESTIONS.length})`;
    el.ptrack.setAttribute('aria-valuenow', String(n));
    el.ptrack.setAttribute('aria-valuetext', `Question ${n} of ${QUESTIONS.length}`);
    paintNav();
    announce(`Question ${n} of ${QUESTIONS.length}. ${q.title}`);
    navSeq++;
    analytics.track('question_viewed', { question_id: q.id, question_index: n, run: String(run) }, { onceKey: `${run}:${navSeq}` });
    if (q.type === 'text' && isFinePointer()) view.focus();
    else title.focus({ preventScroll: true });
  }

  async function go(direction) {
    if (busy) return;
    busy = true;
    try {
      index = Math.max(0, Math.min(QUESTIONS.length - 1, index + direction));
      await renderCurrent({ direction });
    } finally {
      busy = false;
    }
  }

  function submit({ skip = false } = {}) {
    if (busy || el.body.dataset.screen !== 'survey') return;
    const q = current();
    if (skip && q.type === 'text') {
      answers[q.id] = '';
      if (view?.input) view.input.value = '';
    }
    if (!canContinue()) {
      view?.nudge?.();
      el.next.classList.remove('shake');
      void el.next.offsetWidth;
      el.next.classList.add('shake');
      announce('Choose an answer to continue.');
      return;
    }
    const revised = validated.has(q.id);
    validated.add(q.id);
    const text = q.type === 'text';
    const answered = text ? sanitizeText(answers[q.id], q.maxLength).length > 0 : true;
    analytics.track(
      'answer_submitted',
      text ? { question_id: q.id, answered, skipped: !answered, revised, run: String(run) } : { question_id: q.id, option_id: answers[q.id], revised, run: String(run) },
      { onceKey: `${run}:${q.id}:${text ? (answered ? 'text' : 'skip') : answers[q.id]}` },
    );
    updateState();
    syncLayers();
    // pace and transition change patterns rather than add a layer: a short fill marks the change
    if (q.id === 'pace' || q.id === 'explore') engine.fill();
    if (index === QUESTIONS.length - 1) finishSurvey();
    else go(1);
  }

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  el.back.addEventListener('click', () => go(-1));
  el.skip.addEventListener('click', () => submit({ skip: true }));
  el.reset.addEventListener('click', () => restart());

  document.addEventListener('keydown', (e) => {
    if (el.body.dataset.screen !== 'survey' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const typing = t.tagName === 'INPUT' && t.type === 'text';
    if (e.key === 'Enter') {
      if (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY') return;
      e.preventDefault();
      submit();
      return;
    }
    if (typing || !view?.selectIndex) return;
    if (/^[1-9]$/.test(e.key) && view.selectIndex(Number(e.key) - 1)) e.preventDefault();
  });

  // -------------------------------------------------------------- start
  async function begin(withSound) {
    if (el.start.classList.contains('is-loading')) return;
    run++;
    index = 0;
    answers = {};
    validated.clear();
    state = initialState();
    applyAccent(null);
    analytics.track('survey_started', { sound: withSound, run: String(run) }, { onceKey: `run${run}` });
    if (withSound) {
      el.start.classList.add('is-loading');
      const ok = await enableSound();
      el.start.classList.remove('is-loading');
      if (ok) {
        engine.setState(state);
        engine.start(state);
      }
    }
    studio.reset();
    show('survey');
    studio.start();
    studio.showPattern(patternOf(state));
    paintTransport();
    await renderCurrent({ initial: true });
  }
  el.start.addEventListener('click', () => begin(true));
  el.silent.addEventListener('click', () => begin(false));

  // ------------------------------------------------------------- finish
  async function finishSurvey() {
    if (busy) return;
    busy = true;
    analytics.track('survey_completed', { run: String(run) }, { onceKey: `run${run}` });
    state = mapAnswers(answers, validated);
    engine.setState(state);
    const finalState = state;
    const ending = engine.running ? engine.finish() : Promise.resolve();
    studio.stop();
    show('results');
    const title = sanitizeText(answers.title, 32) || 'Untitled';
    resultsView?.destroy();
    resultsView = mountResults(el.results, {
      state: finalState,
      answers: { ...answers },
      facts: describe(finalState),
      title,
      duration: trackSeconds(finalState.bpm),
      render: async (onProgress) => renderTrack(finalState, await assetsReady, { onProgress }),
      makePlayer: (result) => (engine.enabled ? new TrackPlayer(engine, result) : new SilentPlayerWithSound(result)),
      ensureSound: async () => {
        const ok = await enableSound();
        if (ok && engine.muted) engine.setMuted(false);
        return ok;
      },
      onRestart: restart,
      onPlayerChange: paintTransport,
      analytics,
      reducedMotion: prefersReducedMotion,
    });
    resultsView.focus();
    announce('Mixing your soundtrack.');
    busy = false;
    // the track starts once the live ending has rung out and the render is done
    const [rendered] = await Promise.all([resultsView.ready, ending.then(() => wait(1600))]);
    if (rendered) announce('Your soundtrack is ready.');
    if (rendered && engine.audible && soundWanted && el.body.dataset.screen === 'results') {
      await resultsView.autoplay();
      announce('Your soundtrack is playing.');
    }
    paintTransport();
  }

  /**
   * Results reached without sound: the player starts silent, and becomes a real
   * player the first time the participant presses play (that click turns sound on).
   */
  class SilentPlayerWithSound extends SilentPlayer {
    constructor(result) {
      super(result);
      this.silent = false;
      this.result = result;
      this.real = null;
      this.fns = new Set();
    }
    onChange(fn) {
      this.fns.add(fn);
      return () => this.fns.delete(fn);
    }
    get position() {
      return this.real ? this.real.position : 0;
    }
    set position(v) {}
    get playing() {
      return this.real ? this.real.playing : false;
    }
    set playing(v) {}
    _ensure() {
      if (!this.real && engine.enabled) {
        this.real = new TrackPlayer(engine, this.result);
        this.real.onChange(() => this.fns.forEach((fn) => fn(this)));
      }
      return this.real;
    }
    async play() {
      await this._ensure()?.play();
    }
    async toggle() {
      await this._ensure()?.toggle();
    }
    seek(s) {
      this._ensure()?.seek(s);
    }
    pause() {
      this.real?.pause();
    }
    dispose() {
      this.real?.dispose();
      this.fns.clear();
    }
  }

  // -------------------------------------------------------------- restart
  async function restart() {
    resultsView?.destroy();
    resultsView = null;
    studio.stop();
    await engine.reset();
    answers = {};
    validated.clear();
    state = initialState();
    index = 0;
    soundWanted = false;
    applyAccent(null);
    studio.reset();
    show('landing');
    paintTransport();
    el.start.focus({ preventScroll: true });
    announce('Everything was cleared. You can start again.');
  }

  // ----------------------------------------------------------------- boot
  analytics.track('experience_opened', {}, { onceKey: 'page' });
  el.qtotal.textContent = pad2(QUESTIONS.length);
  studio.reset();
  paintTransport();
  show('landing');
  document.title = `${BRAND.experience} — ${BRAND.name} · StickySounds concept demo`;

  if (debug) {
    Object.assign(window, {
      blockDemo: {
        engine,
        analytics,
        get state() {
          return state;
        },
        get answers() {
          return { ...answers };
        },
        get validated() {
          return [...validated];
        },
        get bank() {
          return bank;
        },
        assetsReady,
      },
    });
  }
}
