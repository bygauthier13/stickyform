// StickySound for schools: a parent survey where every second question is for the child.
//
// The parent's questions are the school's real survey. The child's questions
// (favourite animal, colour, superpower …) are simple and playful, and they —
// together with the letters of the child's name and every key the family types —
// write a song the child can keep as an MP3. Child answers are used only to make
// the song on this device; they are not part of what is sent to the school.

import { nameMotif } from '../audio/theory.js';
import { h } from '../components/dom.js';
import { makeProfileBuilder, MOTIF_POOL, slider01 } from '../soundmap.js';

const parent = (q) => ({ ...q, audience: 'parent' });
const child = (q) => ({ ...q, audience: 'child' });

// ------------------------------------------------------------------ questions

export const QUESTIONS = [
  parent({
    id: 'p1',
    type: 'single',
    short: 'Overall experience this term',
    title: 'Overall, how happy are you with your child’s experience at school this term?',
    options: [
      { id: 'delighted', label: 'Delighted' },
      { id: 'happy', label: 'Happy' },
      { id: 'mixed', label: 'Mixed feelings' },
      { id: 'concerned', label: 'Concerned' },
      { id: 'unhappy', label: 'Unhappy' },
    ],
  }),
  child({
    id: 'c1',
    type: 'emoji',
    title: 'What’s your favourite animal?',
    help: 'Over to your little one! Read each of these out together.',
    options: [
      { id: 'lion', label: 'Lion', emoji: '🦁' },
      { id: 'dolphin', label: 'Dolphin', emoji: '🐬' },
      { id: 'cat', label: 'Cat', emoji: '🐱' },
      { id: 'dog', label: 'Dog', emoji: '🐶' },
      { id: 'rabbit', label: 'Rabbit', emoji: '🐰' },
      { id: 'elephant', label: 'Elephant', emoji: '🐘' },
      { id: 'owl', label: 'Owl', emoji: '🦉' },
      { id: 'butterfly', label: 'Butterfly', emoji: '🦋' },
    ],
  }),
  parent({
    id: 'p2',
    type: 'scale',
    short: 'Likelihood to recommend',
    title: 'How likely are you to recommend us to another family?',
    min: 0,
    max: 10,
    low: 'Not at all likely',
    high: 'Extremely likely',
  }),
  child({
    id: 'c2',
    type: 'swatch',
    title: 'What’s your favourite colour?',
    options: [
      { id: 'red', label: 'Red', color: '#d6453d', accent: '#ff7a6e' },
      { id: 'orange', label: 'Orange', color: '#e98a2b', accent: '#ffb35c' },
      { id: 'yellow', label: 'Yellow', color: '#e8c52e', accent: '#ffe066' },
      { id: 'green', label: 'Green', color: '#4aa35a', accent: '#86d896' },
      { id: 'aqua', label: 'Aqua', color: '#2ab3b1', accent: '#70e0dd' },
      { id: 'blue', label: 'Blue', color: '#3d73d6', accent: '#7fa8ff' },
      { id: 'purple', label: 'Purple', color: '#8454c9', accent: '#b894ff' },
      { id: 'pink', label: 'Pink', color: '#e069a8', accent: '#ff9fd0' },
    ],
  }),
  parent({
    id: 'p3',
    type: 'single',
    short: 'Keeping you informed',
    title: 'How well do we keep you informed about your child’s progress?',
    options: [
      { id: 'verywell', label: 'Very well' },
      { id: 'quitewell', label: 'Quite well' },
      { id: 'notvery', label: 'Not very well' },
      { id: 'notatall', label: 'Not well at all' },
    ],
  }),
  child({
    id: 'c3',
    type: 'emoji',
    title: 'Pick a superpower!',
    options: [
      { id: 'fly', label: 'Fly like a bird', emoji: '🕊️' },
      { id: 'speed', label: 'Super speed', emoji: '⚡' },
      { id: 'invisible', label: 'Turn invisible', emoji: '👻' },
      { id: 'strong', label: 'Super strength', emoji: '💪' },
      { id: 'animals', label: 'Talk to animals', emoji: '🐾' },
      { id: 'magic', label: 'Sparkle magic', emoji: '✨' },
    ],
  }),
  parent({
    id: 'p4',
    type: 'multi',
    short: 'What matters most next year',
    title: 'What matters most to you for your child over the next year?',
    help: 'Choose up to three.',
    max: 3,
    options: [
      { id: 'academics', label: 'Academic progress' },
      { id: 'wellbeing', label: 'Wellbeing and pastoral care' },
      { id: 'sport', label: 'Sport and activities' },
      { id: 'arts', label: 'Music, drama and the arts' },
      { id: 'community', label: 'Friendships and community' },
      { id: 'nextstage', label: 'Preparing for the next stage' },
    ],
  }),
  child({
    id: 'c4',
    type: 'slider',
    variant: 'pace',
    title: 'How fast do you like to go?',
    low: 'Slow as a sloth',
    high: 'Fast as a cheetah',
    words: ['Sleepy sloth', 'Strolling turtle', 'Happy puppy', 'Galloping horse', 'Speedy cheetah'],
    default: 50,
  }),
  parent({
    id: 'p5',
    type: 'single',
    short: 'Feels safe and supported',
    title: 'How safe and supported does your child feel at school?',
    options: [
      { id: 'very', label: 'Very safe and supported' },
      { id: 'mostly', label: 'Mostly' },
      { id: 'sometimes', label: 'Sometimes' },
      { id: 'rarely', label: 'Rarely' },
    ],
  }),
  child({
    id: 'c5',
    type: 'emoji',
    title: 'Where would your song live?',
    options: [
      { id: 'forest', label: 'Enchanted forest', emoji: '🌲' },
      { id: 'beach', label: 'Sunny beach', emoji: '🏖️' },
      { id: 'space', label: 'Outer space', emoji: '🚀' },
      { id: 'castle', label: 'Castle in the clouds', emoji: '🏰' },
      { id: 'sea', label: 'Under the sea', emoji: '🐠' },
      { id: 'funfair', label: 'Funfair', emoji: '🎡' },
    ],
  }),
  parent({
    id: 'p6',
    type: 'text',
    short: 'What we do especially well',
    title: 'What is one thing we do especially well?',
    placeholder: 'A few words is plenty…',
    maxLength: 120,
    optional: true,
    hint: 'As you type, you’ll hear notes join the music.',
  }),
  child({
    id: 'c6',
    type: 'emoji',
    title: 'How are you feeling today?',
    options: [
      { id: 'happy', label: 'Happy', emoji: '😊' },
      { id: 'sleepy', label: 'Sleepy', emoji: '😴' },
      { id: 'silly', label: 'Silly', emoji: '🤪' },
      { id: 'brave', label: 'Brave', emoji: '🦸' },
      { id: 'calm', label: 'Calm', emoji: '😌' },
    ],
  }),
  parent({
    id: 'p7',
    type: 'single',
    short: 'Value for the fees',
    title: 'How would you rate the value you get for the fees?',
    options: [
      { id: 'excellent', label: 'Excellent value' },
      { id: 'good', label: 'Good value' },
      { id: 'fair', label: 'Fair' },
      { id: 'poor', label: 'Poor value' },
    ],
  }),
  child({
    id: 'c7',
    type: 'emoji',
    title: 'Which sound makes you smile?',
    options: [
      { id: 'bells', label: 'Twinkly bells', emoji: '🔔' },
      { id: 'boing', label: 'Bouncy boing', emoji: '🎈' },
      { id: 'piano', label: 'Soft piano', emoji: '🎹' },
      { id: 'musicbox', label: 'Music box', emoji: '🧸' },
    ],
  }),
  parent({
    id: 'p8',
    type: 'textarea',
    short: 'What we could do better',
    title: 'Is there anything we could do better for your family?',
    placeholder: 'Anything at all — it all helps.',
    maxLength: 240,
    optional: true,
    hint: 'Shift + Enter for a new line.',
  }),
  child({
    id: 'c8',
    type: 'text',
    title: 'What’s your name?',
    help: 'Just a first name. It helps write your song — and it stays on this device.',
    placeholder: 'Type your first name…',
    maxLength: 20,
    optional: true,
    autocapitalize: 'words',
    hint: 'Listen: every letter plays a note.',
    final: true,
  }),
];

