// How answers shape the music.
//
// This is the only place that knows both the questionnaire and the audio
// engine. Every option contributes small numeric nudges (energy, brightness,
// space, tempo …) and weighted votes for categorical choices (groove,
// chord progression, pad and lead timbre, texture). The audio engine only
// ever sees the resulting `profile`, so it stays independent of the form.

import { PROGRESSIONS, hashString } from './audio/theory.js';

export const BASE = {
  energy: 0.5,
  bright: 0.5,
  space: 0.5,
  tempo: 110,
  swing: 0.04,
  drive: 0.5,
  density: 0.55,
  variation: 0.3,
  sparkle: 0.35,
  duck: 0.45,
};

// Contribution shorthand:  numeric keys add;  categorical keys are [choice, weight].
const MAP = {
  q1: {
    tokyo: { lead: ['glass', 1.2], pad: ['glass', 0.6], prog: ['reverie', 0.5], bright: 0.08, sparkle: 0.1 },
    newyork: { groove: ['hiphop', 0.7], prog: ['noir', 1.2], energy: 0.08, swing: 0.02, drive: 0.1 },
    ibiza: { groove: ['house', 1], prog: ['goldenHour', 1], energy: 0.1, bright: 0.1, tempo: 2 },
    paris: { lead: ['felt', 1], pad: ['warm', 0.6], prog: ['reverie', 0.6], space: 0.05, tempo: -2 },
    remote: { groove: ['ambient', 1], pad: ['dream', 1], lead: ['kalimba', 0.5], space: 0.2, energy: -0.12, texture: ['air', 1] },
  },
  q2: {
    nightcity: { prog: ['noir', 1.5], bright: -0.12, groove: ['electro', 0.3] },
    beach: { prog: ['goldenHour', 1.6], lead: ['kalimba', 1], bright: 0.1, energy: 0.05 },
    rain: { texture: ['rain', 3], prog: ['reverie', 0.6], groove: ['hiphop', 0.3], space: 0.1, energy: -0.08 },
    rooftop: { prog: ['midnight', 1.6], groove: ['house', 0.6], space: 0.1, bright: -0.05 },
    mountain: { groove: ['ambient', 1], pad: ['dream', 0.8], texture: ['air', 1], space: 0.2, energy: -0.15 },
  },
  q3: {
    freedom: { space: 0.1, variation: 0.15 },
    discovery: { density: 0.1, lead: ['glass', 0.8], sparkle: 0.12 },
    luxury: { pad: ['warm', 1], space: 0.1, bright: 0.04, prog: ['reverie', 0.4] },
    adventure: { energy: 0.12, tempo: 3, groove: ['electro', 0.4] },
    connection: { pad: ['warm', 1], lead: ['felt', 0.8], prog: ['euphoria', 0.5] },
  },
  q5: {
    dinner: { prog: ['reverie', 0.6], pad: ['warm', 0.5], groove: ['pop', 0.5], tempo: -3, energy: -0.05 },
    drinks: { groove: ['pop', 0.8], swing: 0.03, energy: 0.05 },
    club: { groove: ['house', 1.4], energy: 0.2, tempo: 5, duck: 0.1 },
    home: { groove: ['ambient', 0.6], texture: ['vinyl', 1.4], energy: -0.15, tempo: -4 },
    adventure: { groove: ['broken', 1], variation: 0.2, energy: 0.1 },
  },
  q6: {
    ink: { bright: -0.12, prog: ['midnight', 0.4], pad: ['velvet', 0.5] },
    bone: { bright: 0.08, space: 0.05, pad: ['glass', 0.5] },
    ocean: { space: 0.12, pad: ['dream', 0.6], prog: ['reverie', 0.3] },
    sand: { bright: 0.05, prog: ['goldenHour', 0.6], pad: ['warm', 0.6] },
    terracotta: { energy: 0.05, lead: ['kalimba', 0.8], pad: ['warm', 0.4] },
    moss: { lead: ['kalimba', 1], texture: ['air', 0.6], energy: -0.03 },
    blush: { bright: 0.05, prog: ['euphoria', 0.5], pad: ['warm', 0.8] },
    plum: { bright: -0.08, pad: ['velvet', 1], prog: ['midnight', 0.3] },
  },
  q7: {
    house: { groove: ['house', 3.2], tempo: 5, energy: 0.05 },
    pop: { groove: ['pop', 3.2], bright: 0.05, lead: ['pluck', 0.5] },
    hiphop: { groove: ['hiphop', 3.2], swing: 0.1, drive: 0.2, texture: ['vinyl', 1] },
    electronic: { groove: ['electro', 3.2], lead: ['pluck', 1], variation: 0.1 },
    ambient: { groove: ['ambient', 3.2], pad: ['dream', 1], lead: ['felt', 1], energy: -0.2, space: 0.15 },
    unexpected: { groove: ['broken', 3.2], lead: ['pluck', 0.8], variation: 0.25 },
  },
  q8: {
    sunrise: { prog: ['goldenHour', 1.2], bright: 0.12, energy: -0.04 },
    morning: { prog: ['goldenHour', 0.6], bright: 0.08 },
    afternoon: { prog: ['euphoria', 0.5], energy: 0.05 },
    golden: { prog: ['goldenHour', 2], space: 0.05, pad: ['warm', 0.5] },
    midnight: { prog: ['midnight', 2], bright: -0.1, space: 0.05, pad: ['velvet', 0.5] },
  },
  q11: {
    stability: { variation: -0.15, swing: -0.02, duck: 0.05 },
    freedom: { variation: 0.15, space: 0.08, swing: 0.02 },
  },
  q12: {
    concrete: { bright: -0.08, drive: 0.15, space: -0.1 },
    linen: { lead: ['kalimba', 2], texture: ['vinyl', 0.8], pad: ['warm', 0.6] },
    glass: { bright: 0.15, lead: ['glass', 2], pad: ['glass', 1.2], sparkle: 0.2, space: 0.05 },
    velvet: { bright: -0.1, pad: ['velvet', 2], space: 0.12, prog: ['midnight', 0.4] },
  },
  q14: {
    achievement: { energy: 0.08, drive: 0.1, prog: ['euphoria', 0.5] },
    curiosity: { density: 0.1, sparkle: 0.15, lead: ['glass', 0.8] },
    people: { pad: ['warm', 0.8], prog: ['euphoria', 0.4] },
    creativity: { variation: 0.15, sparkle: 0.1, density: 0.05 },
    freedom: { space: 0.1, variation: 0.08 },
  },
  q16: {
    cinematic: { pad: ['strings', 3], prog: ['cinematic', 3], lead: ['felt', 1.5], space: 0.2, density: -0.1 },
    euphoric: { prog: ['euphoria', 3], bright: 0.18, energy: 0.15, tempo: 3, lead: ['pluck', 1], pad: ['glass', 0.8] },
    dreamy: { pad: ['dream', 3], prog: ['reverie', 2], space: 0.25, energy: -0.1, sparkle: 0.15, tempo: -3, lead: ['felt', 1] },
    dark: { prog: ['midnight', 2], pad: ['velvet', 2], bright: -0.2, drive: 0.15, tempo: -2 },
    energetic: { energy: 0.25, tempo: 6, drive: 0.2, bright: 0.08, groove: ['electro', 0.5] },
  },
};

