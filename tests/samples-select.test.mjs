// Style families, the generic genre rules, and the style-compatibility selector.
// Pack and file names here are invented: the real library's names stay out of the repo.
//   npm test
import assert from 'node:assert/strict';
import { FAMILIES, FAMILY_OF, MAX_SHIFT, STYLES, familyOf, keyFit, renderPlan, tempoFit } from '../scripts/samples/styles.mjs';
import { LEXICON, nameIsOpaque, proposeFromName } from '../scripts/samples/genres.mjs';
import { bucketOf, evaluate, fill, hasLyrics } from '../scripts/samples/select.mjs';

let checks = 0;
const eq = (actual, expected, msg) => {
  checks++;
  assert.deepEqual(actual, expected, msg);
};
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};

const SS = STYLES.stickysound;
const DRILL = STYLES.drill;
const key = (pc, mode) => ({ pc, mode });

// ---------------------------------------------------------------- style families
eq(FAMILIES.length, 8, 'eight style families, one per engine style pack');
for (const [tag, family] of Object.entries(FAMILY_OF)) ok(FAMILIES.includes(family), `${tag} lands in a known family`);
eq(familyOf(['lofi']), 'lofi', 'a tag maps to its family');
eq(familyOf(['nu_disco', 'house']), 'soul', 'the first tag that has a family wins');
eq(familyOf([]), 'unlabelled', 'no genre, no family');
eq(familyOf(['not_a_genre']), 'unlabelled', 'an unknown tag is not invented into a family');

// ---------------------------------------------------------------- key fitting
// D minor and F major are the same seven notes: a minor loop goes to D, a major one to F.
eq(keyFit(key(2, 'minor'), SS.key), 0, 'D minor is already home');
eq(keyFit(key(5, 'major'), SS.key), 0, 'F major is the same key');
eq(keyFit(key(9, 'minor'), SS.key), 5, 'A minor is a fourth up from D minor');
eq(keyFit(key(7, 'minor'), SS.key), -5, 'G minor is a fourth down');
eq(keyFit(key(0, 'minor'), SS.key), 2, 'C minor moves up a tone');
eq(keyFit(key(4, 'minor'), SS.key), -2, 'E minor moves down a tone');
eq(keyFit(key(8, 'minor'), SS.key), 6, 'the tritone is reported as +6, never +7 or -6');
eq(keyFit(key(0, 'major'), SS.key), 5, 'C major is a fourth from F major');
eq(keyFit(key(5, 'minor'), DRILL.key), 0, 'F minor is home for the drill style');
eq(keyFit(key(8, 'major'), DRILL.key), 0, 'Ab major is the same key as F minor');
eq(keyFit(null, SS.key), null, 'no key, no answer');
eq(keyFit({ pc: 3, mode: null }, SS.key), null, 'a bare note has no mode to match');
for (let pc = 0; pc < 12; pc++) {
  for (const mode of ['minor', 'major']) {
    const s = keyFit(key(pc, mode), SS.key);
    ok(s >= -6 && s <= 6, `${pc} ${mode} is reported as the shorter move (${s})`);
  }
}

// ---------------------------------------------------------------- tempo fitting
eq(tempoFit(110, SS.tempo).tier, 'exact', '110 is inside 90–126');
eq(tempoFit(110, SS.tempo).stretch, 0, 'nothing to stretch');
eq(tempoFit(150, SS.tempo), null, '150 is out of reach: half-time is 75, below the band, and too far to stretch');
eq(tempoFit(170, SS.tempo).how, 'half-time', '170 halves to 85, close enough to stretch up to 90');
eq(tempoFit(170, SS.tempo).bpm, 90, 'and it is stretched to the bottom of the band');
eq(tempoFit(60, SS.tempo).how, 'double-time', 'a 60 loop plays at 120 in double-time');
eq(tempoFit(200, SS.tempo).how, 'half-time', 'a 200 loop plays at 100 in half-time');
eq(tempoFit(128, SS.tempo).tier, 'stretch', '128 is just outside and must be stretched');
eq(tempoFit(128, SS.tempo).bpm, 126, 'it is stretched to the edge of the band, not past it');
ok(tempoFit(128, SS.tempo).stretch < 0, 'stretching 128 down to 126 is a negative ratio');
eq(tempoFit(140, SS.tempo), null, '140 is out of reach for StickySound');
eq(tempoFit(140, DRILL.tempo).tier, 'exact', '140 is home for the drill style');
eq(tempoFit(null, SS.tempo), null, 'no tempo, no fit');
eq(tempoFit(0, SS.tempo), null, 'a zero tempo is not a tempo');

