# BUILD YOUR SOUND — the UK Drill edition (`drill.html`)

A concept demo for a **fictional** streetwear label, **BLOCK / 01**: ten questions build a UK drill track while
people answer them; at the end they play it and download it as a WAV. "Powered by StickySounds". It is an
independent concept demo — not an official brand campaign, not commissioned, no real brand or client assets.

```sh
npm start                 # → http://localhost:5173/drill.html   (?debug exposes window.blockDemo)
npm test                  # pure checks, including tests/drill.test.mjs (~911,000 checks, < 1 s)
npm run test:e2e:drill    # the whole journey in headless Chromium (18 checks, ~70 s)
```

The other editions (`index.html`, `school.html`) are untouched; the drill edition only reuses shared helpers
(`src/audio/fx.js` buses and reverb, `src/audio/wav.js`, `src/audio/trackPlayer.js`, `src/components/dom.js`).

---

## The journey

1. **Landing** — *BUILD YOUR SOUND · 10 answers. Your own drill soundtrack.* Two buttons: **Start with sound**
   (that click creates the AudioContext — nothing plays before) and **Continue without sound**. A status line says
   whether the sounds are loading, ready, or partly replaced by synthesis.
2. **Ten questions**, one at a time, `03 / 10` progress, the key and tempo (`F MIN · 140 BPM`) in the top bar,
   play/pause and mute always there. A *studio* panel shows the five layers (atmosphere, melody, bass, drums,
   vocals) with their state (off · next bar · on) and the sixteen steps of the bar that is playing — the lit blocks
   are the notes the engine actually scheduled, flashed on the audio clock.
3. **Results** — a cover in the chosen colourway with the title and the track's own pattern, *Your soundtrack is
   ready.*, a player (play/pause, seek, waveform, section markers), **Download WAV**, **Start again**, what each
   answer did, and credits.

| # | Question | Type | Musical job (when it is heard) | Brand insight (aggregate) |
| - | -------- | ---- | ------------------------------ | ------------------------- |
| 1 | What defines your style? | choice | Main melody: Minimal = glass bells, Bold = dark piano riff, Technical = pluck arpeggio, Vintage = recorder line. Enters on the next bar after Continue. | style segment |
| 2 | Pick your colour. | colour cards (named) | Secondary texture (tape dust, frost shimmer, cold pulse, acid blips) and the interface accent. | colourway preference |
| 3 | Where do you wear your style? | choice | 808 pattern (classic slide, low & sparse, bounce, octave slides). Enters on the next bar. | usage occasion |
| 4 | Which piece catches your eye? | product cards (line art) | Main drum pattern (classic, laid-back bounce, tight/technical, heavy stomp). Enters on the next bar. | product interest |
| 5 | Describe your energy in three words. | text ≤ 60, skippable | Typing plays plucks in key; validated text becomes a short motif (letters → scale degrees). Skip → default motif. | not collected |
| 6 | Choose your pace. | choice | Hat and percussion density, rolls. **Same 140 BPM** — intensity comes from the arrangement. | energy preference |
| 7 | What matters most in a drop? | choice | Second voice in the melody's gaps: string stabs, soft piano counter-line, choir swells, high bell answers. | drop priorities |
| 8 | Give your track a title. | text ≤ 32, skippable | Typing plays vocal chops; the title becomes a 3–4-note chop signature; it goes on the cover and the file name. | not collected |
| 9 | Would you explore this collection? | choice | Transition style only (lift / sweep / stutter). **Strictly neutral**: same events, same loudness, same accent sound for every answer, and the answer does not even change the humanisation seed (tested). | stated purchase intent |
| 10 | How should your track finish? | choice | Ending: clean hard stop, atmospheric fade, high-energy last hit. Played live, then the results. | taste signal |

The mappings are art direction, not a personality reading; the results screen says so.

---

## The music

- **Key and tempo:** F natural minor (F G Ab Bb C Db Eb), 140 BPM, 4/4, half-time feel (snare on beat three).
  Loop: Fm7 · Fm7 · Dbmaj7 · Cm7 (the dark b6 → v fall pulls back home). Every tonal note is in the scale —
  `npm test` composes ~190 answer combinations through the whole track and the live loop and checks ~132,000 notes,
  plus every hover, selection and typed note. Glides travel between two scale notes. Drums are not tuned (the
  percussion blip is pitched to C, the fifth).