export const GROOVE_TEMPO = { house: 6, pop: 0, hiphop: -14, electro: 2, ambient: -10, broken: -2 };
const GROOVE_SWING = { house: 0.05, pop: 0.02, hiphop: 0.1, electro: 0, ambient: 0.05, broken: 0.07 };
const GROOVE_DUCK = { house: 0.2, pop: 0, hiphop: -0.25, electro: 0.1, ambient: -0.35, broken: -0.05 };
const GROOVE_ENERGY = { house: 0.05, pop: 0, hiphop: -0.02, electro: 0.04, ambient: -0.1, broken: 0.02 };

export const MOTIF_POOL = {
  cinematic: [5, 1, 2],
  euphoric: [3, 0, 4],
  dreamy: [5, 2, 0],
  dark: [1, 2, 5],
  energetic: [4, 3, 0],
  none: [0, 1, 2, 3, 4, 5],
};

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const slider01 = (v, fallback = 0.5) => (typeof v === 'number' ? clamp(v / 100, 0, 1) : fallback);

export function pickWinner(votes, fallback) {
  let best = fallback;
  let bestW = 0;
  for (const [k, w] of Object.entries(votes)) {
    if (w > bestW + 1e-9) {
      best = k;
      bestW = w;
    }
  }
  return best;
}

/**
 * Build a profile builder for one questionnaire.
 *
 * @param {object} cfg
 * @param {Record<string, Record<string, object>>} cfg.map   question id → option id → contribution
 * @param {object} [cfg.base]     starting values that replace BASE entries
 * @param {object} [cfg.votes]    starting votes, e.g. { prog: { euphoria: 0.6 } }
 * @param {(num:object, answers:object)=>void} [cfg.sliders]  continuous answers nudge the numbers
 * @param {(answers:object)=>string} cfg.words           the user's own words, hashed into the melody
 * @param {(answers:object)=>number[]} cfg.motifPool     motifs that suit the chosen feel
 * @param {(answers:object)=>object|null} [cfg.customMotif]  a hook written from the answers (e.g. a name)
 * @returns {(answers?:Record<string, any>) => object} musical profile consumed by the audio engine
 */
