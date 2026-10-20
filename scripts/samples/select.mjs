// Picks the samples a given engine style can actually play, from the catalogue's
// names alone (no audio is opened).
//
//   node scripts/samples/select.mjs [--style stickysound|drill] [--count 800]
//     [--index data/samples-index.json] [--packs data/pack-overrides.json]
//     [--out data/selection-<style>] [--tempo-steps 96,104,112,120]
//
// Compatibility is decided by the style target in styles.mjs: one tempo band, one
// key, and a per-group limit on how far material may be transposed. Variety is
// enforced on top of it: quotas per engine layer, a cap per pack, and a round-robin
// over (style family × tempo band) so no family or tempo takes over.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { MAX_SHIFT, STYLES, familyOf, keyFit, renderPlan, stepsFor, tempoFit } from './styles.mjs';

export const TONAL = new Set(['bass', 'harmony', 'melody', 'vocal', 'music']);
/** Vocal material that carries words: language-locked, and not for a children's survey. */
export const WORDS = /(phrase|hook|adlib|acapella|accapella|gang|verse|rap|chant|shout|lyric|talk|spoken)/i;

/** True when a vocal sample sings or speaks actual words rather than a wordless chop. */
export function hasLyrics(s) {
  if (s.group !== 'vocal') return false;
  return WORDS.test(s.file) || WORDS.test(s.dir) || ['hook', 'phrase', 'adlib', 'gang'].includes(s.variant);
}

/**
 * Decide whether one catalogue record fits a style, and how it must be treated.
 * Returns the record with `reject` set, or with `tempo`, `shift`, `tier` and `lyrics`.
 */
export function evaluate(s, styleTarget, packOverrides = {}, tempoSteps = undefined) {
  const pack = packOverrides[s.pack] || {};
  const genres = pack.genres?.length ? pack.genres : s.genres;
  const r = { ...s, genres, reject: null, tempo: null, shift: null, tier: null, lyrics: hasLyrics(s) };

  if (pack.skip) return { ...r, reject: 'pack skipped' };
  if (s.kind === 'unknown') return { ...r, reject: 'loop or one-shot unknown (audio pass)' };

  if (s.kind === 'loop') {
    const t = tempoFit(s.bpm, styleTarget.tempo);
    if (!t) return { ...r, reject: s.bpm ? `tempo ${s.bpm} out of this style's reach` : 'loop with no tempo in the name' };
    r.tempo = t;
    r.renderAt = TONAL.has(s.group) ? renderPlan(s.bpm, styleTarget, tempoSteps) : [];
  }

  if (TONAL.has(s.group)) {
    const shift = keyFit(s.key, styleTarget.key);
    if (shift === null) {
      // A pitched one-shot named with a bare note is retunable; a loop is not,
      // until the audio pass reads its pitch.
      if (s.kind === 'oneshot' && s.key) r.shift = 0;
      else return { ...r, reject: 'no key in the name (audio pass)' };
    } else r.shift = shift;
    const a = Math.abs(r.shift);
    const max = MAX_SHIFT[s.group] ?? 4;
    if (a > max) return { ...r, reject: `${r.shift} semitones — more than ${s.group} survives (max ${max})` };
    r.tier = a <= 1 ? 'A' : a <= 2 ? 'B' : a <= 3 ? 'C' : a <= 4 ? 'D' : 'E';
  } else {
    r.tier = 'A'; // drums, FX, texture: no key to match
  }
  if (r.tempo?.tier === 'stretch' && r.tier === 'A') r.tier = 'B';
  return r;
}

/** Which engine layer a record belongs to. */
export function bucketOf(r) {
  switch (r.group) {
    case 'drums': return r.kind === 'loop' ? 'rhythm-loops' : 'rhythm-hits';
    case 'bass': return r.kind === 'loop' ? 'bass-loops' : 'bass-hits';
    case 'harmony': return r.kind === 'loop' ? 'harmony-loops' : 'harmony-hits';
    case 'melody': return r.kind === 'loop' ? 'melody-loops' : 'melody-hits';
    case 'texture': return 'texture';
    case 'vocal': return r.lyrics ? 'vocal-lyrics' : 'vocal';
    case 'music': return 'music';
    case 'fx': return 'fx';
    default: return null;
  }
}

