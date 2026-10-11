// Plays the drill edition's whole journey in its built preview, under the viewer's strict
// CSP (no network), with the `downloads` capability stubbed to the real allowlist, and
// checks the file that comes out.
//
//   node scripts/preview/build.mjs drill && node scripts/preview/smoke-drill.cjs [mobile]
//
// Needs Playwright and a Chromium. Exits non-zero on any problem.
const { spawn } = require('node:child_process');
const path = require('node:path');
const zlib = require('node:zlib');

const { loadPlaywright, launch } = require('../../tests/helpers/browser.cjs');
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '../..');
const mobile = process.argv[2] === 'mobile';
const PORT = 5500 + Math.floor(Math.random() * 100);
const FILE = path.join(ROOT, 'dist-preview', 'drill.html');

function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip');
  const nameLen = buf.readUInt16LE(26);
  const extra = buf.readUInt16LE(28);
  const size = buf.readUInt32LE(18);
  const crc = buf.readUInt32LE(14);
  const data = buf.subarray(30 + nameLen + extra, 30 + nameLen + extra + size);
  if (zlib.crc32 && zlib.crc32(data) !== crc) throw new Error('zip CRC mismatch');
  return { name: buf.toString('utf8', 30, 30 + nameLen), data };
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve-wrapped.mjs'), FILE, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await launch(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`request failed: ${r.url().slice(0, 80)}`));
  await page.addInitScript(() => {
    window.__saves = [];
    const ALLOWED = /\.(gif|png|jpg|jpeg|webp|mp4|webm|txt|json|md|docx|pptx|epub|csv|ttf|html|svg|pdf|xlsx|zip)$/i;
    window.claude = {
      use: async (n) =>
        n === 'downloads'
          ? {
              save: async (r) => {
                if (!ALLOWED.test(r.filename)) throw Object.assign(new Error('extension'), { code: 'rejected_extension' });
                window.__saves.push({ filename: r.filename, bytes: Array.from(new Uint8Array(await r.data.arrayBuffer())) });
                return { status: 'saved' };
              },
            }
          : null,
    };
  });
  let failed = false;
  const check = (ok, msg) => {
    console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
    if (!ok) failed = true;
  };
  const qcur = () => page.textContent('#q-cur');
  try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForFunction(() => document.querySelector('#asset-status')?.dataset.state !== 'loading', null, { timeout: 60000 });
    check((await page.getAttribute('#asset-status', 'data-state')) === 'ready', `samples decoded from the page itself (${await page.textContent('#asset-status')})`);
    check((await page.title()) === 'Build Your Sound', `title "${await page.title()}"`);
    await page.click('#start-sound');
    await page.waitForSelector('#q-title');
    const texts = { 4: 'cold sharp focused', 7: 'Night Shift' };
    for (let i = 0; i < 10; i++) {
      const at = await qcur();
      if (texts[i] !== undefined) {
        await page.locator('.text-input').click();
        await page.keyboard.type(texts[i], { delay: 30 });
        await page.keyboard.press('Enter');
      } else {
        await page.locator('.opt').nth(i % 3).click();
        await page.click('#q-next');
      }
      if (i < 9) await page.waitForFunction((prev) => document.querySelector('#q-cur').textContent !== prev, at);
    }
    await page.waitForSelector('.results.is-rendered', { timeout: 300000 });
    check((await page.textContent('#results-title')) === 'Your soundtrack is ready.', 'results headline');
    check((await page.textContent('.results-actions .btn-primary')).includes('Download WAV (.zip)'), 'the button says the WAV comes zipped');
    await page.click('.results-actions .btn-primary');
    await page.waitForFunction(() => window.__saves.length > 0, null, { timeout: 60000 });
    const [saved] = await page.evaluate(() => window.__saves);
    check(saved.filename === 'Night Shift - BLOCK 01 drill.zip', `zip name: ${saved.filename}`);
    const inner = unzipFirst(Buffer.from(saved.bytes));
    check(inner.name === 'Night Shift - BLOCK 01 drill.wav', `inside: ${inner.name}`);
    const b = inner.data;
    const fmt = b.indexOf('fmt ');
    const ok = b.toString('ascii', 0, 4) === 'RIFF' && b.readUInt16LE(fmt + 10) === 2 && b.readUInt32LE(fmt + 12) === 44100 && b.readUInt16LE(fmt + 22) === 16;
    const data = b.indexOf('data');
    const seconds = b.readUInt32LE(data + 4) / (44100 * 4);
    check(ok && seconds > 45 && seconds < 60, `a real stereo 44.1 kHz 16-bit WAV of ${seconds.toFixed(1)} s (${(b.length / 1048576).toFixed(1)} MB)`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `no sideways scroll (${overflow}px)`);
    check(problems.length === 0, `no console messages${problems.length ? `: ${problems.join(' | ')}` : ''}`);
  } catch (e) {
    check(false, String(e.message || e));
  }
  await browser.close();
  server.kill();
  process.exit(failed ? 1 : 0);
})();
