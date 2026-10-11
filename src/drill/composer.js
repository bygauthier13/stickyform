// The composer: (musical state, bar, section) → the notes of that bar.
//
// Pure and deterministic — no audio, no clock. The live engine calls it just
// before each bar line; the offline renderer calls it for every bar of the
// arrangement. Both then hand the very same events to the very same
// instruments, so the downloaded file is the music people were hearing.
//
// An event:
//   { layer, part, inst, step, dur?, midi?, vel, glideFrom?, vowel?, extra? }
//   step/dur in sixteenth notes from the bar line (fractions = triplets / 32nds)

import {
  BASSLINES, COUNTERS, DRUMS, HAT_GRIDS, MELODIES, PACES, PAD_VOICINGS, ROLLS, TEXTURES, TRANSITIONS,
} from './patterns.js';
import { CHORDS, barSeconds, chordAt, mulberry32, placeOverChord } from './theory.js';

// ------------------------------------------------------------------ arrangement

/** The downloadable track: 32 bars at 140 BPM ≈ 55 s, plus the ending's tail. */
export const ARRANGEMENT = [
  { kind: 'intro', bars: 4 },
  { kind: 'build', bars: 4 },
  { kind: 'main', bars: 8 },
  { kind: 'breakdown', bars: 4 },
  { kind: 'mainB', bars: 8 },
  { kind: 'outro', bars: 4 },
];

export const TOTAL_BARS = ARRANGEMENT.reduce((n, s) => n + s.bars, 0);
/** Seconds of reverb tail after the last bar. */
export const TAIL_SECONDS = 2.6;

export const arrangementSeconds = (bpm) => TOTAL_BARS * barSeconds(bpm) + TAIL_SECONDS;

/** One descriptor per bar of the track. */
export function buildArrangement() {
  const bars = [];
  for (const sec of ARRANGEMENT) {
    for (let i = 0; i < sec.bars; i++) {
      // a fill leads into every new section, and into the final hit of the outro
      const transition = sec.kind === 'outro' ? i === sec.bars - 2 : i === sec.bars - 1;
      bars.push({ kind: sec.kind, barInSection: i, sectionBars: sec.bars, transition });
    }
  }
  return bars;
}

/** Where each section starts, in bars — for markers on the player. */
export function sectionStarts() {
  let at = 0;
  return ARRANGEMENT.map((s) => {
    const out = { kind: s.kind, bar: at };
    at += s.bars;
    return out;
  });
}

// ---------------------------------------------------------------- helpers

const loopSlice = (notes, bar, span = 64) => {
  const from = (((bar % (span / 16)) + span / 16) % (span / 16)) * 16;
  return notes.filter(([s]) => s >= from && s < from + 16).map(([s, ...rest]) => [s - from, ...rest]);
};

/** Small deterministic humanisation (± a few ms, ± a few % velocity). */
const humaniser = (seed, bar) => {
  const rnd = mulberry32((seed ^ Math.imul(bar + 7, 2654435761)) >>> 0);
  return {
    time: (ms) => ((rnd() - 0.5) * 2 * ms) / 1000,
    vel: (v, amt = 0.08) => v * (1 - amt + rnd() * 2 * amt),
  };
};

/** Section → which parts play and how loud. One table, read by every part. */
function sectionMix(state, section) {
  const L = state.layers;
  const live = section.kind === 'live';
  const all = !live; // the exported track always has every layer
  const on = (layer) => (live ? !!L[layer] : all);
  const k = section.kind;
  const i = section.barInSection ?? 0;
  const mix = {
    pad: 1,
    texture: live ? (state.texture ? 1 : 0) : 1,
    lead: on('melody') ? 1 : 0,
    double: on('melody') ? 1 : 0,
    energy: live ? (state.energy ? 0.6 : 0) : 0.55,
    counter: live ? (state.counter ? 1 : 0) : 1,
    bass: on('bass') ? 1 : 0,
    kick: on('drums') ? 1 : 0,
    snare: on('drums') ? 1 : 0,
    hats: on('drums') ? 1 : 0,
    perc: on('drums') ? 1 : 0,
    vocals: on('vocals') ? 1 : 0,
    vocalBars: [3],
    hatPace: state.pace,
    bed: 1,
  };
  if (live) {
    // while answering, the atmosphere is the foreground at first and recedes as layers arrive
    const n = Object.values(L).filter(Boolean).length;
    const lift = n <= 1 ? 2.7 : n === 2 ? 1.5 : 1;
    mix.pad *= lift;
    mix.bed = lift;
  }
  if (k === 'intro') {
    // two bars of atmosphere alone, then the melody, then a hint of hats
    Object.assign(mix, { pad: 1.5, texture: 1.2, lead: i >= 2 ? mix.lead : 0, double: 0, energy: 0, counter: 0, bass: 0, kick: 0, snare: 0, perc: 0, hats: i === 3 ? 0.7 : 0 });
    mix.hatPace = 'laidback';
  } else if (k === 'build') {
    Object.assign(mix, { counter: 0, energy: 0.85, perc: i >= 2 ? 1 : 0, hats: i === 0 ? 0 : 1, double: i >= 2 ? 1 : 0 });
    if (i === 1) mix.hatPace = 'laidback';
  } else if (k === 'breakdown') {
    Object.assign(mix, { bass: 0, kick: 0, snare: 0, perc: 0, hats: i >= 2 ? 0.75 : 0, energy: 0.9, double: 0 });
    mix.hatPace = 'laidback';
    mix.vocalBars = [1, 3];
  } else if (k === 'mainB') {
    mix.energy = 0.7;
    mix.vocalBars = [1, 3];
  }
  return mix;
}

