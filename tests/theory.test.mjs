// Musical-correctness checks: no WebAudio needed, runs in plain Node.
//   npm test
import assert from 'node:assert/strict';
import {
  CADENCE, CHORDS, MOTIFS, PROGRESSIONS, SCALE, bassMidi, chordLadder, clashes, melodyPitch, padVoicing, settleNote,
} from '../src/audio/theory.js';
import { buildProfile } from '../src/soundmap.js';

const SCALE_PCS = new Set([0, 2, 4, 5, 7, 9, 10]);
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};

// ---- every chord is diatonic to D minor / F major
for (const chord of Object.values(CHORDS)) {
  for (const pc of chord.pcs) ok(SCALE_PCS.has(pc), `${chord.name} contains out-of-key pitch class ${pc}`);
}

// ---- every progression and cadence refers to real chords and is four bars
for (const [name, prog] of Object.entries(PROGRESSIONS)) {
  for (const list of [prog.chords, prog.alt]) {
    ok(list.length === 4, `${name} must be 4 bars`);
    for (const c of list) ok(CHORDS[c], `${name}: unknown chord ${c}`);
  }
}
for (const [mode, list] of Object.entries(CADENCE)) {
  ok(list.length === 4, `${mode} cadence must be 4 bars`);
  list.forEach((c) => ok(CHORDS[c], `cadence ${mode}: unknown chord ${c}`));
}
ok(CADENCE.minor[3] === 'Dm9', 'minor cadence resolves to Dm9');
ok(CADENCE.major[3] === 'Fmaj9', 'major cadence resolves to Fmaj9');

// ---- bass notes stay audible on small speakers
for (const chord of Object.values(CHORDS)) {
  const m = bassMidi(chord.root);
  ok(m >= 33 && m <= 44, `${chord.name} bass ${m} out of A1–G2`);
  ok(m % 12 === chord.root, `${chord.name} bass is not the root`);
}

// ---- pad voicings: in range, unique, ascending, voice-led smoothly
let prev = null;
let maxJump = 0;
for (const prog of Object.values(PROGRESSIONS)) {
  for (const names of [prog.chords, prog.alt]) {
    prev = null;
    for (const n of names) {
      const v = padVoicing(CHORDS[n], prev);
      ok(new Set(v).size === v.length, `${n}: duplicate notes in voicing`);
      ok(v.every((m, i) => i === 0 || m > v[i - 1]), `${n}: voicing not ascending ${v}`);
      ok(v[0] >= 47 && v[0] <= 58, `${n}: root ${v[0]} out of range`);
      ok(v.slice(1).every((m) => m >= 57 && m <= 77), `${n}: upper structure out of range ${v}`);
      ok(v.every((m) => CHORDS[n].pcs.includes(m % 12)), `${n}: voicing contains a non-chord tone`);
      if (prev) {
        const avg = (a) => a.slice(1).reduce((x, y) => x + y, 0) / (a.length - 1);
        maxJump = Math.max(maxJump, Math.abs(avg(v) - avg(prev)));
      }
      prev = v;
    }
  }
}
ok(maxJump <= 6, `voice-leading jumps too far on average (${maxJump.toFixed(1)} semitones)`);

// ---- melody: every motif, over every chord it can meet, never clashes and stays in register
const allChords = [...new Set([...Object.values(PROGRESSIONS).flatMap((p) => [...p.chords, ...p.alt]), ...CADENCE.minor, ...CADENCE.major])];
let nudged = 0;
let total = 0;
for (const motif of MOTIFS) {
  for (const name of allChords) {
    const chord = CHORDS[name];
    for (const [step, degree, len] of motif.notes) {
      for (const target of [69, 72, 77]) {
        const raw = melodyPitch(chord, degree, { target, center: motif.center });
        const note = settleNote(chord, raw);
        total++;
        if (note !== raw) nudged++;
        ok(SCALE.includes(note), `${motif.name}/${name}: ${note} not in scale`);
        ok(note >= 55 && note <= 94, `${motif.name}/${name}: ${note} out of register`);
        ok(!clashes(chord, note), `${motif.name}/${name} step ${step} len ${len}: ${note} clashes`);
      }
    }
  }
}

