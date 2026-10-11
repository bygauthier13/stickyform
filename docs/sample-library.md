# Sample library — paused work, ready to resume

**Goal.** Let the music engine draw on the owner's ~9,500 Splice samples (loops and one-shots):
a catalogue the engine (and later an LLM "composer") can pick from, so every track is different.

## Done (branch `claude/brave-volta-8atohg`)
- `scripts/samples/parse.mjs` — reads a sample's **path/name** and returns: loop or one-shot, BPM, key (+ Camelot code),
  instrument group (drums, bass, harmony, melody, vocal, music, texture, fx), wet/dry, tags, genres from the pack name,
  and `kit` (tempo/key written in a folder name). Uncertain things are flagged for the audio pass.
- `scripts/samples/build-index.mjs` — builds `<out>.json`, `<out>.csv`, an editable `<out>-packs.json`, prints a report.
  Per-pack corrections via `--packs data/pack-overrides.json` (genres, defaultGroup, defaultKind, skip).
- `tests/samples.test.mjs` — 337 checks against ~70 real file names (`npm test`).
- Usage: see `scripts/samples/README.md`.

## Resume steps (recommended route: Claude Code running on the owner's Mac)

A cloud session cannot see the Mac and blocks Drive/iCloud, so the simplest route is a **local** Claude Code
session in a clone of this repo: it reads the Splice folder directly, nothing is uploaded, the samples never leave the
machine. `.gitignore` already excludes `data/`, `liste*.txt` and `assets/library/`, so no list, catalogue or sound can
be committed by accident.

1. One time: Node 18+ (`node -v`), `git clone` the repo, `git checkout claude/brave-volta-8atohg`, `npm install`,
   drop the private memory file into `.claude/skills/sticky-sound/reference/private/`.
2. File list (names only):
   `find "$HOME/Splice - bygauthier/sounds" -type f \( -iname "*.wav" -o -iname "*.aif*" -o -iname "*.mp3" -o -iname "*.flac" -o -iname "*.ogg" \) > ~/Desktop/liste-splice.txt`
   then `wc -l ~/Desktop/liste-splice.txt` (expect about 9,500).
3. Catalogue: `npm run samples:index -- ~/Desktop/liste-splice.txt --root sounds/packs --out data/samples-index`
   and read the report (packs, tempos, keys, unknowns). Fix pack genres in `data/samples-index-packs.json`
   (copy it to `data/pack-overrides.json` and pass `--packs`).
4. Audio pass on a selection of ~600–1,000 files (the "Plan once the list is in" section below, step 2).
5. Convert the selection to ~128 kbps OGG/MP3 into `assets/library/` (about 100–200 MB, git-ignored).
6. Loop mode + rule-based selector + quality gate (plan steps 3–4), then the LLM composer (plan step 6).
7. Owner listens and gives 👍/👎 on whole tracks. Claude cannot hear: its checks are measurements, the ears decide.
8. Only for the online product: host the chosen ~800 sounds (bucket/CDN), not the 8 GB.

Open decision for step 6: run the LLM **offline** (Claude writes many ready "recipes" that ship with the app,
no backend) or **at runtime** (an API call per track: needs a small backend and a key). Start offline.

## Where it stopped
1. The owner's Mac has the real library in `~/Splice - bygauthier/sounds/packs/<Pack>/…` (the `~/Desktop/SAMPLES`
   folder is only a 124-file copy of some packs, 287 MB). Total library is ~8 GB.
2. Still needed: the **full file list** (names only, ~1–2 MB), made with:
   `find <sounds folder> -type f \( -iname "*.wav" -o -iname "*.aif*" -o -iname "*.mp3" -o -iname "*.flac" -o -iname "*.ogg" \) > ~/Desktop/liste-splice.txt`
   (drag the `sounds` folder from Finder into Terminal after typing `find `). Then:
   `npm run samples:index -- liste-splice.txt --root sounds/packs --out data/samples-index`
3. **How to get the list to Claude:** the cloud sandbox blocks Google Drive / iCloud / Dropbox / WeTransfer
   (HTTP 403 on CONNECT) and the chat only carries pasted text and images. Working route: GitHub web upload
   (Add file → Upload files) onto this branch, under `data/`. **The repo is currently public** — make it private first
   (Settings → Danger Zone → Change visibility) before uploading anything from the library.
4. For the audio itself (only ~1,000 chosen samples are needed, not 8 GB): allow `drive.google.com` and
   `*.googleusercontent.com` in the environment's Network access (session title-bar menu → Edit), then share a Drive link.

## Plan once the list is in
1. Run the index, review the report (packs, tempos, keys, unknown kinds), fix pack genres in the packs table.
2. Audio pass on a selection of ~600–1,000 files: real duration/bars, loudness, brightness, pitch, true BPM/key
   (half/double-time check), dry/wet. Resolve `kind-unknown`.
3. **Loop mode** in the engine: each of the 8 layers = loops from compatible kits (same BPM, compatible Camelot key,
   ideally same pack); drums/FX are key-free and can be mixed across packs; pitched one-shots are retuned to the key;
   the engine still sequences one-shots on the loop grid; risers/impacts/UI sounds stay synthesised.
4. Quality gate: normalise by measured loudness, avoid stacking two sub-heavy loops, render offline, measure
   (loudness, clipping, spectral balance), re-roll if it fails. A 👍/👎 in the preview logs good combinations.
5. Hosting: compact index in the app; sounds in a bucket; each track fetches ~20–40 sounds.
6. Selection starts as code (rules + seeded randomness from the answers); an LLM plugs into the same interface later
   (catalogue in, choices out; the engine validates ids, tempo and key).

## Notes
- Licence: the owner states the Splice rights are fine as long as the final output is a complete track. Serving
  raw files from a public bucket was not confirmed separately with Splice.
- Naming: "StickySound" stays for now; a US registration "STICKY SOUNDS" (reg. 5120765, speakers) exists — unchecked.
