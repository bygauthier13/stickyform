// The questionnaire. Pure data — no DOM, no audio.
//
// Types: single · multi · binary · swatch · mood · slider · text · textarea
// Sliders carry a `variant` that selects their visual treatment.

export const QUESTIONS = [
  {
    id: 'q1',
    type: 'single',
    title: 'Where would you rather wake up tomorrow?',
    options: [
      { id: 'tokyo', label: 'Tokyo', sub: 'Neon after rain' },
      { id: 'newyork', label: 'New York', sub: 'Steam, yellow cabs, a skyline' },
      { id: 'ibiza', label: 'Ibiza', sub: 'Salt air and slow sunsets' },
      { id: 'paris', label: 'Paris', sub: 'Café window, grey morning' },
      { id: 'remote', label: 'Somewhere completely remote', sub: 'No signal, no schedule' },
    ],
  },
  {
    id: 'q2',
    type: 'single',
    title: 'Pick the atmosphere that feels most like you.',
    options: [
      { id: 'nightcity', label: 'Late-night city', sub: 'Streetlights, low traffic' },
      { id: 'beach', label: 'Golden-hour beach', sub: 'Warm sand, long shadows' },
      { id: 'rain', label: 'Rainy morning', sub: 'Window glass, slow coffee' },
      { id: 'rooftop', label: 'Rooftop at midnight', sub: 'Skyline, a little wind' },
      { id: 'mountain', label: 'Quiet mountain', sub: 'Thin air, total stillness' },
    ],
  },
  {
    id: 'q3',
    type: 'single',
    title: 'What do you value most when travelling?',
    options: [
      { id: 'freedom', label: 'Freedom' },
      { id: 'discovery', label: 'Discovery' },
      { id: 'luxury', label: 'Luxury' },
      { id: 'adventure', label: 'Adventure' },
      { id: 'connection', label: 'Connection' },
    ],
  },
  {
    id: 'q4',
    type: 'slider',
    variant: 'pace',
    title: 'Choose your ideal pace.',
    low: 'Slow & intentional',
    high: 'Fast & spontaneous',
    words: ['Unhurried', 'Easy', 'Steady', 'Brisk', 'Spontaneous'],
    default: 50,
  },
  {
    id: 'q5',
    type: 'single',
    title: 'What’s your ideal Friday night?',
    options: [
      { id: 'dinner', label: 'Dinner somewhere incredible' },
      { id: 'drinks', label: 'Drinks with friends' },
      { id: 'club', label: 'Club until sunrise' },
      { id: 'home', label: 'Staying in' },
      { id: 'adventure', label: 'Last-minute adventure' },
    ],
  },
  {
    id: 'q6',
    type: 'swatch',
    title: 'Choose a colour.',
    options: [
      { id: 'ink', label: 'Ink', color: '#1d2027', accent: '#a9b4c6' },
      { id: 'bone', label: 'Bone', color: '#e6dccb', accent: '#efe9df' },
      { id: 'ocean', label: 'Ocean', color: '#2c5b7a', accent: '#78b0d2' },
      { id: 'sand', label: 'Sand', color: '#c9ae82', accent: '#d8bf8f' },
      { id: 'terracotta', label: 'Terracotta', color: '#b0543a', accent: '#e0896a' },
      { id: 'moss', label: 'Moss', color: '#4c6847', accent: '#93b786' },
      { id: 'blush', label: 'Blush', color: '#d49b9a', accent: '#e8b6b3' },
      { id: 'plum', label: 'Plum', color: '#59385c', accent: '#bf92c3' },
    ],
  },
  {
    id: 'q7',
    type: 'single',
    title: 'What kind of music do you naturally gravitate towards?',
    options: [
      { id: 'house', label: 'House' },
      { id: 'pop', label: 'Pop' },
      { id: 'hiphop', label: 'Hip-hop' },
      { id: 'electronic', label: 'Electronic' },
      { id: 'ambient', label: 'Ambient' },
      { id: 'unexpected', label: 'Something unexpected' },
    ],
  },
  {
    id: 'q8',
    type: 'single',
    title: 'What time of day feels most like you?',
    options: [
      { id: 'sunrise', label: 'Sunrise', meta: '05:40' },
      { id: 'morning', label: 'Morning', meta: '09:00' },
      { id: 'afternoon', label: 'Afternoon', meta: '14:30' },
      { id: 'golden', label: 'Golden hour', meta: '18:45' },
      { id: 'midnight', label: 'Midnight', meta: '00:00' },
    ],
  },
  {
    id: 'q9',
    type: 'text',
    title: 'If you could instantly teleport somewhere right now, where would you go?',
    placeholder: 'A city, a coastline, a corner of the map…',
    maxLength: 60,
    optional: true,
    hint: 'The words you type will help write your melody.',
  },
  {
    id: 'q10',
    type: 'slider',
    variant: 'energy',
    title: 'Choose your energy level.',
    low: 'Still',
    high: 'Electric',
    words: ['Still', 'Calm', 'Warm', 'Charged', 'Electric'],
    default: 50,
  },
  {
    id: 'q11',
    type: 'binary',
    title: 'What’s more important?',
    options: [
      { id: 'stability', label: 'Stability', sub: 'A steady foundation' },
      { id: 'freedom', label: 'Freedom', sub: 'Room to move' },
    ],
  },
  {
    id: 'q12',
    type: 'mood',
    title: 'Pick a visual mood.',
    options: [
      { id: 'concrete', label: 'Concrete', sub: 'Raw, tactile' },
      { id: 'linen', label: 'Linen', sub: 'Soft, natural' },
      { id: 'glass', label: 'Glass', sub: 'Clear, luminous' },
      { id: 'velvet', label: 'Velvet', sub: 'Deep, enveloping' },
    ],
  },
  {
    id: 'q13',
    type: 'slider',
    variant: 'spontaneity',
    title: 'How spontaneous are you?',
    low: 'I plan everything',
    high: 'I improvise',
    words: ['Planned', 'Organised', 'Flexible', 'Spontaneous', 'Improviser'],
    default: 50,
  },
  {
    id: 'q14',
    type: 'multi',
    title: 'What motivates you most?',
    help: 'Choose up to two.',
    max: 2,
    options: [
      { id: 'achievement', label: 'Achievement' },
      { id: 'curiosity', label: 'Curiosity' },
      { id: 'people', label: 'People' },
      { id: 'creativity', label: 'Creativity' },
      { id: 'freedom', label: 'Freedom' },
    ],
  },
  {
    id: 'q15',
    type: 'textarea',
    title: 'Describe your perfect day in a few words.',
    placeholder: 'Slow coffee, a long walk, good company…',
    maxLength: 160,
    optional: true,
    hint: 'Press Shift + Enter for a new line.',
  },
  {
    id: 'q16',
    type: 'single',
    title: 'One final choice: how should your soundtrack feel?',
    final: true,
    options: [
      { id: 'cinematic', label: 'Cinematic', sub: 'Wide, slow, orchestral' },
      { id: 'euphoric', label: 'Euphoric', sub: 'Bright and lifting' },
      { id: 'dreamy', label: 'Dreamy', sub: 'Soft focus, floating' },
      { id: 'dark', label: 'Dark', sub: 'Low, brooding, deep' },
      { id: 'energetic', label: 'Energetic', sub: 'Driving and alive' },
    ],
  },
];

/** Option label lookup used by the results summary. */
export function labelOf(qid, value) {
  const q = QUESTIONS.find((x) => x.id === qid);
  if (!q || !q.options) return undefined;
  const o = q.options.find((x) => x.id === value);
  return o?.label;
}

export function optionOf(qid, value) {
  return QUESTIONS.find((x) => x.id === qid)?.options?.find((o) => o.id === value);
}