const byId = new Map(QUESTIONS.map((q) => [q.id, q]));
export const optionOf = (qid, value) => byId.get(qid)?.options?.find((o) => o.id === value);
export const labelOf = (qid, value) => optionOf(qid, value)?.label;

// -------------------------------------------------------------------- sound
// Child answers choose the style; the parent's priorities only tip a close vote, so a
// critical survey answer never makes the child's song sound unhappy.

const MAP = {
  p4: {
    academics: { pad: ['glass', 0.4], lead: ['glass', 0.3] },
    wellbeing: { pad: ['warm', 0.5], space: 0.04 },
    sport: { energy: 0.05, tempo: 2, groove: ['pop', 0.3] },
    arts: { sparkle: 0.08, lead: ['kalimba', 0.3] },
    community: { pad: ['warm', 0.4], prog: ['euphoria', 0.3] },
    nextstage: { prog: ['goldenHour', 0.3] },
  },
  c1: {
    lion: { energy: 0.12, drive: 0.15, tempo: 2, groove: ['pop', 1], pad: ['strings', 0.6] },
    dolphin: { space: 0.1, groove: ['pop', 0.4], pad: ['dream', 0.7], prog: ['euphoria', 0.5], lead: ['glass', 0.8] },
    cat: { swing: 0.04, groove: ['hiphop', 0.5], lead: ['felt', 0.7], energy: -0.05 },
    dog: { energy: 0.1, groove: ['pop', 0.9], lead: ['pluck', 0.8], prog: ['euphoria', 0.5] },
    rabbit: { groove: ['broken', 0.8], lead: ['pluck', 1], sparkle: 0.1, variation: 0.1 },
    elephant: { tempo: -3, drive: 0.1, pad: ['warm', 0.8], space: 0.05, energy: -0.03 },
    owl: { prog: ['midnight', 0.8], pad: ['velvet', 0.4], bright: -0.05, lead: ['felt', 0.6] },
    butterfly: { sparkle: 0.18, bright: 0.1, lead: ['glass', 1], pad: ['glass', 0.6], groove: ['ambient', 0.3] },
  },
  c2: {
    red: { energy: 0.08, prog: ['euphoria', 0.8], bright: 0.05 },
    orange: { prog: ['goldenHour', 1], bright: 0.08, pad: ['warm', 0.6] },
    yellow: { prog: ['euphoria', 0.8], bright: 0.15, sparkle: 0.1 },
    green: { texture: ['air', 0.8], lead: ['kalimba', 0.8], prog: ['reverie', 0.4] },
    aqua: { prog: ['reverie', 0.6], lead: ['glass', 0.6], space: 0.1 },
    blue: { prog: ['reverie', 1], pad: ['dream', 0.8], space: 0.1 },
    purple: { prog: ['midnight', 0.6], pad: ['dream', 0.6], sparkle: 0.1 },
    pink: { prog: ['goldenHour', 0.6], pad: ['warm', 0.6], lead: ['glass', 0.5], bright: 0.08 },
  },
  c3: {
    fly: { sparkle: 0.1, pad: ['glass', 0.6], space: 0.08, lead: ['glass', 0.6] },
    speed: { tempo: 5, energy: 0.12, drive: 0.1, groove: ['electro', 0.6] },
    invisible: { density: -0.1, space: 0.12, groove: ['ambient', 0.8], energy: -0.08 },
    strong: { drive: 0.2, energy: 0.08, groove: ['hiphop', 0.4], tempo: -2 },
    animals: { lead: ['kalimba', 1], texture: ['air', 0.8], pad: ['warm', 0.6] },
    magic: { sparkle: 0.2, pad: ['dream', 0.8], lead: ['glass', 0.8], bright: 0.06 },
  },
  c5: {
    forest: { texture: ['air', 1.4], lead: ['kalimba', 1], pad: ['warm', 0.6], groove: ['ambient', 0.4] },
    beach: { prog: ['goldenHour', 1.5], lead: ['kalimba', 0.8], texture: ['air', 0.6], bright: 0.08 },
    space: { pad: ['dream', 1.2], sparkle: 0.2, space: 0.2, lead: ['glass', 1], groove: ['electro', 0.5] },
    castle: { pad: ['strings', 1.4], prog: ['cinematic', 0.7], lead: ['felt', 0.8], space: 0.12 },
    sea: { pad: ['dream', 1], texture: ['rain', 1.2], lead: ['glass', 0.6], space: 0.2 },
    funfair: { groove: ['pop', 1], energy: 0.1, sparkle: 0.1, lead: ['pluck', 0.6] },
  },
  c6: {
    happy: { prog: ['euphoria', 1], bright: 0.1, energy: 0.05 },
    sleepy: { groove: ['ambient', 1.2], tempo: -4, energy: -0.15, pad: ['dream', 0.8], prog: ['reverie', 0.6] },
    silly: { groove: ['broken', 1], variation: 0.2, sparkle: 0.15, lead: ['pluck', 1], swing: 0.03 },
    brave: { prog: ['euphoria', 0.6], drive: 0.2, groove: ['pop', 0.6], energy: 0.12 },
    calm: { groove: ['ambient', 0.8], pad: ['warm', 0.8], prog: ['goldenHour', 0.8] },
  },
  c7: {
    bells: { lead: ['glass', 3], sparkle: 0.1 },
    boing: { lead: ['pluck', 3], groove: ['pop', 0.5] },
    piano: { lead: ['felt', 3], pad: ['warm', 0.6] },
    musicbox: { lead: ['kalimba', 3], sparkle: 0.08 },
  },
};

