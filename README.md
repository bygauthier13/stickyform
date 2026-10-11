# StickySound

**A form that creates a piece of music as you complete it.**

The visitor fills in a normal, well-designed questionnaire. Behind it, a soundtrack builds from a single ambient texture into a full arrangement — one layer for every few answers — and what they answer changes how it sounds. At the end they hear the complete track they made, and can download it as a WAV.

No backend, no accounts, no external APIs, no build step. Everything — including the synthesis, the mix and the audio export — runs in the browser with the Web Audio API.

```bash
npm start          # → http://localhost:5173
```

Requires Node 18+ only for the tiny static dev server (`scripts/serve.mjs`, zero dependencies). Any static file server works: `python3 -m http.server`, `npx serve`, etc. The app must be served over `http(s)` (ES modules don't load from `file://`).

Works in current Chrome, Edge, Firefox and Safari (desktop and mobile). Without Web Audio the form still works completely; the results screen just can't play the track.

---

## The experience

1. **Landing** – "Create something while you answer." Nothing plays until the visitor clicks **Start the experience**; that click creates the AudioContext.
2. **16 questions** – single choice, multi-select, a binary choice, colour and material cards, three differently-styled sliders, short text, long text. Large editorial type, one question at a time, progress as `07 / 16`, Back / Continue, and `Enter` to continue.
3. **Composing** – while the closing chord of the live music rings, the full track is rendered offline.
4. **"You made this."** – a waveform player (seek, play, restart), a timeline showing when each layer entered, a summary built from the visitor's own answers, and a real **WAV download**.

A persistent **Sound on / off** switch silences everything immediately (and keeps the form fully usable). The preference lasts for the browser session.

### Keyboard

| Key | Action |
| --- | --- |
| `Enter` | Continue (`Shift`+`Enter` for a new line in the long-text question) |
| `1`–`9` / `A`–`J` | Choose that option |
| Arrow keys | Move between options / adjust a slider |
| `Tab` | Standard focus order |

`prefers-reduced-motion` is respected throughout (no travelling points, no pulsing bars, no animated field — the audio is unaffected). Sound is never the only feedback: every audio cue has a visual counterpart, and every control is a real, labelled form element.

---

## How the music works

### One key, one tempo, every layer compatible

Everything is in **D natural minor ≡ F major** (D E F G A B♭ C). Every chord is diatonic to that set, so any combination of layers — and any change of mind mid-form — stays consonant. "Minor" vs "major" moods come from which chord feels like home (Dm vs F) and from chord order, not from changing notes.

### Eight layers, entering with progress

| # | Layer | Enters at | What it is |
| - | ----- | --------- | ---------- |
| 1 | Ambient | 0 % | A–D open-fifth drone, filtered air, sparse glass chimes |
| 2 | Pulse | 15 % | Muted plucked ostinato through a dotted-eighth ping-pong delay |
| 3 | Bass | 30 % | Sub + filtered saw; pattern follows the chosen groove |
| 4 | Rhythm | 45 % | Kick → hats → clap → extras, staged across 45–65 %; sidechain-style pump on the other layers |
| 5 | Harmony | 60 % | Chorused chord pad with voice-leading + FM electric-piano comping |
| 6 | Melody | 75 % | A chord-aware motif, seeded by the visitor's own typed words |
| 7 | Texture | 90 % | Formant "choir", sparkle arpeggio, vinyl / rain / air bed |
| 8 | Resolution | on submit | Riser, lift, and a closing cadence (VI–VII–i, or IV–V–I) |

Layers don't switch on at the instant of a click: they arrive **on the next bar line**, led in by a short riser, so the build always feels intentional. At 50 % and 75 % there is an additional arrival (a soft impact and a harp-like flourish), and the chord progression itself develops at 50 % (one chord swaps for a lift). The master filter opens as progress increases, so the piece literally brightens as it fills out.

The music never regresses if the visitor goes back a question.

### Answers shape the sound

`src/soundmap.js` is the only file that knows both the questionnaire and the audio engine. Each option nudges numeric parameters (energy, brightness, space, tempo, swing…) and casts weighted votes for categorical choices (groove, chord progression, pad timbre, lead timbre, texture).

| Answer | Effect |
| ------ | ------ |
| House · Hip-hop · Pop · Electronic · Ambient · "Something unexpected" | Groove: four-on-the-floor + offbeat bass · half-time boom-bap + 808 + swing · backbeat · 16th-note drive · near-drumless · broken beat |
| Cinematic · Euphoric · Dreamy · Dark · Energetic | Strings & wide reverb · major lift & brighter · long soft pads & space · minor, low filter, velvet pad · faster & harder |
| Pace slider / Energy slider | Tempo (≈ 90–126 BPM), drum intensity, filter brightness |
| Spontaneity slider | Swing, melodic decoration, variation |
| Time of day / atmosphere / destination | Chord progression family, brightness, lead timbre, rain or vinyl texture |
| Colour / visual mood | Warmth, material (kalimba, glass, velvet…), space — and the interface accent colour itself |
| Typed text (teleport + perfect day) | Hashed to choose and seed the melodic motif |

Tempo glides toward its target at ≤ 1.5 BPM per bar, so an answer never jolts the groove.

### UI sound design

Interface sounds are tiny, tonal and drawn from the same pentatonic set as the music, so tapping answers feels like playing the piece rather than triggering effects: each option has its own pitch, sliders ripple through the scale (rate-limited), typing plays notes (see below), "next" is a soft air swish, the final answer is a gentle rising figure.

### Typing is playing

While the music runs, every key you type becomes a note that belongs to it (`src/audio/typing.js`):

* **In time** — it lands on the next sixteenth-note slot of the live bar grid, swing included.
* **In key, in tune with the chord** — chord tones on the beat; between beats, scale tones that don't grate against the chord.
* **In company** — never a semitone or tritone against the melody sounding at that instant; it moves like a melody (mostly steps, no run of one pitch).
* **Repeatable** — the same text plays the same tune. A space or Backspace is a rest.

Levels were set by measurement (notes rendered alone against the mix at each stage): ≈ 6.5 dB under the music early on, ≈ 8 dB under it at the end. `npm test` simulates thousands of keystrokes over every progression, tempo and swing and checks all of this.

---

## School edition (`school.html`)

The same engine, with a parent survey where every second question is for the child. Open `school.html` (optionally `?school=Oakfield%20Prep` to set the school's name).

* **16 questions, strictly parent → child → parent …** The parent's are the school's real survey (satisfaction, a 0–10 recommend scale with no default, communication, priorities, safety, value, two open questions). The child's are playful (animal, colour, superpower, speed, where the song lives, feeling, which sound makes them smile, their name).
* **The child's answers write the song; a critical survey answer never changes it** (`tests/school.test.mjs` proves the same child gets the same song whatever the parent scored). Defaults lean major, bright and a little sparkly.
* **The child's name writes the melody:** each letter is a scale degree, so "Maya" sounds like Maya (`nameMotif` in `theory.js`); it changes as they type.
* **Typing makes music** in the open parent questions and the name field.
* **Download is an MP3** with ID3 tags (title "Maya's Song", artist = the school). It is prepared in the background while the family listens, so the click usually just saves it.
* **Privacy by design:** the reveal shows what the school would receive — the parent's eight answers only; the child's answers and name are used on the device to make the song. This build is a **demo: nothing is sent or stored**.

How it is wired: `src/app.js` is the whole application, driven by a *scenario* (`src/scenarios/stickysound.js`, `src/scenarios/school.js`): questions, how answers become music, wording of the reveal. A new survey is a new scenario file plus a page.

---

## UK Drill edition (`drill.html`)

**BUILD YOUR SOUND** for **BLOCK / 01**, a fictional streetwear label — an independent concept demo of an
interactive brand activation ("Powered by StickySounds"; not an official brand campaign). Ten questions build a UK
drill track at 140 BPM in F minor: the first answer brings in the melody, another the 808, another the drums;
typing plays notes in key; the title becomes a vocal-chop signature and goes on a personalised cover. At the end the
57-second arrangement (intro, build, main, breakdown, main, ending) plays and downloads as a WAV.

* Its own engine (`src/drill/`): one AudioContext created on *Start with sound*, one transport on the audio clock,
  a pure composer shared by the live music and the offline render, an asset manifest
  (`assets/drill/manifest.json`) that lets recorded samples or the owner's own stems replace any built-in sound.
* Sounds: CC0 piano, recorder, glockenspiel and claps from the Versilian Community Sample Library; everything else
  (drums, 808, pads, the synthetic vocal chops) is synthesised in the browser — see `assets/drill/PROVENANCE.md`.
* Fair by design: the "would you explore this collection?" answer only picks one of three equally loud transitions.
* Full documentation, the stem-replacement procedure and the listening/demo checklists: [`docs/drill-edition.md`](docs/drill-edition.md).

---

## Download = the real track

Pressing **Download** saves a 16-bit / 44.1 kHz stereo **WAV** (`src/audio/wav.js`) of the exact arrangement shown on screen — about two minutes: the eight layers entering in order, a breakdown, a drop, and a closing cadence that fades into the reverb tail. It is *not* a recording: the same `Composer` that plays live is run through an `OfflineAudioContext`, then mastered to ≈ −14 dBFS RMS with a soft-knee ceiling.

The file carries RIFF metadata (title, tempo and key). Scenarios can ask for **MP3** instead (`src/audio/mp3.js`: 128 kbps with ID3v2.3 tags, encoded in the browser in short slices so the page stays smooth). The encoder is [lamejs](https://github.com/zhuker/lamejs) (LGPL-3.0, a JavaScript port of LAME), shipped unmodified as its own file in `assets/vendor/lamejs/` and loaded only when a track exists; if it ever fails, the WAV is offered instead.

---

## Code map

```
index.html              StickySound
school.html             StickySound for schools (parent survey + a song for the child)
drill.html              UK Drill edition — BUILD YOUR SOUND (BLOCK / 01), see docs/drill-edition.md
assets/                 bundled fonts (Instrument Serif, Inter — SIL OFL), favicon, vendor/lamejs (MP3, LGPL)
scripts/serve.mjs       zero-dependency static dev server
scripts/samples/        sample-library tools (see docs/sample-library.md)
src/
  app.js                the application: screens, form, audio, reveal — driven by a scenario
  main.js / school.js   entry points (pick a scenario)
  scenarios/            stickysound.js · school.js (questions, sound map, wording)
  soundmap.js           answers → musical profile (a configurable builder)
  audio/                ← independent of the form and the DOM; reusable as an SDK
    audioEngine.js      live engine: scheduler, progress → layers, mute, finale, player
    composer.js         per-bar composition (shared by live + offline render)
    musicLayers.js      the eight layer generators
    synth.js            voices: pads, FM piano, bass, bells, leads, risers …
    drumBank.js         drum hits pre-rendered once, played as cheap buffer sources
    fx.js               mixer: buses, sidechain ducking, hall reverb, ping-pong delay, master chain
    theory.js           key, chords, progressions, voice-leading, motifs, clash-avoidance
    render.js           offline arrangement + mastering → AudioBuffer
    wav.js              WAV encoder
    mp3.js              MP3 encoder wrapper + ID3 tags
    typing.js           typed keys → notes in time, in key, in tune with the chord
    soundEffects.js     UI sounds
    trackPlayer.js      playback of the rendered track
  form/                 questions.js (data) · formEngine.js (state & navigation)
  components/           choice · cards · scale · slider · text · field (audio-reactive lines) · results
  styles/               base · landing · form · results · school · drill
  drill/                the UK Drill edition (self-contained):
    surveyConfig.js     the ten questions (musical job + brand insight)
    answerToMusicMapper.js · musicalState.js   answers → plain musical state
    theory.js · patterns.js · composer.js      F minor, drill patterns, per-bar composition (pure)
    interaction.js      hover / selection / typing notes · analyticsAdapter.js  local events
    audio/              audioEngine (live) · trackRenderer (offline + WAV) · instruments · mixer ·
                        assetManifest (samples, stems, fallbacks) · dsp (synthesised sounds)
    ui/                 questions · studio (layers + step grid) · cover · results · art
tests/                  npm test: theory, samples, typing, mp3, school · e2e.cjs, e2e-school.cjs (Playwright)
```

### Using the audio engine on its own

```js
import { AudioEngine } from './src/audio/audioEngine.js';
import { buildProfile } from './src/soundmap.js';   // or build your own profile object

const engine = new AudioEngine();
button.onclick = async () => {          // must be inside a user gesture
  await engine.init();
  engine.start(buildProfile({}));
  engine.setProgress(0.4);              // 0–1 — layers arrive on the next bar
  engine.setProfile(buildProfile({ q7: 'house' }));
  engine.cue('select', 2);              // UI sound
  await engine.finale();                // lift + closing cadence
  const { buffer } = await engine.renderTrack(profile);   // downloadable audio
};
```

A *profile* is a plain object (`tempo`, `energy`, `bright`, `space`, `groove`, `prog`, `pad`, `lead`, `texture`, `motif`, `seed` …); see `src/soundmap.js`.

---

## Testing

```bash
npm test            # music-theory checks (every chord diatonic, voicings in range and voice-led,
                    # no melody note clashes with its chord, profile mapping), the typing
                    # instrument on thousands of simulated keystrokes, MP3 frames and tags,
                    # the school survey's questions, sound map and name hook, the sample parser,
                    # and the drill edition (every composed note in F minor, Q9 neutrality, typing,
                    # mapping, text handling, WAV, analytics, asset manifest and provenance)
```

`npm run test:e2e:drill` drives the UK Drill edition (consent before any AudioContext, both journeys, layers entering on the bar, notes in key, no stacked loops, mute/pause/background tab, WAV validity, sample fallback, stems, phone layout, reduced motion). `npm run test:e2e` (StickySound) and `npm run test:e2e:school` (school edition, including a frame-by-frame check of the downloaded MP3) need Playwright and a Chromium (`npm i -D playwright && npx playwright install chromium`). It drives the whole app — keyboard flow, Back, the multi-select limit, sound switch and its session persistence, mobile layout, reduced motion, a second run after "Start over", and strict validation of the downloaded WAV.

The audio itself was verified by rendering offline and analysing the result — per-layer solo balance, spectral distribution, loudness curve across the arrangement, WAV validity (`ffprobe`/`ffmpeg`), and in-key energy — and the full journey was driven end to end in headless Chromium at desktop and phone sizes.

## Notes & limits

* StickySound exports WAV; the school edition exports MP3 (LGPL encoder shipped as a separate file, with attribution to LAME).
* Rendering the final track happens in the browser and is CPU-bound. It took ≈ 35 s in the slow, shared VM used for development (a 2-minute track at 44.1 kHz), and is expected to be considerably faster on current laptops and phones. The composing screen reports real progress, the live closing cadence covers the first ~8 s, and a reassurance message appears if it runs long.
* On iOS the ringer switch no longer mutes Web Audio (`navigator.audioSession` is set to `playback`).
* Fonts are bundled locally, so the page needs no network at all once served.