// ---------------------------------------------------------------- render plan
eq(renderPlan(112, SS), [104, 112, 120], 'a 112 loop reaches the steps within 10 %');
eq(renderPlan(96, SS), [96, 104], 'a 96 loop cannot reach 112 without smearing');
eq(renderPlan(140, SS), [], 'a loop out of the band has nothing to render to');
eq(renderPlan(150, DRILL), [138, 144, 150, 156], 'at drill tempos every step is within reach');

// ---------------------------------------------------------------- genre rules
eq(proposeFromName('Deep Nu Disco Grooves').genres, ['nu_disco', 'disco', 'house'], 'nu disco is not plain disco');
eq(proposeFromName('UK Garage Essentials').genres, ['uk_garage'], 'garage is not read as "rage" → trap');
eq(proposeFromName('Heavy Bass Design Vol. 2').genres, ['bass_music'], '"design" is not read as "desi" → indian');
eq(proposeFromName('Underscores Of The Deep').genres, [], '"underscores" is not a film score');
eq(proposeFromName('Rocket Science').genres, [], '"rocket" is not rock');
eq(proposeFromName('Heavy Metal Drums').genres, ['metal', 'rock'], 'metal implies rock');
eq(proposeFromName('Dusty Tape Beats').genres.includes('lofi'), true, 'tape and dust mean lofi');
eq(proposeFromName('Bruno Delavega Vol. 3').genres, [], 'an artist name proposes nothing');
eq(proposeFromName('Cinematic Trailer Strings').genres, ['cinematic', 'orchestral'], 'cinematic strings');
ok(proposeFromName('Afro House Rollers').genres.includes('uk_garage') === false, 'afro house is not garage');
eq(proposeFromName('Lo-Fi Vinyl Chill Keys').genres.length <= 3, true, 'at most three genres are proposed');
eq(proposeFromName('Brazilian Phonk Selects').genres.includes('phonk'), true, 'phonk is recognised');
eq(proposeFromName('Deep India Flutes').genres, ['indian', 'world_bass'], 'india is recognised');
eq(proposeFromName('Spicy Riddim Drums').genres, ['dubstep', 'bass_music'], 'riddim is dubstep');
eq(proposeFromName('Christmas Bells').genres, ['christmas', 'sfx'], 'seasonal packs are flagged');
ok(proposeFromName('Tech House Tools').matched.includes('techhouse'), 'the matched text is reported, for auditing');
for (const [, genres] of LEXICON) ok(genres.length > 0, 'every lexicon rule proposes something');
for (const [, genres] of LEXICON) for (const g of genres) ok(FAMILY_OF[g], `${g} belongs to a style family`);

eq(nameIsOpaque('Drum Loops Vol. 2'), true, 'role words only: the name says nothing');
eq(nameIsOpaque('Midnight Tapes'), false, 'there are real words to look at');

