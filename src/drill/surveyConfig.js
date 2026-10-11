// SurveyConfig — the ten questions of "BUILD YOUR SOUND". Pure data: no DOM, no audio.
//
// Every question has a musical job (`builds`, what it adds or changes in the track)
// and, where it makes sense, a brand job (`insight`, what an activation could learn
// from it in aggregate). The musical mappings are art direction, not a reading of
// anyone's personality.

export const BRAND = {
  name: 'BLOCK / 01',
  experience: 'BUILD YOUR SOUND',
  tagline: '10 answers. Your own drill soundtrack.',
  signature: 'Powered by StickySounds',
  disclaimer: 'Independent concept demo — not an official brand campaign.',
};

/** The five layers shown in the interface, in mix order. */
export const LAYERS = [
  { id: 'atmosphere', label: 'Atmosphere', short: 'ATM' },
  { id: 'melody', label: 'Melody', short: 'MEL' },
  { id: 'bass', label: 'Bass', short: '808' },
  { id: 'drums', label: 'Drums', short: 'DRM' },
  { id: 'vocals', label: 'Vocals', short: 'VOX' },
];

export const QUESTIONS = [
  {
    id: 'style',
    type: 'choice',
    title: 'What defines your style?',
    builds: { layer: 'melody', label: 'Melody' },
    insight: 'Style segment',
    options: [
      { id: 'minimal', label: 'Minimal', sound: 'Glass bell motif' },
      { id: 'bold', label: 'Bold', sound: 'Dark piano riff' },
      { id: 'technical', label: 'Technical', sound: 'Pluck arpeggio' },
      { id: 'vintage', label: 'Vintage', sound: 'Recorder line' },
    ],
  },
  {
    id: 'colour',
    type: 'colour',
    title: 'Pick your colour.',
    builds: { layer: 'atmosphere', label: 'Texture' },
    insight: 'Colourway preference',
    options: [
      { id: 'black', label: 'Black', swatch: '#111214', accent: '#edede8', ink: '#0b0c0d', sound: 'Tape dust' },
      { id: 'ice', label: 'Ice Grey', swatch: '#c3ccd4', accent: '#c9d3dc', ink: '#0b0c0d', sound: 'Frost shimmer' },
      { id: 'blue', label: 'Electric Blue', swatch: '#2d5bff', accent: '#5a83ff', ink: '#06081a', sound: 'Cold pulse' },
      { id: 'lime', label: 'Acid Lime', swatch: '#c8ff3e', accent: '#c8ff3e', ink: '#0b0c0d', sound: 'Acid blips' },
    ],
  },
  {
    id: 'where',
    type: 'choice',
    title: 'Where do you wear your style?',
    builds: { layer: 'bass', label: '808 bass' },
    insight: 'Usage occasion',
    options: [
      { id: 'everyday', label: 'Everyday', sound: 'Classic 808 slide' },
      { id: 'afterdark', label: 'After Dark', sound: 'Low, sparse 808' },
      { id: 'onthemove', label: 'On the Move', sound: 'Bouncing 808' },
      { id: 'events', label: 'At Events', sound: 'Octave-slide 808' },
    ],
  },
  {
    id: 'piece',
    type: 'product',
    title: 'Which piece catches your eye?',
    builds: { layer: 'drums', label: 'Drums' },
    insight: 'Product interest',
    options: [
      { id: 'hoodie', label: 'Hoodie', sound: 'Classic drill groove' },
      { id: 'tee', label: 'Oversized Tee', sound: 'Laid-back bounce' },
      { id: 'jacket', label: 'Jacket', sound: 'Tight, technical kit' },
      { id: 'cargo', label: 'Cargo Pants', sound: 'Heavy stomp' },
    ],
  },
  {
    id: 'energy',
    type: 'text',
    title: 'Describe your energy in three words.',
    builds: { layer: 'melody', label: 'Motif' },
    insight: 'Not collected — stays on the device',
    maxLength: 60,
    placeholder: 'e.g. calm, sharp, focused',
    help: 'Typing plays notes in key. Your words become a short motif on this device — never read out, sung or sent anywhere.',
    skipNote: 'Skipped — a default motif plays instead.',
  },
  {
    id: 'pace',
    type: 'choice',
    title: 'Choose your pace.',
    builds: { layer: 'drums', label: 'Hi-hats' },
    insight: 'Energy preference',
    help: 'Same tempo for everyone — the energy comes from the arrangement.',
    options: [
      { id: 'laidback', label: 'Laid-back', sound: 'Sparse hats' },
      { id: 'balanced', label: 'Balanced', sound: 'Skippy hats, a roll or two' },
      { id: 'high', label: 'High Energy', sound: 'Dense hats, rolls, percussion' },
    ],
  },
  {
    id: 'drop',
    type: 'choice',
    title: 'What matters most in a drop?',
    builds: { layer: 'melody', label: 'Second voice' },
    insight: 'Drop priorities',
    options: [
      { id: 'design', label: 'Design', sound: 'String stabs' },
      { id: 'comfort', label: 'Comfort', sound: 'Soft piano counter-line' },
      { id: 'quality', label: 'Quality', sound: 'Choir swells' },
      { id: 'exclusivity', label: 'Exclusivity', sound: 'High bell answers' },
    ],
  },
  {
    id: 'title',
    type: 'text',
    title: 'Give your track a title.',
    builds: { layer: 'vocals', label: 'Vocal chops' },
    insight: 'Not collected — stays on the device',
    maxLength: 32,
    placeholder: 'Untitled',
    help: 'Typing plays vocal chops. Your title becomes a short chop signature, and goes on your cover and file name.',
    skipNote: 'Skipped — your track will be called “Untitled”.',
  },
  {
    id: 'explore',
    type: 'choice',
    title: 'Would you explore this collection?',
    builds: { layer: 'transition', label: 'Transition' },
    insight: 'Purchase intent (stated)',
    help: 'Your answer picks a transition style. Every option sounds equally good.',
    neutral: true, // its sounds must never reward or punish an answer (tested)
    options: [
      { id: 'definitely', label: 'Definitely' },
      { id: 'maybe', label: 'Maybe' },
      { id: 'notforme', label: 'Not for me' },
    ],
  },
  {
    id: 'finish',
    type: 'choice',
    title: 'How should your track finish?',
    builds: { layer: 'ending', label: 'Ending' },
    insight: 'Taste signal',
    options: [
      { id: 'clean', label: 'Clean', sound: 'Hard stop on the one' },
      { id: 'atmospheric', label: 'Atmospheric', sound: 'Drums fall away into reverb' },
      { id: 'high', label: 'High Energy', sound: 'Rolls and one last hit' },
    ],
  },
];

export const questionById = (id) => QUESTIONS.find((q) => q.id === id);
export const optionOf = (qid, oid) => questionById(qid)?.options?.find((o) => o.id === oid) || null;
export const indexOfQuestion = (id) => QUESTIONS.findIndex((q) => q.id === id);
