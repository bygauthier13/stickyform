// Text-led choices: single, multi (pick up to N) and the two-way binary.
// Built on real radio / checkbox inputs, so keyboard and screen readers get
// native behaviour (arrows move and select, Space toggles) for free.

import { h, ICONS } from './dom.js';

const KEYS = 'ABCDEFGHIJ';

/**
 * @param {object} q          question definition
 * @param {{ value:any, onChange:(v:any, meta?:object)=>void, sound?:object }} ctx
 */
export function renderChoice(q, { value, onChange, sound }) {
  const multi = q.type === 'multi';
  const binary = q.type === 'binary';
  let selected = multi ? [...(value || [])] : value;

  const group = h('div', {
    class: `opts opts-${q.type}`,
    role: multi ? 'group' : 'radiogroup',
    'aria-labelledby': 'qtitle',
  });
  const inputs = [];

  const sync = () => {
    inputs.forEach(({ input, o, row }) => {
      const on = multi ? selected.includes(o.id) : selected === o.id;
      input.checked = on;
      row.classList.toggle('is-selected', on);
    });
  };

  q.options.forEach((o, i) => {
    const input = h('input', {
      type: multi ? 'checkbox' : 'radio',
      name: q.id,
      value: o.id,
      class: 'sr-only',
    });
    const body = h('span', { class: 'opt-body' }, h('span', { class: 'opt-label' }, o.label), o.sub ? h('span', { class: 'opt-sub' }, o.sub) : null);
    const row = h(
      'label',
      { class: binary ? 'opt opt-tile' : 'opt', style: `--i:${i}`, dataset: { index: i } },
      input,
      binary ? null : h('span', { class: 'opt-key', 'aria-hidden': 'true' }, KEYS[i]),
      body,
      o.meta ? h('span', { class: 'opt-meta' }, o.meta) : null,
      h('span', { class: 'opt-check', 'aria-hidden': 'true' }, ICONS.check()),
    );
    input.addEventListener('change', () => choose(i));
    inputs.push({ input, o, row });
    group.append(row);
  });

  function choose(i) {
    const o = q.options[i];
    if (multi) {
      const at = selected.indexOf(o.id);
      if (at >= 0) {
        selected.splice(at, 1);
        sound?.deselect(i);
      } else {
        selected.push(o.id);
        // beyond the limit, the oldest pick makes way for the new one
        if (q.max && selected.length > q.max) selected.shift();
        sound?.select(i, { toggle: true });
      }
      sync();
      onChange([...selected], { index: i });
    } else {
      selected = o.id;
      sync();
      sound?.select(i);
      onChange(o.id, { index: i });
    }
  }

  sync();
  return {
    el: group,
    /** Select by position — used by the 1–9 / A–J keyboard shortcuts. */
    selectIndex(i) {
      if (i < 0 || i >= q.options.length) return false;
      choose(i);
      inputs[i].input.focus({ preventScroll: true });
      return true;
    },
    focus() {
      const target = inputs.find(({ input }) => input.checked) || inputs[0];
      target.input.focus({ preventScroll: true });
    },
    nudge() {
      group.classList.remove('nudge');
      void group.offsetWidth;
      group.classList.add('nudge');
    },
  };
}
