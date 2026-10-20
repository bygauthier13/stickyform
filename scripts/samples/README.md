# Sample library tools

Turns a folder of sample packs into a searchable catalogue, from file names alone
(no audio is opened).

```sh
# 1. list the audio files (macOS / Linux)
find ~/Desktop/SAMPLES -type f \( -iname "*.wav" -o -iname "*.aif*" -o -iname "*.mp3" -o -iname "*.flac" -o -iname "*.ogg" \) > liste.txt

# 2. build the catalogue and print a report
npm run samples:index -- liste.txt --root SAMPLES --out data/samples-index
```

`--root` is the folder whose children are the packs: `SAMPLES` for a folder of packs, or
`sounds/packs` for a Splice folder (the first match in each path wins).

Per-pack corrections (optional): copy `<out>-packs.json` to `data/pack-overrides.json` and edit it. For each pack
you can fix `genres`, set `defaultGroup` / `defaultKind` for files the names cannot settle, or `"skip": true`
to leave the pack out. Pack names are only a hint ("a food house moment" is not house).

Output: `<out>.json` (full records) and `<out>.csv` (one row per sample: pack, genres, loop or
one-shot, group, instrument, BPM, key, Camelot code, wet/dry, tags, flags). Some packs write tempo and key in a
folder name ("kits") instead of the file name; the folder is recorded as `kit` and fills in what the name omits.

What is read from the name: loop or one-shot, BPM (60–200), key (`Fmin`, `F#m`, `Bbmaj`, a bare
note on tuned one-shots), instrument group (drums, bass, harmony, melody, vocal, music, texture,
fx), wet/dry, descriptive tags. Genres come from the pack's folder name.

`flags` marks what the names could not settle (`kind-unknown`, `no-bpm`, `no-key`,
`kind-conflict`, `group-unknown`); those go to the audio-analysis pass (length, pitch, loudness).

The parser is covered by `tests/samples.test.mjs`, written against invented names that copy the shape of real packs.

## Genres for packs the names cannot explain

```sh
npm run samples:genres        # data/samples-index-packs.json → data/pack-overrides.json + a review CSV
npm run samples:index -- liste.txt --root sounds/packs --packs data/pack-overrides.json --out data/samples-index
```

`propose-genres.mjs` fills in a genre for every pack the parser left at `?`, and **never overwrites** one it
already found. Three sources, each marked in the output as `_genres`:

- `detected` — the parser read a genre in the pack name; copied through unchanged.
- `curated` — a private per-library table, `data/pack-curated.json` (git-ignored): "this artist / this series
  sounds like X". Pack names are personal, so this file and every pack name stay out of the repository.
- `lexicon` — a generic word in the name, from `genres.mjs`. Narrow on purpose: a wrong genre is worse than none.
  Packs that match nothing are left empty rather than guessed.

The review CSV lists one line per pack with `detected`, `proposed`, `family`, `confidence` and `why`, biggest
packs first, so every proposal can be checked and corrected by hand.

## Style families and style targets

`styles.mjs` is the bridge to the engine, and holds no pack names.

- **Eight style families** group the genre tags into the characters the engine can act on:
  `lofi`, `soul`, `house`, `urban`, `bass`, `afrolatin`, `pop`, `cinematic`.
- **A style target** is what one engine build plays: a tempo band, one key, the tempo steps the engine locks to,
  and how far each kind of material may be transposed into the key (`MAX_SHIFT`). `stickysound` is 90–126 BPM in
  D minor (= F major); `drill` is 132–158 BPM in F minor (= A♭ major).

A minor key and its relative major are the same seven notes, so a minor sample is moved to the minor root and a
major sample to the relative major: both land on the same scale. Chords, pads and plucks survive a fourth; a voice
loses its formants, a bass loses its weight and a full-mix loop drags its drums along, so each group has its own
limit.

## Choosing what a style can play

```sh
npm run samples:select -- --style stickysound --count 800   # → data/selection-stickysound.json / .csv
npm run samples:select -- --style drill --count 400
```

Hard filters: the tempo must be reachable (as is, or in half- or double-time, with at most 8 % stretch) and, for
pitched material, the key must be within that group's transposition limit. On top of that, variety is enforced:
a quota per engine layer, at most 6 files from one pack per layer and 18 overall, and a round-robin over
(style family × tempo band) so no family or tempo takes over. Closest key always wins.

Each chosen sample carries what the pre-render needs: `timeShift` (as is / half-time / double-time), `stretchPct`,
`semitones`, and `renderAt` — the tempo steps that loop can be rendered to without smearing. Vocals that sing
actual words are kept but tagged `lyrics: true` / `schoolSafe: false`; the school edition must filter them out.
