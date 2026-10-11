// UK Drill edition — pure checks (no browser): the survey, the music theory, every
// composed note, the answer mapping, Q9 neutrality, text handling, typing, the
// export arrangement, mastering, the WAV header, analytics and the asset manifest.
//   npm test
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAnalytics, EVENT_NAMES } from '../src/drill/analyticsAdapter.js';
import { describe, mapAnswers } from '../src/drill/answerToMusicMapper.js';
import { ARRANGEMENT, TOTAL_BARS, arrangementSeconds, buildArrangement, composeBar, composeTrack, finalBarEvents, transitionEvents } from '../src/drill/composer.js';
import * as D from '../src/drill/audio/dsp.js';
import { stemProblems } from '../src/drill/audio/assetManifest.js';
import { master, trackSeconds, trackToWav } from '../src/drill/audio/trackRenderer.js';
import { TypingPlanner, classifyInput, hoverEvents, selectEvents } from '../src/drill/interaction.js';
import { MAIN_LAYERS, activeLayers, initialState, stateSignature } from '../src/drill/musicalState.js';
import { BASSLINES, COUNTERS, DRUMS, EXPLORE_TRANSITION, HAT_GRIDS, MELODIES, PACES, PAD_VOICINGS, ROLLS, TEXTURES, TRANSITIONS } from '../src/drill/patterns.js';
import { QUESTIONS, questionById } from '../src/drill/surveyConfig.js';
import { BPM, CHORDS, PROGRESSION, SCALE_PCS, chordAt, inScale, isChordTone, midiToHz, mulberry32, safeFilename, sanitizeText, textMotif } from '../src/drill/theory.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};
const eq = (a, b, msg) => {
  checks++;
  assert.deepEqual(a, b, msg);
};
const ALL = QUESTIONS.map((q) => q.id);