- **Drill vocabulary:** 3-3-2 "skippy" hats with triplet and 32nd rolls, counter-snares, 808 slides (a slide that
  follows on from the previous note bends the same voice — no new attack, like a producer's slide), short kicks
  that duck the 808 (sidechain), the Db → C semitone in the melodies, sparse motifs with space.
- **Starts simple:** the atmosphere (pad + room tone) alone, louder at first and receding as layers arrive.
- **Entrances:** a validated answer is heard from the next bar line (≤ 1.7 s). Feedback is immediate: the studio
  row says *Next bar*, a chip announces "+ 808 bass · next bar", and a swell starts on the next sixteenth and lands
  on the bar line, with the transition hits in the last beat.
- **The download** (`src/drill/composer.js` `ARRANGEMENT`): intro 4 bars (atmosphere, then the melody through an
  opening filter) · build 4 (808, drums arriving in stages, the motif featured) · main 8 · breakdown 4 (drums and 808
  out, vocals and motif forward) · main 8 · outro 4 (the chosen ending). 32 bars + tail = **57.5 s**, a fill before
  every section.

## Architecture

```
SurveyConfig (surveyConfig.js)          the ten questions: wording, options, musical job, brand insight
      │ answers (question id → option id / text), validated ids
      ▼
AnswerToMusicMapper (answerToMusicMapper.js)   pure: answers → MusicalState; free text → motifs, never stored
      ▼
MusicalState (musicalState.js)          plain object: active layers, variations, motifs, seed — no answers
      ├──► composer.js  composeBar(state, bar, section) → events   (pure, deterministic, tested)
      │       ├──► AudioEngine (audio/audioEngine.js)      live: one AudioContext, one transport
      │       └──► TrackRenderer (audio/trackRenderer.js)  OfflineAudioContext → mastering → WAV
      │                 both play events through the same Instruments (audio/instruments.js)
      │                 and the same mix (audio/mixer.js), with the same AssetBank
      └──► ui/cover.js (the cover pattern), ui/studio.js (the step grid)
AssetManifest (audio/assetManifest.js + assets/drill/manifest.json)  which sound plays each instrument
interaction.js        hover / selection / typing → notes (pure planning, quantised by the engine)
analyticsAdapter.js   structured local events, pluggable sink
app.js                the only file that knows the DOM, the survey and the engine
```

- **One transport.** Bars are composed ~0.3 s before they start and scheduled on the audio clock; a 25 ms timer only
  wakes the scheduler. Answers change the state; the next composed bar reflects it. Navigation never starts a new
  loop (tested: one timer, the same number of bars per second after going back and forth).
- **Pause** suspends the context (everything stops in place); **mute** closes a gate but keeps time; a hidden tab
  pauses and resumes on return; an interrupted context (iOS) is revived on the next touch.
- **Limits:** interface sounds are limited per gesture (≤ 3 hover, ≤ 4 selection, ≤ 6 typing gestures ringing),
  hover ≥ 90 ms apart, typing ≤ 8 notes/s and one per sixteenth, a paste plays at most three notes.
- **Levels:** set by rendering each part alone and measuring K-weighted loudness against the melody (808 −1 dB,
  snare −1, kick −4, hats −8, second voice −7, pad −10 …). Live mix ≈ −18.6 LUFS at full arrangement with peaks
  around −4.7 dBFS; a safety limiter (−2 dB) sits last. The download is mastered to ≈ −13 dBFS RMS in the loud
  sections with a soft ceiling at −1 dBFS (measured peaks −1.6 to −2.1 dBFS, no clipped samples).
- **Export:** 16-bit / 44.1 kHz stereo WAV with RIFF INFO tags (title, a plain description). One render at a time,
  progress shown, a 65 s hard limit, a clear error with *Try again* if the browser can't render, object URLs revoked
  on the next export and on *Start again*. The player plays the very buffer that is downloaded.

## Interactions

- **Hover** (mouse only — never on touch, never on keyboard focus): the first time a card is hovered, one short
  note from that option's own instrument, fitted to the chord sounding, on the next sixteenth.
- **Selection:** a short accent that previews what the option adds (three notes of the melody, an 808 slide, a
  drum figure, a hat roll …). For Q9 the accent is identical for every option.
- **Typing (Q5, Q8):** each added character plays one note on the next free sixteenth: on a beat the nearest chord
  tone, between beats a scale tone that doesn't rub. Characters always map to the same scale degree. Deletions,
  arrows, Tab, Shift … are silent; IME composition counts growth only; a paste is a three-note phrase.

## Privacy, accessibility

- No email, no account, no network calls besides loading the page's own files, no external tracking, no LLM, no
  storage. Free text never leaves the device and is never logged (analytics carry ids only; tested). User text is
  displayed with `textContent` only; file names are reduced to printable ASCII.
- Real radio inputs and a real text input; full keyboard flow (Tab, arrows, `1`–`4`, Enter, Skip button); visible
  focus; colours have names; the journey and the download work without sound; `prefers-reduced-motion` turns off
  transitions and the moving playhead; no autoplay on arrival; audio state announced in a live region.
- Not audited: no formal accessibility or legal compliance audit was carried out.

## Analytics

`createAnalytics()` (`src/drill/analyticsAdapter.js`) records `experience_opened`, `audio_enabled`,
`survey_started`, `question_viewed`, `answer_submitted`, `survey_completed`, `export_started`, `export_completed`,
`export_failed` in memory, with question and option ids only (properties outside an allow-list are dropped,
duplicates are removed with `onceKey`). Nothing is sent. To connect a tool later (after consent):
`analytics.setSink((event) => yourTool.track(event.name, event))` in `src/drill/app.js`. `?debug` prints events
to the console and exposes them as `blockDemo.analytics.events()`.

---

## Replacing the sounds with your own

Everything audible is declared in **`assets/drill/manifest.json`**. Paths are relative to that file. Any entry
that fails to load (missing file, wrong format, wrong tempo or key) is reported on the landing page and in the
console, and its synthesised fallback plays instead — the survey never breaks.

### 1 · One-shots (drums) — replace a sound

```json
"snare": { "kind": "oneshot", "synth": "snare", "gain": 1,
           "samples": [ { "src": "samples/mine/snare-1.wav" }, { "src": "samples/mine/snare-2.wav" } ],
           "provenance": "my-drums" }
```
Several samples rotate (round robin). Keep the attack at the very start of the file. Instruments: `kick snare
clap hat ohat crash rim perc shaker`.

### 2 · The 808 — one tuned sample

```json
"808": { "kind": "tonal", "synth": "808", "rootMidi": 29, "samples": [ { "src": "samples/mine/808-F1.wav" } ] }
```
`rootMidi` is the note the sample was recorded at (29 = F1). Use a long sample (≥ 3 s): notes and glides are
made by changing its playback rate, like in a sampler.

### 3 · Melodic instruments — multisamples

```json
"piano": { "kind": "multisample", "synth": "keys", "release": 0.35,
           "zones": [ { "src": "samples/mine/keys-53.wav", "midi": 53, "tuneCents": 0 }, … ] }
```
One file per note every two or three semitones is plenty; the nearest zone is transposed. `tuneCents` corrects a
sample that is slightly sharp (+) or flat (−). Instruments: `piano flute glock pluck bell pulse acid`.
Vocal chops: `"vox": { "kind": "vowels", "zones": [ { "src": …, "midi": 65, "vowel": "ah" }, … ] }` with the vowels
`ah oh oo eh`.

### 4 · Stems — replace a whole pattern with your own loop

```json
"stems": {
  "melody/minimal": { "src": "stems/melody-minimal.wav", "bpm": 140, "key": "F minor", "bars": 4, "gain": 0.8, "provenance": "my-stems" }
}
```
Keys (`src/drill/composer.js` → `STEM_SLOTS`): `atmosphere/base` (pad + room tone), `texture/<tape|frost|pulse|acid>`,
`melody/<minimal|bold|technical|vintage>`, `counter/<stabs|keys|choir|bells>`, `bass/<everyday|afterdark|onthemove|events>`,
`drums/<hoodie|tee|jacket|cargo>` or, per pace, `drums/<pattern>/<laidback|balanced|high>`.
A stem replaces only that variation's pattern; everything else (the other layers, the motifs from text, the vocal
chop signature, transitions, typing) keeps working. The live engine and the download play it bar by bar, aligned
on the four-bar loop, with seamless joins.