const FEELING_POOL = {
  happy: MOTIF_POOL.euphoric,
  sleepy: MOTIF_POOL.dreamy,
  silly: MOTIF_POOL.energetic,
  brave: MOTIF_POOL.energetic,
  calm: MOTIF_POOL.dreamy,
};

const cleanName = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, 20) : '');

export const buildProfile = makeProfileBuilder({
  map: MAP,
  // a song for a child leans major, bright and a little sparkly unless the answers say otherwise
  base: { tempo: 108, energy: 0.55, bright: 0.58, sparkle: 0.45, swing: 0.03 },
  votes: { groove: { pop: 0.5 }, prog: { euphoria: 0.6, goldenHour: 0.5 }, lead: { glass: 0.3 } },
  sliders(num, answers) {
    const pace = slider01(answers.c4);
    num.tempo += (pace - 0.5) * 26;
    num.energy += (pace - 0.5) * 0.3;
    num.variation += (pace - 0.5) * 0.2;
  },
  words: (answers) => cleanName(answers.c8),
  motifPool: (answers) => FEELING_POOL[answers.c6] || MOTIF_POOL.none,
  customMotif: (answers) => nameMotif(cleanName(answers.c8)),
});

// ------------------------------------------------------------------ the reveal

const wordFor = (words, v) => words[Math.min(words.length - 1, Math.floor((v / 100) * words.length))];
const optionText = (q, id) => {
  const o = q.options?.find((x) => x.id === id);
  return o ? o.label : '—';
};