// ------------------------------------------------------------------- parts

function padPart(state, bar, mix, out, chordIndex) {
  if (!mix.pad) return;
  // one pad chord per harmony change (Fm holds for two bars), so a held chord never re-attacks
  if (chordIndex !== 1) {
    const dur = chordIndex === 0 ? 32 : 16;
    out.push({ layer: 'atmosphere', part: 'pad', inst: 'pad', step: 0, dur, midi: PAD_VOICINGS[chordIndex], vel: 0.62 * mix.pad });
  }
  out.push({ layer: 'atmosphere', part: 'bed', inst: 'bed', step: 0, dur: 16, vel: 0.5 * mix.bed, extra: { bed: 'room' } });
}

function texturePart(state, bar, mix, out) {
  if (!mix.texture || !state.texture) return;
  const tex = TEXTURES[state.texture];
  if (tex.bed) out.push({ layer: 'atmosphere', part: 'texture', inst: 'bed', step: 0, dur: 16, vel: 0.8 * (tex.bedGain ?? 1) * mix.texture, extra: { bed: tex.bed } });
  for (const [step, dur, midi] of loopSlice(tex.notes, bar)) {
    out.push({ layer: 'atmosphere', part: 'texture', inst: tex.instrument, step, dur, midi, vel: (step % 4 === 0 ? 0.7 : 0.55) * (tex.gain ?? 1) * mix.texture });
  }
}

function melodyPart(state, bar, mix, out) {
  if (!mix.lead) return;
  const mel = MELODIES[state.melody];
  for (const [step, dur, midi] of loopSlice(mel.notes, bar)) {
    const accent = (step % 4 === 0 ? 1 : 0.86) * mel.gain;
    out.push({ layer: 'melody', part: 'lead', inst: mel.instrument, step, dur, midi, vel: 0.8 * accent * mix.lead });
    if (mel.double && mix.double) {
      out.push({ layer: 'melody', part: 'double', inst: mel.instrument, step, dur, midi: midi + mel.double, vel: 0.42 * accent * mix.double });
    }
  }
}

/**
 * The energy motif: a light answer phrase on the second and fourth bar. It slides
 * into the melody's gaps (the half-bar offset with the fewest collisions) rather
 * than playing on top of it.
 */
function energyPart(state, bar, mix, out, leadSteps) {
  if (!mix.energy || !state.energy) return;
  const cyc = ((bar % 4) + 4) % 4;
  if (cyc !== 1 && cyc !== 3) return;
  const half = cyc === 1 ? 0 : 16; // first half of the motif on bar 2, second half on bar 4
  const ch = chordAt(bar);
  const minimal = state.melody === 'minimal';
  const inst = state.melody === 'technical' ? 'bell' : 'pluck';
  const [lo, hi] = minimal ? [62, 77] : [72, 86];
  const notes = state.energy.notes.filter((n) => n.step >= half && n.step < half + 16).map((n) => ({ ...n, step: n.step - half }));
  const hits = (offset) => notes.filter((n) => n.step + offset < 16 && leadSteps.some((s) => Math.abs(s - (n.step + offset)) < 1.01)).length;
  const fits = (offset) => notes.filter((n) => n.step + offset < 16).length;
  let offset = 0;
  for (const o of [0, 8, 4, 2, 6, 10]) if (fits(o) >= 2 && hits(o) < hits(offset)) offset = o;
  for (const n of notes) {
    const step = n.step + offset;
    if (step >= 16 || leadSteps.some((s) => Math.abs(s - step) < 1.01)) continue;
    const midi = placeOverChord(n.degree, ch, { base: minimal ? 65 : 77, lo, hi, strong: step % 4 === 0 });
    out.push({ layer: 'melody', part: 'energy', inst, step, dur: Math.min(n.dur, 4, 16 - step), midi, vel: 0.6 * mix.energy });
  }
}