Stem rules (checked when loading — a stem that breaks them is refused, never played out of key):
- exactly **140 BPM** and in **F minor** (`"key": "F minor"`), WAV (16/24-bit, 44.1 or 48 kHz) or any format every
  target browser decodes;
- `bars` = 1–32 and the file is at least that long; bar 1 of the file is bar 1 of the loop (the Fm7 bar of
  Fm7 · Fm7 · Dbmaj7 · Cm7 for 4-bar loops), no silence before the downbeat;
- leave headroom (peaks around −6 dBFS) and set `gain` so the stem sits like the part it replaces;
- add a `provenance` entry (name, author, source, licence, modifications, restrictions).

Then: `npm test` (checks the manifest and that every file exists), open `drill.html?debug`, look at the landing
status line, answer the question that selects that variation, and listen; `blockDemo.bank.report` lists what
loaded, fell back or was refused.

---

## What was checked (and how)

- `npm test`: ten questions, wording and options; every chord, pattern and composed note in F minor; text motifs on
  chord tones on the beat; Q9 neutrality; mapping rules (selection vs validation, nothing regresses); sanitising and
  file names; typing (rate limit, slots, paste, deletion, IME); the final bar on F minor; arrangement length;
  synthesis (finite, ≤ full scale, 808 tuned to F1); mastering ceiling; WAV header; analytics; manifest and
  provenance; stems.