// ---- melody contour: consecutive notes within a bar never leap more than a sixth,
//      over any chord — the hook keeps its shape wherever it lands
for (const motif of MOTIFS) {
  for (const name of allChords) {
    const chord = CHORDS[name];
    for (const half of [0, 16]) {
      const bar = motif.notes.filter(([s]) => s >= half && s < half + 16);
      let last = null;
      for (const [, degree] of bar) {
        const note = settleNote(chord, melodyPitch(chord, degree, { target: 77, center: motif.center }));
        if (last !== null) ok(Math.abs(note - last) <= 9, `${motif.name}/${name}: leap of ${Math.abs(note - last)} semitones (${last}→${note})`);
        last = note;
      }
    }
  }
}

// ---- chord ladders contain only chord tones
for (const chord of Object.values(CHORDS)) {
  for (const m of chordLadder(chord, 55, 96)) ok(chord.pcs.includes(m % 12), `${chord.name} ladder wrong`);
}

// ---- profiles: every option of every mapped question yields a valid profile
const GROOVES = ['house', 'pop', 'hiphop', 'electro', 'ambient', 'broken'];
const PADS = ['warm', 'strings', 'glass', 'dream', 'velvet'];
const LEADS = ['glass', 'pluck', 'felt', 'kalimba'];
const answerSets = [
  {},
  { q7: 'house', q16: 'euphoric', q10: 100, q4: 100 },
  { q7: 'hiphop', q16: 'dark', q10: 0, q4: 0 },
  { q7: 'ambient', q16: 'dreamy', q2: 'rain', q9: 'Lisbon', q15: 'coffee, a long walk, no phone' },
  { q7: 'unexpected', q16: 'cinematic', q14: ['curiosity', 'creativity'] },
];
for (const a of answerSets) {
  const p = buildProfile(a);
  ok(GROOVES.includes(p.groove), 'groove');
  ok(PADS.includes(p.pad), 'pad');
  ok(LEADS.includes(p.lead), 'lead');
  ok(PROGRESSIONS[p.prog], 'prog');
  ok(p.tempo >= 90 && p.tempo <= 126, `tempo ${p.tempo}`);
  for (const k of ['energy', 'bright', 'space', 'drive', 'density', 'variation', 'sparkle', 'duck']) {
    ok(p[k] >= 0 && p[k] <= 1, `${k}=${p[k]}`);
  }
  ok(p.swing >= 0 && p.swing <= 0.2, 'swing');
  ok(MOTIFS[p.motif], 'motif');
}
// answers must actually change the result
ok(buildProfile({ q7: 'house' }).groove === 'house', 'house answer → house groove');
ok(buildProfile({ q7: 'hiphop' }).groove === 'hiphop', 'hip-hop answer → hip-hop groove');
ok(buildProfile({ q7: 'ambient' }).groove === 'ambient', 'ambient answer → ambient groove');
ok(buildProfile({ q16: 'euphoric' }).mode === 'major', 'euphoric → major mode');
ok(buildProfile({ q16: 'dark' }).mode === 'minor', 'dark → minor mode');
ok(buildProfile({ q10: 100 }).energy > buildProfile({ q10: 0 }).energy + 0.4, 'energy slider matters');
ok(buildProfile({ q4: 100 }).tempo > buildProfile({ q4: 0 }).tempo + 15, 'pace slider changes tempo');
ok(buildProfile({ q9: 'Tokyo' }).seed !== buildProfile({ q9: 'Lisbon' }).seed, 'typed words change the seed');
ok(buildProfile({ q2: 'rain' }).texture === 'rain', 'rainy morning → rain texture');
ok(buildProfile({ q16: 'cinematic' }).pad === 'strings', 'cinematic → strings');
ok(buildProfile({ q16: 'dreamy' }).pad === 'dream', 'dreamy → dream pad');

console.log(`✓ ${checks} checks passed (${nudged}/${total} melody notes nudged off a clash)`);
