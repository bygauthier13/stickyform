// AssetManifest — which sound plays each instrument, and where it came from.
//
// Every instrument has a built-in synthesised fallback (src/drill/audio/dsp.js).
// The manifest (assets/drill/manifest.json) can point any instrument at audio
// files instead — recorded samples today, the owner's own sounds later — and can
// add stems (loops) that replace a whole pattern. Nothing else has to change.
//
// Loading never blocks the experience: a file that is missing, slow or invalid is
// reported and its instrument keeps the synthesised sound.

import * as D from './dsp.js';
import { BPM } from '../theory.js';

export const MANIFEST_URL = 'assets/drill/manifest.json';
const FETCH_TIMEOUT_MS = 12000;

/** Used when the manifest itself cannot be fetched: synthesis only. */
export const BUILT_IN_MANIFEST = {
  version: 1,
  key: 'F minor',
  bpm: BPM,
  instruments: {
    kick: { kind: 'oneshot', synth: 'kick' },
    snare: { kind: 'oneshot', synth: 'snare' },
    clap: { kind: 'oneshot', synth: 'clap' },
    hat: { kind: 'oneshot', synth: 'hat' },
    ohat: { kind: 'oneshot', synth: 'openHat' },
    crash: { kind: 'oneshot', synth: 'crash' },
    rim: { kind: 'oneshot', synth: 'rim' },
    perc: { kind: 'oneshot', synth: 'perc' },
    shaker: { kind: 'oneshot', synth: 'shaker' },
    808: { kind: 'tonal', synth: '808', rootMidi: D.EIGHT_O_EIGHT_ROOT },
    piano: { kind: 'multisample', synth: 'keys', release: 0.35 },
    flute: { kind: 'multisample', synth: 'flute', release: 0.22, attack: 0.012 },
    glock: { kind: 'multisample', synth: 'bell', release: 0.5 },
    pluck: { kind: 'multisample', synth: 'pluck', release: 0.12 },
    bell: { kind: 'multisample', synth: 'bell', release: 0.5 },
    pulse: { kind: 'multisample', synth: 'pulse', release: 0.04 },
    acid: { kind: 'multisample', synth: 'acid', release: 0.05 },
    vox: { kind: 'vowels', synth: 'vox', release: 0.12 },
  },
  stems: {},
  provenance: {},
};

const ONESHOT_SYNTHS = {
  kick: () => D.kick(),
  snare: () => D.snare(),
  clap: () => D.clap(),
  hat: () => D.hat(),
  openHat: () => D.openHat(),
  crash: () => D.crash(),
  rim: () => D.rim(),
  perc: () => D.perc(),
  shaker: () => D.shaker(),
  808: () => D.bass808(),
};
const PITCHED_SYNTHS = {
  keys: (m) => D.keys(m),
  flute: (m) => D.flute(m),
  bell: (m) => D.bell(m),
  pluck: (m) => D.pluck(m),
  pulse: (m) => D.pulse(m),
  acid: (m) => D.acid(m),
};

// ---------------------------------------------------------------- audio buffers

let scratch = null;
function scratchContext(sampleRate) {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!scratch || scratch.sampleRate !== sampleRate) scratch = new Offline(1, 1, sampleRate);
  return scratch;
}

/** Arrays → AudioBuffer (usable by any context, live or offline). */
export function toAudioBuffer({ channels, sampleRate }) {
  let buf;
  try {
    buf = new AudioBuffer({ length: channels[0].length, numberOfChannels: channels.length, sampleRate });
  } catch {
    buf = scratchContext(sampleRate).createBuffer(channels.length, channels[0].length, sampleRate);
  }
  channels.forEach((c, i) => buf.getChannelData(i).set(c));
  return buf;
}

