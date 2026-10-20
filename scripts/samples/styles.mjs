// Style families and style targets — the bridge between the catalogue and the engine.
//
// A *family* groups genre tags into the eight broad characters the engine can act
// on (groove, palette, tempo band). A *style target* is what one engine build
// actually plays: a tempo band, one key, and how far each kind of material may be
// transposed into it.
//
// Pure data and pure functions: no pack names, no file system, nothing private.

/** Genre tag → one of eight style families. Every tag the catalogue can produce has a home. */
export const FAMILY_OF = {
  // 1 · lofi — dusty, swung, tape-coloured, 70–95 BPM
  lofi: 'lofi', future_beats: 'lofi', jazz: 'lofi', blues: 'lofi',
  // 2 · soul — warm, played, chords and strings, 85–110 BPM
  soul: 'soul', rnb: 'soul', gospel: 'soul', funk: 'soul', disco: 'soul', nu_disco: 'soul',
  // 3 · house — four on the floor, 118–128 BPM
  house: 'house', deep_house: 'house', tech_house: 'house', french_house: 'house', techno: 'house',
  afro_house: 'house', edm: 'house', trance: 'house', hardstyle: 'house', eurodance: 'house',
  future_bass: 'house',
  // 4 · urban — trap and drill, 130–155 BPM (or half-time 65–78)
  trap: 'urban', drill: 'urban', hip_hop: 'urban', phonk: 'urban', jersey_club: 'urban',
  club: 'urban', grime: 'urban',
  // 5 · bass — sub-led, broken, 140–175 BPM
  dubstep: 'bass', bass_music: 'bass', drum_and_bass: 'bass', breaks: 'bass', uk_garage: 'bass',
  glitch: 'bass',
  // 6 · afrolatin — percussion-led, 95–120 BPM
  afro: 'afrolatin', afrobeat: 'afrolatin', amapiano: 'afrolatin', dancehall: 'afrolatin',
  reggaeton: 'afrolatin', latin: 'afrolatin', brazilian_funk: 'afrolatin', dub_reggae: 'afrolatin',
  moombahton: 'afrolatin', world_bass: 'afrolatin', middle_eastern: 'afrolatin', indian: 'afrolatin',
  asian: 'afrolatin',
  // 7 · pop — bright, song-shaped, 100–125 BPM
  pop: 'pop', k_pop: 'pop', indie: 'pop', synthwave: 'pop', hyperpop: 'pop', chiptune: 'pop',
  video_game: 'pop',
  // 8 · cinematic — played or scored, grid-free, any tempo
  cinematic: 'cinematic', orchestral: 'cinematic', ambient: 'cinematic', experimental: 'cinematic',
  acoustic: 'cinematic', folk: 'cinematic', country: 'cinematic', rock: 'cinematic', metal: 'cinematic',
  sfx: 'cinematic', foley: 'cinematic', christmas: 'cinematic',
};

export const FAMILIES = ['lofi', 'soul', 'house', 'urban', 'bass', 'afrolatin', 'pop', 'cinematic'];

/** The first family any of a pack's genres belongs to, or 'unlabelled'. */
export function familyOf(genres = []) {
  for (const g of genres) if (FAMILY_OF[g]) return FAMILY_OF[g];
  return 'unlabelled';
}

/**
 * How far each kind of material may be transposed, in semitones. Chords, pads and
 * plucks survive a fourth; a voice loses its formants, a bass loses its weight, and
 * a full-mix loop drags its drums along with it.
 */
export const MAX_SHIFT = { harmony: 5, melody: 5, vocal: 3, bass: 3, music: 2 };

/**
 * A style target: what one engine build plays.
 *
 * `tempoSteps` matter **only in loop mode**. Web Audio ties playback speed to pitch,
 * so a pre-rendered loop is only in tune at the tempo it was rendered for: when loops
 * are playing the engine locks to the nearest step and plays every loop at rate 1.0.
 * The synthetic engine is untouched by this — it keeps its continuous tempo
 * (`audioEngine.js` glides freely inside the band), because a synthesised note is
 * generated at whatever tempo is asked for.
 *
 * The steps are a setting, not a constant: override them per run with
 * `--tempo-steps 96,104,112,120`, and read them through `stepsFor()` so an override
 * always wins.
 */
