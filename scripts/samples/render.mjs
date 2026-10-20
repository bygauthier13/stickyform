// Pre-renders a selection into assets/library: every loop already in the style's key
// and at a tempo step, so the browser only ever plays it back at rate 1.0.
//
//   node scripts/samples/render.mjs [--style stickysound] [--out assets/library]
//     [--rubberband /opt/homebrew/bin/rubberband] [--limit N] [--target-rms -20] [--force]
//
// Web Audio ties playback speed to pitch, so neither transposition nor stretching can
// happen at runtime. rubberband does both here, in one pass; afconvert (part of macOS)
// encodes the result to AAC, which Safari plays and Ogg Vorbis is not.
//
// Read-only on the sample library. Everything written goes to --out and data/.
// Resumable: a render that already exists on disk is skipped.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodeWav, fade, fitTo, levels, normalise, readWav, toChannels } from './wav.mjs';

export const RUBBERBAND = process.env.RUBBERBAND || '/opt/homebrew/bin/rubberband';

/**
 * One rubberband pass: `semitones` of pitch, `timeRatio` of duration
 * (0.9 = nine tenths as long, so a faster tempo). The R3 engine is the fine one;
 * formant preservation only matters when the pitch actually moves.
 */
export function stretch(input, output, { semitones = 0, timeRatio = 1, formant = false, bin = RUBBERBAND } = {}) {
  const args = ['-3', '-q', '-t', String(timeRatio), '-p', String(semitones)];
  if (formant && semitones !== 0) args.push('-F');
  execFileSync(bin, [...args, input, output], { stdio: ['ignore', 'ignore', 'pipe'] });
  return output;
}

/** How a sample's named tempo is read: "half-time" means a 150 BPM loop is an 75 BPM loop. */
export const MULTIPLIER = { 'as is': 1, 'double-time': 2, 'half-time': 0.5 };

/**
 * Every file to produce for one selected sample.
 * A tonal loop is rendered once per reachable tempo step, because any later rate
 * change would detune it. A drum or FX loop carries no pitch, so one render at the
 * nearest step is enough. A one-shot has no tempo at all.
 */
export function targetsFor(sample, steps) {
  if (sample.kind !== 'loop') return [{ tempo: null, timeRatio: 1 }];
  const effective = sample.bpm * (MULTIPLIER[sample.timeShift] ?? 1);
  const wanted = sample.renderAt?.length
    ? sample.renderAt
    : [steps.reduce((best, s) => (Math.abs(s - effective) < Math.abs(best - effective) ? s : best), steps[0])];
  return wanted.map((tempo) => ({ tempo, timeRatio: effective / tempo }));
}

/** Bars of four beats in a loop, at the tempo its name implies. */
export function barsOf(sample, duration) {
  const effective = sample.bpm * (MULTIPLIER[sample.timeShift] ?? 1);
  return Math.max(1, Math.round((duration * effective) / 240));
}