function decode(arrayBuffer, sampleRate) {
  const ctx = scratchContext(sampleRate);
  return new Promise((resolve, reject) => {
    // old Safari only knows the callback form
    const p = ctx.decodeAudioData(arrayBuffer, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

async function fetchWithTimeout(url, ms = FETCH_TIMEOUT_MS) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctl?.signal, cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const resolveUrl = (base, src) => {
  try {
    return new URL(src, new URL(base, globalThis.location?.href || 'http://localhost/')).href;
  } catch {
    return src;
  }
};

// ---------------------------------------------------------------- validation

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Problems with a stem entry, or [] when it can be used. Stems must match the edition's tempo and key. */
export function stemProblems(stem) {
  const out = [];
  if (!stem || typeof stem.src !== 'string') out.push('no src');
  if (stem && stem.bpm !== BPM) out.push(`tempo ${stem.bpm} ≠ ${BPM} BPM`);
  if (stem && !/^f\s*(minor|min|m)$/i.test(String(stem.key || '').trim())) out.push(`key "${stem.key}" ≠ F minor`);
  if (stem && !(isNum(stem.bars) && stem.bars >= 1 && stem.bars <= 32)) out.push('bars must be 1–32');
  return out;
}

// ------------------------------------------------------------------- the bank

/**
 * Everything the instruments need, ready to play. Synthesised sounds are made
 * on first use and cached, so the first notes of a new instrument never wait
 * on the network.
 */
export class AssetBank {
  constructor(manifest, sampleRate = D.SR) {
    this.manifest = manifest;
    this.sampleRate = sampleRate;
    this.oneshots = new Map(); // name → AudioBuffer[] (round robin)
    this.zones = new Map(); // name → [{ midi, tuneCents, buffer }]
    this.vowelZones = new Map(); // vowel → [{ midi, buffer }]
    this.stems = new Map(); // "layer/variation" → { buffer, bars, gain }
    this.cache = new Map();
    this.report = { loaded: [], fallback: [], failed: [], rejected: [] };
    this.rr = new Map();
  }

  def(name) {
    return this.manifest.instruments?.[name] || BUILT_IN_MANIFEST.instruments[name] || {};
  }

  gain(name) {
    const g = this.def(name).gain;
    return isNum(g) ? Math.min(4, Math.max(0, g)) : 1;
  }

  _cached(key, make) {
    let v = this.cache.get(key);
    if (!v) {
      v = toAudioBuffer(make());
      this.cache.set(key, v);
    }
    return v;
  }

  /** A one-shot buffer (drums, effects), round-robin when there are several. */
  oneshot(name) {
    const list = this.oneshots.get(name);
    if (list?.length) {
      const i = (this.rr.get(name) || 0) % list.length;
      this.rr.set(name, i + 1);
      return list[i];
    }
    const synth = this.def(name).synth || name;
    const make = ONESHOT_SYNTHS[synth] || ONESHOT_SYNTHS[name];
    return make ? this._cached(`one:${synth}`, make) : null;
  }

  /** The 808 (or any tonal one-shot): buffer + the note it was recorded at. */
  tonal(name) {
    const def = this.def(name);
    const list = this.oneshots.get(name);
    if (list?.length) return { buffer: list[0], rootMidi: isNum(def.rootMidi) ? def.rootMidi : D.EIGHT_O_EIGHT_ROOT };
    return { buffer: this._cached('one:808', ONESHOT_SYNTHS[808]), rootMidi: D.EIGHT_O_EIGHT_ROOT };
  }

  /**
   * The buffer and playback rate for a pitched note. Sampled instruments use the
   * nearest zone (corrected by its measured tuning); synthesised ones are made at
   * the exact pitch.
   */
  note(name, midi) {
    const zones = this.zones.get(name);
    if (zones?.length) {
      let best = zones[0];
      for (const z of zones) if (Math.abs(z.midi - midi) < Math.abs(best.midi - midi)) best = z;
      const semis = midi - best.midi - (best.tuneCents || 0) / 100;
      return { buffer: best.buffer, rate: 2 ** (semis / 12) };
    }
    const synth = this.def(name).synth || name;
    const make = PITCHED_SYNTHS[synth];
    if (!make) return null;
    return { buffer: this._cached(`note:${synth}:${midi}`, () => make(midi)), rate: 1 };
  }

  /** A vocal chop: recorded vowels if the manifest provides them, else the formant synth. */
  vox(midi, vowel = 'ah') {
    const zones = this.vowelZones.get(vowel) || this.vowelZones.get('ah');
    if (zones?.length) {
      let best = zones[0];
      for (const z of zones) if (Math.abs(z.midi - midi) < Math.abs(best.midi - midi)) best = z;
      return { buffer: best.buffer, rate: 2 ** ((midi - best.midi - (best.tuneCents || 0) / 100) / 12) };
    }
    const v = D.VOWEL_NAMES.includes(vowel) ? vowel : 'ah';
    return { buffer: this._cached(`vox:${v}:${midi}`, () => D.voxChop(midi, v)), rate: 1 };
  }

  /** A short string-section chord (cached per voicing). */
  stab(midis) {
    const key = `stab:${[...midis].sort((a, b) => a - b).join('.')}`;
    return this._cached(key, () => D.stab(midis));
  }

  /** A seamless looping bed, four bars long. */
  bed(kind) {
    const seconds = (240 / BPM) * 4;
    return this._cached(`bed:${kind}`, () => D.bed(kind, seconds));
  }

  /** Transition sounds that must end exactly on a bar line (cached per length). */
  fx(kind, seconds) {
    const s = Math.round(seconds * 1000) / 1000;
    const make = { riser: () => D.riser(s), reverse: () => D.reverseCymbal(s), swell: () => D.voxSwell(s), impact: () => D.impact() }[kind];
    return make ? this._cached(`fx:${kind}:${kind === 'impact' ? '' : s}`, make) : null;
  }

  stem(key) {
    return this.stems.get(key) || null;
  }

  /** Keys of the stems that loaded, for the composer. */
  get stemKeys() {
    return new Set(this.stems.keys());
  }

  /** Render the synthesised sounds the music is about to need, a few at a time, without blocking. */
  async prewarm(list, { yieldEvery = 12 } = {}) {
    let k = 0;
    for (const [kind, ...args] of list) {
      if (kind === 'note') this.note(args[0], args[1]);
      else if (kind === 'vox') this.vox(args[0], args[1]);
      else if (kind === 'one') this.oneshot(args[0]);
      else if (kind === 'tonal') this.tonal(args[0]);
      else if (kind === 'bed') this.bed(args[0]);
      else if (kind === 'stab') this.stab(args[0]);
      else if (kind === 'fx') this.fx(args[0], args[1]);
      if (++k % yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
    }
  }

}

// -------------------------------------------------------------------- loading

const fromBase64 = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

/**
 * Load the manifest and its audio files. Resolves with a bank in every case —
 * at worst a synthesis-only one — and reports progress through `onProgress`.
 *
 * `inline` serves a page that may not make requests (the claude.ai preview build):
 * `{ manifest, files: { "samples/…wav": base64 } }` replaces every fetch.
 *
 * @param {{ url?: string, sampleRate?: number, onProgress?: (done:number, total:number)=>void, inline?: object|null }} [o]
 */
export async function loadAssets({ url = MANIFEST_URL, sampleRate = D.SR, onProgress, inline = globalThis.__DRILL_INLINE_ASSETS__ || null } = {}) {
  let manifest = BUILT_IN_MANIFEST;
  let manifestError = null;
  try {
    const json = inline ? inline.manifest : await (await fetchWithTimeout(url)).json();
    if (!json || typeof json !== 'object' || typeof json.instruments !== 'object') throw new Error('not a manifest');
    manifest = json;
  } catch (err) {
    manifestError = String(err?.message || err);
  }
  const readFile = async (src) => {
    if (!inline) return (await fetchWithTimeout(resolveUrl(url, src))).arrayBuffer();
    const b64 = inline.files?.[src];
    if (typeof b64 !== 'string') throw new Error('not embedded in this build');
    return fromBase64(b64);
  };
  const bank = new AssetBank(manifest, sampleRate);
  if (manifestError) bank.report.failed.push({ id: 'manifest', src: url, reason: manifestError });

  const jobs = [];
  const job = (fn) => jobs.push(fn);
  for (const [name, def] of Object.entries(manifest.instruments || {})) {
    if (Array.isArray(def.samples) && def.samples.length) {
      job(async () => {
        const bufs = [];
        for (const s of def.samples) {
          try {
            bufs.push(await decode(await readFile(s.src), sampleRate));
          } catch (err) {
            bank.report.failed.push({ id: name, src: s.src, reason: String(err?.message || err) });
          }
        }
        if (bufs.length) {
          bank.oneshots.set(name, bufs);
          bank.report.loaded.push(name);
        } else bank.report.fallback.push(name);
      });
    }
    if (Array.isArray(def.zones) && def.zones.length) {
      job(async () => {
        const zones = [];
        await Promise.all(
          def.zones.map(async (z) => {
            if (!isNum(z.midi)) return bank.report.rejected.push({ id: name, src: z.src, reason: 'zone needs a midi note' });
            try {
              const buffer = await decode(await readFile(z.src), sampleRate);
              zones.push({ midi: z.midi, tuneCents: isNum(z.tuneCents) ? z.tuneCents : 0, vowel: z.vowel, buffer });
            } catch (err) {
              bank.report.failed.push({ id: name, src: z.src, reason: String(err?.message || err) });
            }
          }),
        );
        zones.sort((a, b) => a.midi - b.midi);
        if (!zones.length) return bank.report.fallback.push(name);
        if (def.kind === 'vowels') {
          for (const z of zones) {
            const v = z.vowel || 'ah';
            if (!bank.vowelZones.has(v)) bank.vowelZones.set(v, []);
            bank.vowelZones.get(v).push(z);
          }
        } else bank.zones.set(name, zones);
        bank.report.loaded.push(name);
      });
    }
  }
  for (const [key, stem] of Object.entries(manifest.stems || {})) {
    const problems = stemProblems(stem);
    if (problems.length) {
      bank.report.rejected.push({ id: key, src: stem?.src, reason: problems.join('; ') });
      continue;
    }
    job(async () => {
      try {
        const buffer = await decode(await readFile(stem.src), sampleRate);
        const expected = (240 / BPM) * stem.bars;
        if (Math.abs(buffer.duration - expected) > 0.05 && buffer.duration < expected) throw new Error(`stem is ${buffer.duration.toFixed(2)} s, expected ${expected.toFixed(2)} s`);
        bank.stems.set(key, { buffer, bars: stem.bars, gain: isNum(stem.gain) ? stem.gain : 1 });
        bank.report.loaded.push(`stem:${key}`);
      } catch (err) {
        bank.report.failed.push({ id: `stem:${key}`, src: stem.src, reason: String(err?.message || err) });
      }
    });
  }

  let done = 0;
  onProgress?.(0, jobs.length);
  await Promise.all(
    jobs.map(async (fn) => {
      await fn();
      onProgress?.(++done, jobs.length);
    }),
  );
  return bank;
}

/** The synthesised notes a state is likely to need soon (for prewarming). */
export function prewarmList() {
  const list = [['one', 'kick'], ['one', 'snare'], ['one', 'clap'], ['one', 'hat'], ['one', 'ohat'], ['one', 'rim'], ['one', 'perc'], ['one', 'shaker'], ['tonal', '808'], ['bed', 'room']];
  const scale = [];
  for (let m = 48; m <= 98; m++) if ([5, 7, 8, 10, 0, 1, 3].includes(m % 12)) scale.push(m);
  for (const m of scale.filter((x) => x >= 60 && x <= 91)) list.push(['note', 'pluck', m]);
  for (const m of scale.filter((x) => x >= 63 && x <= 79)) for (const v of ['ah', 'oh', 'eh', 'oo']) list.push(['vox', m, v]);
  for (const m of scale.filter((x) => x >= 72 && x <= 98)) list.push(['note', 'bell', m]);
  list.push(['bed', 'vinyl'], ['bed', 'air'], ['one', 'crash']);
  for (const m of scale.filter((x) => x >= 48 && x <= 60)) list.push(['note', 'pulse', m]);
  for (const m of scale.filter((x) => x >= 60 && x <= 80)) list.push(['note', 'acid', m]);
  return list;
}

