// Generic genre rules: what a pack *name* can tell us on its own.
//
// Only rules that generalise live here. The table of "this artist / this series
// sounds like X" is personal to a library and is read from a private file
// (`data/pack-curated.json`, git-ignored) — never committed.

const compact = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * [pattern, genres] matched against the compacted pack name. Order matters: the
 * most specific pattern must come first, so "nudisco" is not read as "disco".
 * Patterns are deliberately narrow — a wrong genre is worse than none.
 */
export const LEXICON = [
  [/nudisco/, ['nu_disco', 'disco', 'house']],
  [/frenchhouse|frenchtouch/, ['french_house', 'house', 'disco']],
  [/deephouse/, ['deep_house', 'house']],
  [/techhouse/, ['tech_house', 'house']],
  [/bassline|speedgarage/, ['uk_garage', 'house']],
  [/ukgarage|2step|garage/, ['uk_garage']],
  [/grime/, ['grime', 'uk_garage']],
  [/disco|boogie/, ['disco', 'funk']],
  [/eurodance/, ['eurodance', 'house']],
  [/psytrance|trance/, ['trance', 'edm']],
  [/hardstyle|rawstyle|gabber/, ['hardstyle', 'edm']],
  [/riddim/, ['dubstep', 'bass_music']],
  [/colorbass|colourbass/, ['bass_music', 'dubstep']],
  [/futurebass/, ['future_bass', 'edm']],
  [/bassmusic|heavybass|bassdesign|neurofunk/, ['bass_music']],
  [/breakbeat|breaks|bigbeat/, ['breaks']],
  [/phonk/, ['phonk']],
  [/hyperpop|digicore/, ['hyperpop', 'experimental']],
  [/chiptune|8bit|gameboy|videogame|retrogame/, ['chiptune', 'video_game']],
  [/edm|festival|bigroom|mainstage|electrohouse/, ['edm', 'house']],
  [/rnb|randb/, ['rnb', 'soul']],
  [/gospel|worship/, ['gospel', 'soul']],
  [/blues/, ['blues']],
  [/country|bluegrass|nashville/, ['country', 'folk']],
  [/folk|singersongwriter/, ['folk', 'acoustic']],
  [/acoustic|unplugged/, ['acoustic']],
  [/indierock|indiepop|indie/, ['indie', 'pop']],
  [/metalcore|metal|djent/, ['metal', 'rock']],
  [/punk|hardrock|rocktronic|rock(?!et)/, ['rock']],
  [/orchestra|orchestral|strings|cinematic|trailer|epic|soundtrack|filmscore/, ['cinematic', 'orchestral']],
  [/ambient|drone|meditation|soundscape/, ['ambient']],
  [/experimental|glitch|idm|abstract/, ['experimental']],
  [/foley/, ['foley', 'sfx']],
  [/soundeffect|sfx|soundfx/, ['sfx']],
  [/christmas|holiday/, ['christmas', 'sfx']],
  [/reggaeton|dembow|perreo/, ['reggaeton', 'latin']],
  [/baile|funkbrasil|brasil|brazil/, ['brazilian_funk', 'latin']],
  [/cumbia|salsa|bachata|merengue|mariachi|latin|cuba|flamenco|bossa|samba|tango/, ['latin']],
  [/bollywood|india|tabla|sitar/, ['indian', 'world_bass']],
  [/arab|oriental|turkish|persian|desert|souk/, ['middle_eastern']],
  [/japan|anime|kawaii|korea|tokyo/, ['asian']],
  [/gqom|kuduro|azonto|highlife/, ['afro']],
  [/afro/, ['afro']],
  [/club|baltimore|miamibass|ghetto/, ['club', 'breaks']],
  [/synthwave|retrowave|outrun/, ['synthwave']],
  [/boombap/, ['hip_hop']],
  [/beattape/, ['hip_hop', 'lofi']],
  [/typebeat|beats/, ['hip_hop']],
  [/chill|vibes|sleepy|dreamy|bedroom/, ['lofi']],
  [/tape|vinyl|cassette|dusty/, ['lofi']],
];

/** Words that describe what is in the pack, not what it sounds like. */
export const ROLE_WORD = /^(drum|drums|drumkit|kit|bass|vocal|vocals|perc|percussion|fx|loop|loops|oneshot|oneshots|melody|guitar|piano|keys|synth|pad|pads|texture|textures|top|tops|hat|hats|snare|kick|clap|808|stack|stacks|sample|samples|pack|vol|volume|essential|ultimate|toolkit|signature|presents|present|sound|sounds|edition|collection)$/i;

/**
 * Genres a pack name gives away on its own.
 * Returns `{ genres, matched }` — `matched` is the actual text that fired, so a
 * proposal can always be explained and audited.
 */
export function proposeFromName(packName, limit = 3) {
  const c = compact(packName);
  const hits = LEXICON.filter(([re]) => re.test(c));
  if (!hits.length) return { genres: [], matched: [] };
  return {
    genres: [...new Set(hits.flatMap(([, g]) => g))].slice(0, limit),
    matched: [...new Set(hits.map(([re]) => (re.exec(c) || [''])[0]).filter(Boolean))],
  };
}

/**
 * True when the name holds nothing but role words and volume numbers, so there is
 * nothing to read even in principle ("Drum Loops Vol. 2"). A name with real words in
 * it is not opaque — it is simply unknown, which is a different problem.
 */
export function nameIsOpaque(packName) {
  const words = packName.split(/[^A-Za-z0-9&']+/).filter((w) => w && !/^\d+$/.test(w));
  return !words.some((w) => !ROLE_WORD.test(w));
}
