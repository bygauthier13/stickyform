// Question bodies: option cards, colour cards, product cards and the text field.
// Built on real radio inputs and a real text input, so keyboards, screen readers
// and mobile keyboards get native behaviour. User text is only ever set as a
// value or textContent, never as HTML.

import { h } from '../../components/dom.js';
import { ICON, PRODUCT_ART } from './art.js';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * @param {object} q  question from SurveyConfig
 * @param {object} o
 * @param {string} [o.value]          current answer
 * @param {(id:string, index:number)=>void} o.onSelect
 * @param {(index:number)=>void} [o.onHover]     first pointer hover over a card
 * @param {(value:string, info:object)=>void} [o.onText]
 * @param {boolean} [o.hoverSounds]   only on devices with a real hover pointer
 */
export function renderQuestion(q, o) {
  return q.type === 'text' ? textField(q, o) : optionCards(q, o);
}

function optionCards(q, { value, onSelect, onHover, hoverSounds }) {
  const kind = q.type === 'colour' ? 'swatch' : q.type === 'product' ? 'product' : 'list';
  const group = h('div', { class: `opts opts-${kind} opts-n${q.options.length}`, role: 'radiogroup', 'aria-labelledby': 'q-title' });
  const rows = [];
  const hovered = new Set();

  q.options.forEach((opt, i) => {
    const input = h('input', { type: 'radio', name: `q-${q.id}`, value: opt.id, class: 'sr-only' });
    if (opt.id === value) input.checked = true;
    const sub = !q.neutral && opt.sound ? h('span', { class: 'opt-sound' }, opt.sound) : null;
    let art = null;
    if (kind === 'swatch') art = h('span', { class: 'swatch-chip', style: `--swatch:${opt.swatch}`, 'aria-hidden': 'true' });
    if (kind === 'product') art = h('span', { class: 'opt-art', 'aria-hidden': 'true' }, PRODUCT_ART[opt.id]?.());
    const card = h(
      'label',
      { class: `opt opt-${kind}`, style: `--i:${i}`, 'data-option': opt.id },
      input,
      art,
      h('span', { class: 'opt-index', 'aria-hidden': 'true' }, pad2(i + 1)),
      h('span', { class: 'opt-text' }, h('span', { class: 'opt-label' }, opt.label), sub),
      h('span', { class: 'opt-check', 'aria-hidden': 'true' }, ICON.check()),
    );
    input.addEventListener('change', () => {
      if (input.checked) choose(i);
    });
    card.addEventListener('pointerenter', (e) => {
      // a short note the first time a card is hovered with a mouse — never on touch, never on focus
      if (!hoverSounds || e.pointerType !== 'mouse' || hovered.has(i)) return;
      hovered.add(i);
      onHover?.(i);
    });
    rows.push({ input, card, opt });
    group.append(card);
  });

  const sync = () => rows.forEach(({ input, card }) => card.classList.toggle('is-selected', input.checked));
  function choose(i) {
    rows[i].input.checked = true;
    sync();
    onSelect(q.options[i].id, i);
  }
  sync();

  return {
    el: group,
    selectIndex(i) {
      if (i < 0 || i >= rows.length) return false;
      choose(i);
      rows[i].input.focus({ preventScroll: true });
      return true;
    },
    focus() {
      (rows.find((r) => r.input.checked) || rows[0]).input.focus({ preventScroll: true });
    },
    nudge() {
      group.classList.remove('nudge');
      void group.offsetWidth;
      group.classList.add('nudge');
    },
  };
}

function textField(q, { value = '', onText }) {
  const input = h('input', {
    class: 'text-input',
    type: 'text',
    id: `q-input-${q.id}`,
    maxlength: String(q.maxLength),
    autocomplete: 'off',
    autocapitalize: q.id === 'title' ? 'words' : 'none',
    spellcheck: 'false',
    enterkeyhint: 'next',
    placeholder: q.placeholder || '',
    'aria-labelledby': 'q-title',
    'aria-describedby': `q-help q-count-${q.id}`,
  });
  input.value = value || '';
  const count = h('span', { class: 'text-count', id: `q-count-${q.id}` });
  const paint = () => {
    count.textContent = `${[...input.value].length} / ${q.maxLength}`;
    box.classList.toggle('has-value', input.value.length > 0);
  };
  const box = h('div', { class: 'text-box' }, input, h('span', { class: 'text-line', 'aria-hidden': 'true' }));
  const el = h('div', { class: 'text-field' }, box, h('div', { class: 'text-meta' }, h('span', { class: 'text-hint' }, 'Enter to continue · Skip is fine'), count));

  let before = input.value;
  input.addEventListener('input', (e) => {
    const after = input.value;
    onText?.(after, { inputType: e.inputType || '', isComposing: !!e.isComposing, before, after });
    before = after;
    paint();
  });
  paint();
  return {
    el,
    input,
    focus: () => input.focus({ preventScroll: true }),
    nudge() {},
  };
}