// ---------------------------------------------------------------- lyrics
const vocalRec = (file, extra = {}) => ({ group: 'vocal', file, dir: 'Loops/Vocals', variant: null, ...extra });
eq(hasLyrics(vocalRec('XX_90_vocal_chop_airy_Dmin.wav')), false, 'a wordless chop is fine');
eq(hasLyrics(vocalRec('XX_90_vocal_hook_tonight_Dmin.wav')), true, 'a hook sings words');
eq(hasLyrics(vocalRec('XX_90_vocal_loop_Dmin.wav', { variant: 'adlib' })), true, 'an adlib is words');
eq(hasLyrics(vocalRec('XX_90_vocal_loop_Dmin.wav', { dir: 'Loops/Vocals/Phrases' })), true, 'the folder can say it too');
eq(hasLyrics({ group: 'melody', file: 'XX_hook_lead.wav', dir: '', variant: null }), false, 'only vocals carry lyrics');

// ---------------------------------------------------------------- buckets
const rec = (over = {}) => ({
  id: 'id0', pack: 'Invented Pack', dir: 'Loops', file: 'f.wav', kind: 'loop', group: 'drums',
  instrument: null, variant: null, bpm: 110, key: null, genres: ['house'], flags: [], path: 'Invented Pack/f.wav', ...over,
});
eq(bucketOf({ ...rec(), group: 'drums', kind: 'loop' }), 'rhythm-loops', 'drum loops');
eq(bucketOf({ ...rec(), group: 'drums', kind: 'oneshot' }), 'rhythm-hits', 'drum hits');
eq(bucketOf({ ...rec(), group: 'vocal', lyrics: false }), 'vocal', 'wordless vocals');
eq(bucketOf({ ...rec(), group: 'vocal', lyrics: true }), 'vocal-lyrics', 'sung words get their own bucket');
eq(bucketOf({ ...rec(), group: 'other' }), null, 'an unclassified group belongs nowhere');

