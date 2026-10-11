// Plays a whole journey in a built preview, under the viewer's strict CSP, and checks the downloaded file.
//
//   node scripts/preview/build.mjs school && node scripts/preview/smoke.cjs school [mobile]
//
// Needs Playwright and a Chromium. Exits non-zero on any problem.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const { loadPlaywright, launch } = require('../../tests/helpers/browser.cjs');
const { chromium } = loadPlaywright();

const ROOT = path.resolve(__dirname, '../..');
const name = process.argv[2] || 'school';
const mobile = process.argv[3] === 'mobile';
const PORT = 5400 + Math.floor(Math.random() * 100);
const FILE = path.join(ROOT, 'dist-preview', `${name}.html`);
const WANT = name === 'school' ? { ext: 'mp3', magic: 'ID3', title: 'This is Maya’s song.' } : { ext: 'wav', magic: 'RIFF', title: 'You made this.' };

/** Read the first entry of a store-only zip, verifying its CRC. */
function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('not a zip');
  const nameLen = buf.readUInt16LE(26);
  const extra = buf.readUInt16LE(28);
  const size = buf.readUInt32LE(18);
  const crc = buf.readUInt32LE(14);
  const data = buf.subarray(30 + nameLen + extra, 30 + nameLen + extra + size);
  if ((zlib.crc32 ? zlib.crc32(data) : crc) !== crc) throw new Error('zip CRC mismatch');
  return { name: buf.toString('utf8', 30, 30 + nameLen), data };
}

(async () => {
  const server = spawn('node', [path.join(__dirname, 'serve-wrapped.mjs'), FILE, String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 700));
  const browser = await launch(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(m.text()));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  await page.addInitScript(() => {
    window.__saves = [];
    window.claude = {
      use: async (n) =>
        n === 'downloads'
          ? {
              save: async (r) => {
                if (/\.(wav|mp3)$/i.test(r.filename)) throw Object.assign(new Error('ext'), { code: 'rejected_extension' });
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
  try {
    await page.goto(`http://localhost:${PORT}/`);
    await page.waitForSelector('#start');
    await page.click('#start');
    await page.waitForSelector('#qtitle');
    const total = Number(await page.textContent('#qtotal'));
    for (let i = 0; i < total; i++) {
      const type = await page.getAttribute('#stage', 'data-type');
      if (type === 'text' || type === 'textarea') {
        await page.locator('.field-input').click();
        await page.keyboard.type(i === total - 1 ? 'Maya' : 'Lisbon', { delay: 40 });
      } else if (type === 'slider') await page.evaluate(() => { const r = document.querySelector('.range'); r.value = 70; r.dispatchEvent(new Event('input', { bubbles: true })); });
      else if (type === 'multi') { await page.locator('.opt').nth(0).click(); await page.locator('.opt').nth(1).click(); }
      else if (type === 'swatch' || type === 'emoji' || type === 'mood') await page.locator('.card').nth(2).click();
      else if (type === 'scale') await page.locator('.scale-pill').nth(9).click();
      else await page.locator('.opt').nth(0).click();
      await page.waitForTimeout(250);
      if (i < total - 1) { await page.keyboard.press('Enter'); await page.waitForTimeout(550); }
    }
    await page.keyboard.press('Enter');
    await page.waitForSelector('#results:not([hidden]) .results-inner', { timeout: 300000 });
    check((await page.textContent('.results-title')).replace(/\s+/g, ' ').trim() === WANT.title, `reveal title "${WANT.title}"`);
    await page.click('.btn-solid');
    await page.waitForFunction(() => window.__saves.length > 0, null, { timeout: 180000 });
    const [saved] = await page.evaluate(() => window.__saves);
    check(/\.zip$/.test(saved.filename), `the file arrives zipped: ${saved.filename}`);
    const inner = unzipFirst(Buffer.from(saved.bytes));
    check(inner.name.endsWith(`.${WANT.ext}`), `the zip holds a .${WANT.ext}: ${inner.name}`);
    check(inner.data.toString('latin1', 0, WANT.magic.length) === WANT.magic, `it starts with ${WANT.magic}`);
    check(inner.data.length > 1e6, `and is a real track (${(inner.data.length / 1e6).toFixed(1)} MB)`);
    fs.writeFileSync(path.join(ROOT, 'dist-preview', `smoke-${name}.${WANT.ext}`), inner.data); // for ffprobe, if you want to look closer
    check(problems.length === 0, `no console messages${problems.length ? `: ${problems.join(' | ')}` : ''}`);
  } catch (e) {
    check(false, String(e.message || e));
  }
  await browser.close();
  server.kill();
  process.exit(failed ? 1 : 0);
})();
