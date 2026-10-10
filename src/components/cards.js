// Visual choice cards: colour swatches and visual-mood tiles.

import { h, ICONS } from './dom.js';

export function renderCards(q, { value, onChange, sound }) {
  const mood = q.type === 'mood';
  const emoji = q.type === 'emoji';
  const group = h('div', {
    class: emoji ? 'cards cards-emoji' : mood ? 'cards cards-mood' : 'cards cards-swatch',
    role: 'radiogroup',
    'aria-labelledby': 'qtitle',
  });
  const rows = [];

  const sync = (v) =>
    rows.forEach(({ input, o, row }) => {
      input.checked = o.id === v;
      row.classList.toggle('is-selected', o.id === v);
    });

  q.options.forEach((o, i) => {
    const input = h('input', { type: 'radio', name: q.id, value: o.id, class: 'sr-only' });
    const art = emoji
      ? h('span', { class: 'emoji-art', 'aria-hidden': 'true' }, h('span', { class: 'emoji' }, o.emoji), h('span', { class: 'mood-check' }, ICONS.check()))
      : mood
      ? h('span', { class: `mood-art mood-${o.id}`, 'aria-hidden': 'true' }, h('span', { class: 'mood-check' }, ICONS.check()))
      : h('span', { class: 'swatch-chip', 'aria-hidden': 'true' }, h('span', { class: 'swatch-check' }, ICONS.check()));
    const row = h(
      'label',
      { class: emoji ? 'card card-emoji' : mood ? 'card card-mood' : 'card card-swatch', style: `--i:${i};${o.color ? `--c:${o.color};--a:${o.accent}` : ''}` },
      input,
      art,
      h('span', { class: 'card-name' }, o.label),
      o.sub ? h('span', { class: 'card-sub' }, o.sub) : null,
    );
    input.addEventListener('change', () => choose(i));
    rows.push({ input, o, row });
    group.append(row);
  });

  function choose(i) {
    const o = q.options[i];
    sync(o.id);
    sound?.select(i);
    onChange(o.id, { index: i, option: o });
  }

  sync(value);
  return {
    el: group,
    selectIndex(i) {
      if (i < 0 || i >= q.options.length) return false;
      choose(i);
      rows[i].input.focus({ preventScroll: true });
      return true;
    },
    focus() {
      (rows.find(({ input }) => input.checked) || rows[0]).input.focus({ preventScroll: true });
    },
    nudge() {
      group.classList.remove('nudge');
      void group.offsetWidth;
      group.classList.add('nudge');
    },
  };
}