- `npm run test:e2e:drill` (headless Chromium): no AudioContext before consent; silent keyboard journey; the WAV
  (RIFF/PCM, 2 ch, 44.1 kHz, 16-bit, 45–60 s, peak < 0 dBFS, not silent, ASCII file name with the title); analytics;
  layers entering on the bar; hover/selection/typing notes; paste/delete; back and change without stacked loops;
  mute, pause, background tab; autoplay after the ending; Start again; missing samples → synthesis; a manifest stem
  replacing its pattern and a wrong-tempo stem refused; phone layout (no sideways scroll, Continue on screen on a
  question taller than the screen); reduced motion; no console errors.
- Audio, measured on offline renders (Python/numpy): loudness per bar, K-weighted loudness of every part in solo,
  band balance, chroma (the seven strongest pitch classes are F minor's), equal loudness of the three Q9 fills
  (−25.05 / −25.12 / −25.15 LUFS), seamless loop joins, 808 glide pitch tracks (43.8 Hz → 87.5 Hz without a new attack).

## Limits

- **Nobody has listened to it yet.** All tuning was done by measurement. The owner's ears are the real gate (see
  the listening checklist below).
- Tested in headless Chromium only. Safari (macOS/iOS), Firefox and real phones were not tested. Rendering took
  ~8 s in this sandbox for 57 s of audio; older phones will take longer (progress is shown).
- The vocal chops are synthetic (formant synthesis); with recorded vowels in the manifest they will sound more
  human. The piano, recorder, glockenspiel and claps are CC0 recordings; everything else is synthesised.
- The same answers always give the same track, and many people will share the same choices: the track is
  personal, not unique. The texts make the motif and chop signature differ.
- Stems must be 140 BPM in F minor; the edition has one key and one tempo by design.
- The page loads ~3.4 MB of samples (in the background while the landing page is read).

## Listening checklist (with headphones, then a phone speaker)

1. Start with sound: is the pad alone pleasant and loud enough, not muddy?
2. Q1 → each melody: in time, in key, not too busy? Glockenspiel/recorder/piano believable?
3. Q3 → the 808: felt on headphones, *audible* on a phone speaker, slides smooth, no rumble or distortion?
4. Q4 → drums: does it read as UK drill (half-time snare, skippy hats)? Kick and 808 not fighting?
5. Q5/Q8 typing: do the notes feel musical and responsive (≤ ~0.1 s), not annoying?
6. Q7 second voice: under the melody, not covering it? The choir and the vocal chops: acceptable or "robotic"?
7. The three transitions (Q9): equally good to your ear?
8. Results: does the track build (intro → build → main → breakdown → main → ending)? Any click, harsh frequency,
   level jump between the live music and the player?
9. Download the WAV and play it in another player: same as in the page?

## Filming a demo (under a minute)

1. Fresh browser window, sound on, headphones or good speakers, phone on silent; zoom 100 %; close other tabs.
2. Open `drill.html` (not `?debug`), wait for **Sounds ready**.
3. Start with sound → let the pad play two seconds.
4. Q1 Bold (hover the cards first: each has a note) → Continue: the piano enters on the bar.
5. Q2 Acid Lime (the page turns lime) → Q3 At Events (808 slides) → Q4 Hoodie (the drums land).
6. Q5 type slowly "cold sharp focused" — the notes are in key; Continue.
7. Q6 High Energy (hats get dense, same tempo) → Q7 Design (stabs) → Q8 type a title → Q9 any → Q10 High Energy.
8. Let the ending land and the track start; point at the cover with the title and the pattern; press Download WAV.
9. Show "How your answers built it". Mention: independent concept demo, fictional brand, nothing collected.
