// End-to-end test of the school edition: drives school.html in headless Chromium.
//
//   npm run test:e2e:school
//
// Covers the parent/child alternation, typed notes that sit in the music, the name
// that writes the melody, the reveal, and a real MP3 download (frame by frame,
// tags, length), then a phone-sized pass and a sound-off pass. Exits non-zero on failure.

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadPlaywright, launch } = require('./helpers/browser.cjs');
const { chromium } = loadPlaywright();

const PORT = 5280 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}/school.html?debug&school=Oakfield%20Prep`;
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
const title = (page) => page.textContent('#qtitle');
const qcur = (page) => page.textContent('#qcur');
const audience = (page) => page.getAttribute('body', 'data-audience').catch(() => null);
const isDisabled = async (page) => (await page.getAttribute('#next', 'aria-disabled')) === 'true';
const engineState = (page) =>
  page.evaluate(() => {
    const e = window.stickysound.engine;
    return { ready: e.ready, state: e.ready ? e.ctx.state : null, audible: e.audible };
  });

/** Answer whatever question is showing. `i` is the 0-based question number. */
async function answerCurrent(page, i) {
  const type = await page.getAttribute('#stage', 'data-type');
  if (type === 'single') await page.locator('.opt').nth(i % 2).click();
  else if (type === 'multi') {
    await page.locator('.opt').nth(0).click();
    await page.locator('.opt').nth(3).click();
  } else if (type === 'emoji' || type === 'swatch') await page.locator('.card').nth(i % 4).click();
  else if (type === 'scale') await page.locator('.scale-pill').nth(9).click();
  else if (type === 'slider') {
    await page.evaluate((v) => {
      const r = document.querySelector('.range');
      r.value = v;
      r.dispatchEvent(new Event('input', { bubbles: true }));
    }, 82);
  } else if (type === 'text' || type === 'textarea') {
    await page.locator('.field-input').click();
    await page.keyboard.type(i === 15 ? 'Maya' : 'Friendly teachers', { delay: 70 });
  }
  await page.waitForTimeout(120);
  return type;
}

/** A well-formed MP3: ID3 tag, then MPEG-1 Layer III frames that tile the file exactly. */
function parseMp3(file) {
  const b = fs.readFileSync(file);
  assert(b.toString('latin1', 0, 3) === 'ID3', 'file does not start with an ID3 tag');
  const tagEnd = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  const tags = {};
  for (let p = 10; p < tagEnd; ) {
    const id = b.toString('latin1', p, p + 4);
    const len = b.readUInt32BE(p + 4);
    const body = b.subarray(p + 10, p + 10 + len);
    tags[id] = id === 'COMM' ? '' : body[0] === 0 ? body.toString('latin1', 1) : body.subarray(3).toString('utf16le');
    p += 10 + len;
  }
  let p = tagEnd;
  let frames = 0;
  const rates = [44100, 48000, 32000];
  const kbps = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  while (p + 4 <= b.length) {
    assert(b[p] === 0xff && (b[p + 1] & 0xe0) === 0xe0, `lost frame sync at byte ${p}`);
    assert(((b[p + 1] >> 3) & 3) === 3 && ((b[p + 1] >> 1) & 3) === 1, 'not MPEG-1 Layer III');
    const rate = rates[(b[p + 2] >> 2) & 3];
    p += Math.floor((144000 * kbps[b[p + 2] >> 4]) / rate) + ((b[p + 2] >> 1) & 1);
    frames++;
  }
  eq(p, b.length, 'frames must tile the file');
  return { tags, frames, seconds: (frames * 1152) / 44100, bytes: b.length };
}

// ---------------------------------------------------------------- main
(async () => {
  const server = spawn('node', [path.join(ROOT, 'scripts/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await launch(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'stickysound-school-'));
  const consoleProblems = [];
  const watch = (page, tag) => {
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && consoleProblems.push(`[${tag}] ${m.text()}`));
    page.on('pageerror', (e) => consoleProblems.push(`[${tag}] pageerror: ${e.message}`));
    page.on('requestfailed', (r) => consoleProblems.push(`[${tag}] request failed: ${r.url()}`));
  };

  try {
    // ======================================================== desktop journey
    console.log('\nDesktop journey (school edition)');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    watch(page, 'desktop');
    await page.goto(BASE);

    await step('landing: headline, school name from the link, demo notice, no audio yet', async () => {
      await page.waitForSelector('.landing-title');
      eq((await page.textContent('.landing-title')).replace(/\s+/g, ' ').trim(), 'Your feedback. Their song.');
      eq((await page.textContent('.brand-for')).replace(/\s+/g, ' ').trim(), 'for Oakfield Prep');
      assert((await page.title()).includes('Oakfield Prep'), 'page title carries the school name');
      assert((await page.textContent('.landing-demo')).includes('nothing you enter is stored or sent'));
      eq((await engineState(page)).ready, false, 'AudioContext created before click');
    });

    await step('question 1 is for the parent; the 0–10 scale starts with nothing chosen', async () => {
      await page.click('#start');
      await page.waitForSelector('#qtitle');
      await until(async () => (await engineState(page)).state === 'running', { msg: 'running context' });
      eq(await audience(page), 'parent');
      eq((await page.textContent('.audience')).trim(), 'For you');
      assert(await isDisabled(page), 'Continue must wait for an answer');
      await answerCurrent(page, 0);
      await page.click('#next');
      await until(async () => (await qcur(page)) === '02');
      eq(await audience(page), 'child');
      eq((await page.textContent('.audience')).trim(), 'For your little one');
      await answerCurrent(page, 1);
      await page.click('#next');
      await until(async () => (await qcur(page)) === '03');
      eq(await page.getAttribute('#stage', 'data-type'), 'scale');
      eq(await page.locator('.scale-pill.is-selected').count(), 0, 'no default on the recommend scale');
      assert(await isDisabled(page), 'Continue must wait for a scale answer');
      await page.keyboard.press('ArrowRight'); // radios: arrows select natively
      await page.waitForTimeout(150);
      assert(!(await isDisabled(page)), 'an arrow key picks a value');
      await page.locator('.scale-pill').nth(9).click();
      eq(await page.locator('.scale-pill.is-selected').count(), 1);
    });

    // keep a log of every typed note the engine plays
    await page.evaluate(() => {
      const t = window.stickysound.engine.typing;
      const orig = t.play.bind(t);
      window.__typed = [];
      t.play = (...a) => {
        const r = orig(...a);
        if (r) window.__typed.push(r);
        return r;
      };
    });

    await step('every second question is for the child, all 16 (answering through to the last)', async () => {
      const kinds = ['parent', 'child', 'parent']; // questions 1–3 seen above
      await page.click('#next');
      await until(async () => (await qcur(page)) === '04');
      for (let i = 3; i < 16; i++) {
        kinds.push(await audience(page));
        const type = await answerCurrent(page, i);
        if (i === 10) assert(type === 'text', 'question 11 is the parent’s typed question');
        if (i < 15) {
          await page.click('#next');
          await until(async () => (await qcur(page)) === String(i + 2).padStart(2, '0'), { msg: `question ${i + 2}` });
        }
      }
      eq(kinds.join(','), Array.from({ length: 16 }, (_, i) => (i % 2 ? 'child' : 'parent')).join(','), 'alternation');
      eq((await page.textContent('#next-label')).trim(), 'Make our song');
    });

    await step('typed keys play notes in key, on the beat grid, right for the chord', async () => {
      const r = await page.evaluate(async () => {
        const { CHORDS, clashes } = await import('/src/audio/theory.js');
        const { slotTime } = await import('/src/audio/typing.js');
        const e = window.stickysound.engine;
        const keys = [...'Friendly teachers'].filter((c) => c.trim()).length + [...'Friendly teachers'].filter((c) => c.trim()).length + 4; // two typed answers + the name
        const inKey = new Set([0, 2, 4, 5, 7, 9, 10]);
        const bad = [];
        let onGrid = 0;
        for (const n of window.__typed) {
          const chord = CHORDS[n.chord];
          if (!inKey.has(n.midi % 12)) bad.push(['not in key', n.midi]);
          if (n.step % 4 === 0 ? !chord.pcs.includes(n.midi % 12) : clashes(chord, n.midi)) bad.push(['wrong for ' + n.chord, n.midi, n.step]);
          const entry = e.composer.timeline.find((x) => x.bar === n.bar);
          if (entry) {
            if (Math.abs(slotTime(entry, n.step) - n.time) > 1e-9) bad.push(['off the grid', n.time]);
            else onGrid++;
          }
        }
        return { notes: window.__typed.length, keys, bad, onGrid };
      });
      assert(r.notes >= 20, `most typed letters should sound (${r.notes})`);
      eq(JSON.stringify(r.bad), '[]', 'every typed note');
      assert(r.onGrid >= 1, 'at least the recent notes could be checked against the live bar grid');
    });

    await step('a space and Backspace play nothing; the name writes the melody', async () => {
      const before = await page.evaluate(() => window.__typed.length);
      await page.locator('.field-input').click();
      await page.keyboard.press('Space');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(250);
      eq(await page.evaluate(() => window.__typed.length), before, 'no note for space or delete');
      const motif = await page.evaluate(() => window.stickysound.engine.profile.customMotif);
      eq(motif?.name, 'Name: Maya', 'the typed name became the hook');
      eq(motif.notes.length, 8);
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(150);
      eq(await page.evaluate(() => window.stickysound.engine.profile.customMotif?.name), 'Name: May', 'the hook follows the letters');
      await page.keyboard.type('a');
      await page.waitForTimeout(150);
    });

    await step('submit → composing → “This is Maya’s song.”', async () => {
      await page.keyboard.press('Enter');
      await page.waitForSelector('.composing:not([hidden])', { timeout: 5000 });
      await page.waitForSelector('#results:not([hidden]) .results-title', { timeout: 150000 });
      eq((await page.textContent('.results-title')).replace(/\s+/g, ' ').trim(), 'This is Maya’s song.');
      eq((await page.textContent('.results-head .eyebrow')).trim(), 'A song for Maya');
    });

    await step('the reveal shows the child’s choices, and only the parent’s answers go to the school', async () => {
      const facts = await page.$$eval('.summary:not(.school-panel) .fact', (els) => els.map((e) => e.textContent));
      assert(facts.some((f) => f.includes('Favourite animal')), 'animal row');
      assert(facts.some((f) => f.includes('Superpower')), 'superpower row');
      const panel = await page.textContent('.school-panel');
      eq(await page.locator('.school-panel .fact').count(), 8, 'eight parent answers');
      assert(panel.includes('what Oakfield Prep receives'), 'names the school');
      assert(panel.includes('Overall experience this term'), 'parent rows');
      assert(panel.includes('“Friendly teachers”'), 'the typed parent answer');
      assert(!panel.includes('Favourite animal') && !panel.includes('Maya'), 'no child data in the school panel');
      assert(panel.includes('Demo version: nothing on this page is sent or stored.'));
      assert((await page.textContent('.results-foot')).includes('LAME'), 'LAME is acknowledged');
      eq((await page.textContent('.btn-solid')).includes('Download MP3'), true, 'the button says MP3');
    });

    await step('Download saves a valid MP3 with the right tags, name and length', async () => {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('.btn-solid')]);
      eq(dl.suggestedFilename(), "Maya's Song.mp3", 'download filename');
      const file = path.join(downloads, dl.suggestedFilename());
      await dl.saveAs(file);
      const mp3 = parseMp3(file);
      eq(mp3.tags.TIT2, 'Maya’s Song', 'title tag');
      eq(mp3.tags.TPE1, 'Oakfield Prep', 'artist tag');
      eq(mp3.tags.TALB, 'Parent feedback', 'album tag');
      const tempo = await page.evaluate(() => window.stickysound.engine.profile.tempo);
      const expected = 0.12 + 52 * (240 / tempo) + 6.5;
      assert(Math.abs(mp3.seconds - expected) < 0.2, `length ${mp3.seconds.toFixed(2)} s, expected ${expected.toFixed(2)} s`);
      assert(mp3.bytes > 1.2e6 && mp3.bytes < 4e6, `size ${mp3.bytes}`);
      // an independent decoder must accept it, too (skipped where ffmpeg is not installed)
      const ff = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-']);
      if (!ff.error) eq(`${ff.status}:${String(ff.stderr).trim()}`, '0:', 'ffmpeg decodes the file cleanly');
    });

    await step('the preparing label settles to a size once the file is ready', async () => {
      const txt = await page.textContent('.btn-solid small');
      assert(/^MP3 · \d+(\.\d)? MB$/.test(txt.trim()), `size label "${txt}"`);
    });

    await step('Start over returns to the landing page; a second run still plays typed notes', async () => {
      await page.click('.linklike');
      await page.waitForSelector('.landing:not([hidden])');
      eq((await engineState(page)).ready, false, 'audio released');
      await page.click('#start');
      await page.waitForSelector('#qtitle');
      await until(async () => (await engineState(page)).audible, { msg: 'audible again' });
      eq(await qcur(page), '01');
      eq(await page.locator('.opt.is-selected').count(), 0, 'form reset');
      // jump to a typed question through the form engine and type one letter
      await page.evaluate(() => {
        const f = window.stickysound.form;
        f.index = 15;
      });
      const noteCount = await page.evaluate(() => {
        const e = window.stickysound.engine;
        return new Promise((resolve) => setTimeout(() => resolve(['m', 'a', 'x'].map((c) => e.typed(c)).filter(Boolean).length), 1500));
      });
      assert(noteCount >= 2, `typed notes after a restart (${noteCount})`);
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
    await step('every question fits, with Continue reachable (emoji tiles, scale, swatches, slider)', async () => {
      await m.tap('#start');
      await m.waitForSelector('#qtitle');
      for (let i = 0; i < 16; i++) {
        await m.waitForTimeout(450);
        const r = await m.evaluate(() => {
          const b = document.querySelector('#next').getBoundingClientRect();
          const tiles = [...document.querySelectorAll('.card-emoji .emoji-art, .scale-pill')].map((t) => t.getBoundingClientRect());
          return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, bottom: b.bottom, ih: window.innerHeight, top: b.top, smallest: tiles.length ? Math.min(...tiles.map((t) => Math.min(t.width, t.height))) : 99 };
        });
        assert(r.sw <= r.iw + 1, `Q${i + 1}: horizontal overflow ${r.sw} > ${r.iw}`);
        assert(r.top >= 0 && r.bottom <= r.ih + 1, `Q${i + 1}: Continue not fully visible (${r.top}–${r.bottom} of ${r.ih})`);
        assert(r.smallest >= 44, `Q${i + 1}: touch targets under 44px (${r.smallest})`);
        if (i < 15) {
          const type = await m.getAttribute('#stage', 'data-type');
          if (type === 'emoji' || type === 'swatch') await m.locator('.card').nth(1).tap();
          else if (type === 'scale') await m.locator('.scale-pill').nth(7).tap();
          else await answerCurrent(m, i);
          await m.waitForTimeout(150);
          await m.tap('#next');
          await until(async () => (await qcur(m)) === String(i + 2).padStart(2, '0'), { msg: `Q${i + 2}` });
        }
      }
    });
    await mctx.close();

    // ============================================================ sound off
    console.log('\nSound off from the start');
    const octx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await octx.addInitScript(() => sessionStorage.setItem('stickysound.school.sound', 'off'));
    const o = await octx.newPage();
    watch(o, 'sound-off');
    await o.goto(BASE);
    await step('typing with sound off plays nothing and the form still works', async () => {
      await o.waitForSelector('#sound-label');
      eq(await o.textContent('#sound-label'), 'Sound off');
      await o.click('#start');
      await o.waitForSelector('#qtitle');
      eq((await engineState(o)).audible, false, 'engine must be silent');
      const played = await o.evaluate(() => {
        window.stickysound.form.index = 15;
        return ['h', 'i'].map((c) => window.stickysound.engine.typed(c)).filter(Boolean).length;
      });
      eq(played, 0, 'no typed notes while muted');
    });
    await octx.close();

    // ============================================================== console
    console.log('\nConsole');
    await step('no console errors, warnings or failed requests', async () => {
      eq(consoleProblems.join('\n'), '', 'console problems');
    });
  } finally {
    await browser.close();
    server.kill();
    fs.rmSync(downloads, { recursive: true, force: true });
  }
  console.log(`\n${failures ? '✗' : '✓'} ${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