function counterPart(state, bar, mix, out) {
  if (!mix.counter || !state.counter) return;
  const c = COUNTERS[state.counter];
  for (const [step, dur, midi] of loopSlice(c.notes, bar)) {
    out.push({ layer: 'melody', part: 'counter', inst: c.instrument, step, dur, midi, vel: 0.7 * c.gain * mix.counter });
  }
}

function bassPart(state, bar, mix, out) {
  if (!mix.bass) return;
  for (const [step, dur, midi, glideFrom] of loopSlice(BASSLINES[state.bass].notes, bar)) {
    out.push({ layer: 'bass', part: '808', inst: '808', step, dur, midi, vel: 0.9 * mix.bass, ...(glideFrom ? { glideFrom } : {}) });
  }
}

function drumPart(state, bar, mix, out, h) {
  const d = DRUMS[state.drums];
  const off = (((bar % 2) + 2) % 2) * 16;
  const inBar = (map) => Object.entries(map).map(([s, v]) => [Number(s) - off, v]).filter(([s]) => s >= 0 && s < 16);
  const push = (inst, step, vel, part = inst) => out.push({ layer: 'drums', part, inst, step, vel, nudge: h.time(2.5) });

  if (mix.kick) for (const [s, v] of inBar(d.kick)) push('kick', s, v * mix.kick);
  if (mix.snare) {
    for (const [s, v] of inBar(d.snare)) push('snare', s, v * mix.snare);
    for (const [s, v] of inBar(d.clap)) push('clap', s, v * mix.snare);
  }
  if (mix.perc) {
    for (const [s, v] of inBar(d.rim)) push('rim', s, h.vel(v) * mix.perc);
    for (const [s, v] of inBar(d.perc)) push('perc', s, h.vel(v) * mix.perc);
    for (const [s, v] of inBar(d.ohat)) push('ohat', s, v * mix.perc, 'hat');
  }
  if (!mix.hats) return;

  const pace = PACES[mix.hatPace] || PACES.balanced;
  let hits = HAT_GRIDS[d.hats].filter(([, v]) => v >= pace.keep).map(([s, v]) => [s, v * pace.gain]);
  hits = hits.concat(pace.ghosts);
  const roll = ROLLS[pace.rolls[((bar % 4) + 4) % 4]];
  if (roll) {
    const from = roll[0][0];
    hits = hits.filter(([s]) => s < from - 0.01).concat(roll);
  }
  hits.sort((a, b) => a[0] - b[0]);
  for (const [s, v] of hits) push('hat', s, h.vel(v, 0.1) * mix.hats);
  if (pace.shaker) for (let s = 0; s < 16; s++) push('shaker', s, h.vel(pace.shaker * (s % 4 === 2 ? 1 : 0.55)) * mix.hats);
  if (mix.perc) for (const [s, v] of pace.percs) push('perc', s, h.vel(v) * mix.perc);
}

/** The vocal-chop signature: a short tag in the second half of selected bars. */
function vocalPart(state, bar, mix, out) {
  if (!mix.vocals || !state.signature) return;
  const cyc = ((bar % 4) + 4) % 4;
  if (!mix.vocalBars.includes(cyc)) return;
  const ch = chordAt(bar);
  for (const n of state.signature.notes) {
    const step = n.step;
    const midi = placeOverChord(n.degree, ch, { base: 65, lo: 63, hi: 77, strong: step % 4 === 0 });
    out.push({ layer: 'vocals', part: 'chop', inst: 'vox', step, dur: n.dur, midi, vowel: n.vowel, vel: 0.75 * mix.vocals });
  }
}

/** A transition fill in the last beat of the bar (Q9). */
export function transitionEvents(state, { from = 11 } = {}) {
  const t = TRANSITIONS[state.transition] || TRANSITIONS.sweep;
  return t.events
    .filter(([step]) => step >= from)
    .map(([step, inst, vel, extra]) => ({
      layer: inst === 'riser' || inst === 'reverse' || inst === 'swell' ? 'fx' : 'drums',
      part: 'transition',
      inst,
      step,
      vel,
      ...(extra ? { extra } : {}),
    }));
}

// ------------------------------------------------------------------- endings

