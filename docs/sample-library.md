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
