// Tiny DOM helpers shared by the components.

/** Create an element: h('div', { class: 'x', onclick }, child, 'text', …) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(c));
  }
  return el;
}

export const svg = (markup, cls = '') => {
  const t = document.createElement('template');
  t.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="${cls}" aria-hidden="true" focusable="false" ${markup}</svg>`;
  return t.content.firstElementChild;
};

export const ICONS = {
  check: () => svg('viewBox="0 0 20 20" fill="none"><path d="M4.5 10.5l3.6 3.6 7.4-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'),
  arrow: () => svg('viewBox="0 0 20 20" fill="none"><path d="M3.5 10h12M11 5.2l4.8 4.8-4.8 4.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'),
  back: () => svg('viewBox="0 0 20 20" fill="none"><path d="M16.5 10h-12M9 5.2L4.2 10 9 14.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'),
  play: () => svg('viewBox="0 0 24 24"><path d="M8 5.2v13.6a.6.6 0 00.92.5l10.6-6.8a.6.6 0 000-1L8.92 4.7A.6.6 0 008 5.2z" fill="currentColor"/>', 'icon'),
  pause: () => svg('viewBox="0 0 24 24"><rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor"/><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor"/>', 'icon'),
  restart: () => svg('viewBox="0 0 20 20" fill="none"><path d="M4.2 10a5.8 5.8 0 105.8-5.8H7.4M7.4 4.2L9.6 2M7.4 4.2L9.6 6.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'),
  download: () => svg('viewBox="0 0 20 20" fill="none"><path d="M10 3.5v9M6.2 9l3.8 3.8L13.8 9M4 16h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', 'icon'),
};

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isFinePointer = () => window.matchMedia('(pointer: fine)').matches;
export const pad2 = (n) => String(n).padStart(2, '0');
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