/** The final bar of the track (and of the live session): it always lands on F minor. */
export function finalBarEvents(state) {
  const ev = [];
  const mel = MELODIES[state.melody];
  const tonic = { minimal: 77, bold: 65, technical: 65, vintage: 65 }[state.melody];
  const e = state.ending;
  if (e === 'atmospheric') {
    ev.push({ layer: 'atmosphere', part: 'pad', inst: 'pad', step: 0, dur: 28, midi: PAD_VOICINGS[0], vel: 0.6 });
    ev.push({ layer: 'melody', part: 'lead', inst: mel.instrument, step: 0, dur: 12, midi: tonic, vel: 0.62 });
    ev.push({ layer: 'vocals', part: 'chop', inst: 'vox', step: 4, dur: 10, midi: 72, vowel: 'oh', vel: 0.5 });
    ev.push({ layer: 'bass', part: '808', inst: '808', step: 0, dur: 14, midi: 29, vel: 0.55 });
    ev.push({ layer: 'fx', part: 'end', inst: 'swell', step: 0, vel: 0.35, extra: { beats: 2, reverse: false } });
  } else if (e === 'high') {
    ev.push({ layer: 'drums', part: 'kick', inst: 'kick', step: 0, vel: 1 });
    ev.push({ layer: 'drums', part: 'snare', inst: 'snare', step: 0, vel: 0.9 });
    ev.push({ layer: 'drums', part: 'clap', inst: 'clap', step: 0, vel: 0.8 });
    ev.push({ layer: 'drums', part: 'hat', inst: 'crash', step: 0, vel: 0.75 });
    ev.push({ layer: 'fx', part: 'end', inst: 'impact', step: 0, vel: 0.7 });
    ev.push({ layer: 'bass', part: '808', inst: '808', step: 0, dur: 12, midi: 29, glideFrom: 41, vel: 0.95, extra: { glideSteps: 6 } });
    ev.push({ layer: 'atmosphere', part: 'pad', inst: 'pad', step: 0, dur: 6, midi: PAD_VOICINGS[0], vel: 0.55 });
    ev.push({ layer: 'melody', part: 'lead', inst: mel.instrument, step: 0, dur: 6, midi: tonic, vel: 0.75 });
  } else {
    // clean: everything on the one, then silence
    ev.push({ layer: 'drums', part: 'kick', inst: 'kick', step: 0, vel: 1 });
    ev.push({ layer: 'drums', part: 'hat', inst: 'crash', step: 0, vel: 0.55 });
    ev.push({ layer: 'bass', part: '808', inst: '808', step: 0, dur: 10, midi: 29, vel: 0.95 });
    ev.push({ layer: 'atmosphere', part: 'pad', inst: 'pad', step: 0, dur: 10, midi: PAD_VOICINGS[0], vel: 0.6 });
    ev.push({ layer: 'melody', part: 'lead', inst: mel.instrument, step: 0, dur: 8, midi: tonic, vel: 0.8 });
    ev.push({ layer: 'vocals', part: 'chop', inst: 'vox', step: 0, dur: 6, midi: 68, vowel: 'ah', vel: 0.45 });
  }
  return ev;
}

/** Outro bars before the final one, per ending. Returns a section override. */
function outroSection(state, i) {
  const e = state.ending;
  if (e === 'atmospheric') {
    if (i === 1) return { drumsOnly: ['hats', 'perc'], bass: 1, vocalsBars: [1, 3] };
    if (i === 2) return { drumsOnly: [], bass: 0, vocalsBars: [1, 2, 3] };
  }
  if (e === 'high') return { pace: 'high' };
  return {};
}

/** Master tone (a low-pass on the whole mix) per section: the intro opens up, the breakdown darkens. */
function toneEvents(state, section) {
  const i = section.barInSection ?? 0;
  const tone = (hz, rampBars) => [{ layer: 'fx', part: 'tone', inst: 'tone', step: 0, vel: 1, extra: { hz, rampBars } }];
  switch (section.kind) {
    case 'intro':
      return tone([900, 1300, 2100, 3400][i], 1);
    case 'build':
    case 'mainB':
      return i === 0 ? tone(20000, 0.02) : [];
    case 'breakdown':
      return i === 0 ? tone(2600, 0.5) : i === 3 ? tone(7000, 1) : [];
    case 'outro':
      return state.ending === 'atmospheric' && i === 2 ? tone(1700, 2) : [];
    default:
      return [];
  }
}

// ------------------------------------------------------------------- compose

// ------------------------------------------------------------------- stems

/**
 * Stems (audio loops from the asset manifest) replace a part's pattern for a given
 * variation, e.g. "melody/minimal" or "bass/everyday". Keys and the parts they replace:
 */