export function makeProfileBuilder(cfg) {
  return function buildProfile(answers = {}) {
    const num = { ...BASE, ...cfg.base };
    const votes = {
      groove: { ...cfg.votes?.groove },
      prog: { ...cfg.votes?.prog },
      pad: { ...cfg.votes?.pad },
      lead: { glass: 0.3, ...cfg.votes?.lead },
      texture: { ...cfg.votes?.texture },
    };

    const apply = (fx) => {
      if (!fx) return;
      for (const [key, val] of Object.entries(fx)) {
        if (Array.isArray(val)) votes[key][val[0]] = (votes[key][val[0]] || 0) + val[1];
        else num[key] += val;
      }
    };

    for (const [qid, table] of Object.entries(cfg.map)) {
      const a = answers[qid];
      if (Array.isArray(a)) a.forEach((id) => apply(table[id]));
      else apply(table[a]);
    }
    cfg.sliders?.(num, answers);

    const groove = pickWinner(votes.groove, 'electro');
    const prog = pickWinner(votes.prog, 'reverie');
    const mode = PROGRESSIONS[prog].mode;
    const pad = pickWinner(votes.pad, 'warm');
    const lead = pickWinner(votes.lead, 'glass');
    const texture = pickWinner(votes.texture, 'air');

    const tempo = Math.round(clamp(num.tempo + GROOVE_TEMPO[groove], 90, 126));
    const energy = clamp(num.energy + GROOVE_ENERGY[groove], 0, 1);

    // The user's own words write the melody: hash them to choose among motifs
    // that suit the chosen feel.
    const words = (cfg.words(answers) || '').toLowerCase().trim();
    const wordsHash = hashString(words || 'stickysound');
    const pool = cfg.motifPool(answers);
    const motif = pool[wordsHash % pool.length];
    const seed = hashString(`${wordsHash}|${JSON.stringify(answers)}`) || 1;

    return {
      tempo,
      swing: clamp(num.swing + GROOVE_SWING[groove], 0, 0.2),
      energy,
      bright: clamp(num.bright, 0.05, 0.95),
      space: clamp(num.space, 0, 1),
      drive: clamp(num.drive, 0, 1),
      density: clamp(num.density - (groove === 'ambient' ? 0.15 : 0), 0.1, 1),
      variation: clamp(num.variation, 0, 1),
      sparkle: clamp(num.sparkle, 0, 1),
      duck: clamp(num.duck + GROOVE_DUCK[groove], 0, 0.9),
      groove,
      prog,
      mode,
      pad,
      lead,
      texture,
      motif,
      customMotif: cfg.customMotif?.(answers) ?? null,
      seed,
    };
  };
}

export const buildProfile = makeProfileBuilder({
  map: MAP,
  sliders(num, answers) {
    const pace = slider01(answers.q4);
    const energySlider = slider01(answers.q10);
    const spont = slider01(answers.q13);
    num.tempo += (pace - 0.5) * 26;
    num.energy += (pace - 0.5) * 0.26;
    num.energy += (energySlider - 0.5) * 0.7;
    num.tempo += (energySlider - 0.5) * 10;
    num.drive += (energySlider - 0.5) * 0.4;
    num.variation += (spont - 0.5) * 0.6;
    num.swing += (spont - 0.5) * 0.04;
    num.density += (spont - 0.5) * 0.2;
  },
  words: (answers) => [answers.q9, answers.q15].filter((s) => typeof s === 'string' && s.trim()).join('|'),
  motifPool: (answers) => MOTIF_POOL[answers.q16] || MOTIF_POOL.none,
});

export const DEFAULT_PROFILE = buildProfile({});

const ENERGY_LABELS = [
  [0.34, 'Low'],
  [0.62, 'Medium'],
  [0.84, 'High'],
  [Infinity, 'Very high'],
];

/**
 * Human-readable summary of the finished soundtrack.
 * @param {(qid:string, optionId:any)=>string|undefined} labelOf  option label lookup
 */
export function summarise(answers, profile, labelOf) {
  const label = (q) => labelOf(q, answers[q]);
  const style = label('q7');
  return {
    energy: ENERGY_LABELS.find(([max]) => profile.energy < max)[1],
    mood: label('q16') || 'Cinematic',
    style: style === 'Something unexpected' ? 'Experimental' : style || 'Electronic',
    atmosphere: label('q8') || 'Midnight',
    tempo: `${profile.tempo} BPM`,
    key: profile.mode === 'major' ? 'F major' : 'D minor',
    words: [answers.q9, answers.q15].filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()),
  };
}
