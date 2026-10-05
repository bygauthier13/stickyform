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

Interface sounds are tiny, tonal and drawn from the same pentatonic set as the music, so tapping answers feels like playing the piece rather than triggering effects: each option has its own pitch, sliders ripple through the scale (rate-limited), typing is a barely-there tick, "next" is a soft air swish, the final answer is a gentle rising figure.

---

## Download = the real track

Pressing **Download** saves a 16-bit / 44.1 kHz stereo **WAV** (`src/audio/wav.js`) of the exact arrangement shown on screen — about two minutes: the eight layers entering in order, a breakdown, a drop, and a closing cadence that fades into the reverb tail. It is *not* a recording: the same `Composer` that plays live is run through an `OfflineAudioContext`, then mastered to ≈ −14 dBFS RMS with a soft-knee ceiling.

The file carries RIFF metadata (title, tempo and key).

---

## Code map

```
index.html
assets/                 bundled fonts (Instrument Serif, Inter — SIL OFL) + favicon
scripts/serve.mjs       zero-dependency static dev server
src/
  main.js               wiring: screens, form, audio, reveal (only file that joins them)
  soundmap.js           answers → musical profile (+ results summary)
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
    soundEffects.js     UI sounds
    trackPlayer.js      playback of the rendered track
  form/                 questions.js (data) · formEngine.js (state & navigation)
  components/           choice · cards · slider · text · field (audio-reactive lines) · results
  styles/               base · landing · form · results
tests/                  theory.test.mjs (npm test) · e2e/ (Playwright)
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
npm test            # music-theory checks: every chord diatonic, voicings in range and
                    # voice-led, no melody note clashes with its chord, profile mapping
```

The audio itself was verified by rendering offline and analysing the result — per-layer solo balance, spectral distribution, loudness curve across the arrangement, WAV validity (`ffprobe`/`ffmpeg`), and in-key energy — and the full journey was driven end to end in headless Chromium at desktop and phone sizes.

## Notes & limits

* Audio export is WAV only (no MP3 encoder is bundled to keep the project dependency-free).
* Rendering the final track takes a few seconds on a modern laptop (longer on slow devices); the composing screen reports real progress, and the live closing cadence masks most of the wait.
* On iOS the ringer switch no longer mutes Web Audio (`navigator.audioSession` is set to `playback`).
* Fonts are bundled locally, so the page needs no network at all once served.
