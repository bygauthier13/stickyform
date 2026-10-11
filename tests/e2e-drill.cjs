// End-to-end test of the UK Drill edition (drill.html) in headless Chromium.
//
//   npm run test:e2e:drill      (needs Playwright and a Chromium; ~3 minutes here)
//
// Covers: no AudioContext before consent · the silent journey with the keyboard ·
// the sound journey (layers entering on the bar, hover / select / typing notes in
// key, paste and delete, back and change, no stacked loops, mute, pause, background
// tab) · the rendered WAV (format, length, level, no clipping) · start again cleans
// the transport · missing samples fall back to synthesis · phone layout · reduced
// motion · no console errors.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { loadPlaywright, launch } = require('./helpers/browser.cjs');

const { chromium } = loadPlaywright();
const PORT = 5280 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}/drill.html?debug`;
const ROOT = path.resolve(__dirname, '..');
const SCALE = new Set([5, 7, 8, 10, 0, 1, 3]);

let failures = 0;
let passed = 0;
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name} (${((Date.now() - t) / 1000).toFixed(1)}s)`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n      ${String(e.message || e).split('\n').join('\n      ')}`);
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg || 'assertion failed');
};
async function until(fn, { timeout = 10000, every = 100, msg = 'condition' } = {}) {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > timeout) throw new Error(`timed out waiting for ${msg}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

function parseWav(file) {
  const b = fs.readFileSync(file);
  assert(b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE', 'not a RIFF/WAVE file');
  assert(b.readUInt32LE(4) === b.length - 8, 'RIFF size field');
  let o = 12;
  let fmt = null;
  let data = null;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4);
    const size = b.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === 'data') {
      data = { offset: o + 8, size };
      break;
    }
    o += 8 + size + (size % 2);
  }
  assert(fmt && data, 'fmt and data chunks');
  assert(data.offset + data.size === b.length, 'data runs to the end of the file');
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let i = data.offset; i + 1 < data.offset + data.size; i += 2 * 7) {
    const v = Math.abs(b.readInt16LE(i)) / 32768;
    peak = Math.max(peak, v);
    sum += v * v;
    n++;
  }
  return { ...fmt, seconds: data.size / (fmt.rate * fmt.channels * (fmt.bits / 8)), peak, rms: Math.sqrt(sum / n), bytes: b.length };
}

const hasAudioCtx = () => window.__acCount;
const engineInfo = (page) =>
  page.evaluate(() => {
    const e = window.blockDemo.engine;
    return {
      enabled: e.enabled,
      ctx: e.ctx ? e.ctx.state : null,
      running: e.running,
      muted: e.muted,
      paused: e.userPaused,
      timers: e.debug.timers(),
      gate: e.gate && e.ctx ? e.gate.gain.value : null,
      hovers: e.debug.hovers,
      selects: e.debug.selects,
      typed: e.debug.typed.length,
      bars: e.debug.barsScheduled,
      lastBarEvents: e.debug.lastBarEvents,
    };
  });
const layerState = (page, id) => page.getAttribute(`.row[data-layer="${id}"]`, 'data-state');
const qcur = (page) => page.textContent('#q-cur');

async function newPage(browser, { mobile = false, reducedMotion = 'no-preference', blockSamples = false } = {}) {
  const context = await browser.newContext({
    ...(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 860 } }),
    reducedMotion,
    acceptDownloads: true,
  });
  await context.addInitScript(() => {
    window.__acCount = 0;
    const Orig = window.AudioContext;
    if (Orig) {
      window.AudioContext = class extends Orig {
        constructor(...a) {
          super(...a);
          window.__acCount++;
        }
      };
    }
  });
  if (blockSamples) await context.route('**/assets/drill/samples/**', (r) => r.abort());
  const page = await context.newPage();
  page.errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(m.text());
  });
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#asset-status')?.dataset.state !== 'loading', null, { timeout: 30000 });
  return page;
}

