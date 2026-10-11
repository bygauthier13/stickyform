# Architecture and numbers

## Music (src/audio/)

- **Key:** D natural minor ≡ F major (D E F G A Bb C). Chords are all diatonic (`CHORDS` in `theory.js`: Dm7/9, Gm7/9,
  Am7, Bbmaj7/9, Fmaj7/9, Cadd9). Six four-bar progressions (`reverie, midnight, noir, cinematic` minor;
  `euphoria, goldenHour` major), each with an `alt` variant used from 50% progress. Closing cadences: minor
  Bbmaj9–Cadd9–Dm9–Dm9, major Bbmaj9–Cadd9–Fmaj9–Fmaj9. Pad voicings are voice-led (`padVoicing`).
- **Eight layers** (`musicLayers.js`), entering at progress `LAYER_ENTER = [0,.15,.30,.45,.60,.75,.90,1]`:
  0 Ambient · 1 Pulse · 2 Bass · 3 Rhythm (kick → hats → clap, staged) · 4 Harmony · 5 Melody · 6 Texture ·
  7 Resolution (risers, finale). New layers land on the next bar line, led by a riser, with an "arrival emphasis"
  (up to +70% gain settling over 0.3 progress) and a receding ambient drone so each entrance is heard.
- **Per-layer trims** (`composer.js`, set from solo renders): `LAYER_TRIM = [1.56, 4.5, 0.16, 0.97, 1.58, 1.72, 0.4, 0.8]`;
  drums use `PERC = 4.7`. A breakdown multiplies levels by 0.6.
