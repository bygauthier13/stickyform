// Fills in a genre for every pack whose name the parser could not read.
//
//   node scripts/samples/propose-genres.mjs [--packs data/samples-index-packs.json]
//     [--curated data/pack-curated.json] [--out data/pack-overrides.json]
//
// Nothing the parser already found is overwritten: a pack that has genres is copied
// through unchanged. The result is ready to pass to build-index.mjs as --packs.
//
// `--curated` is a private per-library table ("this artist sounds like X"), kept out
// of the repository; only the generic rules in genres.mjs are committed.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { familyOf } from './styles.mjs';
import { nameIsOpaque, proposeFromName } from './genres.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const packsFile = flag('--packs', 'data/samples-index-packs.json');
const curatedFile = flag('--curated', 'data/pack-curated.json');
const out = flag('--out', 'data/pack-overrides.json');
const review = flag('--review', out.replace(/\.json$/, '-review.csv'));

const packs = JSON.parse(readFileSync(packsFile, 'utf8'));
const curated = existsSync(curatedFile) ? JSON.parse(readFileSync(curatedFile, 'utf8')) : {};
if (!existsSync(curatedFile)) console.warn(`no ${curatedFile}: generic name rules only`);

const rows = [['pack', 'files', 'detected', 'proposed', 'family', 'confidence', 'why']];
const table = {};
const stats = { detected: 0, curated: 0, lexicon: 0, todo: 0 };
const files = { detected: 0, curated: 0, lexicon: 0, todo: 0 };

for (const [pack, info] of Object.entries(packs)) {
  const n = info._files ?? 0;
  let genres = info.genres ?? [];
  let confidence = 'detected';
  let why = 'genre word in the pack name';

  if (!genres.length && curated[pack]?.length) {
    genres = curated[pack];
    confidence = 'curated';
    why = 'known artist / series (private table)';
  } else if (!genres.length) {
    const { genres: g, matched } = proposeFromName(pack);
    if (g.length) {
      genres = g;
      confidence = 'lexicon';
      why = `word in the name: ${matched.join(', ')}`;
    } else {
      confidence = 'todo';
      why = nameIsOpaque(pack) ? 'name says nothing' : 'nothing musical in the name (likely an artist name)';
    }
  }

  stats[confidence]++;
  files[confidence] += n;
  table[pack] = { genres, skip: false, _files: n, _genres: confidence };
  rows.push([pack, n, info.genres?.join(' ') ?? '', genres.join(' '), familyOf(genres), confidence, why]);
}

writeFileSync(out, `${JSON.stringify(table, null, 1)}\n`);
const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const head = rows.shift();
rows.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
writeFileSync(review, `${[head, ...rows].map((r) => r.map(cell).join(',')).join('\n')}\n`);

console.log(`${Object.keys(table).length} packs  →  ${out} · ${review}`);
for (const k of ['detected', 'curated', 'lexicon', 'todo']) {
  console.log(`  ${k.padEnd(9)} ${String(stats[k]).padStart(5)} packs  ${String(files[k]).padStart(5)} files`);
}