/** Answer all ten questions. `how`: 'keys' (keyboard) or 'click'. */
async function answerAll(page, { how = 'keys', energy = '', title = '', picks = [2, 4, 1, 1, null, 2, 1, null, 3, 3] } = {}) {
  const seen = [];
  for (let i = 0; i < 10; i++) {
    seen.push(await qcur(page));
    const pick = picks[i];
    if (pick === null) {
      const text = i === 4 ? energy : title;
      if (text) {
        await page.locator('.text-input').click();
        await page.keyboard.type(text, { delay: 25 });
        await page.keyboard.press('Enter');
      } else await page.click('#q-skip');
    } else if (how === 'keys') {
      await page.locator('#q-title').focus();
      await page.keyboard.press(String(pick));
      await page.keyboard.press('Enter');
    } else {
      await page.locator('.opt').nth(pick - 1).click();
      await page.click('#q-next');
    }
    if (i < 9) await until(async () => (await qcur(page)) === String(i + 2).padStart(2, '0'), { msg: `question ${i + 2}` });
  }
  return seen;
}

async function downloadWav(page, dir, name) {
  await page.waitForSelector('.results.is-rendered', { timeout: 120000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.results-actions .btn-primary')]);
  const file = path.join(dir, name);
  await download.saveAs(file);
  return { file, suggested: download.suggestedFilename(), info: parseWav(file) };
}

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 800));
  const browser = await launch(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
  const tmp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'drill-e2e-'));
  console.log('\nUK drill edition — end to end\n');

  // ------------------------------------------------------------ silent journey
  let page = await newPage(browser);
  await step('no AudioContext and no sound before consent', async () => {
    await page.mouse.move(200, 300);
    await page.waitForTimeout(400);
    assert((await page.evaluate(hasAudioCtx)) === 0, 'an AudioContext was created before any click');
    assert(await page.isVisible('#start-sound'), 'Start with sound button');
    assert(await page.isVisible('#start-silent'), 'Continue without sound button');
    assert(/Powered by/.test(await page.textContent('.landing-foot')) && /not an official brand campaign/.test(await page.textContent('.landing-foot')), 'signature and disclaimer');
  });

  await step('silent journey with the keyboard: exactly ten questions, skip on text', async () => {
    await page.click('#start-silent');
    const seen = await answerAll(page, { how: 'keys' });
    assert(seen.join(',') === '01,02,03,04,05,06,07,08,09,10', `questions seen: ${seen}`);
    assert((await page.textContent('#q-total')) === '10', 'total is 10');
    await page.waitForSelector('#results-title');
    assert((await page.evaluate(hasAudioCtx)) === 0, 'continuing without sound never creates an AudioContext');
  });

  await step('silent journey: the rendered WAV is real, 44.1 kHz stereo, 45–60 s, not clipped', async () => {
    const { info, suggested } = await downloadWav(page, tmp, 'silent.wav');
    assert(info.format === 1 && info.channels === 2 && info.rate === 44100 && info.bits === 16, `format ${JSON.stringify(info)}`);
    assert(info.seconds >= 45 && info.seconds <= 60, `length ${info.seconds.toFixed(1)} s`);
    assert(info.peak < 0.995 && info.peak > 0.3, `peak ${info.peak.toFixed(3)}`);
    assert(info.rms > 0.05, `the file contains audio (rms ${info.rms.toFixed(3)})`);
    assert(/^Untitled - BLOCK 01 drill\.wav$/.test(suggested), `filename ${suggested}`);
  });

  await step('analytics: structured events, no free text, no duplicates', async () => {
    const ev = await page.evaluate(() => window.blockDemo.analytics.events());
    const names = ev.map((e) => e.name);
    for (const n of ['experience_opened', 'survey_started', 'survey_completed', 'export_started', 'export_completed']) assert(names.includes(n), `missing ${n}`);
    assert(names.filter((n) => n === 'question_viewed').length === 10, 'ten question views');
    assert(names.filter((n) => n === 'answer_submitted').length === 10, 'ten answers');
    assert(!names.includes('audio_enabled'), 'no audio_enabled without sound');
    const text = ev.filter((e) => e.question_id === 'energy' || e.question_id === 'title');
    assert(text.every((e) => !('option_id' in e) && Object.values(e).every((v) => typeof v !== 'string' || v.length < 40)), 'text answers carry no text');
  });
  const silentErrors = page.errors.slice();
  await page.context().close();

  // ------------------------------------------------------------- sound journey
  page = await newPage(browser);
  await step('start with sound: one AudioContext, running, the atmosphere plays', async () => {
    await page.click('#start-sound');
    await until(async () => (await engineInfo(page)).running, { msg: 'transport' });
    const e = await engineInfo(page);
    assert((await page.evaluate(hasAudioCtx)) === 1, 'exactly one AudioContext');
    assert(e.ctx === 'running' && e.timers === 1, `context ${e.ctx}, timers ${e.timers}`);
    assert((await layerState(page, 'atmosphere')) === 'on', 'atmosphere on');
    assert((await layerState(page, 'melody')) === 'off', 'melody off');
  });

  await step('hover: a note on first hover only; nothing on keyboard focus', async () => {
    const before = (await engineInfo(page)).hovers;
    const card = page.locator('.opt').nth(2);
    await card.hover();
    await page.waitForTimeout(150);
    await page.mouse.move(5, 5);
    await card.hover(); // second hover of the same card: silent
    await page.waitForTimeout(150);
    const after = (await engineInfo(page)).hovers;
    assert(after - before === 1, `hover notes: ${after - before}`);
    await page.locator('#q-title').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown'); // radio: moves the selection (a select accent), but focus alone made no hover note
    await page.waitForTimeout(150);
    assert((await engineInfo(page)).hovers === after, 'keyboard focus does not hover');
  });

  /** Click option n (1-based) and Continue, then wait for the next question. */
  const choose = async (n) => {
    const at = await qcur(page);
    await page.locator('.opt').nth(n - 1).click();
    await page.click('#q-next');
    await until(async () => (await qcur(page)) !== at, { msg: `leaving question ${at}` });
  };

  await step('selection is musical feedback; the layer enters on the next bar after Continue', async () => {
    await page.locator('.opt').nth(0).click(); // Minimal
    await page.waitForTimeout(150);
    const s0 = (await engineInfo(page)).selects;
    await page.locator('.opt').nth(1).click(); // Bold
    assert((await engineInfo(page)).selects > s0, 'select accent');
    assert((await page.evaluate(() => window.blockDemo.state.melody)) === 'bold', 'variation recorded');
    assert((await layerState(page, 'melody')) === 'off', 'not before validation');
    await page.click('#q-next');
    await until(async () => (await layerState(page, 'melody')) === 'entering' || (await layerState(page, 'melody')) === 'on', { msg: 'melody entering', timeout: 2000 });
    await until(async () => (await layerState(page, 'melody')) === 'on', { msg: 'melody on', timeout: 4500 });
  });

  await step('answers build the track layer by layer (808, drums)', async () => {
    await until(async () => (await qcur(page)) === '02');
    await choose(4); // Acid Lime
    await choose(4); // At Events
    await until(async () => (await layerState(page, 'bass')) === 'on', { msg: 'bass on', timeout: 5000 });
    await choose(3); // Jacket
    await until(async () => (await layerState(page, 'drums')) === 'on', { msg: 'drums on', timeout: 5000 });
  });

  await step('typing plays notes in F minor; paste is a short phrase; delete is silent', async () => {
    await page.locator('.text-input').click();
    const t0 = (await engineInfo(page)).typed;
    await page.keyboard.type('calm sharp focused', { delay: 70 });
    const typed = await page.evaluate(() => window.blockDemo.engine.debug.typed.map((n) => n.midi));
    assert(typed.length - t0 >= 6, `typed notes: ${typed.length - t0}`);
    assert(typed.every((m) => SCALE.has(m % 12)), `notes out of key: ${typed.filter((m) => !SCALE.has(m % 12))}`);
    const t1 = (await engineInfo(page)).typed;
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const el = document.querySelector('.text-input');
      const before = el.value;
      el.value = before + ' and a long pasted sentence';
      el.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', data: null, bubbles: true }));
    });
    const t2 = (await engineInfo(page)).typed;
    assert(t2 - t1 <= 3, `paste played ${t2 - t1} notes`);
    for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace');
    assert((await engineInfo(page)).typed === t2, 'deleting played notes');
    assert([...(await page.inputValue('.text-input'))].length <= 60, 'max length respected');
    await page.keyboard.press('Enter');
    await until(async () => (await qcur(page)) === '06', { msg: 'question 6' });
  });

  await step('back and change an answer: no stacked loops, the change is heard', async () => {
    await page.click('#q-back'); // 5
    await until(async () => (await qcur(page)) === '05');
    await page.click('#q-back'); // 4
    await until(async () => (await qcur(page)) === '04');
    await page.click('#q-back'); // 3
    await until(async () => (await qcur(page)) === '03');
    await page.locator('.opt').nth(0).click(); // Everyday
    assert((await page.evaluate(() => window.blockDemo.state.bass)) === 'everyday', 'changed 808 pattern');
    assert((await layerState(page, 'bass')) === 'on', 'layer stays');
    for (let q = 4; q <= 6; q++) {
      await page.click('#q-next');
      await until(async () => (await qcur(page)) === String(q).padStart(2, '0'));
    }
    await choose(2); // pace: Balanced (from question 6 to 7)
    const e = await engineInfo(page);
    assert(e.timers === 1, `scheduler timers: ${e.timers}`);
    const b0 = e.bars;
    await page.waitForTimeout(3600); // ~2 bars at 140 BPM
    const b1 = (await engineInfo(page)).bars;
    assert(b1 - b0 >= 1 && b1 - b0 <= 3, `bars scheduled in 3.6 s: ${b1 - b0} (a stacked loop would double it)`);
  });

  await step('mute keeps time silently; pause and resume; background tab pauses', async () => {
    await page.click('#t-mute');
    await page.waitForTimeout(200);
    let e = await engineInfo(page);
    assert(e.muted && e.gate < 0.05 && e.running, `muted ${e.muted}, gate ${e.gate}`);
    await page.click('#t-mute');
    await page.waitForTimeout(250);
    e = await engineInfo(page);
    assert(!e.muted && e.gate > 0.8, 'unmuted');
    await page.click('#t-play');
    await until(async () => (await engineInfo(page)).ctx === 'suspended', { msg: 'paused', timeout: 3000 });
    const bars = (await engineInfo(page)).bars;
    await page.waitForTimeout(2000);
    assert((await engineInfo(page)).bars === bars, 'nothing scheduled while paused');
    await page.click('#t-play');
    await until(async () => (await engineInfo(page)).ctx === 'running', { msg: 'resumed', timeout: 3000 });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await until(async () => (await engineInfo(page)).ctx === 'suspended', { msg: 'background pause', timeout: 3000 });
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await until(async () => (await engineInfo(page)).ctx === 'running', { msg: 'back on the page', timeout: 3000 });
  });

  await step('finish: the ending plays, the track renders and starts, WAV is valid', async () => {
    assert((await qcur(page)) === '07', `on question ${await qcur(page)}`);
    await choose(1); // drop: Design
    await page.locator('.text-input').click();
    await page.keyboard.type('Night Shift', { delay: 30 });
    await page.keyboard.press('Enter');
    await until(async () => (await qcur(page)) === '09');
    await choose(2); // explore: Maybe
    await page.locator('.opt').nth(2).click(); // finish: High Energy
    await page.click('#q-next');
    await page.waitForSelector('#results-title');
    assert((await page.textContent('.cover-title')).trim() === 'Night Shift', 'title on the cover');
    await page.waitForSelector('.results.is-rendered', { timeout: 120000 });
    assert((await page.textContent('#results-title')) === 'Your soundtrack is ready.', 'the headline says ready only once rendered');
    const { info, suggested } = await downloadWav(page, tmp, 'sound.wav');
    assert(info.channels === 2 && info.rate === 44100 && info.seconds > 45 && info.seconds < 60 && info.peak < 0.995, JSON.stringify(info));
    assert(suggested === 'Night Shift - BLOCK 01 drill.wav', `filename ${suggested}`);
    await until(() => page.evaluate(() => document.querySelector('.play-btn')?.classList.contains('is-playing')), { msg: 'autoplay after the ending', timeout: 15000 });
    await page.click('.play-btn');
    await until(() => page.evaluate(() => !document.querySelector('.play-btn').classList.contains('is-playing')), { msg: 'pause' });
  });

  await step('start again: answers cleared, transport stopped, context closed', async () => {
    await page.click('.results-actions .btn-ghost');
    await page.waitForSelector('#start-sound', { state: 'visible' });
    const e = await engineInfo(page);
    assert(!e.enabled && !e.running && e.timers === 0, JSON.stringify(e));
    const answers = await page.evaluate(() => window.blockDemo.answers);
    assert(Object.keys(answers).length === 0, 'answers cleared');
    assert((await page.evaluate(() => window.blockDemo.validated.length)) === 0, 'validations cleared');
  });
  const soundErrors = page.errors.slice();
  await page.context().close();

  // ---------------------------------------------------------- missing samples
  page = await newPage(browser, { blockSamples: true });
  await step('missing sample files: reported, synthesised instead, the track still renders', async () => {
    assert((await page.getAttribute('#asset-status', 'data-state')) === 'partial', 'status shows the fallback');
    await page.click('#start-sound');
    await answerAll(page, { how: 'click', energy: 'cold', title: 'Fallback' });
    const { info } = await downloadWav(page, tmp, 'fallback.wav');
    assert(info.seconds > 45 && info.peak < 0.995 && info.rms > 0.05, JSON.stringify(info));
  });
  const fallbackErrors = page.errors.filter((e) => !/Failed to load resource|ERR_FAILED/.test(e));
  await page.context().close();

  // ------------------------------------------------------------------ a stem from the manifest
  page = await (async () => {
    // a 4-bar loop at 140 BPM in F minor (an F4 pulse on each beat), declared in a manifest that is otherwise the real one
    const sr = 44100;
    const n = Math.round(((240 / 140) * 4) * sr);
    const pcm = Buffer.alloc(44 + n * 2);
    pcm.write('RIFF', 0);
    pcm.writeUInt32LE(36 + n * 2, 4);
    pcm.write('WAVEfmt ', 8);
    pcm.writeUInt32LE(16, 16);
    pcm.writeUInt16LE(1, 20);
    pcm.writeUInt16LE(1, 22);
    pcm.writeUInt32LE(sr, 24);
    pcm.writeUInt32LE(sr * 2, 28);
    pcm.writeUInt16LE(2, 32);
    pcm.writeUInt16LE(16, 34);
    pcm.write('data', 36);
    pcm.writeUInt32LE(n * 2, 40);
    const beat = (60 / 140) * sr;
    for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 349.23 * i) / sr) * Math.exp(-(i % beat) / (0.15 * sr))), 44 + i * 2);
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/drill/manifest.json'), 'utf8'));
    manifest.stems = {
      'melody/minimal': { src: 'stems/e2e-melody.wav', bpm: 140, key: 'F minor', bars: 4, gain: 0.8, provenance: 'synth' },
      'bass/afterdark': { src: 'stems/e2e-bad.wav', bpm: 128, key: 'F minor', bars: 4, provenance: 'synth' },
    };
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.route('**/assets/drill/manifest.json', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(manifest) }));
    await context.route('**/assets/drill/stems/e2e-melody.wav', (r) => r.fulfill({ contentType: 'audio/wav', body: pcm }));
    const p = await context.newPage();
    p.errors = [];
    p.on('pageerror', (e) => p.errors.push(e.message));
    await p.goto(BASE);
    await p.waitForFunction(() => document.querySelector('#asset-status')?.dataset.state !== 'loading', null, { timeout: 30000 });
    return p;
  })();
  await step('a stem declared in the manifest replaces its pattern (and a wrong-tempo stem is refused)', async () => {
    const report = await page.evaluate(() => window.blockDemo.bank.report);
    assert(report.loaded.includes('stem:melody/minimal'), `stem not loaded: ${JSON.stringify(report)}`);
    assert(report.rejected.some((r) => r.id === 'bass/afterdark' && /tempo/.test(r.reason)), 'the 128 BPM stem must be rejected');
    await page.click('#start-sound');
    await until(async () => (await engineInfo(page)).running, { msg: 'transport' });
    await page.locator('.opt').nth(0).click(); // Minimal → the stem
    await page.click('#q-next');
    await until(async () => (await layerState(page, 'melody')) === 'on', { msg: 'melody on', timeout: 5000 });
    await page.waitForTimeout(1800);
    const counts = await page.evaluate(() => window.blockDemo.engine.instruments.counts);
    assert(counts.stem > 0, `stem slices played: ${counts.stem}`);
    assert(!counts.glock, `the replaced glock pattern still played ${counts.glock} notes`);
    assert(page.errors.length === 0, page.errors.join('\n'));
  });
  await page.context().close();

  // ------------------------------------------------------------------ phone
  page = await newPage(browser, { mobile: true });
  await step('phone 390×844: no sideways scroll; the Continue bar stays on screen on a tall question', async () => {
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert((await overflow()) <= 0, 'landing overflows sideways');
    await page.click('#start-silent');
    for (const [n, next] of [[1, '02'], [2, '03'], [2, '04']]) {
      await page.locator('.opt').nth(n - 1).tap();
      await page.click('#q-next');
      await until(async () => (await qcur(page)) === next, { msg: `question ${next}` });
    }
    assert((await overflow()) <= 0, 'question 4 overflows sideways');
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    assert(docH > 844, 'question 4 is taller than the screen (the case that matters)');
    const box = await page.locator('#q-next').boundingBox();
    assert(box && box.y + box.height <= 844 && box.y > 700, `Continue at y=${box && box.y}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const box2 = await page.locator('#q-next').boundingBox();
    assert(box2.y + box2.height <= 844, 'Continue still on screen after scrolling');
  });
  await page.context().close();

  // ---------------------------------------------------------- reduced motion
  page = await newPage(browser, { reducedMotion: 'reduce' });
  await step('reduced motion: no moving playhead, transitions effectively off', async () => {
    await page.click('#start-sound');
    await until(async () => (await engineInfo(page)).running, { msg: 'transport' });
    await page.waitForTimeout(1200);
    const nows = await page.evaluate(() => document.querySelectorAll('.cell.now, .cell.hit').length);
    assert(nows === 0, `moving cells: ${nows}`);
    const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.stage')).animationDuration);
    assert(parseFloat(dur) < 0.01, `stage animation ${dur}`);
  });
  const rmErrors = page.errors.slice();
  await page.context().close();

  await step('no console errors', async () => {
    const all = [...silentErrors, ...soundErrors, ...fallbackErrors, ...rmErrors];
    assert(all.length === 0, all.join('\n'));
  });

  await browser.close();
  server.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failures} failed\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
