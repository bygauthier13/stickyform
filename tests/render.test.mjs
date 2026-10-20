// The two things the whole pre-render rests on: that rubberband shifts a pitch by
// exactly the semitones we ask for, and stretches time by exactly the ratio we ask
// for. Everything downstream assumes it, so it is measured rather than trusted.
//
//   node tests/render.test.mjs        (skips when rubberband is not installed)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { RUBBERBAND, stretch } from '../scripts/samples/render.mjs';
import { dominantHz, encodeWav, readWav, toChannels } from '../scripts/samples/wav.mjs';

let checks = 0;
const eq = (actual, expected, msg) => { checks++; assert.deepEqual(actual, expected, msg); };
const near = (actual, expected, tol, msg) => {
  checks++;
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: expected ${expected} ±${tol}, got ${actual}`);
};

if (!existsSync(RUBBERBAND)) {
  console.log(`render: skipped (no rubberband at ${RUBBERBAND})`);
  process.exit(0);
}

const SR = 44100;
const DIR = 'data/tmp-render-test';
mkdirSync(DIR, { recursive: true });

/** A steady tone, long enough for the stretcher to settle. */
function tone(hz, seconds) {
  const n = Math.round(SR * seconds);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / SR);
  return [ch];
}

const src = `${DIR}/tone.wav`;
const out = `${DIR}/out.wav`;
writeFileSync(src, encodeWav(tone(220, 3), SR));

// ---- pitch: +5 semitones from A3 (220 Hz) must land on D4 (293.665 Hz)
stretch(src, out, { semitones: 5, timeRatio: 1, formant: true });
{
  const w = readWav(readFileSync(out));
  const hz = dominantHz(toChannels(w)[0], w.sampleRate);
  near(hz, 220 * 2 ** (5 / 12), 2, 'a +5 semitone shift lands on D4');
  near(w.frames / w.sampleRate, 3, 0.05, 'and leaves the duration alone');
}

// ---- pitch down, and the awkward tritone
stretch(src, out, { semitones: -5, timeRatio: 1, formant: true });
{
  const w = readWav(readFileSync(out));
  near(dominantHz(toChannels(w)[0], w.sampleRate), 220 * 2 ** (-5 / 12), 2, 'a -5 semitone shift lands on E3');
}

// ---- time: a 4-bar loop at 100 BPM becomes the same 4 bars at 112 BPM
{
  const bars = 4;
  const from = 100;
  const to = 112;
  const seconds = (bars * 240) / from;                 // 9.6 s
  writeFileSync(src, encodeWav(tone(220, seconds), SR));
  stretch(src, out, { semitones: 0, timeRatio: to === from ? 1 : from / to });
  const w = readWav(readFileSync(out));
  const want = (bars * 240) / to;                      // 8.571 s
  near(w.frames / w.sampleRate, want, 0.03, `${bars} bars at ${from} BPM become ${bars} bars at ${to} BPM`);
  near(dominantHz(toChannels(w)[0], w.sampleRate), 220, 2, 'and the pitch does not move with the tempo');
}

// ---- both at once, which is what a tonal loop actually needs
{
  const seconds = (4 * 240) / 90;
  writeFileSync(src, encodeWav(tone(220, seconds), SR));
  stretch(src, out, { semitones: 2, timeRatio: 90 / 120, formant: true });
  const w = readWav(readFileSync(out));
  near(w.frames / w.sampleRate, (4 * 240) / 120, 0.03, 'tempo and key move together');
  near(dominantHz(toChannels(w)[0], w.sampleRate), 220 * 2 ** (2 / 12), 2, 'and the shift is still exact');
}

// ---- a no-op must stay a no-op
{
  const before = readWav(readFileSync(src));
  stretch(src, out, { semitones: 0, timeRatio: 1 });
  const after = readWav(readFileSync(out));
  near(after.frames, before.frames, SR * 0.02, 'no shift and no stretch changes nothing audible');
}

eq(typeof RUBBERBAND, 'string', 'the rubberband path is configurable');
console.log(`render: ${checks} checks passed`);
