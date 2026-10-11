# Sound provenance — UK Drill edition (`drill.html`)

Every sound in the drill edition is either **synthesised in the browser by this repository's code** or a
**CC0 recording** from the Versilian Community Sample Library. Nothing comes from commercial tracks, sample packs,
artist acapellas or voice cloning. The machine-readable version of this file is the `provenance` section of
[`manifest.json`](manifest.json); the test suite checks that every instrument points to an entry and that every
listed file exists.

## Recorded samples (CC0)

| Asset | Files | Author | Source | Licence | Modifications | Restrictions |
| --- | --- | --- | --- | --- | --- | --- |
| Upright piano (soft) — 11 notes, F3–A5 | `samples/piano/piano-<midi>.wav` | Versilian Studios LLC (VCSL); sampled by Simon Dalzell of Ivy Audio for the VSCO 2 Pro set, per the library's `Info.txt` | [VCSL › Upright Piano, Knight › Sustains](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains) (velocity layer 1) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | mono · 32 kHz (SoX resampler) · trimmed to the onset · 2.2 s with a 0.55 s raised-cosine fade · loudness-matched across notes · peak −1 dBFS · 16-bit TPDF dither · renamed by measured MIDI note | none (CC0); no endorsement implied |
| Baroque alto recorder (sustain, vibrato) — 8 notes, F4–C6 | `samples/flute/flute-<midi>.wav` | Versilian Studios LLC (VCSL) | [VCSL › Baroque Alto Recorder › SusVib](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Aerophones/Edge-blown%20Aerophones/Baroque%20Alto%20Recorder/SusVib) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | mono · 32 kHz · trimmed 6 ms before the onset · 2.0 s with a 0.45 s fade · loudness-matched · peak −1 dBFS · 16-bit · renamed by measured note | none (CC0); no endorsement implied |
| Glockenspiel (soft mallets) — 4 notes, G5–C7 sounding | `samples/glock/glock-<midi>.wav` | Versilian Studios LLC (VCSL) | [VCSL › Glockenspiel](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Glockenspiel) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | mono · trimmed · 1.8 s with a 0.6 s fade · loudness-matched · peak −1 dBFS · 16-bit; the measured +8 to +16 cent offset is corrected at playback (`tuneCents`) | none (CC0); no endorsement implied |
| Hand clap — 2 velocities | `samples/clap/clap-1.wav`, `clap-2.wav` | Versilian Studios LLC (VCSL) | [VCSL › Claps](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Claps) (`SoloClap_vl3`, `SoloClap_vl4`) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | mono · trimmed to the onset · 0.34 s with a 0.12 s fade · peak −1 dBFS · 16-bit; layered under the synthesised snare | none (CC0); no endorsement implied |

How the licence was verified: the repository's `LICENSE` file is the CC0 1.0 Universal legal code, and its README
states "you can do whatever you want with these sounds (even make commercial software), no royalties, no credit,
no special terms" (commit `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`, January 2026). Files were fetched from
GitHub's public raw file endpoint — no login, API key or paywall involved. CC0 waives the authors' rights; it does
not imply that Versilian Studios endorses this demo.

Pitch: the library's file names are one octave below scientific pitch (`F2` is MIDI 53). Every file was measured
(YIN / FFT) and renamed by its real note; the residual offset is stored per zone as `tuneCents`.

## Synthesised in the browser (no recorded material)

Generated at runtime by [`src/drill/audio/dsp.js`](../../src/drill/audio/dsp.js) (sample arrays) and
[`src/drill/audio/instruments.js`](../../src/drill/audio/instruments.js) (pad and choir voices):
kick, snare, synthetic clap fallback, closed and open hi-hats (six-square metallic recipe), crash, rim, percussion
blip, shaker, the 808 (rendered at F1 and transposed with glides), pluck, FM bell, dark-keys and flute fallbacks,
cold pulse, acid blip, string stabs, the vocal chops, risers, reverse cymbal, vocal swell, impact, and the three
looping beds (room tone, tape dust with an F/C drone, air).

**The vocal chops are formant synthesis**, not a recorded or cloned voice: a glottal-like sawtooth through four
vowel formants (ah, oh, oo, eh), a small scoop into the note and light vibrato. They must not be presented as a
recorded human voice. The user's text is never sung, spoken or sent to a voice service — its letters only choose
notes and abstract vowels.

## Third-party code

None added. The drill edition uses the repository's existing modules (`src/audio/fx.js`, `src/audio/wav.js`,
`src/audio/trackPlayer.js`, `src/components/dom.js`) and the bundled Inter font (SIL OFL, `assets/fonts/`).
