// Free-text answers: a short single line and a longer, auto-growing textarea.

import { h } from './dom.js';

export function renderText(q, { value, onChange, sound }) {
  const long = q.type === 'textarea';
  const input = long
    ? h('textarea', { class: 'field-input field-area', rows: 2 })
    : h('input', { class: 'field-input', type: 'text', autocomplete: 'off', autocapitalize: q.autocapitalize || 'sentences', spellcheck: 'false' });
  input.setAttribute('aria-labelledby', 'qtitle');
  input.setAttribute('placeholder', q.placeholder || '');
  if (q.maxLength) input.setAttribute('maxlength', q.maxLength);
  input.value = value || '';

  const count = h('span', { class: 'field-count', 'aria-hidden': 'true' });
  const el = h(
    'div',
    { class: 'field' },
    h('div', { class: 'field-box' }, input, h('span', { class: 'field-line', 'aria-hidden': 'true' })),
    h('div', { class: 'field-meta' }, h('span', { class: 'field-hint' }, q.hint || (q.optional ? 'Optional — press Enter to continue.' : 'Press Enter to continue.')), count),
  );

  const grow = () => {
    if (!long) return;
    input.style.height = 'auto';
    input.style.height = `${input.scrollHeight}px`;
  };
  const paint = () => {
    count.textContent = q.maxLength ? `${input.value.length} / ${q.maxLength}` : '';
    el.classList.toggle('has-value', input.value.length > 0);
    grow();
  };

  input.addEventListener('input', (e) => {
    paint();
    if (e.data) sound?.type(e.data);
    onChange(input.value);
  });
  // size correctly once attached (scrollHeight is 0 while detached)
  requestAnimationFrame(paint);
  paint();

  return {
    el,
    focus: () => input.focus({ preventScroll: true }),
    nudge() {},
  };
}
