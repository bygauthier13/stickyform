// Turns a sample's file path into structured metadata (loop or one-shot, BPM, key,
// instrument group, tags). Pure functions with no I/O, so the same code runs in the
// index builder and in the tests.
//
// Sample packs name things in wildly different ways, so nothing here is trusted
// blindly: every guess carries a source or a flag, and anything still unclear
// is left for the audio-analysis pass (length, pitch, loudness) to settle.
import { createHash } from 'node:crypto';

const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Words that say nothing about a pack once a name is split into tokens. */
const GENERIC = new Set(['the', 'and', 'presents', 'present', 'vol', 'sample', 'pack', 'sounds', 'edition', 'collection', 'audio', 'feat', 'by']);
/** Structural words: they describe the file's role, not its sound. */
const STOP = new Set(['loop', 'loops', 'one', 'shot', 'shots', 'oneshot', 'oneshots', 'hit', 'hits', 'song', 'starter']);

// "DrumFill1" → Drum Fill 1; "F#min" stays whole.
const words = (s) => s
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/([A-Za-z])(\d)/g, '$1 $2')
  .replace(/(\d)([A-Za-z])/g, '$1 $2')
  .split(/[^A-Za-z0-9#]+/)
  .filter(Boolean);
const compact = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const lower = (a) => a.map((t) => t.toLowerCase());

// ------------------------------------------------------------------ key

const KEY_RE = /^([A-G])([#b]?)(min|Min|MIN|minor|Minor|m|maj|Maj|MAJ|major|Major)?$/;

/**
 * "Fmin", "F#min", "Em", "Bbmaj" → { name, root, pc, mode }.
 * A bare letter ("C") is only accepted when `bare` is set, because "A" or "E"
 * on their own are far more often part of a sentence than a key.
 */
export function parseKeyToken(tok, bare = false) {
  let m = KEY_RE.exec(tok);
  if (!m && bare) {
    const o = /^([A-G])([#b]?)-?\d$/.exec(tok); // a note name with its octave: "C#3"
    if (o) m = [tok, o[1], o[2], undefined];
  }
  if (!m) return null;
  const [, letter, acc, modeStr] = m;
  if (!modeStr && !bare) return null;
  const pc = (LETTER_PC[letter] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
  const mode = !modeStr ? null : /^maj/i.test(modeStr) ? 'major' : 'minor';
  const root = SHARPS[pc];
  return { name: root + (mode === 'minor' ? 'm' : mode === 'major' ? 'maj' : ''), root, pc, mode };
}

/** Camelot wheel code ("8A" = A minor), the quick way to tell which keys mix. */
export function camelot(key) {
  if (!key || !key.mode) return null;
  const minorPc = key.mode === 'minor' ? key.pc : (key.pc + 9) % 12;
  return ((minorPc * 7 + 5) % 12 || 12) + (key.mode === 'minor' ? 'A' : 'B');
}

// ------------------------------------------------------------------ tempo

/** First plausible BPM among the tokens (60–200; "808" or "04" are not tempos). */
export function parseBpm(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let m = /^(\d{2,3})bpm$/i.exec(t);
    if (m) return +m[1];
    if (/^bpm$/i.test(t) && /^\d{2,3}$/.test(tokens[i + 1] || '')) return +tokens[i + 1];
    m = /^([1-9]\d{1,2})$/.exec(t);
    if (m && +m[1] >= 60 && +m[1] <= 200) return +m[1];
  }
  return null;
}

// ------------------------------------------------------------------ instruments

const FX_RE = /^(fx|sfx|riser|risers|build|builds|buildup|sweep|sweeps|impact|impacts|uplifter|downlifter|transition|transitions|swell|whoosh|animal)$/;

// [token pattern, group, instrument]: the first match, in reading order, wins.
const LEX = [
  [/^(kick|kicks|bd)$/, 'drums', 'kick'],
  [/^(snare|snares)$/, 'drums', 'snare'],
  [/^(clap|claps|snap|snaps)$/, 'drums', 'clap'],
  [/^(hat|hats|hihat|hihats|hh)$/, 'drums', 'hat'],
  [/^(tom|toms)$/, 'drums', 'tom'],
  [/^(crash|ride|cymbal|cymbals)$/, 'drums', 'cymbal'],
  [/^(perc|percs|percussion|shaker|shakers|tambourine|cowbell|clave|conga|congas|bongo|bongos|tabla|woodblock|guiro|cabasa|triangle)$/, 'drums', 'perc'],
  [/^(drum|drums|beat|beats|breakbeat)$/, 'drums', 'drums'],
  [/^top$/, 'drums', 'top'],
  [/^(808|808s)$/, 'bass', '808'],
  [/^(bass|sub|reese)$/, 'bass', 'bass'],
  [/^(chord|chords|stab|stabs)$/, 'harmony', 'chords'],
  [/^(piano|rhodes|keys|organ|wurli|wurlitzer|epiano|clav|keyboard)$/, 'harmony', 'keys'],
  [/^(pad|pads|string|strings)$/, 'harmony', 'pad'],
  [/^(vocal|vocals|vox|voice|voices|chant|chants|adlib|adlibs|acapella|choir|chop|chops|hook|hooks|gang|phrase|phrases)$/, 'vocal', 'vocal'],
  [/^(guitar|guitars|gtr|banjo|ukulele|sitar|oud)$/, 'melody', 'guitar'],
  [/^(flute|flutes|sax|saxophone|trumpet|horn|horns|brass|violin|cello|harp|marimba|kalimba|bell|bells)$/, 'melody', null],
  [/^(melody|melodic|melodies|riff|riffs)$/, 'melody', 'melody'],
  [/^(lead|leads)$/, 'melody', 'lead'],
  [/^(arp|arps)$/, 'melody', 'arp'],
  [/^(pluck|plucks)$/, 'melody', 'pluck'],
  [/^(synth|synths)$/, 'melody', 'synth'],
  [/^(stack|stacks|resampled|songstarter|songstarters)$/, 'music', 'stack'],
  [/^(music|musical|pattern|patterns|tonal)$/, 'music', 'music'],
  [/^(texture|textures|ambience|ambient|atmos|atmosphere|vinyl|crackle|foley|noise|drone|static|hiss|hum|buzz|rumble)$/, 'texture', 'texture'],
  [/^(fx|sfx|riser|risers|build|builds|buildup|sweep|sweeps|impact|impacts|uplifter|downlifter|transition|transitions|swell|whoosh|animal)$/, 'fx', 'fx'],
];

const VARIANT = {
  full: 'full', top: 'top', fill: 'fill', fills: 'fill', hook: 'hook', hooks: 'hook', gang: 'gang',
  chop: 'chops', chops: 'chops', adlib: 'adlib', adlibs: 'adlib', phrase: 'phrase', phrases: 'phrase',
  songstarter: 'songstarter', riser: 'riser', risers: 'riser', build: 'build', builds: 'build', buildup: 'build',
  impact: 'impact', impacts: 'impact', sweep: 'sweep', sweeps: 'sweep', animal: 'animal',
};

/** [group, instrument] for a token, or null. */
const TONAL = new Set(['bass', 'harmony', 'melody', 'vocal', 'music']);
/** Single hits: a file named after one of these, with no tempo, is a one-shot. */
const HIT_INSTRUMENTS = new Set(['kick', 'snare', 'clap', 'hat', 'tom', 'cymbal', '808']);

const lexOf = (token) => {
  const row = LEX.find(([re]) => re.test(token));
  return row ? [row[1], row[2] ?? token] : null;
};

// Words stuck together ("fluteharm", "bassline"): matched by their start, only as a last resort.
const LOOSE = [['drum', 'drums', 'drums'], ['kick', 'drums', 'kick'], ['snare', 'drums', 'snare'], ['perc', 'drums', 'perc'],
  ['bass', 'bass', 'bass'], ['vocal', 'vocal', 'vocal'], ['synth', 'melody', 'synth'], ['flute', 'melody', 'flute'],
  ['piano', 'harmony', 'keys'], ['guitar', 'melody', 'guitar'], ['chord', 'harmony', 'chords'], ['melod', 'melody', 'melody']];
const looseOf = (token) => {
  const row = token.length >= 6 && LOOSE.find(([stem]) => token.startsWith(stem));
  return row ? [row[1], row[2]] : null;
};

// ------------------------------------------------------------------ genres

// Matched against the pack's folder names only, never the file name.
const GENRES = [
  [/afrohouse/, 'afro_house'], [/afrobeat/, 'afrobeat'], [/afro/, 'afro'], [/jersey/, 'jersey_club'],
  [/trap/, 'trap'], [/drill/, 'drill'], [/dancehall/, 'dancehall'], [/moombahton/, 'moombahton'], [/worldbass/, 'world_bass'],
  [/drumbass|drumandbass|dnb|liquidfunk|jungle/, 'drum_and_bass'], [/lofi/, 'lofi'], [/futurebeats/, 'future_beats'],
  [/synthwave/, 'synthwave'], [/techno/, 'techno'], [/house/, 'house'], [/dubstep/, 'dubstep'], [/dub(?!step)|reggae/, 'dub_reggae'],
  [/kpop/, 'k_pop'], [/pop/, 'pop'], [/hiphop/, 'hip_hop'], [/jazz/, 'jazz'], [/soul/, 'soul'], [/funk/, 'funk'],
  [/middleeast/, 'middle_eastern'], [/amapiano/, 'amapiano'], [/reggaeton/, 'reggaeton'],
];

export function genresOf(packName, innerName = '') {
  const c = compact(packName + ' ' + innerName);
  return GENRES.filter(([re]) => re.test(c)).map(([, g]) => g);
}

// ------------------------------------------------------------------ path

function isInnerRoot(name, packTokens) {
  if (/sample|pack|labeled|processed|audio/i.test(name)) return true;
  return lower(words(name)).some((t) => t.length >= 3 && !GENERIC.has(t) && packTokens.has(t));
}

/** Parse one path (relative to the library root: "Pack/…/file.wav"). */
export function parsePath(rel) {
  const segs = rel.replace(/\\/g, '/').split('/').filter(Boolean);
  const file = segs.pop();
  const ext = ((/\.([A-Za-z0-9]+)$/.exec(file) || [])[1] || '').toLowerCase();
  const stem = file.replace(/\.[A-Za-z0-9]+$/, '');
  const pack = segs.shift() || '';
  const packTokens = new Set(lower(words(pack)).filter((t) => t.length >= 3 && !GENERIC.has(t)));

  // Most packs wrap everything in a folder named after themselves; it carries no category.
  let inner = '';
  if (segs.length >= 2 && isInnerRoot(segs[0], packTokens)) inner = segs.shift();
  const dir = segs.join('/');

  const tokens = words(stem);
  const lt = lower(tokens);
  const flags = [];

  // ---- tempo and key written in the file name
  let bpm = parseBpm(tokens);
  let bpmSource = bpm ? 'name' : null;
  let key = null;
  let keySource = null;
  let keyIdx = -1;
  for (let i = tokens.length - 1; i >= 0 && !key; i--) {
    key = parseKeyToken(tokens[i]);
    if (key) [keyIdx, keySource] = [i, 'name'];
  }

  // ---- kit: some packs put tempo and key in a folder name ("…_150_FB_PowerfullTrack__Bmin")
  let kit = null;
  let kitBpm = null;
  let kitKey = null;
  for (let i = segs.length - 1; i >= 0 && !kit; i--) {
    const w = words(segs[i]);
    const b = parseBpm(w);
    const k = [...w].reverse().map((t) => parseKeyToken(t)).find(Boolean) || null;
    if (b || k) [kit, kitBpm, kitKey] = [segs.slice(0, i + 1).join('/'), b, k];
  }

  // ---- instrument: the file name first, then the nearest category folder
  const noKick = lt.some((t, i) => t === 'no' && lt[i + 1] === 'kick');
  const skip = new Set(noKick ? [lt.indexOf('kick')] : []);
  const dirTokens = lower(words(segs.join(' '))).reverse(); // nearest folder first
  const exact = lt.map((t, i) => (skip.has(i) ? null : lexOf(t)));
  const nameHit = exact.find(Boolean) || null;
  const fxWord = lt.find((t) => FX_RE.test(t));
  let hit = nameHit;
  // "Drum FX Build" is an effect, but "horn swell" is still a horn.
  if (fxWord && (!nameHit || nameHit[0] === 'drums')) hit = ['fx', 'fx'];
  if (!hit) hit = lt.map((t, i) => (skip.has(i) ? null : looseOf(t))).find(Boolean) || null;
  if (!hit) hit = dirTokens.map(lexOf).find(Boolean) || dirTokens.map(looseOf).find(Boolean) || null;
  let [group, instrument] = hit || ['other', null];
  if (group === 'melody' && lt.some((t) => /^(chord|chords)$/.test(t))) group = 'harmony';
  const instruments = [...new Set([...exact.filter(Boolean).map((l) => l[1]), ...(fxWord ? ['fx'] : [])])];

  let variant = noKick ? 'no_kick' : null;
  if (!variant && lt.some((t, i) => t === 'song' && lt[i + 1] === 'starter')) variant = 'songstarter';
  for (const t of [...lt, ...dirTokens]) {
    if (variant) break;
    if (Object.hasOwn(VARIANT, t)) variant = VARIANT[t];
  }

  // ---- loop or one-shot
  const cs = compact(stem);
  const cd = compact(dir);
  const nameLoop = /loop|stack|songstarter/.test(cs) || lt.some((t, i) => t === 'song' && lt[i + 1] === 'starter');
  const nameOne = /oneshot|singlehit/.test(cs) || lt.includes('hit') || lt.includes('hits');
  const folderOne = /oneshot|single|hits/.test(cd);
  const folderLoop = /loop/.test(cd);
  let kind = 'unknown';
  let kindSource = 'none';
  if (nameLoop) [kind, kindSource] = ['loop', 'name'];
  else if (bpm) [kind, kindSource] = ['loop', 'bpm'];
  else if (nameOne || folderOne) [kind, kindSource] = ['oneshot', nameOne ? 'name' : 'folder'];
  else if (folderLoop) [kind, kindSource] = ['loop', 'folder'];
  else if (HIT_INSTRUMENTS.has(instrument)) [kind, kindSource] = ['oneshot', 'instrument'];
  if (kind === 'loop' && (nameOne || folderOne) && kindSource !== 'folder') flags.push('kind-conflict');

  // Whatever the name left out, the kit folder may say.
  if (kind !== 'oneshot' && kit) {
    if (!bpm && kitBpm) {
      [bpm, bpmSource] = [kitBpm, 'kit'];
      if (kind === 'unknown') [kind, kindSource] = ['loop', 'kit'];
    }
    if (!key && kitKey && TONAL.has(group)) [key, keySource] = [kitKey, 'kit'];
  }

  // A tuned one-shot may carry a bare note name: "OS_AS_C_808_Pound", "Vocal_Shout_31_G#".
  if (!key && kind === 'oneshot' && ['bass', 'harmony', 'melody', 'vocal'].includes(group)) {
    for (let i = 0; i < tokens.length && !key; i++) {
      key = parseKeyToken(tokens[i], true);
      if (key) [keyIdx, keySource] = [i, 'name'];
    }
  }

  // ---- wet or dry
  let wet = null;
  if (lt.includes('dry')) wet = false;
  if (lt.some((t) => /^(wet|verb|verby|reverb|reverbed)$/.test(t))) wet = true;

  // ---- tags: whatever descriptive words are left
  const isSignal = (t, i) => parseBpm([t]) || (parseKeyToken(tokens[i]) && i === keyIdx) || lexOf(t) || STOP.has(t);
  const firstSignal = lt.findIndex(isSignal);
  const prefixEnd = firstSignal < 0 ? 0 : firstSignal;
  const tags = lt.filter((t, i) => i >= prefixEnd && !isSignal(t, i) && i !== keyIdx
    && t.length > 1 && !/^\d+$/.test(t) && !packTokens.has(t) && !/^(no|s)$/.test(t));

  // ---- flags the audio pass should look at
  if (kind === 'unknown') flags.push('kind-unknown');
  if (kind === 'loop' && !bpm) flags.push('no-bpm');
  if (kind === 'loop' && !key && TONAL.has(group)) flags.push('no-key');
  if (group === 'other') flags.push('group-unknown');

  return {
    id: createHash('sha1').update(rel.replace(/\\/g, '/')).digest('hex').slice(0, 10),
    pack, dir, file, ext,
    kind, kindSource,
    bpm, bpmSource,
    key, keySource,
    kit,
    camelot: camelot(key),
    group, instrument, instruments, variant,
    wet,
    genres: genresOf(pack, inner),
    tags: [...new Set(tags)],
    flags,
  };
}
