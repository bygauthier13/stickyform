// Reads the chosen samples and measures what a file name cannot say: real length,
// loudness, brightness, sub weight, pitch, and whether a file is a loop at all.
//
//   node scripts/samples/analyse.mjs [--root <library folder>] [--out data/audio-analysis]
//     [--include selection,nokey,unknown,nobpm] [--limit N]
//
// The library folder is personal, so it is never written in the repository: pass
// --root, or put the path in data/library-root.txt (git-ignored).
//
// Read-only on the library: files are opened, never written, moved or re-tagged.
// Results are appended one JSON object per line, so a run can be stopped and resumed
// at any point — already-measured files are skipped.
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { barsAt, centroid, chroma, downsample, guessScale, levels, lowRatio, readWav, spectrum, toMono, trim } from './wav.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const ROOT_FILE = 'data/library-root.txt';
const root = flag('--root', existsSync(ROOT_FILE) ? readFileSync(ROOT_FILE, 'utf8').trim() : null);
if (!root) {
  console.error(`no library folder: pass --root, or write the path into ${ROOT_FILE}`);
  process.exit(1);
}
const out = flag('--out', 'data/audio-analysis');
const include = new Set(flag('--include', 'selection,nokey,unknown,nobpm').split(','));
const limit = +flag('--limit', 0);
const indexFile = flag('--index', 'data/samples-index.json');

const index = JSON.parse(readFileSync(indexFile, 'utf8'));
const byId = new Map(index.map((s) => [s.id, s]));

// ---------------------------------------------------------------- what to read
const TONAL = new Set(['bass', 'harmony', 'melody', 'vocal', 'music']);
const BANDS = [[90, 126], [132, 158]];
const reachable = (bpm) => !!bpm && BANDS.some(([lo, hi]) => [1, 2, 0.5]
  .some((m) => bpm * m >= lo * 0.92 && bpm * m <= hi * 1.08));

const wanted = new Map();
const add = (s, why) => { if (s && !wanted.has(s.id)) wanted.set(s.id, { ...s, why }); };
if (include.has('selection')) {
  for (const style of ['stickysound', 'drill']) {
    const f = `data/selection-${style}.json`;
    if (!existsSync(f)) continue;
    for (const r of JSON.parse(readFileSync(f, 'utf8')).samples) add(byId.get(r.id), `selection:${style}`);
  }
}
for (const s of index) {
  if (include.has('nokey') && s.kind === 'loop' && TONAL.has(s.group) && !s.key && reachable(s.bpm)) add(s, 'no key in the name');
  if (include.has('unknown') && s.kind === 'unknown') add(s, 'loop or one-shot unknown');
  if (include.has('nobpm') && s.kind === 'loop' && !s.bpm) add(s, 'no tempo in the name');
}

// ---------------------------------------------------------------- resume
mkdirSync(dirname(out), { recursive: true });
const resultFile = `${out}.jsonl`;
const errorFile = `${out}-errors.jsonl`;
const done = new Set();
if (existsSync(resultFile)) {
  for (const line of readFileSync(resultFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).id); } catch { /* a half-written last line: it will be redone */ }
  }
}
if (existsSync(errorFile)) {
  for (const line of readFileSync(errorFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).id); } catch { /* ignore */ }
  }
}

let todo = [...wanted.values()].filter((s) => !done.has(s.id));
if (limit) todo = todo.slice(0, limit);
console.log(`${wanted.size} files wanted · ${done.size} already measured · ${todo.length} to read`);

// ---------------------------------------------------------------- measure
/** Everything one file can tell us, from its samples. */
export function measure(buf, s) {
  const w = readWav(buf);
  const mono = toMono(w);
  const lv = levels(mono);
  const tr = trim(mono, w.sampleRate);
  // Chroma and brightness only need the low end of the spectrum: 4× down is plenty
  // and makes the FFT four times cheaper.
  const factor = Math.max(1, Math.round(w.sampleRate / 11025));
  const low = downsample(mono, factor);
  const sr = w.sampleRate / factor;
  const sp = spectrum(low, sr);
  const ch = chroma(low, sr);
  const atName = barsAt(w.duration, s.bpm);
  // When the name has no tempo, try the tempos that would make the file a whole
  // number of bars inside the engine's reach.
  const candidates = [];
  if (!s.bpm) {
    for (const bars of [1, 2, 4, 8, 16]) {
      const bpm = (bars * 240) / w.duration;
      if (bpm >= 60 && bpm <= 200) candidates.push({ bars, bpm: Math.round(bpm * 10) / 10 });
    }
  }
  return {
    id: s.id,
    why: s.why,
    sampleRate: w.sampleRate,
    channels: w.channels,
    bitDepth: w.bitDepth,
    duration: Math.round(w.duration * 1000) / 1000,
    ...lv,
    startSilence: Math.round(tr.startSilence * 1000) / 1000,
    endSilence: Math.round(tr.endSilence * 1000) / 1000,
    sounding: Math.round(tr.sounding * 1000) / 1000,
    centroidHz: centroid(sp.mag, sp.binHz),
    subRatio: lowRatio(sp.mag, sp.binHz, 120),
    analysedFrames: sp.frames,
    chroma: ch ? Array.from(ch, (v) => Math.round(v * 1000) / 1000) : null,
    scaleGuess: guessScale(ch),
    nameBpm: s.bpm ?? null,
    barsAtNameBpm: atName,
    bpmCandidates: candidates,
  };
}

let ok = 0;
let failed = 0;
const started = Date.now();
for (const [i, s] of todo.entries()) {
  const file = join(root, s.path);
  try {
    const row = measure(readFileSync(file), s);
    appendFileSync(resultFile, `${JSON.stringify(row)}\n`);
    ok++;
  } catch (e) {
    appendFileSync(errorFile, `${JSON.stringify({ id: s.id, path: s.path, error: String(e.message || e) })}\n`);
    failed++;
  }
  if ((i + 1) % 50 === 0 || i + 1 === todo.length) {
    const per = (Date.now() - started) / (i + 1);
    const left = Math.round((per * (todo.length - i - 1)) / 1000);
    console.log(`${i + 1}/${todo.length}  ok ${ok}  failed ${failed}  ~${left}s left`);
  }
}
console.log(`done: ${ok} measured, ${failed} failed  →  ${resultFile}`);