- **Melody:** two-bar chord-relative motifs (`MOTIFS`, degrees over the *current chord's root*), placed by register
  centre with melodic voice-leading (`melodyPitch`), clashes nudged by `settleNote`. `profile.customMotif` (a hook
  spelled from a name) overrides the chosen motif.
- **Mixer** (`fx.js`): buses with sidechain-style ducking; hall reverb from a procedural impulse response; tempo-synced
  ping-pong delay; chorus; tone low-pass that opens with progress; soft saturation; presence +2 dB @ 3.2 kHz; air
  shelf +1.4 dB @ 8.5 kHz; **safety limiter only** (threshold −1.5 dB); master gain 0.34. No glue compressor: Chrome's
  compressors add hidden make-up gain. **`Bus` level defaults to 0** — pass `level: 1` (or call `setLevel`).
- **Drums** are pre-rendered once into AudioBuffers (`drumBank.js`) and played as buffer sources.
- **Live loudness:** `liveGain(p) = db(4·(1−p))·0.62` (intro lifted, full arrangement held back). UI sounds go through
  `SoundEffects.out.gain = 4.5` (calibrated: a selection ≈ −25 dBFS peak).

## Scheduler (audioEngine.js)

40 ms timer, 0.7 s lookahead (2.4 s when the tab is hidden). `start()` must follow `init()` inside a user gesture
(`resume()` is requested synchronously for iOS). Tempo glides ≤ 1.5 BPM per bar toward `profile.tempo` (90–126).
`setProgress(p)` never regresses; the finale is a lift bar + 4-bar cadence (`finaleInfo`). The Composer keeps a
`timeline` of the last 8 scheduled bars (time, chord, swing, melody notes) — the typing instrument plays against it.

## Offline render (render.js)

Same `Composer`, `buildPlan()` = 52 bars: 4+4+4 (ambient, +pulse, +bass), 12–15 staged drums, 16–19 harmony, 20–23
melody, 24–31 full, 32–35 breakdown (35 = lift), 36–46 peak (drop at 36), 47 lift, 48–51 resolve. Duration =
0.12 + 52 bars + 6.5 s tail (≈ 1:45–2:25 by tempo). Scheduling every note up front made renders crawl, so bars are
scheduled **two at a time inside `ctx.suspend()` callbacks** (it also gives progress). `master()`: target −14 dBFS RMS
at the 85th-percentile one-second window, soft-knee ceiling −1.2 dBFS, 12 ms fade-in, 50 ms fade-out.
Render took ≈ 35–45 s in the slow sandbox VM; real devices are unmeasured.

## Profile (soundmap.js)

`makeProfileBuilder({ map, base, votes, sliders, words, motifPool, customMotif })` → `buildProfile(answers)`.
Options contribute **numeric nudges** (energy, bright, space, tempo, swing, drive, density, variation, sparkle, duck)
and **weighted votes** (`groove`: house/pop/hiphop/electro/ambient/broken; `prog`; `pad`: warm/strings/glass/dream/velvet;
`lead`: glass/pluck/felt/kalimba; `texture`: air/rain/vinyl). Typed words are hashed to choose and seed a motif.
The engine only ever sees the resulting plain object.

## Typing instrument (typing.js)

`TypingPlanner` (pure: slot + note) and `TypingInstrument` (plays through `S.lead` on its own bus). Slot = next free
sixteenth ≥ 30 ms ahead and ≤ 360 ms (swing included); a key with no free slot is skipped. Note = chord tone on beats,
non-clashing scale tone between beats; avoid ic 1 and 6 against sounding melody notes; weighted toward steps, never three
equal pitches in a row; seeded by the character (same text → same tune). **Levels (measured by rendering the notes
alone against the live mix):** ≈ −6.5 dB under the music early and mid, ≈ −8 dB at the end (`stageGain`: −4.5 dB at
p=0, 0 dB at p=0.4, +1.7 dB at p≥0.86; `KIND_TRIM` per timbre). Do **not** measure with an A/B render difference at high
progress: the synths use `Math.random()` so two renders differ by noise. `engine.typed(char)` falls back to the old
quiet tick when the music isn't running.

## Name hook (theory.js `nameMotif`)

Each letter has a fixed degree (`LETTER_DEGREE`; vowels are distinct chord tones), eight notes on a long-short-short-long
twice rhythm, octave nearest the previous note, phrase ends (notes 4 and 8) snapped to chord tones. 49 common names → no
duplicate hooks. Case and accents ignored; fewer than two letters → `null`.

## MP3 and WAV

`wav.js`: 16-bit with TPDF dither; the RIFF `LIST` chunk must come **before** `data`. `mp3.js`: lamejs, 128 kbps,
encoded in ~10 ms slices, ID3v2.3 (ISO-8859-1 or UTF-16 for non-ASCII). Downloads use ASCII-only filenames (some
browsers drop the name otherwise). The reveal prepares the file in the background 1.8 s after mounting; if MP3 encoding
throws it offers the WAV.

## App and scenarios

`createApp(scenario)` needs: `questions`, `buildProfile`, `summarise`, `labelOf`, `optionOf`, `soundKey`, `finalLabel`,
`phrases`; optional `accent`, `layerNames`, `audience(q)`, `results(ctx)`. `results` returns the reveal's `copy`:
`eyebrow, titleWords, sub, deckLabel, summaryLabel, wordsLead, pressPlay, footer, extra, format ('wav'|'mp3'), filename,
tags`. Question types: `single multi binary swatch mood emoji scale slider text textarea`. FormEngine sliders start
answered at their default; the `scale` has no default. The page's markup (`index.html`, `school.html`) holds the landing
and composing copy. A new survey = a scenario file + a page + an entry script.

## UI

CSS tokens in `base.css`; Instrument Serif + Inter bundled as woff2 (SIL OFL). The accent re-tints when a colour is
chosen (`@property --accent`). Eight hairlines (`field.js`) are audio-reactive via per-layer analysers. `prefers-reduced-motion`
respected; real radio/checkbox inputs; Enter/1–9/A–J keys. On phones the action bar is `position: fixed` — it only works
if no ancestor keeps a `transform` (see lessons).
