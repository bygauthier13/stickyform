# Roadmap and research notes

## Sample library (paused) — see `docs/sample-library.md`

Parser and catalogue builder exist and are tested on ~70 real names. Missing: the owner's **full file list** of
`…/Splice - …/sounds/packs` (≈ 8 GB, "≈ 9,500 samples"). The sandbox can't reach cloud drives; the chat carries text and
images only. Working route: a private repo/branch + GitHub web upload of the list (names only, 1–2 MB). For audio itself
(~1,000 chosen files) allow `drive.google.com` and `*.googleusercontent.com` in the environment's Network access.

Design for **loop mode**: each of the 8 layers = loops from compatible kits (same BPM, compatible Camelot key, ideally
same pack); drums/FX are key-free and mix across packs; pitched one-shots retuned to the key; the engine still sequences
one-shots on the loop grid; risers/impacts/UI sounds stay synthesised. Quality gate: normalise by measured loudness,
avoid stacking two sub-heavy loops, render offline and measure (loudness, clipping, balance), re-roll if it fails;
👍/👎 in previews logs good combinations. Hosting: compact index in the app, sounds in a bucket, ~20–40 files per track.
Selection starts as code (rules + seeded randomness from the answers); an LLM plugs into the same interface later
(catalogue in, ids out; the engine validates ids, tempo, key). Never give an LLM thousands of rows: a per-style catalogue
of 100–200 entries.

## Making the generator "crazy" (Route A, recommended) vs Suno-style (B, C)

- **A — keep it procedural and push it:** style packs as data (key/mode, tempo range, grooves, progressions, palette,
  mix trims) so a style is a file; 5–6 new styles (lo-fi, house, synthwave, cinematic, trap, acoustic/ambient); keys and
  modes beyond D minor (re-measure `LAYER_TRIM` and voicing ranges per style); song structure per style; sampled
  instruments (CC0 multisamples, lazy-loaded per style) and the owner's samples; an LLM composer that writes a plan in
  the engine's own language (the engine validates and corrects it). Runtime LLM needs a tiny serverless function (hide
  the key) and costs ~cents per form — reserve for a premium "brand brief" feature; author offline first.
- **B — full songs with voice (later, premium):** open models, licences from secondary sources, verify on the model card:
  ACE-Step and YuE reported Apache-2.0; MusicGen weights are CC BY-NC (avoid); Stable Audio 3 community licence needs an
  enterprise licence above $1M annual revenue. GPU cost per track erodes the near-zero marginal cost.
- **C — a partner API:** fastest, but margin and dependency follow the provider.
- **Not an option:** training on Suno outputs (terms; far too little data anyway) or on Splice material.

## School edition

Done: scenario, questions, sound map, name hook, typed notes, MP3, reveal, previews, tests. Next, in order:
1. Deliver the parent's answers (webhook → the school's tool or a sheet); the child's answers never leave the device.
2. Privacy: parental consent flow, retention, a data-processing agreement, UK GDPR / Children's Code review.
3. A/B pilot in one school: completion rate, time, drop-off per question, vs the current survey. The prototype proves
   nothing about completion yet — it is a hypothesis to test.
4. Per-school branding and language (FR/EN), accessibility audit, real-device checks (iOS Safari, Android Chrome).
5. Templates for other surveys (a new survey = a scenario file + a page).

## Product

Template-first B2B subscription, not a general form builder; the music is generated in the visitor's browser so marginal
cost is near zero; store answers, not audio (the track is rebuilt from the answers). Pricing, targets and layout are in the
private context. Sell a handful of hand-onboarded pilots before building accounts or billing.

## Housekeeping

PR base branch (pending decision) · make the repo private · trademark and domain checks · LAME attribution stays on any
page that offers MP3 · keep `docs/sample-library.md` current.