// ------------------------------------------------------------------ the survey
eq(QUESTIONS.length, 10, 'exactly 10 questions');
eq(new Set(ALL).size, 10, 'question ids are unique');
const TITLES = [
  'What defines your style?', 'Pick your colour.', 'Where do you wear your style?', 'Which piece catches your eye?',
  'Describe your energy in three words.', 'Choose your pace.', 'What matters most in a drop?', 'Give your track a title.',
  'Would you explore this collection?', 'How should your track finish?',
];
QUESTIONS.forEach((q, i) => eq(q.title, TITLES[i], `Q${i + 1} wording`));
eq(QUESTIONS.map((q) => q.options?.length ?? 0), [4, 4, 4, 4, 0, 3, 4, 0, 3, 3], 'option counts');
eq(QUESTIONS[0].options.map((o) => o.label), ['Minimal', 'Bold', 'Technical', 'Vintage']);
eq(QUESTIONS[1].options.map((o) => o.label), ['Black', 'Ice Grey', 'Electric Blue', 'Acid Lime'], 'colours have names');
eq(QUESTIONS[2].options.map((o) => o.label), ['Everyday', 'After Dark', 'On the Move', 'At Events']);
eq(QUESTIONS[3].options.map((o) => o.label), ['Hoodie', 'Oversized Tee', 'Jacket', 'Cargo Pants']);
eq(QUESTIONS[5].options.map((o) => o.label), ['Laid-back', 'Balanced', 'High Energy']);
eq(QUESTIONS[6].options.map((o) => o.label), ['Design', 'Comfort', 'Quality', 'Exclusivity']);
eq(QUESTIONS[8].options.map((o) => o.label), ['Definitely', 'Maybe', 'Not for me']);
eq(QUESTIONS[9].options.map((o) => o.label), ['Clean', 'Atmospheric', 'High Energy']);
eq(questionById('energy').maxLength, 60);
eq(questionById('title').maxLength, 32);
ok(questionById('explore').neutral && questionById('explore').options.every((o) => !o.sound), 'Q9 options carry no sound description');
for (const q of QUESTIONS) ok(q.builds?.label && q.insight, `${q.id} has a musical and a brand role`);
for (const o of QUESTIONS[1].options) ok(/^#[0-9a-f]{6}$/i.test(o.swatch) && /^#[0-9a-f]{6}$/i.test(o.accent), `${o.id} colours`);

// ------------------------------------------------------------------ the key
eq(BPM, 140);
eq([...SCALE_PCS].sort((a, b) => a - b), [0, 1, 3, 5, 7, 8, 10], 'F natural minor: F G Ab Bb C Db Eb');
for (const ch of Object.values(CHORDS)) for (const pc of ch.pcs) ok(SCALE_PCS.includes(pc), `${ch.name} is diatonic`);
for (const name of PROGRESSION) ok(CHORDS[name], `progression chord ${name}`);
PAD_VOICINGS.forEach((v, i) => v.forEach((m) => ok(inScale(m) && isChordTone(chordAt(i), m), `pad voicing ${i}: ${m} is a chord tone`)));

// every written note is in key
for (const [name, mel] of Object.entries(MELODIES)) for (const [, , m] of mel.notes) ok(inScale(m), `melody ${name} ${m}`);
for (const [name, line] of Object.entries(BASSLINES)) {
  for (const [s, d, m, g] of line.notes) {
    ok(inScale(m) && m >= 29 && m <= 44, `808 ${name} ${m} in key and range`);
    if (g !== undefined) ok(inScale(g), `808 ${name} glide from ${g} in key`);
    ok(s >= 0 && s < 64 && d > 0, `808 ${name} timing`);
  }
}
for (const [name, c] of Object.entries(COUNTERS)) for (const [, , m] of c.notes) [].concat(m).forEach((x) => ok(inScale(x), `counter ${name} ${x}`));
for (const [name, t] of Object.entries(TEXTURES)) for (const [, , m] of t.notes) ok(inScale(m), `texture ${name} ${m}`);
for (const [name, d] of Object.entries(DRUMS)) {
  ok(HAT_GRIDS[d.hats], `${name} hat grid`);
  ok(d.snare[8] === 1 && d.snare[24] === 1, `${name}: half-time snare on beat three`);
  for (const k of ['kick', 'snare', 'clap', 'rim', 'perc', 'ohat']) for (const s of Object.keys(d[k])) ok(Number(s) >= 0 && Number(s) < 32, `${name} ${k} step`);
}
for (const p of Object.values(PACES)) p.rolls.forEach((r) => ok(r === null || ROLLS[r], 'pace roll exists'));

// ------------------------------------------------------------------ mapper
const init = initialState();
eq(activeLayers(init), ['atmosphere'], 'the experience starts with the atmosphere alone');
const sel = mapAnswers({ style: 'bold' }, []);
ok(sel.melody === 'bold' && !sel.layers.melody, 'a selection is recorded, the layer waits for validation');
const val = mapAnswers({ style: 'bold' }, ['style']);
ok(val.layers.melody, 'validation brings the melody in');
eq(activeLayers(mapAnswers({ style: 'bold', where: 'events' }, ['style', 'where'])), ['atmosphere', 'melody', 'bass']);
const full = { style: 'vintage', colour: 'blue', where: 'onthemove', piece: 'cargo', energy: 'slow heavy cold', pace: 'high', drop: 'quality', title: 'Fog Line', explore: 'maybe', finish: 'atmospheric' };
const fs = mapAnswers(full, ALL);
eq(activeLayers(fs), MAIN_LAYERS, 'all five layers after the ten answers');
ok(fs.texture === 'pulse' && fs.counter === 'choir' && fs.transition === 'sweep' && fs.ending === 'atmospheric', 'option mapping');
eq(stateSignature(fs), stateSignature(mapAnswers({ ...full }, [...ALL].reverse())), 'deterministic');
eq(mapAnswers({ ...full, energy: 'other words' }, ALL).seed, fs.seed, 'free text never seeds the humanisation');
ok(mapAnswers({ ...full, energy: '' }, ALL).energy.source === 'default', 'skipped energy → default motif');
ok(mapAnswers({ ...full, title: '   ' }, ALL).signature.source === 'default', 'skipped title → default signature');
ok(mapAnswers({ ...full, energy: '🔥🔥🔥' }, ALL).energy.source === 'default', 'emoji only → default motif');
ok(mapAnswers({ ...full, style: '<img src=x onerror=1>' }, ['style']).melody === 'minimal', 'unknown option ids fall back');
const d = describe(fs);
ok(d.key === 'F minor' && d.tempo === '140 BPM', 'description');

// ------------------------------------------------------------------ composer: every note in key
const rnd = mulberry32(140);
const pick = (q) => q.options[Math.floor(rnd() * q.options.length)].id;
const TEXTS = ['', 'calm sharp focused', 'Café crème, déjà vu', 'ZZZZZZZZ', '12 34 56', 'a', '🔥 fire 🔥', 'x'.repeat(60)];
const states = [];
for (let n = 0; n < 160; n++) {
  const a = {};
  for (const q of QUESTIONS) a[q.id] = q.type === 'text' ? TEXTS[Math.floor(rnd() * TEXTS.length)] : pick(q);
  states.push(mapAnswers(a, ALL));
}
// and every option of every question at least once
for (const q of QUESTIONS.filter((x) => x.options)) for (const o of q.options) states.push(mapAnswers({ ...full, [q.id]: o.id }, ALL));
let notes = 0;
const checkEvents = (events, where) => {
  let prev = -1;
  for (const e of events) {
    ok(e.step >= 0 && e.step < 16, `${where}: step ${e.step} inside the bar`);
    ok(e.step >= prev, `${where}: events sorted`);
    prev = e.step;
    ok(Number.isFinite(e.vel) && e.vel >= 0 && e.vel <= 2.5, `${where}: velocity ${e.vel}`);
    for (const m of e.midi == null ? [] : [].concat(e.midi)) {
      notes++;
      ok(Number.isInteger(m) && inScale(m), `${where}: ${e.inst} ${m} is in F minor`);
    }
    if (e.glideFrom != null) ok(inScale(e.glideFrom), `${where}: glide from a scale note`);
  }
};
for (const st of states) {
  for (const { bar, section, events } of composeTrack(st)) checkEvents(events, `track bar ${bar} ${section.kind}`);
  for (let bar = 0; bar < 8; bar++) checkEvents(composeBar(st, bar, { kind: 'live' }), `live bar ${bar}`);
}
ok(notes > 50000, `checked ${notes} composed notes`);

// strong-beat notes generated from text land on chord tones
for (const st of states.slice(0, 40)) {
  for (const { bar, events } of composeTrack(st)) {
    for (const e of events.filter((x) => (x.part === 'energy' || x.part === 'chop') && x.step % 4 === 0 && bar < 31)) {
      ok(isChordTone(chordAt(bar), e.midi), `text note on the beat is a chord tone (bar ${bar}, ${e.midi})`);
    }
  }
}

// final bar lands on F minor
for (const ending of ['clean', 'atmospheric', 'high']) {
  const ev = finalBarEvents({ ...fs, ending });
  ok(ev.some((e) => e.inst === '808' && e.midi === 29), `${ending}: final 808 on F`);
  for (const e of ev) for (const m of e.midi == null ? [] : [].concat(e.midi)) ok(isChordTone(CHORDS.Fm, m), `${ending}: final ${e.inst} ${m} in F minor chord`);
}

// ------------------------------------------------------------------ stems replace their pattern
{
  const st = mapAnswers({ ...full, style: 'bold', where: 'everyday', piece: 'hoodie' }, ALL);
  const stems = new Set(['melody/bold', 'bass/everyday', 'drums/hoodie', 'atmosphere/base']);
  const plan = buildArrangement();
  for (const bar of [9, 15, 20]) {
    const ev = composeBar(st, bar, plan[bar], { stems });
    ok(!ev.some((e) => ['lead', 'double', '808', 'kick', 'snare', 'hat', 'pad'].includes(e.part)), `bar ${bar}: stems replace the melody, 808, drums and pad patterns`);
    for (const key of stems) ok(ev.some((e) => e.inst === 'stem' && e.extra.key === key), `bar ${bar}: ${key} plays`);
  }
  ok(composeBar(st, 8, plan[8], { stems }).some((e) => e.part === 'counter'), 'the second voice (no stem) keeps its pattern');
  ok(composeBar(st, 9, plan[9], { stems }).some((e) => e.part === 'energy'), 'the motif (no stem) keeps its pattern');
  ok(composeBar(st, 15, plan[15], { stems }).some((e) => e.part === 'transition'), 'the fills stay with a drum stem');
  ok(!composeBar(st, 0, plan[0], { stems }).some((e) => e.extra?.key === 'drums/hoodie'), 'no drum stem in the drumless intro');
  ok(composeBar(mapAnswers({ ...full, style: 'minimal' }, ALL), 9, plan[9], { stems }).some((e) => e.part === 'lead'), 'a stem only replaces its own variation');
}

// ------------------------------------------------------------------ arrangement and export length
eq(TOTAL_BARS, 32);
eq(ARRANGEMENT.map((s) => s.kind), ['intro', 'build', 'main', 'breakdown', 'mainB', 'outro']);
const secs = trackSeconds(BPM);
ok(secs >= 45 && secs <= 60, `export is ${secs.toFixed(1)} s (45–60)`);
ok(Math.abs(arrangementSeconds(BPM) - (secs - 0.05)) < 0.01, 'arrangement length');
eq(buildArrangement().filter((b) => b.transition).length, 6, 'a fill before each of the five section changes and before the final hit');

// ------------------------------------------------------------------ Q9: no answer is rewarded
const base = { ...full };
const byExplore = Object.keys(EXPLORE_TRANSITION).map((e) => mapAnswers({ ...base, explore: e }, ALL));
const shape = (st) => composeTrack(st).map(({ events }) => events.filter((e) => e.part !== 'transition').map((e) => `${e.inst}${e.step}${e.midi}${e.vel}`).join());
for (const st of byExplore.slice(1)) {
  eq(activeLayers(st), activeLayers(byExplore[0]), 'Q9: same layers for every answer');
  eq(shape(st), shape(byExplore[0]), 'Q9: identical music outside the transition fills');
}
const counts = Object.values(TRANSITIONS).map((t) => t.events.length);
ok(counts.every((c) => c === counts[0]), 'Q9: every transition has the same number of events');
const spans = Object.values(TRANSITIONS).map((t) => [Math.min(...t.events.map((e) => e[0])), Math.max(...t.events.map((e) => e[0]))].join('-'));
ok(spans.every((s) => s === spans[0]), 'Q9: every transition spans the same beat');
for (const st of byExplore) ok(transitionEvents(st).length === counts[0], 'Q9: fills are complete');
const hov = [0, 1, 2].map((i) => hoverEvents('explore', i, 0)[0]);
ok(hov.every((e) => e.inst === hov[0].inst && e.vel === hov[0].vel && e.dur === hov[0].dur), 'Q9 hover: same timbre and level for each option');
const selQ9 = ['definitely', 'maybe', 'notforme'].map((o) => JSON.stringify(selectEvents('explore', o, 0)));
ok(selQ9.every((s) => s === selQ9[0]), 'Q9 selection: the same accent whatever the answer');

// ------------------------------------------------------------------ interaction notes are in key
for (const q of QUESTIONS.filter((x) => x.options)) {
  for (let bar = 0; bar < 4; bar++) {
    q.options.forEach((o, i) => {
      for (const e of [...hoverEvents(q.id, i, bar), ...selectEvents(q.id, o.id, bar)]) {
        for (const m of e.midi == null ? [] : [].concat(e.midi)) ok(inScale(m), `${q.id}/${o.id} interaction note ${m}`);
        if (e.glideFrom != null) ok(inScale(e.glideFrom), 'interaction glide');
      }
    });
  }
}

// ------------------------------------------------------------------ text handling
eq(sanitizeText('  Night\u0000 ‮Shift​  '), 'Night Shift', 'control, bidi and zero-width characters removed');
eq(sanitizeText('a'.repeat(100), 32).length, 32, 'title capped at 32');
eq([...sanitizeText('🔥'.repeat(70), 60)].length, 60, 'caps count characters, not code units');
eq(sanitizeText('<b>x</b>', 32), '<b>x</b>', 'text is kept as text (displayed with textContent, never as HTML)');
eq(safeFilename('Café / "Night" <Shift>'), 'Cafe Night Shift', 'ASCII-only, no path or quote characters');
eq(safeFilename('🔥🔥'), 'Untitled', 'nothing usable → Untitled');
eq(safeFilename('..\\..\\etc'), 'etc', 'no path traversal');
ok(/^[\x20-\x7e]*$/.test(safeFilename('Ünïcödé — ✓ title')), 'filename is printable ASCII');
eq(JSON.stringify(textMotif('Café')), JSON.stringify(textMotif('cafe')), 'accents and case do not change the motif');
eq(textMotif('   '), null);
eq(JSON.stringify(textMotif('calm sharp focused')), JSON.stringify(textMotif('calm sharp focused')), 'same text → same motif');
ok(textMotif('x'.repeat(60)).notes.length <= 7, 'long text → a short motif');

// ------------------------------------------------------------------ typing
eq(classifyInput({ inputType: 'insertText', before: 'ab', after: 'abc' }).kind, 'type');
eq(classifyInput({ inputType: 'deleteContentBackward', before: 'abc', after: 'ab' }).kind, 'silent', 'deleting is silent');
eq(classifyInput({ inputType: 'insertFromPaste', before: '', after: 'a long pasted sentence' }).kind, 'paste');
eq(classifyInput({ inputType: 'insertCompositionText', isComposing: true, before: 'a', after: 'ab' }).kind, 'compose');
eq(classifyInput({ inputType: 'insertCompositionText', isComposing: true, before: 'ab', after: 'ab' }).kind, 'silent', 'IME replacement of the same length is silent');
eq(classifyInput({ inputType: '', before: 'a', after: 'a long autocorrected phrase' }).kind, 'paste', 'big jumps count as a paste');

const step = 60 / BPM / 4;
const grid = (from) => {
  const k = Math.ceil(from / step - 1e-9);
  return { time: k * step, bar: Math.floor(k / 16), step: k % 16 };
};
const planner = new TypingPlanner();
const range = { lo: 65, hi: 84 };
let typed = [];
for (let i = 0; i < 40; i++) typed.push(...planner.plan('a', 'type', grid, i * 0.02, range)); // 50 keys per second
const perSecond = typed.filter((n) => n.time < 1).length;
ok(perSecond <= 8, `typing is rate-limited (${perSecond} notes in the first second)`);
ok(new Set(typed.map((n) => `${n.bar}:${n.step}`)).size === typed.length, 'one note per sixteenth slot');
for (const n of typed) {
  ok(inScale(n.midi) && n.midi >= 65 && n.midi <= 84, `typed note ${n.midi} in key and range`);
  if (n.step % 4 === 0) ok(isChordTone(chordAt(n.bar), n.midi), 'typed note on a beat is a chord tone');
}
const p2 = new TypingPlanner();
ok(p2.plan('a long pasted sentence of many words', 'paste', grid, 10, range).length <= 3, 'a paste plays three notes at most');
const p3 = new TypingPlanner();
const p4 = new TypingPlanner();
eq(p3.plan('k', 'type', grid, 5, range).map((n) => n.midi), p4.plan('k', 'type', grid, 5, range).map((n) => n.midi), 'same key, same moment → same note');
ok(new TypingPlanner().plan(' ', 'type', grid, 1, range).length === 0, 'a space is a rest');

// ------------------------------------------------------------------ synthesis (fallback sounds)
const finite = (r) => r.channels.every((c) => c.every(Number.isFinite));
for (const [name, r] of Object.entries({ kick: D.kick(), snare: D.snare(), clap: D.clap(), hat: D.hat(), rim: D.rim(), perc: D.perc(), b808: D.bass808(), pluck: D.pluck(72), bell: D.bell(84), keys: D.keys(65), flute: D.flute(70), vox: D.voxChop(68, 'oh'), stab: D.stab([56, 60, 65]), riser: D.riser(0.5), bed: D.bed('vinyl', 6.857) })) {
  ok(finite(r), `${name}: finite samples`);
  ok(r.channels.every((c) => c.every((v) => Math.abs(v) <= 1)), `${name}: never above full scale`);
}
{
  const r = D.bass808();
  const x = r.channels[0];
  let crossings = 0;
  for (let i = Math.floor(0.3 * D.SR); i < Math.floor(0.8 * D.SR); i++) if (x[i - 1] < 0 && x[i] >= 0) crossings++;
  const f = crossings / 0.5;
  ok(Math.abs(12 * Math.log2(f / midiToHz(29))) < 0.5, `808 is tuned to F1 (${f.toFixed(1)} Hz)`);
}

// ------------------------------------------------------------------ mastering and WAV
function fakeBuffer(seconds, fn) {
  const sr = 44100;
  const n = Math.floor(seconds * sr);
  const ch = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) ch[0][i] = ch[1][i] = fn(i / sr);
  return { numberOfChannels: 2, sampleRate: sr, length: n, duration: n / sr, getChannelData: (c) => ch[c] };
}
{
  const hot = fakeBuffer(4, (t) => 3 * Math.sin(2 * Math.PI * 110 * t) + (t % 0.5 < 0.01 ? 6 : 0)); // far above full scale
  const stats = master(hot);
  ok(stats.peak < 0.9, `mastering ceiling holds (peak ${stats.peakDb.toFixed(2)} dBFS)`);
  ok(hot.getChannelData(0).every(Number.isFinite), 'mastered audio is finite');
  const quiet = fakeBuffer(4, (t) => 0.001 * Math.sin(2 * Math.PI * 220 * t));
  ok(master(quiet).gain <= 10 ** (24 / 20) + 1e-9, 'quiet input is not boosted without limit');
}
{
  const buf = fakeBuffer(2, (t) => 0.5 * Math.sin(2 * Math.PI * 440 * t));
  const blob = trackToWav({ buffer: buf }, { title: 'Test Title' });
  const b = Buffer.from(await blob.arrayBuffer());
  eq(b.toString('ascii', 0, 4), 'RIFF');
  eq(b.toString('ascii', 8, 12), 'WAVE');
  eq(b.readUInt32LE(4), b.length - 8, 'RIFF size');
  const fmt = b.indexOf('fmt ');
  eq([b.readUInt16LE(fmt + 8), b.readUInt16LE(fmt + 10), b.readUInt32LE(fmt + 12), b.readUInt16LE(fmt + 22)], [1, 2, 44100, 16], 'PCM, stereo, 44.1 kHz, 16-bit');
  const data = b.indexOf('data');
  eq(data + 8 + b.readUInt32LE(data + 4), b.length, 'data chunk runs to the end');
  ok(b.indexOf('LIST') < data, 'INFO tags before the samples');
}

