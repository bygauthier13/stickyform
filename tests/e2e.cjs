// End-to-end test: drives the real app in headless Chromium.
//
//   npm i -D playwright        (once; also needs a Chromium: `npx playwright install chromium`)
//   npm run test:e2e
//
// Covers the full journey on desktop (keyboard, Back, multi-select limit, sound
// switch + session persistence, composing, results, player, WAV download), a
// phone-sized pass checking nothing overflows, and a reduced-motion / sound-off
// pass. Exits non-zero on any failure.

const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadPlaywright, launch } = require('./helpers/browser.cjs');
const { chromium } = loadPlaywright();

const PORT = 5180 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}/?debug`;
const ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------- mini runner
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
const eq = (a, b, msg) => assert(a === b, `${msg || 'expected equal'}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
async function until(fn, { timeout = 10000, every = 100, msg = 'condition' } = {}) {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > timeout) throw new Error(`timed out waiting for ${msg}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

// ---------------------------------------------------------------- helpers
const engineState = (page) =>
  page.evaluate(() => {
    const e = window.stickysound.engine;
    return { ready: e.ready, state: e.ready ? e.ctx.state : null, enabled: e.enabled, audible: e.audible, gate: e.ready ? e.gate.gain.value : null, p: e.pHigh };
  });
const title = (page) => page.textContent('#qtitle');
const qcur = (page) => page.textContent('#qcur');
const isDisabled = async (page) => (await page.getAttribute('#next', 'aria-disabled')) === 'true';

const PLAN = [
  { t: 'key', v: 3 }, // q1  Ibiza
  { t: 'click', v: 4 }, // q2  Rooftop at midnight
  { t: 'key', v: 5 }, // q3  Connection
  { t: 'slider', v: 72 }, // q4
  { t: 'key', v: 3 }, // q5  Club
  { t: 'click', v: 6 }, // q6  Moss
  { t: 'key', v: 1 }, // q7  House
  { t: 'key', v: 5 }, // q8  Midnight
  { t: 'text', v: 'Lisbon' }, // q9
  { t: 'slider', v: 85 }, // q10
  { t: 'click', v: 2 }, // q11 Freedom
  { t: 'click', v: 4 }, // q12 Velvet
  { t: 'slider', v: 66 }, // q13
  { t: 'multi', v: [2, 4] }, // q14
  { t: 'text', v: 'Slow coffee, a long walk by the water, no plans at all' }, // q15
  { t: 'key', v: 3 }, // q16 Dreamy
];

async function answer(page, i) {
  const { t, v } = PLAN[i];
  if (t === 'key') await page.keyboard.press(String(v));
  else if (t === 'click') await page.locator((await page.$('.card')) ? '.card' : '.opt').nth(v - 1).click();
  else if (t === 'slider') {
    await page.evaluate((val) => {
      const r = document.querySelector('.range');
      r.value = val;
      r.dispatchEvent(new Event('input', { bubbles: true }));
    }, v);
  } else if (t === 'text') {
    await page.locator('.field-input').click();
    await page.keyboard.type(v, { delay: 5 });
  } else if (t === 'multi') for (const n of v) await page.locator('.opt').nth(n - 1).click();
  await page.waitForTimeout(120);
}

function parseWav(file) {
  const b = fs.readFileSync(file);
  assert(b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE', 'not a RIFF/WAVE file');
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
  assert(fmt && data, 'missing fmt or data chunk');
  eq(b.readUInt32LE(4), b.length - 8, 'RIFF size field');
  eq(data.offset + data.size, b.length, 'data chunk must run to end of file');
  let peak = 0;
  for (let i = data.offset; i < data.offset + data.size; i += 2 * 17) peak = Math.max(peak, Math.abs(b.readInt16LE(i)));
  let head = 0;
  for (let i = 0; i < 400; i++) head = Math.max(head, Math.abs(b.readInt16LE(data.offset + i * 2)));
  return { ...fmt, seconds: data.size / (fmt.rate * fmt.channels * (fmt.bits / 8)), peak: peak / 32768, head: head / 32768 };
}

// ---------------------------------------------------------------- main
(async () => {
  const server = spawn('node', [path.join(ROOT, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await launch(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'stickysound-'));
  const consoleProblems = [];
  const watch = (page, tag) => {
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && consoleProblems.push(`[${tag}] ${m.text()}`));
    page.on('pageerror', (e) => consoleProblems.push(`[${tag}] pageerror: ${e.message}`));
    page.on('requestfailed', (r) => consoleProblems.push(`[${tag}] request failed: ${r.url()}`));
  };

  try {
    // ======================================================== desktop journey
    console.log('\nDesktop journey');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    watch(page, 'desktop');
    await page.goto(BASE);

    await step('landing shows the headline, sub copy and CTA', async () => {
      await page.waitForSelector('.landing-title');
      eq((await page.textContent('.landing-title')).replace(/\s+/g, ' ').trim(), 'Create something while you answer.', 'headline');
      assert((await page.textContent('.landing-sub')).includes('A form that turns your answers into a soundtrack.'));
      assert((await page.textContent('.landing-small')).includes('Answer a few questions. Your music will evolve with you.'));
      eq((await page.textContent('.cta-label')).trim(), 'Start the experience');
      eq(await page.textContent('#sound-label'), 'Sound on');
    });

    await step('no audio exists before the user interacts', async () => {
      eq((await engineState(page)).ready, false, 'AudioContext created before click');
    });

    await step('Start creates the audio engine and shows question 1', async () => {
      await page.click('#start');
      await page.waitForSelector('#qtitle');
      const s = await until(async () => (await engineState(page)).state === 'running' && (await engineState(page)), { msg: 'running context' });
      assert(s.audible, 'engine should be audible');
      eq(await qcur(page), '01');
      assert((await title(page)).includes('wake up tomorrow'));
      assert(await isDisabled(page), 'Continue must be disabled until an answer is chosen');
    });

    await step('keyboard: number key selects, Enter continues, Back restores', async () => {
      await page.keyboard.press('3');
      assert(!(await isDisabled(page)), 'Continue should enable');
      eq(await page.locator('.opt.is-selected .opt-label').textContent(), 'Ibiza');
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '02', { msg: 'question 2' });
      await page.click('#back');
      await until(async () => (await qcur(page)) === '01', { msg: 'back to question 1' });
      eq(await page.locator('.opt.is-selected .opt-label').textContent(), 'Ibiza', 'answer kept after Back');
      assert(await page.isHidden('#back'), 'Back is hidden on question 1');
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '02');
    });

    await step('Enter without an answer does not advance', async () => {
      await page.waitForTimeout(300);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      eq(await qcur(page), '02');
    });

    await step('layers arrive with progress (Pulse after question 4)', async () => {
      await answer(page, 1);
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '03');
      await answer(page, 2);
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '04');
      assert((await page.textContent('#layers-text')).includes('Layer 1 of 8'));
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '05');
      await until(async () => /Pulse/.test(await page.textContent('#layers-text')), { timeout: 9000, msg: 'Pulse layer' });
    });

    await step('sound switch: off silences everything, form still works, on restores', async () => {
      await page.click('#sound');
      eq(await page.getAttribute('#sound', 'aria-checked'), 'false');
      eq(await page.textContent('#sound-label'), 'Sound off');
      await until(async () => (await engineState(page)).state === 'suspended', { timeout: 3000, msg: 'context suspended' });
      const s = await engineState(page);
      assert(s.gate < 0.02, `output gate should be ~0, was ${s.gate}`);
      assert(!s.audible, 'engine must not be audible');
      eq(await page.evaluate(() => sessionStorage.getItem('stickysound.sound')), 'off', 'preference persisted for the session');
      // the form is fully usable with sound off
      await answer(page, 4); // q5
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '06');
      await page.click('#sound');
      eq(await page.getAttribute('#sound', 'aria-checked'), 'true');
      await until(async () => (await engineState(page)).state === 'running', { timeout: 3000, msg: 'context running again' });
    });

    await step('colour card re-tints the interface accent', async () => {
      const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
      await answer(page, 5); // moss
      const after = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim());
      assert(after && after.toLowerCase() !== before.toLowerCase(), `accent unchanged (${before} → ${after})`);
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '07');
    });

    await step('answers q7–q13 (choice, text, sliders, binary, cards)', async () => {
      for (let i = 6; i <= 12; i++) {
        await answer(page, i);
        await page.keyboard.press('Enter');
        await until(async () => (await qcur(page)) === String(i + 2).padStart(2, '0'), { msg: `question ${i + 2}` });
      }
    });

    await step('multi-select allows at most two', async () => {
      await page.locator('.opt').nth(0).click();
      await page.locator('.opt').nth(1).click();
      await page.locator('.opt').nth(2).click();
      eq(await page.locator('.opt.is-selected').count(), 2, 'selected count');
      await page.locator('.opt').nth(2).click(); // toggle off
      eq(await page.locator('.opt.is-selected').count(), 1);
      await page.locator('.opt').nth(3).click();
      eq(await page.locator('.opt.is-selected').count(), 2);
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '15');
    });

    await step('textarea: Shift+Enter inserts a newline, Enter continues; text survives Back', async () => {
      await page.locator('.field-input').click();
      await page.keyboard.type('Slow coffee');
      await page.keyboard.press('Shift+Enter');
      await page.keyboard.type('a long walk');
      assert((await page.inputValue('.field-input')).includes('\n'), 'newline expected');
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '16');
      await page.click('#back');
      await until(async () => (await qcur(page)) === '15');
      assert((await page.inputValue('.field-input')).includes('a long walk'), 'text kept');
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '16');
    });

    await step('last question offers "Create my soundtrack"', async () => {
      eq((await page.textContent('#next-label')).trim(), 'Create my soundtrack');
      await answer(page, 15);
    });

    await step('submit → composing → results ("You made this.")', async () => {
      await page.keyboard.press('Enter');
      await page.waitForSelector('[data-screen="composing"]:not([hidden])', { timeout: 10000 });
      await page.waitForSelector('#results:not([hidden]) .results-inner', { timeout: 300000 });
      eq((await page.textContent('.results-title')).replace(/\s+/g, ' ').trim(), 'You made this.');
      assert((await page.textContent('.results-sub')).includes('Your answers became a soundtrack.'));
    });

    await step('summary is built from the actual answers', async () => {
      const facts = Object.fromEntries(await page.$$eval('.fact', (els) => els.map((e) => [e.querySelector('dt').textContent.trim(), e.querySelector('dd').textContent.trim()])));
      eq(facts.Mood, 'Dreamy');
      eq(facts.Style, 'House', 'style from the music-taste answer');
      for (const k of ['Energy', 'Mood', 'Style', 'Atmosphere', 'Tempo', 'Key']) assert(facts[k], `missing ${k}`);
      eq(facts.Atmosphere, 'Midnight', 'atmosphere from time-of-day answer');
      assert(/\d+ BPM/.test(facts.Tempo), 'tempo format');
      assert((await page.textContent('.words')).includes('Lisbon'), 'typed words are acknowledged');
      assert((await page.textContent('.results-foot')).includes('Created with StickySound'));
    });

    await step('player: plays (auto), pauses, seeks, restarts', async () => {
      await until(async () => (await page.evaluate(() => window.stickysound.engine.player.playing)), { timeout: 8000, msg: 'autoplay' });
      const p1 = await page.evaluate(() => window.stickysound.engine.player.position);
      await page.waitForTimeout(1200);
      const p2 = await page.evaluate(() => window.stickysound.engine.player.position);
      assert(p2 > p1 + 0.8, `position should advance (${p1} → ${p2})`);
      await page.click('.play');
      assert(!(await page.evaluate(() => window.stickysound.engine.player.playing)), 'paused');
      await page.evaluate(() => window.stickysound.engine.player.seek(60));
      eq(Math.round(await page.evaluate(() => window.stickysound.engine.player.position)), 60, 'seek');
      await page.click('.btn-ghost'); // restart
      await until(async () => (await page.evaluate(() => window.stickysound.engine.player.position)) < 3, { msg: 'restart' });
      await page.keyboard.press('Tab'); // focusable controls exist
    });

    await step('seek slider is keyboard operable', async () => {
      await page.focus('.wave');
      const before = await page.evaluate(() => window.stickysound.engine.player.position);
      await page.keyboard.press('ArrowRight');
      const after = await page.evaluate(() => window.stickysound.engine.player.position);
      assert(after >= before + 4, `ArrowRight should seek +5s (${before} → ${after})`);
    });

    await step('Download saves a valid 44.1 kHz / 16-bit stereo WAV of the full track', async () => {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('.btn-solid')]);
      const file = path.join(downloads, dl.suggestedFilename());
      await dl.saveAs(file);
      assert(/^StickySound - .+\.wav$/i.test(dl.suggestedFilename()), `filename should be "StickySound - <mood> <style>.wav", got ${dl.suggestedFilename()}`);
      const w = parseWav(file);
      eq(w.format, 1, 'PCM');
      eq(w.channels, 2, 'stereo');
      eq(w.rate, 44100, 'sample rate');
      eq(w.bits, 16, 'bit depth');
      assert(w.seconds > 90 && w.seconds < 200, `duration ${w.seconds.toFixed(1)}s`);
      assert(w.peak > 0.3 && w.peak <= 1, `peak ${w.peak}`);
      assert(w.head < 0.02, `start of file should be silent/clean, was ${w.head}`);
      try {
        const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]).toString();
        assert(Math.abs(Number(out) - w.seconds) < 0.1, 'ffprobe duration mismatch');
      } catch (e) {
        if (e.code !== 'ENOENT') throw e; // ffprobe optional
      }
    });

    await step('Start over returns to the landing page and releases audio', async () => {
      await page.click('.linklike');
      await page.waitForSelector('.landing-title', { state: 'visible' });
      await until(async () => !(await engineState(page)).ready, { timeout: 5000, msg: 'engine disposed' });
      assert(await page.isVisible('#start'));
    });

    await step('a second run works after "Start over" (fresh audio, reset form and accent)', async () => {
      await page.click('#start');
      await page.waitForSelector('#qtitle');
      await until(async () => (await engineState(page)).state === 'running', { msg: 'engine running again' });
      eq(await qcur(page), '01', 'form restarted on question 1');
      assert(await isDisabled(page), 'Continue disabled again');
      assert((await page.textContent('#layers-text')).includes('Layer 1 of 8'), 'layer strip reset');
      const accent = await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent').trim().toLowerCase());
      eq(accent, '#d8bf8f', 'accent colour reset to the default');
      await page.keyboard.press('2');
      await page.keyboard.press('Enter');
      await until(async () => (await qcur(page)) === '02', { msg: 'advance on second run' });
    });
    await ctx.close();

    // ================================================================ mobile
    console.log('\nMobile (390×844)');
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const m = await mctx.newPage();
    watch(m, 'mobile');
    await m.goto(BASE);
    await step('landing fits the phone without horizontal scroll', async () => {
      await m.waitForSelector('.landing-title');
      await m.waitForTimeout(1500);
      const o = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      assert(o.sw <= o.iw + 1, `overflow ${o.sw} > ${o.iw}`);
    });
    await step('every question fits, with Continue reachable in the viewport', async () => {
      await m.tap('#start');
      await m.waitForSelector('#qtitle');
      for (let i = 0; i < 16; i++) {
        await m.waitForTimeout(450);
        const r = await m.evaluate(() => {
          const b = document.querySelector('#next').getBoundingClientRect();
          return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, bottom: b.bottom, ih: window.innerHeight, top: b.top };
        });
        assert(r.sw <= r.iw + 1, `Q${i + 1}: horizontal overflow ${r.sw} > ${r.iw}`);
        assert(r.top >= 0 && r.bottom <= r.ih + 1, `Q${i + 1}: Continue not fully visible (${r.top}–${r.bottom} of ${r.ih})`);
        if (i < 15) {
          await answer(m, i);
          await m.waitForTimeout(150);
          await m.tap('#next');
          await until(async () => (await qcur(m)) === String(i + 2).padStart(2, '0'), { msg: `Q${i + 2}` });
        }
      }
    });
    await mctx.close();

    // ================================================== sound-off + reduced motion
    console.log('\nSound off from the start, reduced motion');
    const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    await rctx.addInitScript(() => sessionStorage.setItem('stickysound.sound', 'off'));
    const r = await rctx.newPage();
    watch(r, 'reduced');
    await r.goto(BASE);
    await step('preference "off" is honoured on load', async () => {
      await r.waitForSelector('#sound-label');
      eq(await r.textContent('#sound-label'), 'Sound off');
      eq(await r.getAttribute('#sound', 'aria-checked'), 'false');
    });
    await step('the whole form works with sound off (no audible output)', async () => {
      await r.click('#start');
      await r.waitForSelector('#qtitle');
      for (let i = 0; i < 5; i++) {
        await answer(r, i);
        await r.keyboard.press('Enter');
        await until(async () => (await qcur(r)) === String(i + 2).padStart(2, '0'), { msg: `Q${i + 2}` });
      }
      const s = await engineState(r);
      assert(!s.audible, 'must stay silent');
      assert(/Bass|Layer 3 of 8/.test(await r.textContent('#layers-text')), `layer strip should still follow progress while muted, got: ${await r.textContent('#layers-text')}`);
    });
    await step('reduced motion disables the equaliser animation', async () => {
      const d = await r.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.eq i')).animationDuration));
      assert(d < 0.01, `animation duration ${d}s should be ~0`);
    });
    await rctx.close();
  } finally {
    await browser.close();
    server.kill();
  }

  console.log('\nConsole');
  await step('no console errors, warnings or failed requests', async () => {
    assert(consoleProblems.length === 0, consoleProblems.join('\n'));
  });

  console.log(`\n${failures ? '✗' : '✓'} ${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
