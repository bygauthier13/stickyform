// The personalised cover: colourway from Q2, the title from Q8 and a pattern
// that is the track's own main bar (each lit block is a note it plays).

import { h } from '../../components/dom.js';
import { composeBar } from '../composer.js';
import { MAIN_LAYERS } from '../musicalState.js';
import { optionOf } from '../surveyConfig.js';

const COVER = {
  black: { bg: '#0e0f11', ink: '#efefea', mark: '#efefea' },
  ice: { bg: '#c7d0d8', ink: '#0d0f12', mark: '#0d0f12' },
  blue: { bg: '#2d5bff', ink: '#f4f6ff', mark: '#f4f6ff' },
  lime: { bg: '#c8ff3e', ink: '#0b0c0d', mark: '#0b0c0d' },
};

/** The pattern of one bar of the main section: 5 rows × 16 steps, 0–1. */
export function coverPattern(state) {
  const grid = MAIN_LAYERS.map(() => new Array(16).fill(0));
  for (const bar of [9, 11]) {
    for (const ev of composeBar(state, bar, { kind: 'main', barInSection: bar - 8, sectionBars: 8 })) {
      const row = MAIN_LAYERS.indexOf(ev.layer);
      if (row < 0 || ev.part === 'bed' || ev.inst === 'tone') continue;
      const s = Math.min(15, Math.floor(ev.step));
      grid[row][s] = Math.max(grid[row][s], Math.min(1, ev.vel ?? 0.5));
    }
  }
  return grid;
}

/**
 * @param {object} state      MusicalState
 * @param {{ colour?: string, title: string, duration: number }} o
 */
export function renderCover(state, { colour, title, duration }) {
  const c = COVER[colour] || COVER.lime;
  const grid = coverPattern(state);
  const mins = `${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')}`;
  const colourName = optionOf('colour', colour)?.label || 'Acid Lime';
  return h(
    'figure',
    { class: 'cover', style: `--cover-bg:${c.bg};--cover-ink:${c.ink};--cover-mark:${c.mark}`, 'aria-label': `Cover for “${title}”, ${colourName} colourway` },
    h('div', { class: 'cover-top' }, h('span', { class: 'cover-brand' }, 'BLOCK / 01'), h('span', {}, 'DRILL EDITION')),
    h(
      'div',
      { class: 'cover-grid', 'aria-hidden': 'true' },
      grid.flatMap((row, r) => row.map((v, s) => h('i', { class: v > 0 ? 'on' : '', style: `--v:${v.toFixed(2)};--r:${r};--s:${s}` }))),
    ),
    h('figcaption', { class: 'cover-title' }, title),
    h('div', { class: 'cover-meta' }, h('span', {}, 'F MIN · 140 BPM'), h('span', {}, mins)),
  );
}