export const STEM_SLOTS = [
  { key: () => 'atmosphere/base', layer: 'atmosphere', parts: ['pad', 'bed'], level: (m) => m.pad },
  { key: (s) => s.texture && `texture/${s.texture}`, layer: 'atmosphere', parts: ['texture'], level: (m) => m.texture },
  { key: (s) => `melody/${s.melody}`, layer: 'melody', parts: ['lead', 'double'], level: (m) => m.lead },
  { key: (s) => s.counter && `counter/${s.counter}`, layer: 'melody', parts: ['counter'], level: (m) => m.counter },
  { key: (s) => `bass/${s.bass}`, layer: 'bass', parts: ['808'], level: (m) => m.bass },
  { key: (s, m) => [`drums/${s.drums}/${m.hatPace}`, `drums/${s.drums}`], layer: 'drums', parts: ['kick', 'snare', 'clap', 'rim', 'perc', 'hat', 'shaker'], level: (m) => m.kick },
];

function applyStems(state, out, mix, stems) {
  for (const slot of STEM_SLOTS) {
    const key = [].concat(slot.key(state, mix) || []).find((k) => stems.has(k));
    const level = slot.level(mix);
    if (!key || !level) continue;
    for (let k = out.length - 1; k >= 0; k--) {
      const e = out[k];
      // the bed slot only replaces the room tone, never a texture bed
      if (e.layer === slot.layer && slot.parts.includes(e.part) && e.part !== 'transition' && !(e.part === 'bed' && e.extra?.bed !== 'room')) out.splice(k, 1);
    }
    out.push({ layer: slot.layer, part: 'stem', inst: 'stem', step: 0, dur: 16, vel: level, extra: { key } });
  }
}

/**
 * Compose one bar.
 * @param {object} state     MusicalState
 * @param {number} bar       global bar index (the loop position is bar % 4)
 * @param {{kind:string, barInSection?:number, transition?:boolean, final?:boolean}} [section]
 * @param {{ stems?: Set<string> }} [o]  stems available in the asset bank
 * @returns {Array<object>}  events, sorted by step
 */
export function composeBar(state, bar, section = { kind: 'live' }, { stems = null } = {}) {
  if (section.kind === 'outro' && section.barInSection === section.sectionBars - 1) {
    return finalBarEvents(state).sort((a, b) => a.step - b.step);
  }
  const out = [];
  const mix = sectionMix(state, section);
  if (section.kind === 'outro') {
    const o = outroSection(state, section.barInSection);
    if (o.drumsOnly) {
      mix.kick = mix.snare = 0;
      if (!o.drumsOnly.includes('hats')) mix.hats = 0;
      if (!o.drumsOnly.includes('perc')) mix.perc = 0;
    }
    if (o.bass === 0) mix.bass = 0;
    if (o.vocalsBars) mix.vocalBars = o.vocalsBars;
    if (o.pace) mix.hatPace = o.pace;
  }
  const h = humaniser(state.seed, bar);
  const cyc = ((bar % 4) + 4) % 4;

  padPart(state, bar, mix, out, cyc);
  texturePart(state, bar, mix, out);
  melodyPart(state, bar, mix, out);
  const leadSteps = out.filter((e) => e.part === 'lead').map((e) => e.step);
  energyPart(state, bar, mix, out, leadSteps);
  counterPart(state, bar, mix, out);
  bassPart(state, bar, mix, out);
  drumPart(state, bar, mix, out, h);
  vocalPart(state, bar, mix, out);
  if (stems?.size) applyStems(state, out, mix, stems);

  out.push(...toneEvents(state, section));

  // fills: before each new section of the track, every eight bars while answering
  const liveFill = section.kind === 'live' && bar % 8 === 7 && state.layers.drums;
  const sectionFill = section.transition && !(section.kind === 'outro' && state.ending === 'atmospheric');
  if (sectionFill || liveFill) {
    const fill = transitionEvents(state);
    const from = Math.min(...fill.filter((e) => e.layer === 'drums').map((e) => e.step));
    // the fill takes over the end of the bar: grid hats there make way
    for (let k = out.length - 1; k >= 0; k--) {
      const e = out[k];
      if (e.layer === 'drums' && (e.inst === 'hat' || e.inst === 'shaker') && e.step >= from - 0.01) out.splice(k, 1);
    }
    out.push(...fill);
  }
  return out.sort((a, b) => a.step - b.step);
}

/** Every bar of the downloadable track, composed. */
export function composeTrack(state) {
  return buildArrangement().map((section, bar) => ({ bar, section, events: composeBar(state, bar, section) }));
}

/** Chord name of a bar (for display). */
export const chordName = (bar) => chordAt(bar).name;
export { CHORDS };
