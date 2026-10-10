// A numbered row of choices (0–10 "how likely are you to recommend…").
// Real radio buttons, so arrows move and select natively. Nothing is pre-selected:
// a default would bias a survey answer.

import { h } from './dom.js';

export function renderScale(q, { value, onChange, sound }) {
  const min = q.min ?? 0;
  const max = q.max ?? 10;
  const group = h('div', { class: 'scale', role: 'radiogroup', 'aria-labelledby': 'qtitle' });
  const items = [];

  const sync = (v) => items.forEach(({ input, n, row }) => {
    input.checked = String(n) === v;
    row.classList.toggle('is-selected', String(n) === v);
  });

  function choose(n) {
    sync(String(n));
    sound?.select(n - min);
    onChange(String(n), { index: n - min });
  }

  for (let n = min; n <= max; n++) {
    const input = h('input', { type: 'radio', name: q.id, value: String(n), class: 'sr-only', 'aria-label': `${n} out of ${max}` });
    const row = h('label', { class: 'scale-pill', style: `--i:${n - min}` }, input, h('span', { 'aria-hidden': 'true' }, String(n)));
    input.addEventListener('change', () => choose(n));
    items.push({ input, n, row });
    group.append(row);
  }
  sync(value);

  const el = h('div', { class: 'scale-wrap' }, group, h('div', { class: 'scale-ends', 'aria-hidden': 'true' }, h('span', {}, q.low), h('span', {}, q.high)));
  return {
    el,
    focus: () => (items.find(({ input }) => input.checked) || items[0]).input.focus({ preventScroll: true }),
    nudge() {
      group.classList.remove('nudge');
      void group.offsetWidth;
      group.classList.add('nudge');
    },
  };
}
