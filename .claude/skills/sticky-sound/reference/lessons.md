# Lessons learned (bugs, traps, how things were measured)

## Audio

- **Measure, don't trust.** Claude cannot hear. Useful tools: render with `OfflineAudioContext` in Playwright, analyse
  WAVs in Python (spectral balance, loudness per second, chroma), solo-layer renders for trims, live capture with a
  ScriptProcessor tapped on `engine.gate`, `ffprobe`/`ffmpeg` for file validity.
- Mix fixes made from measurement: bass was ~14 dB too loud; upper bands dull; limiter was squashing (removed the glue
  compressor, master gain 0.9 → 0.34, new `master()` loudness stage); breakdown wasn't quieter (`bd = 0.6`); new layer
  entries were inaudible against the full drone (arrival emphasis + receding drone; drums excluded from emphasis);
  UI cues sat at ≈ −39 dBFS (`out.gain` 4.5); hats too bright (hp 6000, lp 11000); the riser was tone-dominated because
  `noiseSrc` could start at a random offset that truncated the noise (offset now ≤ `buf.duration − dur − 0.02`).
- Melody: octave-folding notes one at a time broke contours; placing the whole motif by its centre and voice-leading
  between bars fixed it.
- `stop()` before `start()` on the chorus threw → guard with a started flag.
- **Click detection** was too weak in dense mixes to prove "no clicks"; never claim click-free. Envelopes end well before
  `stop()` by construction.
- Full offline render with everything scheduled up front took > 4.5 minutes → lazy 2-bar chunks in `suspend()`.
- A/B "with vs without typing" renders are unreliable at high progress (random noise in synths). Render the typed notes
  alone instead.
- Name-hook first draft mapped letters onto five pitch classes: "Maya" and "Zoë" came out almost monotone. A 26-letter
  table with distinct vowels fixed it; test for duplicates across ~50 names.

## Files and UI

- WAV `LIST` chunk inside `data` → click at sample 0 and misaligned audio. Fixed order matters.
- Download filename became "download" when it contained a non-ASCII dash → ASCII-only names.
- `replaceChildren(null)` printed "null": filter falsy children. Inline-block headline words need real spaces between spans.
- Counter "11" looked like "ll" in the serif → Inter with tabular figures. Slider SVG path NaN: jitter arrays must be n+1 long.
- **Fixed bar pinned to the page:** `.screen-in { animation: … both }` kept an identity `transform`, which makes the screen the
  containing block of `position: fixed` descendants, so the Continue bar sat below the fold on short phones when a question
  was taller than the screen. Use `backwards`, not `both`. Always test a question taller than the viewport.
- Emoji tiles: 3 columns on phones keeps touch targets ≥ 44 px; the 0–10 scale becomes two rows of six.
- Timeline marker labels collide when names are long (bars 0/4/8/12 are close): keep layer names ≤ 7 characters.

## Environment and process

- `tail` on a long pipeline hides output until it ends → write logs to files and run in the background.
- `pkill -f` matches its own shell → kill by PID. A `( … ) &` inside a background Bash call is killed when the outer shell
  exits → give the whole command to `run_in_background` instead. Foreground `sleep` is blocked.
- `npm i -D …` also installs the repo's Playwright, which pins a Chromium build the sandbox doesn't have. `tests/helpers/browser.cjs`
  falls back to any installed Chromium. Never run `playwright install` here (browsers are pre-installed in `/opt/pw-browsers`).
- The sandbox cannot reach Google Drive / iCloud / Dropbox / WeTransfer (proxy 403); GitHub works. Domain availability
  lookups (RDAP) failed from here — availability of names/domains is unverified.
- The claude.ai preview viewer blocks `<a download>`, `fetch`, any network, and refuses `.wav`/`.mp3` through the `downloads`
  capability (allowlist), hence the zip fallback in `scripts/preview/`.
