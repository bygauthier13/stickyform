---
name: sticky-sound
description: Project memory and working guide for StickySound — a form that composes a layered soundtrack as people answer it (Web Audio, vanilla JS, no backend), its school-survey edition (parent/child survey, typing plays notes, MP3 download), the B2B product idea, and the paused sample-library pipeline. Use when the user mentions StickySound, the school edition, the music engine, MP3 export, typed notes, the sample library or Splice indexing, previews, or asks to continue this project.
---

# StickySound — project memory

Read this first, then the reference files only when the task needs them:

| File | Read it when |
|---|---|
| `reference/architecture.md` | touching the audio engine, scenarios, typing instrument, MP3, results screen |
| `reference/lessons.md` | something sounds or renders wrong; before changing mix levels; before running long jobs |
| `reference/roadmap.md` | deciding what to build next; any question about Suno-like generation, samples, SaaS, the school pilot |
| `reference/workflow.md` | working with the owner, the sandbox limits, tests, previews, git |
| `reference/private-context.md` | business, pricing, naming, family/pilot context, or the full conversation log |
| `../../../docs/sample-library.md` | resuming the sample-library work |

## What exists (all on branch `claude/brave-volta-8atohg`)

1. **StickySound** (`index.html`): a 16-question form (choice, multi, binary, colour and material cards, three styled
   sliders, short and long text). As the user answers, eight musical layers enter on the bar line in one fixed key
   (D minor ≡ F major) at fixed progress thresholds; answers steer groove, progression, timbres, tempo; typed words seed
   the melody. The ending plays a closing cadence while the full track renders offline in the browser; the reveal
   ("You made this.") has a waveform player, a summary, and a real **WAV** download.
2. **School edition** (`school.html`, `?school=Name` sets the school): a parent survey where every second question is
   for the child. 16 questions, strictly parent → child → …; the child's answers (animal, colour, superpower, speed,
   place, feeling, favourite sound, first name) write the song; a critical parent answer never changes it (tested); the
   child's name spells the melody (`nameMotif`); open parent questions and the name field **play notes while typing**;
   the download is an **MP3** with ID3 tags. The reveal shows "what the school receives" = the parent's eight answers
   only. **It is a demo: nothing is sent or stored.**
3. **Typing instrument** (`src/audio/typing.js`): each key becomes a note on the live sixteenth-note grid, in key, right
   for the chord, never a semitone/tritone against the melody that is sounding. Used by both editions.
4. **MP3 export** (`src/audio/mp3.js`, lamejs LGPL vendored unmodified in `assets/vendor/lamejs/`, lazily imported).
5. **Sample-library toolkit** (`scripts/samples/`, `docs/sample-library.md`): parses sample file *names* into a
   catalogue (loop/one-shot, BPM, key, instrument group, genres, kits). Paused until the owner's full file list arrives.
6. **Preview tooling** (`scripts/preview/`): single-file builds for claude.ai Artifact links, plus a strict-CSP smoke test.

Preview links (private to the owner): school edition https://claude.ai/artifact/2H75CvDSzHqnCUiQKU1TfZ ·
original StickySound https://claude.ai/artifact/GZWiK7ziQMwFuTfjHSNY9X (older build, before typed notes and MP3).
Republishing the same file path keeps a URL.

## How it is built (one paragraph)

`src/app.js` is the whole application, driven by a *scenario* (`src/scenarios/stickysound.js`, `school.js`): questions,
`buildProfile` (answers → a plain musical profile), `summarise`, wording of the reveal. The audio engine
(`src/audio/`) never touches the DOM or the form; the live engine and the offline renderer run the **same `Composer`**,
so the downloaded file is the track the user heard. `src/soundmap.js` exports `makeProfileBuilder(config)`. Details in
`reference/architecture.md`.

## Commands

```sh
npm start                  # dev server (no build step, no runtime dependencies)
npm test                   # pure tests: theory 5731 · samples 337 · typing 45355 · mp3 247 · school 5396 checks
npm run test:e2e           # StickySound in headless Chromium (25 checks, ~2.5 min: the render takes ~45 s here)
npm run test:e2e:school    # school edition incl. a frame-by-frame MP3 check (14 checks)
npm run samples:index -- list.txt --root sounds/packs --out data/samples-index
node scripts/preview/build.mjs school|stickysound   # → dist-preview/ (needs esbuild)
```

Lint (no config in the repo): ESLint with `ecmaVersion 2023`, browser globals, `no-unused-vars`/`no-undef`; keep it clean.

## Decisions already made (do not re-litigate)

- **One key, one tempo family, every layer compatible.** Mood (major/minor) comes from chord order and which chord is
  "home", never from changing the pitch set.
- **No backend, no runtime dependencies.** The only vendored library is the MP3 encoder (LGPL, separate file, LAME
  acknowledged on the school reveal).
- **Audio quality is verified by rendering and measuring** (Claude cannot hear). The owner's ear is the final gate:
  always ask for listening feedback after a sound change.
- **Typed notes are quantised to sixteenths** (up to ~0.13 s after the key): that is what makes them sound composed.
  If the owner finds it laggy, tighten the grid rather than abandon the rules.
- **Parent answers do not change the child's song.** Parent options only tip close votes (e.g. `p4` priorities).
- **0–10 recommend scale has no default** (a default would bias the survey); sliders do default (they are for fun).
- **Child data stays on the device** in the school design; only the parent's answers are meant to reach the school.
- **Do not train any model on Suno outputs** (its terms reportedly prohibit it, and 500 tracks is far too little
  anyway). Do not use Splice material to train models (Splice's terms say AI training is not permitted).
- **Samples:** loops and one-shots from the owner's library will be used inside finished tracks; keep raw files out of
  git; a compact index in the app and files in a bucket is the intended hosting (see roadmap).
- **Name:** "StickySound" stays for now. A US registration "STICKY SOUNDS" (speakers, reg. 5120765) exists and has not
  been checked; "Songform" is taken. Verify trademarks and domains before any launch.

## Open work, in rough priority

1. **Owner's call, pending:** PR base branch (create an empty `main` and merge, recommended; or create `main` and
   rebase; or the owner creates it). Make the GitHub repo **private**.
2. **School edition → real use:** deliver the parent's answers (webhook / Sheets / the school's survey tool), parental
   consent and privacy review for children's data, per-school branding and language (copy is UK English), an A/B pilot
   (completion rate, drop-off per question), accessibility audit, a one-page pitch for the school group.
3. **Make the music "crazy" (Route A):** style packs (lo-fi, house, cinematic …), keys/modes beyond D minor, song
   structures per style, sampled instruments, an LLM "composer" (offline authoring first; runtime only as a premium
   feature), stems/MIDI export.
4. **Sample library:** get the full file list, build the catalogue, audio pass on ~1,000 chosen files, loop mode.
5. **B2B product:** template-first (not a general form builder), five hand-sold pilots before building accounts/billing.
6. Check real-device render time and the feel of typed notes on a phone.