/** What the school would receive: the parent's own answers only. */
export function parentRows(answers) {
  return QUESTIONS.filter((q) => q.audience === 'parent').map((q) => {
    const a = answers[q.id];
    let v;
    if (q.type === 'scale') v = a === undefined ? '—' : `${a} / ${q.max}`;
    else if (q.type === 'multi') v = Array.isArray(a) && a.length ? a.map((id) => optionText(q, id)).join(', ') : '—';
    else if (q.type === 'text' || q.type === 'textarea') v = typeof a === 'string' && a.trim() ? `“${a.trim()}”` : '—';
    else v = a ? optionText(q, a) : '—';
    return [q.short, v];
  });
}

/** Summary shown on the reveal: the child's choices, in the child's words. */
export function summarise(answers, profile) {
  const pick = (qid) => {
    const o = optionOf(qid, answers[qid]);
    return o ? `${o.label}${o.emoji ? ` ${o.emoji}` : ''}` : '—';
  };
  const speed = byId.get('c4');
  const name = cleanName(answers.c8);
  return {
    rows: [
      ['Favourite animal', pick('c1')],
      ['Favourite colour', pick('c2')],
      ['Superpower', pick('c3')],
      ['Speed', wordFor(speed.words, answers.c4 ?? 50)],
      ['Where it lives', pick('c5')],
      ['Feeling', pick('c6')],
      ['Sound', pick('c7')],
      ['Tempo', `${profile.tempo} beats a minute`],
    ],
    words: name ? [name] : [],
    mood: 'Song',
    style: 'for you',
    tempo: `${profile.tempo} BPM`,
    key: profile.mode === 'major' ? 'F major' : 'D minor',
  };
}

