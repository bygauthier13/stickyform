// The composer turns (progress, profile, flags) into music, one bar at a time.
// It is deliberately clock-agnostic: the live engine calls it a bar ahead of
// the audio clock, and the offline renderer calls it for the whole timeline.
// Because both paths run this exact code, the downloaded file is the track
// the user was hearing — not an approximation of it.

import { createLayers, LAYER_ENTER, smooth } from './musicLayers.js';
import { CADENCE, CHORDS, PROGRESSIONS, mulberry32, padVoicing } from './theory.js';

/** Per-bar state: progress 0–1 plus structural flags. */
export const defaultState = () => ({
  p: 0,
  lift: false, // riser bar before a drop / resolution
  drop: false, // the bar a full groove returns
  breakdown: false, // drums + bass out
  resolve: -1, // 0–3 = bar of the closing cadence, -1 = not resolving
  milestone: null, // 'half' | 'q3' | 'full' | 'enter' on the bar a milestone lands
});

/**
 * Static mix trim per layer (linear). Calibrated from solo-layer renders so the
 * eight layers sit in a sensible balance: the bass is felt rather than heard,
 * the harmony and melody carry the mids, the texture is a veil.
 */
export const LAYER_TRIM = [1.56, 4.5, 0.16, 0.97, 1.58, 1.72, 0.4, 0.8];

/**
 * Arrival emphasis: a layer is up to ~4 dB louder when it first enters, then
 * settles back into the mix as the next layers join — so every entrance is
 * clearly heard without the finished arrangement getting top-heavy.
 */
const emphasis = (p, enter) => {
  const x = Math.min(1, Math.max(0, (p - enter) / 0.3));
  return 1 + 0.7 * (1 - x * x * (3 - 2 * x));
};

/** Layer entrance: arrives at ~50% on the bar it enters, full a question later. */
const entrance = (p, enter) => (p < enter ? 0 : Math.min(1, 0.5 + (p - enter) / 0.09));

/** Target level and ramp length for each layer in a given bar state. */
function levelFor(i, st, barDur) {
  const p = st.p;
  // In a breakdown the groove drops out and what remains is pulled down too, so
  // the drop that follows lands as a genuine change in energy.
  const bd = st.breakdown ? 0.6 : 1;
  const out = (lv, ramp = barDur * 0.9) => ({ lv: lv * bd, ramp });
  // entering layers (1–6) carry the arrival emphasis
  const enter = (i, ramp) => out(entrance(p, LAYER_ENTER[i]) * emphasis(p, LAYER_ENTER[i]), ramp);
  switch (i) {
    case 0: // ambient: foundation that gently recedes as the arrangement fills in
      // the drone is the foreground while alone, then recedes into a bed
      return out(st.breakdown ? 1 : 1 - 0.55 * smooth(p, 0.1, 0.5));
    case 1:
      if (st.breakdown || st.resolve >= 2) return out(0, 0.08);
      return enter(1, barDur * 0.5);
    case 2:
      if (st.breakdown) return out(0, 0.08);
      return enter(2, barDur * 0.5);
    case 3:
      // in a breakdown only the fill into the drop remains
      if ((st.breakdown && !st.lift) || st.resolve === 3) return out(0, 0.08);
      // the drums already build in stages (kick → hats → clap), so no extra emphasis
      return out(entrance(p, LAYER_ENTER[3]), st.drop ? 0.02 : barDur * 0.4);
    case 4:
      return enter(4, barDur * 0.5);
    case 5:
      if (st.resolve === 3) return out(0, 0.08);
      return enter(5, barDur * 0.5);
    case 6:
      return enter(6, barDur * 0.6);
    default:
      return out(1, 0.01);
  }
}

export class Composer {
  constructor(ctx, mixer, { live = false, bank } = {}) {
    if (!bank) throw new Error('Composer needs a drum bank — await getDrumBank() first');
    this.ctx = ctx;
    this.mixer = mixer;
    this.bank = bank;
    this.layers = createLayers(ctx, mixer, { live });
    this.voicing = null;
    this.cycle = null;
    /** The last few scheduled bars (time, chord, melody notes) — what the typing instrument plays along with. */
    this.timeline = [];
  }

  init(t, profile) {
    for (const l of this.layers) l.init(t, profile);
  }

  stop(t) {
    for (const l of this.layers) l.stop(t);
  }

  /** Four chords for the current cycle, re-chosen every four bars. */
  _pickCycle(profile, st) {
    const prog = PROGRESSIONS[profile.prog] || PROGRESSIONS.reverie;
    const names = st.p >= 0.5 ? prog.alt : prog.chords;
    return names.map((n) => CHORDS[n]);
  }

  scheduleBar({ bar, t0, barDur, st, profile }) {
    const { ctx, mixer } = this;
    const stepDur = barDur / 16;
    const cycleBar = bar % 4;
    if (cycleBar === 0 || !this.cycle) this.cycle = this._pickCycle(profile, st);

    const chord =
      st.resolve >= 0 ? CHORDS[CADENCE[profile.mode][Math.min(3, st.resolve)]] : this.cycle[cycleBar];
    this.voicing = padVoicing(chord, this.voicing);

    const seed = (profile.seed ^ Math.imul(bar + 1, 2654435761)) >>> 0;
    const rnd = mulberry32(seed);
    const swing = profile.swing;
    const entry = { bar, t0, barDur, stepDur, swing, chord, p: st.p, sounding: [] };
    this.timeline.push(entry);
    if (this.timeline.length > 8) this.timeline.shift();
    const env = {
      entry,
      ctx,
      mixer,
      bank: this.bank,
      bar,
      t0,
      barDur,
      stepDur,
      cycleBar,
      chord,
      voicing: this.voicing,
      p: st.p,
      st,
      profile,
      rnd,
      swing,
      at: (step) => t0 + (step + (step & 1 ? swing : 0)) * stepDur,
      lv: 1,
    };

    // ---- global mix movement: the piece opens up as it develops
    const bright = 0.55 + 0.9 * profile.bright;
    let toneHz = (2700 + 14000 * Math.pow(st.p, 0.85)) * bright;
    if (st.breakdown) toneHz = 1900 * bright;
    if (st.lift || st.resolve >= 0 || st.drop) toneHz = 19000;
    mixer.setTone(t0, toneHz, st.lift ? barDur : barDur * 0.8);
    mixer.setSpace(t0, 0.4 + 0.5 * profile.space - 0.12 * st.p + (st.breakdown ? 0.12 : 0), barDur);
    mixer.setTempo(t0, 240 / barDur);

    // ---- layers
    this.layers.forEach((layer, i) => {
      const { lv, ramp } = levelFor(i, st, barDur);
      layer.setLevel(t0, lv * LAYER_TRIM[i], ramp);
      // A layer that has faded out schedules nothing; its tails ring out naturally.
      if (lv > 0.002) {
        env.lv = lv;
        layer.bar(env);
      }
    });
  }
}