// ------------------------------------------------------------------ analytics
{
  const sent = [];
  const a = createAnalytics({ sink: (e) => sent.push(e) });
  ok(!a.track('page_scrolled'), 'unknown events are rejected');
  ok(a.track('answer_submitted', { question_id: 'energy', answered: true, text: 'my secret words', value: 'calm' }), 'known event');
  ok(!('text' in a.events()[0]) && !('value' in a.events()[0]), 'free text never reaches the log');
  ok(a.track('survey_started', {}, { onceKey: 'r1' }) && !a.track('survey_started', {}, { onceKey: 'r1' }), 'duplicates are dropped');
  eq(sent.length, 2, 'the sink receives each event once');
  eq(EVENT_NAMES.length, 9);
  a.setSink(() => {
    throw new Error('broken sink');
  });
  ok(a.track('export_started'), 'a failing sink never breaks the experience');
}

// ------------------------------------------------------------------ asset manifest and provenance
{
  const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/drill/manifest.json'), 'utf8'));
  eq(manifest.bpm, 140);
  eq(manifest.key, 'F minor');
  for (const [name, def] of Object.entries(manifest.instruments)) {
    ok(typeof def.synth === 'string', `${name} has a synthesised fallback`);
    ok(manifest.provenance[def.provenance], `${name} provenance "${def.provenance}" documented`);
    for (const z of [...(def.zones || []), ...(def.samples || [])]) {
      ok(existsSync(join(ROOT, 'assets/drill', z.src)), `${z.src} exists`);
      if (z.midi !== undefined) ok(inScale(z.midi) || Math.abs(z.tuneCents) < 50, `${z.src} has a pitch`);
    }
  }
  for (const p of Object.values(manifest.provenance)) ok(p.name && p.author && p.source && p.license && p.modifications && p.restrictions, 'provenance fields complete');
  for (const [k, p] of Object.entries(manifest.provenance)) if (k.startsWith('vcsl')) ok(/CC0/.test(p.license) && /creativecommons\.org\/publicdomain\/zero/.test(p.licenseUrl), `${k} is CC0 with licence URL`);
  eq(stemProblems({ src: 'a.wav', bpm: 140, key: 'F minor', bars: 4 }), [], 'a valid stem');
  ok(stemProblems({ src: 'a.wav', bpm: 128, key: 'F minor', bars: 4 }).length === 1, 'wrong tempo is rejected');
  ok(stemProblems({ src: 'a.wav', bpm: 140, key: 'A minor', bars: 4 }).length === 1, 'wrong key is rejected (no accidental key change)');
}

console.log(`drill: ${checks} checks passed (${notes} composed notes, all in F minor)`);