// ---------------------------------------------------------------- evaluate
{
  const r = evaluate(rec({ group: 'drums', bpm: 110 }), SS);
  eq([r.reject, r.tier, r.shift], [null, 'A', null], 'a drum loop in tempo needs no key');
  eq(r.renderAt, [], 'drums are not pre-rendered per tempo step: they take the rate change');
}
{
  const r = evaluate(rec({ group: 'harmony', bpm: 112, key: { name: 'Dm', root: 'D', pc: 2, mode: 'minor' } }), SS);
  eq([r.reject, r.shift, r.tier], [null, 0, 'A'], 'a chord loop already in D minor');
  eq(r.renderAt, [104, 112, 120], 'tonal loops are pre-rendered at each reachable tempo step');
}
{
  const r = evaluate(rec({ group: 'harmony', bpm: 112, key: { name: 'Am', pc: 9, mode: 'minor' } }), SS);
  eq([r.reject, r.shift, r.tier], [null, 5, 'E'], 'A minor chords survive the fourth up, at the widest tier');
}
{
  const r = evaluate(rec({ group: 'bass', bpm: 112, key: { name: 'Am', pc: 9, mode: 'minor' } }), SS);
  eq(r.shift, 5, 'the move is the same for a bass');
  ok(/more than bass survives/.test(r.reject), 'but a bass is not transposed a fourth');
}
{
  const r = evaluate(rec({ group: 'music', bpm: 112, key: { name: 'Cm', pc: 0, mode: 'minor' } }), SS);
  eq([r.reject, r.shift], [null, 2], 'a full-mix loop may move a tone');
  const far = evaluate(rec({ group: 'music', bpm: 112, key: { name: 'Bm', pc: 11, mode: 'minor' } }), SS);
  ok(/more than music survives/.test(far.reject), 'but no further: it would drag its drums along');
}
{
  const r = evaluate(rec({ group: 'melody', bpm: 112, key: null }), SS);
  eq(r.reject, 'no key in the name (audio pass)', 'a tonal loop with no key waits for the audio pass');
  const hit = evaluate(rec({ kind: 'oneshot', group: 'melody', bpm: null, key: { name: 'C', pc: 0, mode: null } }), SS);
  eq([hit.reject, hit.shift], [null, 0], 'a pitched one-shot named with a bare note is retunable');
}
{
  eq(evaluate(rec({ kind: 'unknown' }), SS).reject, 'loop or one-shot unknown (audio pass)', 'unknown kind waits');
  ok(/out of this style's reach/.test(evaluate(rec({ bpm: 140 }), SS).reject), '140 is out of reach here');
  eq(evaluate(rec({ bpm: 140 }), DRILL).reject, null, 'and in reach for the drill style');
  eq(evaluate(rec({ bpm: null }), SS).reject, 'loop with no tempo in the name', 'a loop needs a tempo');
  eq(evaluate(rec(), SS, { 'Invented Pack': { skip: true } }).reject, 'pack skipped', 'a skipped pack is dropped');
}
{
  const r = evaluate(rec({ genres: [] }), SS, { 'Invented Pack': { genres: ['lofi'] } });
  eq(r.genres, ['lofi'], 'the override supplies the genre the name lacked');
  const keep = evaluate(rec({ genres: ['house'] }), SS, { 'Invented Pack': { genres: [] } });
  eq(keep.genres, ['house'], 'an empty override never erases a detected genre');
}
for (const g of Object.keys(MAX_SHIFT)) ok(MAX_SHIFT[g] >= 2 && MAX_SHIFT[g] <= 6, `${g} has a sane transposition limit`);

// ---------------------------------------------------------------- fill
{
  // One pack with 40 candidates, one with 4: the cap must stop the big one taking over.
  const big = Array.from({ length: 40 }, (_, i) => ({ ...rec({ id: `b${i}`, pack: 'Big Pack' }), tier: 'A', shift: null, tempo: { bpm: 110 } }));
  const small = Array.from({ length: 4 }, (_, i) => ({ ...rec({ id: `s${i}`, pack: 'Small Pack', genres: ['lofi'] }), tier: 'A', shift: null, tempo: { bpm: 110 } }));
  const picked = fill([...big, ...small], 20);
  eq(picked.length, 10, 'the caps limit what is available: 6 from one pack, 4 from the other');
  eq(picked.filter((r) => r.pack === 'Big Pack').length, 6, 'at most six per pack per layer');
  eq(new Set(picked.map((r) => r.id)).size, picked.length, 'no sample is picked twice');
}
{
  // Best tier first: a handful of in-key loops must be chosen before the far ones.
  const near = Array.from({ length: 3 }, (_, i) => ({ ...rec({ id: `n${i}`, pack: `P${i}` }), tier: 'A', shift: 0, tempo: { bpm: 110 } }));
  const far = Array.from({ length: 10 }, (_, i) => ({ ...rec({ id: `f${i}`, pack: `Q${i}` }), tier: 'E', shift: 5, tempo: { bpm: 110 } }));
  const picked = fill([...far, ...near], 3);
  eq(picked.map((r) => r.tier), ['A', 'A', 'A'], 'the closest key is always preferred');
}
{
  const pool = Array.from({ length: 30 }, (_, i) => ({ ...rec({ id: `x${i}`, pack: `Pack ${i}` }), tier: 'A', shift: null, tempo: { bpm: 110 } }));
  eq(fill(pool, 7).length, 7, 'a quota is met exactly when the pool allows');
  eq(fill(pool, 100).length, 30, 'and never invents samples that are not there');
  eq(fill([], 10).length, 0, 'an empty pool yields nothing');
}
{
  // Variety: three families, quota 6 → two from each, not six from the first.
  const pool = ['lofi', 'house', 'urban'].flatMap((g, gi) => Array.from({ length: 10 }, (_, i) => ({
    ...rec({ id: `${g}${i}`, pack: `${g} pack ${i}`, genres: [g === 'urban' ? 'trap' : g] }), tier: 'A', shift: null, tempo: { bpm: 110 },
  })));
  const picked = fill(pool, 6);
  eq(new Set(picked.map((r) => r.genres[0])).size, 3, 'the round-robin spreads over the style families');
}

console.log(`samples-select: ${checks} checks passed`);