function main() {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const style = flag('--style', 'stickysound');
  const outDir = flag('--out', 'assets/library');
  const bin = flag('--rubberband', RUBBERBAND);
  const limit = +flag('--limit', 0);
  const force = args.includes('--force');
  const targetRms = +flag('--target-rms', -20);
  const root = readFileSync('data/library-root.txt', 'utf8').trim();

  if (!existsSync(bin)) { console.error(`no rubberband at ${bin}`); process.exit(1); }
  const sel = JSON.parse(readFileSync(`data/selection-${style}.json`, 'utf8'));
  const measured = new Map();
  for (const line of readFileSync('data/audio-analysis.jsonl', 'utf8').split('\n')) {
    if (line.trim()) { const r = JSON.parse(line); measured.set(r.id, r); }
  }

  const tmp = 'data/tmp-render';
  mkdirSync(tmp, { recursive: true });
  mkdirSync(join(outDir, style), { recursive: true });

  let made = 0;
  let skipped = 0;
  let failed = 0;
  const entries = [];
  const problems = [];
  let samples = sel.samples;
  if (limit) samples = samples.slice(0, limit);
  const started = Date.now();

  for (const [n, s] of samples.entries()) {
    const m = measured.get(s.id);
    const srcPath = join(root, s.path);
    for (const t of targetsFor(s, sel.tempoSteps)) {
      const name = t.tempo ? `${s.id}_${t.tempo}.m4a` : `${s.id}.m4a`;
      const dest = join(outDir, style, name);
      const entry = {
        id: s.id, file: `${style}/${name}`, bucket: s.bucket, group: s.group, instrument: s.instrument,
        kind: s.kind, tempo: t.tempo, bars: null, semitones: s.semitones ?? 0, lyrics: s.lyrics,
        schoolSafe: !s.lyrics, family: s.family, genres: s.genres, subRatio: m?.subRatio ?? null,
      };
      if (existsSync(dest) && !force) {
        entry.bars = s.kind === 'loop' && m ? barsOf(s, m.duration) : null;
        entries.push(entry);
        skipped++;
        continue;
      }
      try {
        const w = readWav(readFileSync(srcPath));
        let chans = toChannels(w);
        // A one-shot may lose its leading silence; a loop may not — that silence is
        // the start of its bar.
        if (s.kind === 'oneshot' && m?.startSilence > 0.005) {
          const cut = Math.floor(m.startSilence * w.sampleRate);
          chans = chans.map((c) => c.subarray(cut));
        }
        normalise(chans, targetRms, -1);
        // Fixed names, overwritten each time: the loop is sequential, and per-sample
        // names would leave gigabytes of intermediate WAV behind over a full run.
        const a = join(tmp, 'in.wav');
        const b = join(tmp, 'out.wav');
        writeFileSync(a, encodeWav(chans, w.sampleRate));

        const semis = s.semitones ?? 0;
        const needsWork = semis !== 0 || Math.abs(t.timeRatio - 1) > 1e-6;
        if (needsWork) stretch(a, b, { semitones: semis, timeRatio: t.timeRatio, formant: true, bin });

        let outChans = toChannels(readWav(readFileSync(needsWork ? b : a)));
        const sr = w.sampleRate;
        if (s.kind === 'loop' && m) {
          // Land on exactly the right number of bars: rubberband is accurate to a few
          // milliseconds, and a loop has to be sample-exact to start on the bar.
          const bars = barsOf(s, m.duration);
          entry.bars = bars;
          outChans = fitTo(outChans, Math.round((bars * 240 * sr) / t.tempo));
          fade(outChans, 32, 64);
        } else {
          fade(outChans, 16, Math.min(256, outChans[0].length));
        }
        // rubberband can lift a peak above where normalise left it, so the ceiling is
        // applied again on the finished audio — the encoder needs the headroom.
        let peak = 0;
        for (const c of outChans) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > peak) peak = v; }
        const ceiling = 10 ** (-1 / 20);
        if (peak > ceiling) {
          const g = ceiling / peak;
          for (const c of outChans) for (let i = 0; i < c.length; i++) c[i] *= g;
        }
        const lv = levels(outChans[0]);
        if (lv.peakDb !== null && lv.peakDb > -0.9) problems.push({ id: s.id, why: `peak ${lv.peakDb} dBFS after the ceiling` });
        entry.rmsDb = lv.rmsDb;
        entry.peakDb = lv.peakDb;
        entry.seconds = Math.round((outChans[0].length / sr) * 1000) / 1000;

        const final = join(tmp, 'final.wav');
        writeFileSync(final, encodeWav(outChans, sr));
        execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '128000', final, dest], { stdio: ['ignore', 'ignore', 'pipe'] });
        entry.bytes = statSync(dest).size;
        entries.push(entry);
        made++;
      } catch (e) {
        failed++;
        problems.push({ id: s.id, path: s.path, why: String(e.message || e).split('\n')[0] });
      }
    }
    if ((n + 1) % 25 === 0 || n + 1 === samples.length) {
      const per = (Date.now() - started) / (n + 1);
      console.log(`${n + 1}/${samples.length} samples · ${made} rendered · ${skipped} already there · ${failed} failed · ~${Math.round((per * (samples.length - n - 1)) / 1000)}s left`);
    }
  }

  const indexFile = join(outDir, `index-${style}.json`);
  mkdirSync(dirname(indexFile), { recursive: true });
  writeFileSync(indexFile, `${JSON.stringify({
    style, label: sel.label, tempo: sel.tempo, tempoSteps: sel.tempoSteps, key: sel.key,
    targetRmsDb: targetRms, format: 'aac 128 kbps (.m4a)', count: entries.length, samples: entries,
  }, null, 1)}\n`);
  const totalBytes = entries.reduce((a, e) => a + (e.bytes || 0), 0);
  console.log(`\n${entries.length} files · ${(totalBytes / 1048576).toFixed(0)} MB  →  ${outDir}/${style}/ · ${indexFile}`);
  // Always written, even when empty, so the file always describes the latest run.
  writeFileSync(`data/render-problems-${style}.json`, `${JSON.stringify(problems, null, 1)}\n`);
  console.log(problems.length ? `${problems.length} problems  →  data/render-problems-${style}.json` : 'no problems');
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