/** Share of the selection each layer gets, and why. */
const SHARE = {
  stickysound: {
    'rhythm-loops': [0.213, 'layer 4 Rhythm: whole grooves and percussion loops'],
    'rhythm-hits': [0.188, 'layer 4 Rhythm: kick / snare / clap / hat / perc to sequence'],
    'bass-loops': [0.075, 'layer 3 Bass'],
    'bass-hits': [0.038, 'layer 3 Bass: 808s and sub notes, retuned'],
    'harmony-loops': [0.088, 'layer 5 Harmony: chords, keys, pads'],
    'harmony-hits': [0.031, 'layer 5 Harmony: single chord stabs, retuned'],
    'melody-loops': [0.113, 'layers 2 Pulse + 6 Melody'],
    'melody-hits': [0.050, 'layers 2 Pulse + 6 Melody: plucks, bells, single notes'],
    texture: [0.075, 'layer 7 Texture: vinyl, air, noise beds'],
    vocal: [0.056, 'layer 7 Texture / 6 Melody: wordless chops and choirs'],
    'vocal-lyrics': [0.031, 'sung words — tagged "lyrics", never used by the school edition'],
    music: [0.031, 'full-mix loops, for a breakdown or an intro bed'],
    fx: [0.044, 'layer 8 Resolution: impacts and sweeps (risers stay synthesised)'],
  },
  drill: {
    'rhythm-loops': [0.19, 'drill hats and percussion: the signature of the style'],
    'rhythm-hits': [0.21, 'kick / snare / clap / hat to sequence at 140'],
    'bass-loops': [0.05, 'sliding 808 lines'],
    'bass-hits': [0.09, '808s to retune and slide — the main bass source in drill'],
    'harmony-loops': [0.07, 'dark pads and keys'],
    'harmony-hits': [0.03, 'chord stabs'],
    'melody-loops': [0.16, 'the melodic hook: bells, plucks, strings, guitars'],
    'melody-hits': [0.05, 'single notes for the hook'],
    texture: [0.04, 'air and noise beds'],
    vocal: [0.04, 'wordless chops'],
    'vocal-lyrics': [0.03, 'sung words — tagged "lyrics", never used by the school edition'],
    music: [0.02, 'full-mix loops'],
    fx: [0.02, 'impacts and sweeps'],
  },
};

const TIER_SCORE = { A: 4, B: 3, C: 2, D: 1, E: 0 };
const tempoBand = (r) => (!r.tempo ? 'hit' : `${Math.floor(r.tempo.bpm / 10) * 10}s`);

const MAX_PER_PACK_BUCKET = 6;
const MAX_PER_PACK_TOTAL = 18;

/**
 * Fill one layer's quota: best tier first, then round-robin over
 * (style family × tempo band) so no family or tempo takes over, with a hard cap
 * per pack so a 1,000-file pack cannot flood the result.
 */
export function fill(pool, want, packTotals = new Map(), caps = {}) {
  const perBucket = caps.perPackBucket ?? MAX_PER_PACK_BUCKET;
  const perTotal = caps.perPackTotal ?? MAX_PER_PACK_TOTAL;
  const sorted = [...pool].sort((a, b) => TIER_SCORE[b.tier] - TIER_SCORE[a.tier]
    || Math.abs(a.shift ?? 0) - Math.abs(b.shift ?? 0)
    || a.flags.length - b.flags.length
    || a.id.localeCompare(b.id));
  const lanes = new Map();
  for (const r of sorted) {
    const k = `${familyOf(r.genres)}|${tempoBand(r)}`;
    if (!lanes.has(k)) lanes.set(k, []);
    lanes.get(k).push(r);
  }
  const order = [...lanes.keys()].sort();
  const picked = [];
  const perPack = new Map();
  let moved = true;
  while (picked.length < want && moved) {
    moved = false;
    for (const k of order) {
      if (picked.length >= want) break;
      const lane = lanes.get(k);
      while (lane.length) {
        const r = lane.shift();
        if ((perPack.get(r.pack) || 0) >= perBucket || (packTotals.get(r.pack) || 0) >= perTotal) continue;
        perPack.set(r.pack, (perPack.get(r.pack) || 0) + 1);
        packTotals.set(r.pack, (packTotals.get(r.pack) || 0) + 1);
        picked.push(r);
        moved = true;
        break;
      }
    }
  }
  return picked;
}