export const STYLES = {
  stickysound: {
    label: 'StickySound (current engine)',
    tempo: [90, 126],
    tempoSteps: [96, 104, 112, 120],
    key: { pc: 2, mode: 'minor' },      // D minor = F major
    keyName: 'D minor = F major',
  },
  drill: {
    label: 'Drill / trap edition',
    tempo: [132, 158],
    tempoSteps: [138, 144, 150, 156],
    key: { pc: 5, mode: 'minor' },      // F minor = Ab major
    keyName: 'F minor = Ab major',
  },
};

/** A loop may be stretched this far before it starts to smear. */
export const STRETCH = 0.08;
/** A loop is only pre-rendered to a tempo step within this much of its own tempo. */
export const RENDER_STRETCH = 0.10;

/**
 * The tempo steps in force for a style: an override when one is given, the style's
 * own otherwise. An override is a list of BPM, as a string or an array.
 */
export function stepsFor(style, override) {
  if (!override) return style.tempoSteps;
  const steps = (Array.isArray(override) ? override : String(override).split(','))
    .map((v) => Number(String(v).trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (!steps.length) throw new Error(`no usable tempo step in "${override}"`);
  const [lo, hi] = style.tempo;
  const stray = steps.filter((v) => v < lo || v > hi);
  if (stray.length) throw new Error(`tempo steps outside ${lo}-${hi} BPM: ${stray.join(', ')}`);
  return steps;
}

/** The step a continuous tempo locks to when loops start playing. */
export function snapTempo(bpm, steps) {
  return steps.reduce((best, s) => (Math.abs(s - bpm) < Math.abs(best - bpm) ? s : best), steps[0]);
}

/**
 * Playback rate that brings a loop into a style's tempo band, or null.
 * Half- and double-time count: a 150 BPM loop is a 75 BPM loop.
 */
export function tempoFit(bpm, [lo, hi]) {
  if (!bpm) return null;
  for (const [mult, how] of [[1, 'as is'], [2, 'double-time'], [0.5, 'half-time']]) {
    const b = bpm * mult;
    if (b >= lo && b <= hi) return { tier: 'exact', how, bpm: b, stretch: 0 };
  }
  for (const [mult, how] of [[1, 'as is'], [2, 'double-time'], [0.5, 'half-time']]) {
    const b = bpm * mult;
    if (b >= lo * (1 - STRETCH) && b <= hi * (1 + STRETCH)) {
      const target = Math.min(hi, Math.max(lo, b));
      return { tier: 'stretch', how, bpm: target, from: b, stretch: Math.round((target / b - 1) * 1000) / 10 };
    }
  }
  return null;
}

/**
 * Semitones to move a sample into a style's key, or null when the key is unknown.
 * A minor key and its relative major are the same seven notes, so a minor sample
 * goes to the minor root and a major sample to the relative major: both land on the
 * same scale. The result is always the shorter of the two directions.
 */
export function keyFit(key, target) {
  if (!key || !key.mode) return null;
  const root = key.mode === 'major' ? (target.pc + 3) % 12 : target.pc;
  let s = ((root - key.pc) % 12 + 12) % 12;
  if (s > 6) s -= 12;
  return s;
}

/**
 * Which tempo steps a loop can be pre-rendered to, given its own tempo. Empty when
 * every step would need too much stretching — the loop then stays a single render at
 * its own tempo and is only used by layers that tolerate a rate change (drums, FX).
 */
export function renderPlan(bpm, style, override) {
  const fit = tempoFit(bpm, style.tempo);
  if (!fit) return [];
  return stepsFor(style, override).filter((step) => Math.abs(step / fit.bpm - 1) <= RENDER_STRETCH);
}
