// Does an AAC file decode to exactly the audio we encoded?
//
//   node tests/e2e-aac.cjs
//
// Loop mode starts every loop at the exact instant of the bar, with no `loop = true`,
// so a decoded buffer that is a few milliseconds longer or shorter than the source —
// the encoder's priming and padding — would drift the groove. This renders a loop of
// an exact whole number of bars, encodes it with macOS's own `afconvert`, decodes it
// in the browser, and measures the difference.
//
// macOS only (afconvert). Chromium is tested here; Safari is the one that matters for
// the school edition on iPhone, and WebKit must be installed for it
// (`npx playwright install webkit`) or the page opened in Safari by hand.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadPlaywright, launch } = require('./helpers/browser.cjs');

const SR = 44100;
const BPM = 120;
const BARS = 4;
const FRAMES = Math.round((BARS * 240 * SR) / BPM); // 8.000 s exactly
let checks = 0;
let failures = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.error(`  ✗ ${msg}`); } };

/** A loop with a click on every beat, so any shift is visible in the sample positions. */
function renderLoop() {
  const x = new Float32Array(FRAMES);
  const beat = Math.round((60 * SR) / BPM);
  for (let i = 0; i < FRAMES; i++) {
    const tone = 0.25 * Math.sin((2 * Math.PI * 220 * i) / SR);
    const since = i % beat;
    const click = since < 400 ? 0.7 * Math.exp(-since / 60) * Math.sin((2 * Math.PI * 1500 * since) / SR) : 0;
    x[i] = Math.max(-1, Math.min(1, tone + click));
  }
  return x;
}

function writeWav(file, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  fs.writeFileSync(file, b);
}

(async () => {
  if (process.platform !== 'darwin') { console.log('aac: skipped (afconvert is macOS only)'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-aac-'));
  const wav = path.join(dir, 'loop.wav');
  const m4a = path.join(dir, 'loop.m4a');
  writeWav(wav, renderLoop());
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '128000', wav, m4a]);

  const pw = loadPlaywright();
  const bytes = { wav: [...fs.readFileSync(wav)], m4a: [...fs.readFileSync(m4a)] };

  /** Decode both files in one engine. Returns null when that engine is not installed. */
  async function measureIn(name) {
    let browser;
    try {
      browser = name === 'Chromium' ? await launch(pw.chromium, { headless: true }) : await pw.webkit.launch({ headless: true });
    } catch (e) {
      if (/Executable doesn't exist|ENOENT/.test(String(e.message))) return null;
      throw e;
    }
    const page = await browser.newPage();
    const out = await page.evaluate(async ({ wav: w, m4a: m, sr }) => {
    const ctx = new OfflineAudioContext(1, sr, sr);
    const decode = async (arr) => {
      const buf = await ctx.decodeAudioData(new Uint8Array(arr).buffer);
      const ch = buf.getChannelData(0);
      let first = 0;
      while (first < ch.length && Math.abs(ch[first]) < 0.02) first++;
      let last = ch.length - 1;
      while (last > 0 && Math.abs(ch[last]) < 0.02) last--;
      // the loudest sample of the final beat, to see whether the audio moved at all
      let lastPeak = 0;
      let lastPeakAt = 0;
      for (let i = Math.max(0, ch.length - 30000); i < ch.length; i++) {
        if (Math.abs(ch[i]) > lastPeak) { lastPeak = Math.abs(ch[i]); lastPeakAt = i; }
      }
      return { length: buf.length, sampleRate: buf.sampleRate, firstSound: first, lastSound: last, lastPeakAt };
    };
      return { wav: await decode(w), m4a: await decode(m) };
    }, { ...bytes, sr: SR });
    await browser.close();
    return out;
  }

  /** Print one engine's numbers and check that the audio has not moved. */
  function report(engine, got) {
    console.log(`\n--- ${engine} ---`);
    const padFrames = got.m4a.length - FRAMES;
    const padMs = Math.round((padFrames / SR) * 10000) / 10;
    const leadFrames = got.m4a.firstSound - got.wav.firstSound;
    const lastFrames = got.m4a.lastPeakAt - got.wav.lastPeakAt;
    console.log(`source              ${FRAMES} frames (${(FRAMES / SR).toFixed(3)} s), first sound at ${got.wav.firstSound}, last beat at ${got.wav.lastPeakAt}`);
    console.log(`WAV decoded         ${got.wav.length} frames`);
    console.log(`AAC decoded         ${got.m4a.length} frames  →  ${padFrames >= 0 ? '+' : ''}${padFrames} frames (${padMs} ms) of encoder padding`);
    console.log(`AAC first sound     ${got.m4a.firstSound}  →  ${leadFrames >= 0 ? '+' : ''}${leadFrames} frames`);
    console.log(`AAC last beat at    ${got.m4a.lastPeakAt}  →  ${lastFrames >= 0 ? '+' : ''}${lastFrames} frames`);
    console.log(`AAC audible tail at ${got.m4a.lastSound}  →  ${got.m4a.length - 1 - got.m4a.lastSound} frames of silence after it`);

    ok(got.wav.length === FRAMES, `${engine}: WAV must decode to exactly ${FRAMES} frames, got ${got.wav.length}`);
    // What loop mode needs: the audio must not move. Padding may exist — it is silence
    // at the end — as long as nothing inside the file is shifted or stretched.
    ok(Math.abs(leadFrames) <= 5, `${engine}: the first sound must not move by more than 5 frames, it moved ${leadFrames}`);
    ok(Math.abs(lastFrames) <= 5, `${engine}: the last beat must not move by more than 5 frames, it moved ${lastFrames}`);
    ok(padFrames >= 0, `${engine}: the encoder must not truncate: the length changed by ${padFrames} frames`);
    ok(got.m4a.lastSound <= FRAMES + 5, `${engine}: everything after the source length must be silence`);
    console.log(padFrames > 5
      ? `→ ${padFrames} frames (${padMs} ms) of silence added at the end. Harmless when every loop is\n  started at the exact instant of its bar; it would drift audibly with\n  AudioBufferSourceNode.loop = true, which loop mode must therefore never use.`
      : '→ gapless: the decoded length matches the source exactly.');
  }

  let engines = 0;
  for (const engine of ['Chromium', 'WebKit']) {
    const got = await measureIn(engine);
    if (!got) {
      console.log(`\n--- ${engine} ---\nnot installed; install it with: npx playwright install ${engine.toLowerCase()}`);
      continue;
    }
    engines++;
    report(engine, got);
  }
  fs.rmSync(dir, { recursive: true, force: true });

  if (engines < 2) console.log('\nWARNING: Safari (WebKit) is the engine that matters on iPhone and was not measured.');
  console.log(failures ? `\naac: ${checks - failures}/${checks} checks passed, ${failures} FAILED` : `\naac: ${checks} checks passed in ${engines} engine(s)`);
  process.exit(failures ? 1 : 0);
})();