// ---------------------------------------------------------------- run
function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const styleName = flag('--style', 'stickysound');
  const style = STYLES[styleName];
  if (!style) {
    console.error(`unknown style "${styleName}" — known: ${Object.keys(STYLES).join(', ')}`);
    process.exit(1);
  }
  const total = +flag('--count', 800);
  const out = flag('--out', `data/selection-${styleName}`);
  const steps = stepsFor(style, flag('--tempo-steps', null));
  const index = JSON.parse(readFileSync(flag('--index', 'data/samples-index.json'), 'utf8'));
  const overrides = JSON.parse(readFileSync(flag('--packs', 'data/pack-overrides.json'), 'utf8'));

  const evaluated = index.map((s) => evaluate(s, style, overrides, steps));
  const eligible = evaluated.filter((r) => !r.reject);

  const pools = {};
  for (const r of eligible) {
    const b = bucketOf(r);
    if (b) (pools[b] ??= []).push(r);
  }

  const packTotals = new Map();
  const selection = [];
  const report = [];
  for (const [bucket, [share, why]] of Object.entries(SHARE[styleName])) {
    const want = Math.round(share * total);
    const pool = pools[bucket] || [];
    const picked = fill(pool, want, packTotals);
    for (const r of picked) selection.push({ ...r, bucket });
    report.push({ bucket, want, got: picked.length, pool: pool.length, why });
  }

  const rows = selection.map((r) => ({
    id: r.id,
    bucket: r.bucket,
    group: r.group,
    instrument: r.instrument,
    kind: r.kind,
    lyrics: r.lyrics,
    schoolSafe: !r.lyrics,
    bpm: r.bpm,
    playAt: r.tempo ? Math.round(r.tempo.bpm) : null,
    timeShift: r.tempo?.how ?? null,
    stretchPct: r.tempo?.stretch ?? 0,
    renderAt: r.renderAt ?? [],
    key: r.key?.name ?? null,
    semitones: r.shift,
    tier: r.tier,
    family: familyOf(r.genres),
    genres: r.genres,
    pack: r.pack,
    path: r.path,
    flags: r.flags,
  }));
  writeFileSync(`${out}.json`, `${JSON.stringify({
    style: styleName,
    label: style.label,
    tempo: style.tempo,
    tempoSteps: steps,
    key: style.keyName,
    maxShift: MAX_SHIFT,
    count: rows.length,
    buckets: report,
    samples: rows,
  }, null, 1)}\n`);
  const COLS = ['id', 'bucket', 'group', 'instrument', 'kind', 'lyrics', 'bpm', 'playAt', 'timeShift', 'stretchPct', 'renderAt', 'key', 'semitones', 'tier', 'family', 'genres', 'pack', 'path', 'flags'];
  const cell = (v) => { const s = Array.isArray(v) ? v.join(' ') : v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  writeFileSync(`${out}.csv`, `${[COLS.join(','), ...rows.map((r) => COLS.map((c) => cell(r[c])).join(','))].join('\n')}\n`);

  const tally = (arr, f) => { const m = new Map(); for (const x of arr) { const v = f(x); for (const k of (Array.isArray(v) ? v : [v])) m.set(k, (m.get(k) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]); };
  console.log(`${style.label} · ${style.tempo[0]}–${style.tempo[1]} BPM · ${style.keyName} · loop-mode tempo steps ${steps.join(', ')}`);
  console.log(`catalogue ${index.length} · fits this style ${eligible.length} · selected ${selection.length}  →  ${out}.json / .csv\n`);
  console.log('layer              want   got   pool');
  for (const b of report) console.log(`${b.bucket.padEnd(15)} ${String(b.want).padStart(6)} ${String(b.got).padStart(5)} ${String(b.pool).padStart(6)}   ${b.why}`);
  console.log('\nrejected, by reason (top 10)');
  for (const [k, n] of tally(evaluated.filter((r) => r.reject), (r) => r.reject).slice(0, 10)) console.log(`  ${String(n).padStart(5)}  ${k}`);
  console.log('\nby style family'); console.log(tally(selection, (r) => familyOf(r.genres)));
  console.log('by tier (A = in key … E = a fourth away)'); console.log(tally(selection, (r) => r.tier));
  console.log('by tempo band'); console.log(tally(selection, tempoBand));
  console.log(`packs represented: ${new Set(selection.map((r) => r.pack)).size} · lyrics-tagged: ${selection.filter((r) => r.lyrics).length}`);
  const renders = selection.filter((r) => r.renderAt?.length).reduce((a, r) => a + r.renderAt.length, 0);
  console.log(`pre-renders needed: ${renders} (tonal loops × their reachable tempo steps) + ${selection.filter((r) => !r.renderAt?.length).length} single copies`);

}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) main();
