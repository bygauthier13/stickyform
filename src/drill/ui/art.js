// Static artwork for the drill edition: interface icons and the four fictional
// product line drawings (no external images or brand marks). Markup is fixed —
// never built from user text.

import { svg } from '../../components/dom.js';

const STROKE = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

export const ICON = {
  play: () => svg('viewBox="0 0 24 24"><path d="M8 5.6v12.8a.7.7 0 0 0 1.07.6l10.1-6.4a.7.7 0 0 0 0-1.2L9.07 5a.7.7 0 0 0-1.07.6z" fill="currentColor"/>', 'icon'),
  pause: () => svg('viewBox="0 0 24 24"><rect x="6.5" y="5" width="3.8" height="14" rx="1" fill="currentColor"/><rect x="13.7" y="5" width="3.8" height="14" rx="1" fill="currentColor"/>', 'icon'),
  soundOn: () => svg(`viewBox="0 0 24 24" ${STROKE} stroke-width="1.7"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>`, 'icon'),
  soundOff: () => svg(`viewBox="0 0 24 24" ${STROKE} stroke-width="1.7"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>`, 'icon'),
  arrow: () => svg(`viewBox="0 0 20 20" ${STROKE} stroke-width="1.6"><path d="M3.5 10h12M11 5.2l4.8 4.8-4.8 4.8"/>`, 'icon'),
  back: () => svg(`viewBox="0 0 20 20" ${STROKE} stroke-width="1.6"><path d="M16.5 10h-12M9 5.2L4.2 10 9 14.8"/>`, 'icon'),
  download: () => svg(`viewBox="0 0 20 20" ${STROKE} stroke-width="1.6"><path d="M10 3.5v9M6.2 9l3.8 3.8L13.8 9M4 16h12"/>`, 'icon'),
  restart: () => svg(`viewBox="0 0 20 20" ${STROKE} stroke-width="1.6"><path d="M4.2 10a5.8 5.8 0 1 0 5.8-5.8H7.4M7.4 4.2L9.6 2M7.4 4.2L9.6 6.4"/>`, 'icon'),
  check: () => svg(`viewBox="0 0 20 20" ${STROKE} stroke-width="1.8"><path d="M4.5 10.5l3.6 3.6 7.4-8"/>`, 'icon'),
};

/** Fictional garments, drawn as single-weight line art. */
export const PRODUCT_ART = {
  hoodie: () =>
    svg(
      `viewBox="0 0 120 120" ${STROKE} stroke-width="1.6"><path d="M47 26c-2-11 5-17 13-17s15 6 13 17"/><path d="M47 26c-3-3-7-3-10-2L22 32 12 72l10 3 8-29 2 54h56l2-54 8 29 10-3-10-40-15-8c-3-1-7-1-10 2"/><path d="M50 30c3 10 17 10 20 0"/><path d="M55 38l-1 12M65 38l1 12"/><path d="M45 78h30l-4 15H49z"/><path d="M32 95h56"/>`,
      'product-art',
    ),
  tee: () =>
    svg(
      `viewBox="0 0 120 120" ${STROKE} stroke-width="1.6"><path d="M44 21 20 29 10 55l16 6 4-12v55h60V49l4 12 16-6-10-26-24-8"/><path d="M44 21c4 8 28 8 32 0"/><path d="M44 21c6-4 26-4 32 0"/><path d="M30 99h60"/>`,
      'product-art',
    ),
  jacket: () =>
    svg(
      `viewBox="0 0 120 120" ${STROKE} stroke-width="1.6"><path d="M42 18 20 26l-8 50 12 4 6-36v56h60V44l6 36 12-4-8-50-22-8"/><path d="M42 18l10 12 8-4 8 4 10-12"/><path d="M60 26v74"/><path d="M38 70l11-6M82 70l-11-6"/><path d="M30 94h60M14 70l12 4M106 70l-12 4"/>`,
      'product-art',
    ),
  cargo: () =>
    svg(
      `viewBox="0 0 120 120" ${STROKE} stroke-width="1.6"><path d="M36 12h48v8H36z"/><path d="M36 20l-4 88h22l6-62 6 62h22l-4-88"/><path d="M60 20v26"/><path d="M33 58h12l-1 20H32M87 58H75l1 20h12"/><path d="M33 63h12M75 63h12"/>`,
      'product-art',
    ),
};
