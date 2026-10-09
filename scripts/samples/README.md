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

Output: `<out>.json` (full records) and `<out>.csv` (one row per sample: pack, genres, loop or
one-shot, group, instrument, BPM, key, Camelot code, wet/dry, tags, flags).

What is read from the name: loop or one-shot, BPM (60–200), key (`Fmin`, `F#m`, `Bbmaj`, a bare
note on tuned one-shots), instrument group (drums, bass, harmony, melody, vocal, music, texture,
fx), wet/dry, descriptive tags. Genres come from the pack's folder name.

`flags` marks what the names could not settle (`kind-unknown`, `no-bpm`, `no-key`,
`kind-conflict`, `group-unknown`); those go to the audio-analysis pass (length, pitch, loudness).

The parser is covered by `tests/samples.test.mjs`, written against real file names.
