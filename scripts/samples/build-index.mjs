// Builds the sample catalogue from a plain list of file paths (one per line).
//
//   node scripts/samples/build-index.mjs liste.txt [--root SAMPLES] [--out data/samples-index] [--packs data/pack-overrides.json]
//
// --root is the folder whose children are the packs ("SAMPLES", or "sounds/packs" for a Splice folder).
// --packs is an optional file of per-pack corrections; <out>-packs.json is written as a template for it.
//
// Writes <out>.json and <out>.csv and prints a report of what was understood and
// what still needs the audio-analysis pass. Reads names only; no audio is opened.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parsePath } from './parse.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const input = args.find((a, i) => !a.startsWith('--') && !['--root', '--out', '--packs'].includes(args[i - 1]));
if (!input) {
  console.error('usage: node scripts/samples/build-index.mjs <list.txt> [--root SAMPLES] [--out data/samples-index]');
  process.exit(1);
}
const root = flag('--root', 'SAMPLES');
const out = flag('--out', 'data/samples-index');
const packsFile = flag('--packs', existsSync('data/pack-overrides.json') ? 'data/pack-overrides.json' : null);
const overrides = packsFile ? JSON.parse(readFileSync(packsFile, 'utf8')) : {};

const AUDIO = /\.(wav|aif|aiff|mp3|flac|ogg)$/i;
const lines = [...new Set(readFileSync(input, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];

/**
 * Drop everything up to and including the folder whose children are the packs.
 * `--root` may be several levels ("sounds/packs"); the first match wins.
 */
function relative(line) {
  const norm = line.replace(/\\/g, '/');
  const marker = `/${root.replace(/^\/+|\/+$/g, '').toLowerCase()}/`;
  const i = norm.toLowerCase().indexOf(marker);
  return i >= 0 ? norm.slice(i + marker.length) : norm;
}

/** Per-pack corrections: genres, a default group or kind for files the names cannot settle, or skip. */
function correct(r) {
  const o = overrides[r.pack];
  if (!o) return r;
  if (o.genres) r.genres = o.genres;
  if (o.defaultGroup && r.group === 'other') {
    r.group = o.defaultGroup;
    r.flags = r.flags.filter((f) => f !== 'group-unknown');
  }
  if (o.defaultKind && r.kind === 'unknown') {
    [r.kind, r.kindSource] = [o.defaultKind, 'pack'];
    r.flags = r.flags.filter((f) => f !== 'kind-unknown');
  }
  return r;
}

const records = lines
  .filter((l) => AUDIO.test(l))
  .map((l) => ({ ...parsePath(relative(l)), path: relative(l) }))
  .filter((r) => !overrides[r.pack]?.skip)
  .map(correct);

// ---------------------------------------------------------------- files
mkdirSync(dirname(out), { recursive: true });
writeFileSync(`${out}.json`, JSON.stringify(records, null, 1));

// An editable list of every pack with the genres guessed from its name.
const packTable = {};
for (const r of records) packTable[r.pack] ??= { genres: r.genres, skip: false, _files: 0 };
for (const r of records) packTable[r.pack]._files++;
writeFileSync(`${out}-packs.json`, JSON.stringify(packTable, null, 1));

const csvCell = (v) => {
  const s = Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const COLUMNS = [
  ['id', (r) => r.id], ['pack', (r) => r.pack], ['genres', (r) => r.genres], ['kind', (r) => r.kind],
  ['group', (r) => r.group], ['instrument', (r) => r.instrument], ['variant', (r) => r.variant],
  ['bpm', (r) => r.bpm], ['key', (r) => r.key?.name], ['camelot', (r) => r.camelot], ['wet', (r) => r.wet],
  ['tags', (r) => r.tags], ['flags', (r) => r.flags], ['dir', (r) => r.dir], ['file', (r) => r.file],
];
writeFileSync(`${out}.csv`, [COLUMNS.map(([n]) => n).join(','), ...records.map((r) => COLUMNS.map(([, f]) => csvCell(f(r))).join(','))].join('\n'));

// ---------------------------------------------------------------- report
const tally = (items) => {
  const m = new Map();
  for (const x of items) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const show = (title, entries) => console.log(`\n${title}\n${entries.map(([k, n]) => `  ${String(n).padStart(5)}  ${k}`).join('\n')}`);

console.log(`${records.length} audio files read from ${input}  →  ${out}.json / ${out}.csv / ${out}-packs.json`);
show('Kind', tally(records.map((r) => r.kind)));
show('Group', tally(records.map((r) => r.group)));
show('Instrument', tally(records.map((r) => r.instrument || '(none)')).slice(0, 15));

const loops = records.filter((r) => r.kind === 'loop');
show('Loop tempos (BPM)', tally(loops.map((r) => r.bpm ?? '(none)')).sort((a, b) => (a[0] === '(none)') - (b[0] === '(none)') || +a[0] - +b[0]));
show('Keys (Camelot)', tally(records.filter((r) => r.key).map((r) => `${r.key.name}${r.camelot ? ` (${r.camelot})` : ''}`)));

const packs = tally(records.map((r) => r.pack));
console.log('\nPacks (files · loops · one-shots · unknown · genres)');
for (const [pack, n] of packs) {
  const rs = records.filter((r) => r.pack === pack);
  const c = (k) => rs.filter((r) => r.kind === k).length;
  console.log(`  ${String(n).padStart(5)}  ${pack}  ·  ${c('loop')} loops · ${c('oneshot')} one-shots · ${c('unknown')} unknown  ·  ${rs[0].genres.join(', ') || '?'}`);
}

show('Needs the audio pass', tally(records.flatMap((r) => r.flags)));
const skipped = lines.length - records.length;
if (skipped) console.log(`\n${skipped} lines ignored (not audio, or from skipped packs)`);
