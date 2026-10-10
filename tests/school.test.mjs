// The school edition's questions, sound map and name hook — checked without a browser.
//   npm test
import assert from 'node:assert/strict';
import { CHORDS, SCALE, melodyPitch, nameMotif, settleNote } from '../src/audio/theory.js';
import { QUESTIONS, buildProfile, optionOf, parentRows, summarise } from '../src/scenarios/school.js';

let checks = 0;
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};
const eq = (a, b, msg) => {
  checks++;
  assert.deepEqual(a, b, msg);
};

// ---- the questionnaire: sixteen, strictly alternating parent / child, child's name last
eq(QUESTIONS.length, 16, 'sixteen questions');
eq(QUESTIONS.map((q) => q.audience).join(','), Array.from({ length: 16 }, (_, i) => (i % 2 ? 'child' : 'parent')).join(','), 'parent, child, parent, child …');
eq(new Set(QUESTIONS.map((q) => q.id)).size, 16, 'unique ids');
eq(QUESTIONS.filter((q) => q.final).map((q) => q.id), ['c8'], 'only the last question is final');
eq(QUESTIONS.at(-1).audience, 'child', 'it ends with the child');
for (const q of QUESTIONS) {
  ok(q.title.length > 10, `${q.id} has a title`);
  if (q.options) {
    eq(new Set(q.options.map((o) => o.id)).size, q.options.length, `${q.id}: option ids are unique`);
    if (q.type === 'emoji') ok(q.options.every((o) => o.emoji), `${q.id}: every tile has an emoji`);
    if (q.type === 'swatch') ok(q.options.every((o) => /^#[0-9a-f]{6}$/i.test(o.color) && /^#[0-9a-f]{6}$/i.test(o.accent)), `${q.id}: swatch colours`);
  }
  if (q.audience === 'parent') ok(q.short, `${q.id}: parent questions have a short label for the school's table`);
}
const scale = QUESTIONS.find((q) => q.type === 'scale');
ok(scale && scale.min === 0 && scale.max === 10, 'a 0–10 recommend scale');
ok(!('default' in scale), 'the scale has no default answer');

// ---- every choice a child can make gives a valid profile
const GROOVES = new Set(['house', 'pop', 'hiphop', 'electro', 'ambient', 'broken']);
const LEADS = new Set(['glass', 'pluck', 'felt', 'kalimba']);
const PADS = new Set(['warm', 'strings', 'glass', 'dream', 'velvet']);
const TEXTURES = new Set(['air', 'rain', 'vinyl']);
function validProfile(p, what) {
  ok(GROOVES.has(p.groove) && LEADS.has(p.lead) && PADS.has(p.pad) && TEXTURES.has(p.texture), `${what}: known groove, lead, pad, texture`);
  for (const k of ['energy', 'bright', 'space', 'drive', 'density', 'variation', 'sparkle', 'duck']) ok(p[k] >= 0 && p[k] <= 1, `${what}: ${k} within 0–1 (${p[k]})`);
  ok(p.tempo >= 90 && p.tempo <= 126, `${what}: tempo ${p.tempo} in range`);
  ok(['major', 'minor'].includes(p.mode), `${what}: mode`);
}
validProfile(buildProfile({}), 'no answers');
eq(buildProfile({}).mode, 'major', 'a song for a child starts out major');
for (const q of QUESTIONS.filter((x) => x.audience === 'child' && x.options)) {
  for (const o of q.options) validProfile(buildProfile({ [q.id]: o.id }), `${q.id}=${o.id}`);
}
for (const v of [0, 25, 50, 75, 100]) validProfile(buildProfile({ c4: v }), `speed ${v}`);
ok(buildProfile({ c4: 100 }).tempo > buildProfile({ c4: 0 }).tempo + 10, 'a cheetah is faster than a sloth');
// the child's choices really are what steer the style
eq(buildProfile({ c7: 'bells' }).lead, 'glass', 'bells → glass lead');
eq(buildProfile({ c7: 'boing' }).lead, 'pluck', 'boing → pluck lead');
eq(buildProfile({ c7: 'musicbox' }).lead, 'kalimba', 'music box → kalimba lead');
eq(buildProfile({ c6: 'sleepy' }).groove, 'ambient', 'sleepy → ambient');
ok(buildProfile({ c5: 'castle' }).pad === 'strings', 'castle → strings');
ok(buildProfile({ c6: 'sleepy' }).tempo < buildProfile({ c6: 'silly' }).tempo, 'sleepy is slower than silly');

// ---- a critical survey answer must never change the child's song
const style = (p) => [p.groove, p.prog, p.mode, p.pad, p.lead, p.texture, p.tempo].join('|');
const child = { c1: 'dolphin', c2: 'blue', c3: 'fly', c5: 'sea', c6: 'calm', c7: 'bells', c4: 40 };
const happy = style(buildProfile({ ...child, p1: 'delighted', p2: '10', p3: 'verywell', p5: 'very', p7: 'excellent' }));
const unhappy = style(buildProfile({ ...child, p1: 'unhappy', p2: '0', p3: 'notatall', p5: 'rarely', p7: 'poor' }));
eq(happy, unhappy, 'the same child gets the same song whatever the parent scored');

// ---- what the school receives: the parent's answers, and nothing of the child's
const answers = { ...child, c8: 'Maya', p1: 'happy', p2: '9', p3: 'quitewell', p4: ['arts', 'sport'], p5: 'mostly', p6: 'Friendly teachers', p7: 'good', p8: '' };
const rows = parentRows(answers);
eq(rows.length, 8, 'eight rows');
eq(rows.find(([k]) => k === 'Likelihood to recommend')[1], '9 / 10', 'scale answer');
eq(rows.find(([k]) => k === 'What matters most next year')[1], 'Music, drama and the arts, Sport and activities', 'multi answer');
eq(rows.find(([k]) => k === 'What we could do better')[1], '—', 'an empty optional answer');
const flat = JSON.stringify(rows);
ok(!flat.includes('Maya') && !/dolphin|Dolphin|blue|Blue/.test(flat), 'no child data in the school rows');

// ---- the child's summary
const sum = summarise(answers, buildProfile(answers));
eq(sum.rows.length, 8);
ok(sum.rows[0][1].includes('Dolphin') && sum.rows[0][1].includes('🐬'), 'animal with its emoji');
eq(sum.words, ['Maya'], 'the name is what shaped the tune');

// ---- the name writes the melody
const NAMES = 'Maya Zoe Oliver Al Isabella Noah Amelia Leo Sophia Arthur Tilly Olivia George Charlotte Harry Freya Jack Mia Theo Emily Noor Ivy Max Ruby Lily Oscar Poppy Alfie Grace Archie Ella Henry Rosie Jacob Daisy Muhammad Aisha Yusuf Hugo Chloe Louis Camille Jules Lea Gabriel Manon Raphael Ines Adam'.split(' ');
const seen = new Map();
const CHORD_TONES = new Set([0, 2, 4, 7, 9]);
for (const name of NAMES) {
  const m = nameMotif(name);
  eq(m.notes.length, 8, `${name}: eight notes`);
  let last = -1;
  for (const [step, degree, len] of m.notes) {
    ok(step >= 0 && step + len <= 32 && step > last, `${name}: notes sit in order inside two bars`);
    ok(degree >= 0 && degree <= 9, `${name}: degree ${degree} in range`);
    last = step;
  }
  ok(CHORD_TONES.has(m.notes[3][1]) && CHORD_TONES.has(m.notes[7][1]), `${name}: each phrase ends on a chord tone`);
  const key = m.notes.map((n) => n[1]).join(',');
  ok(!seen.has(key), `${name} does not sound like ${seen.get(key)}`);
  seen.set(key, name);
  // played over every chord, every note lands in the lead's range and in the key
  for (const chord of Object.values(CHORDS)) {
    for (const [, degree] of m.notes) {
      const midi = settleNote(chord, melodyPitch(chord, degree, { target: 74, center: m.center }));
      ok(midi >= 55 && midi <= 94 && SCALE.includes(midi), `${name}: ${midi} over ${chord.name}`);
    }
  }
}
eq(JSON.stringify(nameMotif('MAYA').notes), JSON.stringify(nameMotif('maya').notes), 'case does not matter');
eq(JSON.stringify(nameMotif('Zoë').notes), JSON.stringify(nameMotif('Zoe').notes), 'accents do not matter');
eq(nameMotif('X'), null, 'one letter is not a name');
eq(nameMotif('  '), null, 'nor is nothing');
ok(buildProfile({ c8: 'Maya' }).customMotif?.name === 'Name: Maya', 'the profile carries the hook');
eq(buildProfile({}).customMotif, null, 'no name, no custom hook');
ok(optionOf('c1', 'lion').emoji === '🦁', 'option lookup');

console.log(`school: ${checks} checks passed`);
