// The original StickySound experience as a scenario.
import { QUESTIONS, labelOf, optionOf } from '../form/questions.js';
import { buildProfile, summarise } from '../soundmap.js';

export default {
  id: 'stickysound',
  questions: QUESTIONS,
  buildProfile,
  summarise,
  labelOf,
  optionOf,
  soundKey: 'stickysound.sound',
  finalLabel: 'Create my soundtrack',
  phrases: ['Arranging eight layers', 'Balancing the mix', 'Adding space and air', 'Mastering'],
};
