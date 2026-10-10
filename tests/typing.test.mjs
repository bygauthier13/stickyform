// The typing instrument's musical decisions, checked on thousands of simulated keystrokes.
//   npm test
import assert from 'node:assert/strict';
import { MOTIFS, PROGRESSIONS, CHORDS, clashes, mulberry32, melodyPitch, settleNote } from '../src/audio/theory.js';
import { RANGE, TypingPlanner, nextSlot, slotTime, soundingAt } from '../src/audio/typing.js';

let checks = 0;
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};
const ic = (a, b) => Math.min(Math.abs(a - b) % 12, 12 - (Math.abs(a - b) % 12));
const SCALE_PCS = new Set([0, 2, 4, 5, 7, 9, 10]);

/** A scheduled bar, shaped like the Composer's timeline entries, with the melody the layer would play. */
function makeEntry(bar, t0, barDur, swing, chord, motif) {
  const stepDur = barDur / 16;
  const at = (step) => t0 + (step + (step & 1 ? swing : 0)) * stepDur;
  const sounding = [];
  const base = (bar % 2) * 16;
  for (const [s, degree, len] of motif.notes) {
    if (s < base || s >= base + 16) continue;
    const midi = settleNote(chord, melodyPitch(chord, degree, { target: 74, center: motif.center }));
    sounding.push({ t: at(s - base), dur: len * stepDur + 0.3, midi });
  }
  return { bar, t0, barDur, stepDur, swing, chord, sounding };
}

let notes = 0;
let withMelody = 0;
let fellBack = 0;
const leaps = [];
let sessions = 0;

for (const [pi, prog] of Object.values(PROGRESSIONS).entries()) {
  for (const tempo of [90, 104, 118, 126]) {
    for (const swing of [0, 0.06, 0.12]) {
      sessions++;
      const barDur = 240 / tempo;
      const rnd = mulberry32(pi * 1000 + tempo + swing * 100);
      const timeline = [];
      const planner = new TypingPlanner();
      const taken = new Set();
      let now = 0.3;
      let prev = null;
      let bars = 0;
      for (let k = 0; k < 90; k++) {
        now += 0.06 + rnd() * 0.36; // typing at 2–8 keys a second
        // the engine schedules each bar a little ahead of the clock
        while (bars * barDur < now + 0.7) {
          const chord = CHORDS[prog.chords[bars % 4]];
          timeline.push(makeEntry(bars, bars * barDur, barDur, swing, chord, MOTIFS[(pi + (bars >> 2)) % MOTIFS.length]));
          if (timeline.length > 8) timeline.shift();
          bars++;
        }
        const char = 'abcdefghijklmnopqrstuvwxyz'[Math.floor(rnd() * 26)];
        const n = planner.plan(char, timeline, now);
        if (!n) continue;
        notes++;

        // ---- time: on the sixteenth-note grid of a real bar, never in the past, never twice
        ok(n.time >= now + 0.03 - 1e-9, 'never earlier than the minimum lead');
        ok(Math.abs(n.time - slotTime(n.entry, n.step)) < 1e-9, 'lands exactly on a grid slot');
        ok(!taken.has(`${n.entry.bar}:${n.step}`), 'a slot is used once');
        taken.add(`${n.entry.bar}:${n.step}`);
        ok(n.time - now <= 0.36 + 1e-9, 'keys are never held back more than a third of a second');

        // ---- pitch: in the key, in range, right for the chord
        ok(SCALE_PCS.has(n.midi % 12), `${n.midi} is in the key`);
        ok(n.midi >= RANGE.lo && n.midi <= RANGE.hi, 'inside the playing range');
        if (n.strong) ok(n.entry.chord.pcs.includes(n.midi % 12), `on the beat the note is a ${n.entry.chord.name} tone`);
        else ok(!clashes(n.entry.chord, n.midi), `between beats the note does not grate against ${n.entry.chord.name}`);

        // ---- company: no semitone or tritone against the melody that is sounding
        const melody = soundingAt(timeline, n.time);
        if (melody.length) {
          withMelody++;
          const clean = melody.every((m) => ic(n.midi, m) !== 1 && ic(n.midi, m) !== 6);
          if (!clean) fellBack++;
        }

        // ---- movement
        if (prev !== null) leaps.push(Math.abs(n.midi - prev));
        prev = n.midi;
      }
    }
  }
}

ok(notes > 3000, `enough keystrokes were exercised (${notes})`);
ok(withMelody > 500, `and many of them landed under a sounding melody (${withMelody})`);
ok(fellBack / withMelody < 0.01, `the melody-clash rule is only ever relaxed when nothing else fits (${fellBack}/${withMelody})`);
const small = leaps.filter((l) => l <= 5).length / leaps.length;
const big = leaps.filter((l) => l > 9).length / leaps.length;
ok(small > 0.6, `most moves are steps or small skips (${(small * 100).toFixed(0)}%)`);
ok(big < 0.08, `big leaps are rare (${(big * 100).toFixed(1)}%)`);

// ---- same text, same music
{
  const run = () => {
    const timeline = [makeEntry(0, 0, 2.1, 0.04, CHORDS.Dm9, MOTIFS[0]), makeEntry(1, 2.1, 2.1, 0.04, CHORDS.Bbmaj9, MOTIFS[0])];
    const p = new TypingPlanner();
    return [...'hello world'].filter((c) => c !== ' ').map((c, i) => p.plan(c, timeline, 0.2 + i * 0.25)?.midi);
  };
  assert.deepEqual(run(), run());
  checks++;
}

// ---- no run of one pitch
{
  const timeline = [makeEntry(0, 0, 2.1, 0, CHORDS.Fmaj9, MOTIFS[1]), makeEntry(1, 2.1, 2.1, 0, CHORDS.Cadd9, MOTIFS[1])];
  const p = new TypingPlanner();
  const seq = [];
  for (let i = 0; i < 16; i++) seq.push(p.plan('a', timeline, 0.1 + i * 0.26)?.midi);
  let run = 1;
  for (let i = 1; i < seq.length; i++) {
    run = seq[i] === seq[i - 1] ? run + 1 : 1;
    ok(run <= 2, 'the same pitch is never played three times in a row');
  }
}

// ---- when every slot nearby is taken, the key is skipped rather than played late
{
  const timeline = [makeEntry(0, 0, 2.1, 0, CHORDS.Dm9, MOTIFS[0])];
  const used = new Set();
  for (let step = 0; step < 16; step++) used.add(`0:${step}`);
  ok(nextSlot(timeline, 0.0, used) === null, 'no slot left → null');
  ok(nextSlot(timeline, 5, new Set()) === null, 'no scheduled bar ahead → null');
}

console.log(`typing: ${checks} checks passed (${notes} keystrokes in ${sessions} simulated sessions; ${(small * 100).toFixed(0)}% small moves)`);
