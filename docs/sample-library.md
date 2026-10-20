# Sample library

**Goal.** Let the music engine draw on the owner's ~9,500 Splice samples (loops and one-shots):
a catalogue the engine (and later an LLM "composer") can pick from, so every track is different.

**Two rules that never bend.** The library and the owner's music projects are **read-only**: nothing in them is
moved, renamed, deleted or re-tagged. And nothing personal reaches this public repository — no sample, no
catalogue, no pack name, no path from the owner's machine. Everything generated lands in `data/` or
`assets/library/`, both git-ignored; the private per-library tables live there too.

## The toolkit (`scripts/samples/`)

| File | What it does |
|---|---|
| `parse.mjs` | one path → loop or one-shot, BPM, key (+ Camelot), instrument group, wet/dry, tags, genres, kit |
| `build-index.mjs` | a list of paths → `<out>.json` / `.csv` / `-packs.json` and a report |
| `genres.mjs` | the generic "what a pack name gives away" rules — narrow keyword patterns only |
| `propose-genres.mjs` | fills a genre in for every pack the parser left at `?`, without overwriting any it found |
| `styles.mjs` | the eight style families, the style targets (tempo band, key, transposition limits), tempo steps |
| `select.mjs` | what a given style can actually play, with quotas per engine layer and a cap per pack |
| `wav.mjs` | a dependency-free WAV reader plus the measurements (levels, trim, spectrum, chroma, bars) |
| `analyse.mjs` | reads the chosen samples and writes one JSON line per file, resumable |

```sh
npm run samples:index -- liste.txt --root sounds/packs --out data/samples-index
npm run samples:genres                                   # → data/pack-overrides.json + a review CSV
npm run samples:select -- --style stickysound --count 800
npm run samples:select -- --style drill --count 400
npm run samples:analyse                                  # reads audio; needs data/library-root.txt
```

`data/library-root.txt` holds the one line that says where the library is. It is git-ignored, which is how the
owner's path stays out of the repository.

## Where it stands

**Catalogue: 9,412 files, 2,489 packs** (1,427 of them a single file). 5,764 loops, 3,101 one-shots, 547 the
names could not settle. 5,725 loops carry a tempo; only 2,513 files carry a key.

**Genres.** The parser read a genre for 1,057 packs. `propose-genres.mjs` adds 131 from the private
`data/pack-curated.json` ("this artist sounds like X") and 351 from generic keywords, leaving 950 packs — 1,659
files — deliberately empty, because a wrong genre is worse than none.

**Style families.** Eight, in `styles.mjs`: `lofi`, `soul`, `house`, `urban`, `bass`, `afrolatin`, `pop`,
`cinematic`. Every genre tag maps to one.

**Selections.** `stickysound` (90–126 BPM, D minor = F major): 821 samples from 467 packs. `drill`
(132–158 BPM, F minor = A♭ major): 400 samples from 246 packs. Vocals that sing words are kept and tagged
`lyrics: true` / `schoolSafe: false`; the school edition filters them out.

**Audio pass.** 2,064 files read, 2,062 measured, 2 failed (AIFF, which the reader does not handle).

**Pre-render.** `stickysound` is rendered: **1,050 files, 151 MB** in `assets/library/stickysound/`, no failures,
every loop landing on its exact bar length (worst case 0.46 ms out) and every file peaking at −1 dBFS.
`drill` has not been rendered yet.

## What the audio pass settled, and what it did not

Reliable, and now the basis for the next steps:

- **526 of the 545 unknown files are resolved**: 402 are loops (their length is a whole number of bars at a
  plausible tempo), 124 are one-shots (under 1.2 s), 19 remain undecided.
- **Tempos in names are trustworthy, mostly**: of 1,153 files whose tempo could be checked, 1,009 last a round
  number of bars (1, 2, 4, 8, 16, 32) and **111 do not** — those names are wrong and must not be believed.
- **16 dB of loudness spread** (RMS p10 −27.7, p90 −11.3 dBFS): every sample has to be normalised by measurement.
- **469 files are sub-heavy** (over 40 % of their energy below 120 Hz) — never stack two of them.
- **126 files clip** (peak ≥ −0.1 dBFS) and **644 carry over 100 ms of trailing silence**.

**Key detection failed, and must not be used.** Several chroma extractors were measured against the 491 files
whose key is written in the name: the best reached **45 % correct, with 15 % of the energy still outside the
scale even at the right answer**. Summing harmonics made it worse, not better — folding a peak's third harmonic
onto a fundamental adds a fifth, which is exactly the +5 / +7 semitone confusion the errors showed.
`guessScale()` therefore reports `reliable: false` and nothing is allowed to act on it. The honest consequences:

- loops whose key is in the name are usable (that is what the selections are built from);
- the 431 tonal loops without a key in their name stay unusable for now;
- fixing this needs a real key-detection tool (offline, e.g. Essentia or librosa — never in the browser) or the
  owner's ears. It is a decision to take, not a bug to fix in `wav.mjs`.

## Playing loops: what the engine must do

**Web Audio ties playback speed to pitch.** `playbackRate` is the only control there is, so a loop cannot be
transposed or stretched in the browser without changing the other. Everything is therefore **pre-rendered
offline**: each tonal loop is rendered once per tempo it is needed at, already in the style's key, and played
back at rate 1.0.

- **Tempo steps.** In loop mode the engine locks to a step (96 / 104 / 112 / 120 by default) and each tonal loop
  is pre-rendered to the steps within 10 % of its own tempo. The steps are a setting, not a constant:
  `--tempo-steps 92,100,108,116,124`, read through `stepsFor()`. **The synthetic engine is untouched** — it keeps
  the continuous tempo it glides to today, because a synthesised note is generated at whatever tempo is asked for.
  For `stickysound` this is 528 tonal renders plus 522 single copies.
- **Transposition limits** (`MAX_SHIFT`): chords, pads and plucks survive a fourth (±5); a voice loses its
  formants and a bass its weight (±3); a full-mix loop drags its drums along (±2).
- **The stretcher is rubberband 4**, called once per file for pitch and tempo together (`-3` for the fine engine,
  `-F` when the pitch moves). `tests/render.test.mjs` measures it rather than trusting it: a +5 semitone shift
  lands within 2 Hz, a tempo change lands within 30 ms and does not move the pitch.
- **The transposition was verified on the finished library**, not just on test tones. Absolute key detection is
  unreliable, but the *relative* move is not: a loop shifted by N semitones must come back with its chroma
  rotated by exactly N. On a sample of rendered files, 24 of 25 transposed files and **15 of 15 untransposed
  tonal files** came back exactly right. The handful of apparent mismatches are drum loops, whose chroma is
  noise and whose best rotation is therefore meaningless.
- **Never `loop = true`, and never time anything from `buffer.duration`.** Measured in both engines
  (`npm run test:aac`) on the same 8.000 s file: **Chromium decodes 416 frames — 9.4 ms — longer** than the
  source, **Safari/WebKit decodes it gapless**, to the exact frame. In both, the audio itself does not move
  (first sound +0 frames, last beat +0 frames); Chromium simply appends silence. So a decoded buffer's length is
  a property of the browser, not of the music: looping the buffer would hold time on Safari and drift 9.4 ms per
  repeat on Chrome. Loop mode must schedule every loop at the exact instant of its bar, from the bar count in
  the library index, and ignore the buffer's length entirely.
- **AAC, not Ogg.** `.m4a` at 128 kbps, encoded with macOS's own `afconvert`, which needs nothing installed.
  Safari does not play Ogg Vorbis, and the school edition is made for phones.

## Still to do

1. **Listen.** Nothing below is worth doing before the owner has heard a rendered track: the measurements say
   the files are correct, not that they sound good.
2. Render `drill` too (400 samples, ~670 more files), once the first style has been listened to.
3. Loop mode in the engine: each of the eight layers draws loops from compatible kits; drums and FX are key-free
   and can cross packs; pitched one-shots are retuned; risers, impacts and UI sounds stay synthesised.
4. Quality gate: render offline and measure (loudness, clipping, spectral balance, two sub-heavy loops stacked),
   re-roll on failure. A 👍/👎 in previews logs the combinations that work.
5. Decide the key question above, which unlocks 431 more loops and the thin Harmony layer.
6. Hosting, for the online product only: a compact index in the app, the sounds in a bucket, ~20–40 per track.
7. Selection stays rule-based (seeded by the answers); an LLM plugs into the same interface later — catalogue in,
   ids out, the engine validating ids, tempo and key. Never give it thousands of rows: 100–200 per style.

## Notes

- Licence: the owner states the Splice rights are fine as long as the final output is a complete track. Serving
  raw files from a public bucket was not confirmed separately with Splice. No Splice material trains any model.
- The parser's tests use invented names that copy the shape of real packs; the real ones stay out of the repo.