export function createSchoolScenario({ schoolName = 'Elmwood Academy' } = {}) {
  return {
    id: 'school',
    questions: QUESTIONS,
    buildProfile,
    summarise,
    labelOf,
    optionOf,
    soundKey: 'stickysound.school.sound',
    finalLabel: 'Make our song',
    phrases: ['Gathering the sounds', 'Adding the drums', 'Sprinkling the sparkle', 'Wrapping it up'],
    accent: '#f2c46d',
    layerNames: ['Dreamy hum', 'Little heartbeat', 'Bouncy bass', 'Drums', 'Chords', 'The tune', 'Sparkles', 'Big finish'],
    audience: (q) => ({ kind: q.audience, label: q.audience === 'parent' ? 'For you' : 'For your little one' }),
    results({ answers }) {
      const name = cleanName(answers.c8);
      const rows = parentRows(answers);
      const year = String(new Date().getFullYear());
      return {
        eyebrow: name ? `A song for ${name}` : 'A song for your family',
        titleWords: name
          ? [{ t: 'This' }, { t: 'is' }, { t: `${name}’s`, em: true }, { t: 'song.', em: true }]
          : [{ t: 'This' }, { t: 'is' }, { t: 'your', em: true }, { t: 'song.', em: true }],
        sub: 'Made from your little one’s answers. Play it together, then save it as an MP3.',
        deckLabel: 'Your song',
        summaryLabel: 'What went into the song',
        wordsLead: 'The tune is spelled with the letters of ',
        pressPlay: 'Press play to hear your song',
        format: 'mp3',
        filename: name ? `${name}'s Song` : 'A Song For You',
        tags: {
          title: name ? `${name}’s Song` : 'A song for you',
          artist: schoolName,
          album: 'Parent feedback',
          year,
          comment: 'Made with StickySound from a child’s answers.',
        },
        extra: h(
          'section',
          { class: 'summary school-panel reveal', style: '--d:8', 'aria-labelledby': 'school-label' },
          h('p', { class: 'label', id: 'school-label' }, `For you · what ${schoolName} receives`),
          h('dl', { class: 'facts' }, rows.map(([k, v], i) => h('div', { class: 'fact', style: `--i:${i}` }, h('dt', {}, k), h('dd', {}, v)))),
          h('p', { class: 'words' }, 'Your little one’s answers and name were only used to make this song, on this device. They are not part of what the school receives.'),
          h('p', { class: 'demo-note' }, 'Demo version: nothing on this page is sent or stored.'),
        ),
        footer: h(
          'p',
          {},
          'Made for ',
          h('strong', {}, schoolName),
          ' families with ',
          h('strong', {}, 'StickySound'),
          h('span', { class: 'sep' }, ' · '),
          'MP3 encoding by ',
          h('a', { href: 'https://lame.sourceforge.net', target: '_blank', rel: 'noopener' }, 'LAME'),
          ' (LGPL)',
        ),
      };
    },
  };
}
