// The sample-name parser, checked against real file names from the author's library.
//   npm test
import assert from 'node:assert/strict';
import { camelot, parseBpm, parseKeyToken, parsePath } from '../scripts/samples/parse.mjs';

let checks = 0;
const eq = (actual, expected, msg) => {
  checks++;
  assert.deepEqual(actual, expected, msg);
};

// ---- building blocks
eq(parseBpm(['808']), null, '808 is a drum, not a tempo');
eq(parseBpm(['04']), null, 'a take number is not a tempo');
eq(parseBpm(['x', '128', 'y']), 128, 'plain tempo');
eq(parseBpm(['120bpm']), 120, '120bpm');
eq(parseBpm(['bpm', '90']), 90, 'bpm 90');
eq(parseKeyToken('FM'), null, 'FM is a synth, not F major');
eq(parseKeyToken('Em')?.name, 'Em', 'Em');
eq(parseKeyToken('F#min')?.name, 'F#m', 'F#min');
eq(parseKeyToken('Fmaj')?.mode, 'major', 'Fmaj');
eq(parseKeyToken('Bb'), null, 'a bare note needs permission');
eq(parseKeyToken('Bb', true)?.pc, 10, 'bare Bb when allowed');
eq(parseKeyToken('Ebmaj')?.root, 'D#', 'flats are stored as sharps');
eq(parseKeyToken('bass'), null, 'a word is not a key');
eq([camelot(parseKeyToken('Am')), camelot(parseKeyToken('Fm')), camelot(parseKeyToken('Fmaj')), camelot(parseKeyToken('F#m'))], ['8A', '4A', '7B', '11A'], 'camelot wheel');

eq(parseKeyToken('FMin')?.name, 'Fm', 'capitalised mode');
eq(parseKeyToken('C#3', true)?.name, 'C#', 'a bare note with its octave');

// ---- tempo and key can live in the kit folder when the file name omits them
{
  const r = parsePath('Pack X/Pack_X_Audio/Loops/Kit_122_Stars_Am/Pack_X_Chords_Stars.wav');
  eq([r.bpm, r.bpmSource, r.key?.name, r.keySource, r.kind], [122, 'kit', 'Am', 'kit', 'loop'], 'kit folder supplies tempo and key');
}

// ---- real names: [path, expected]
const CASES = [
  ['Live Anthem Drum & Bass/Test_Press_-_Live_Anthem_Drum_&_Bass/loops/bass_loops_x_43/tp_ladnb_172_bass_guitar_loop_slap_agressive_Fmin.wav', { kind: 'loop', bpm: 172, key: 'Fm', group: 'bass', instrument: 'bass' }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/loops/vocal_loops/vocal_gang/LYRE_110_vocal_gang_lalala_kids_chant_dry_Dmin.wav", { kind: 'loop', bpm: 110, key: 'Dm', group: 'vocal', wet: false, variant: 'gang' }],
  ['Lofi By Nature/CPA_Lofi_By_Nature/Drum_&_Perc_One_Shots/Snares/LBN_snare_hydrohomie.wav', { kind: 'oneshot', bpm: null, key: null, group: 'drums', instrument: 'snare' }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/oneshots/drums/kick/LYRE_kick_disco_punchy.wav", { kind: 'oneshot', group: 'drums', instrument: 'kick' }],
  ['KUURO Sounds Sample Pack/KUURO_labeled_processed/KUURO_drums/KUURO_claps/KUURO_clap_04.wav', { kind: 'oneshot', bpm: null, group: 'drums', instrument: 'clap' }],
  ["LYRE's Perfect Pop Sample Pack/LYRE_sample_pack/LYRE_drums/LYRE_drum_loops/LYRE_drum_kick_snap_tom_deep_construction_song_starter_loop_100.wav", { kind: 'loop', bpm: 100, key: null, group: 'drums', instrument: 'drums' }],
  ['Basement Freaks Presents Smoking Barrels/Loops/Guitar_-_Loops/BOS_BSB_80_Electric_Guitar_Loop_Riff_Bike_Em.wav', { kind: 'loop', bpm: 80, key: 'Em', group: 'melody', instrument: 'guitar' }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/loops/songstarter_loops/VOX_LYRE_96_songstarter_vocal_game_on_Dmin/VOX_LYRE_96_songstarter_vocal_game_on_Dmin.wav", { kind: 'loop', bpm: 96, key: 'Dm', group: 'vocal' }],
  ['Afro House Yethu  Frigid Armadillo/SS_Frigid_Armadillo_Afrohouse/Loops/Bass/SS_FA_120_bass_synth_orbital_Gmin.wav', { kind: 'loop', bpm: 120, key: 'Gm', group: 'bass', instrument: 'bass', genres: ['afro_house', 'afro', 'house'] }],
  ['Afro House Percs vol. 4/RARE_percussion_-_Afro_House_Percs_vol4_-_Audio/LOOPS/COWBELL/RARE_AHP4_128_Cowbell_pro.wav', { kind: 'loop', bpm: 128, key: null, group: 'drums', instrument: 'perc' }],
  ['Lofi By Nature/CPA_Lofi_By_Nature/Drum_&_Perc_One_Shots/Kicks/LBN_kick_knock_knock.wav', { kind: 'oneshot', group: 'drums', instrument: 'kick', genres: ['lofi'] }],
  ["M3rge's No Exit Sample Pack/M3RGE_sample_pack/M3RGE_drums/M3RGE_drum_one_shots/M3RGE_snaps/M3RGE_snap_one_shot_verb.wav", { kind: 'oneshot', group: 'drums', instrument: 'clap', wet: true }],
  ['Lofi Future/Loops/Resampled_Loops/SO_FU_105_resampled_stack_alabama_Fmaj.wav', { kind: 'loop', bpm: 105, key: 'Fmaj', group: 'music', instrument: 'stack' }],
  ['Liquid Funk - DNB Rollers/Komorebi_Audio_-_Liquid_Funk_DNB_Rollers_-_Sample_Pack/Loops/Drum_Loops/Full/KMRBI_DNBR_174_drum_loop_journey.wav', { kind: 'loop', bpm: 174, group: 'drums', variant: 'full', genres: ['drum_and_bass', 'funk'] }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/loops/vocal_loops/vocal_gang/LYRE_95_vocal_gang_nanana_group_female_chant_powerful_anthem_big_filtered_verby_F#min.wav", { kind: 'loop', bpm: 95, key: 'F#m', group: 'vocal', wet: true }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/oneshots/drum_fills/drum_fill/LYRE_173_drum_fill_808_snare_loop_trap_cool_filtering.wav", { kind: 'loop', bpm: 173, group: 'drums', variant: 'fill', flags: ['kind-conflict'] }],
  ['KUURO Sounds Sample Pack/KUURO_labeled_processed/KUURO_fx/KUURO_animal_fx/KUURO_animal_fx_02_bird_chirp.wav', { kind: 'unknown', bpm: null, group: 'fx', variant: 'animal' }],
  ['Afro House & Vocals Vol. 2/Sample_Tools_by_Cr2_-_Afro_House___Vocals_Vol_2/Loops/Demo_Kits/122_Fire/STCR2_AHV2_122_Percussion_Fire_Cm.wav', { kind: 'loop', bpm: 122, key: 'Cm', group: 'drums', instrument: 'perc' }],
  ["LYRE's Perfect Pop Sample Pack/LYRE_sample_pack/LYRE_vocals/LYRE_vocal_hooks_and_phrases/LYRE_vocal_indian_middle_eastern_breathy_airy_adlib_riff_wet_165_F#min.wav", { kind: 'loop', bpm: 165, key: 'F#m', group: 'vocal', wet: true }],
  ['Basement Freaks presents Grooving Guitars XL/Loops/Drum_-_Loops/Full_Drum_Loops/BOS_GGXL_110_Drum_Loop_Full_Banging.wav', { kind: 'loop', bpm: 110, key: null, group: 'drums', variant: 'full' }],
  ['Lockdown The Drill Pack/CPA_Lockdown_The_Drill_Pack/Melodic_Loops/Melody_Loops/LDP_141_melody_loop_matrixed_Fm.wav', { kind: 'loop', bpm: 141, key: 'Fm', group: 'melody', instrument: 'melody', genres: ['drill'] }],
  ['Afro Soul - Island Inspired Dancehall/Origin_Sound_-_Afro_Soul/Music_Single_Hits/808/OS_AS_C_808_Pound.wav', { kind: 'oneshot', bpm: null, key: 'C', group: 'bass', instrument: '808' }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/loops/percussion_loops/LYRE_120_percussion_tambourine_acoustic_live_weird_pitched.wav", { kind: 'loop', bpm: 120, key: null, group: 'drums', instrument: 'perc' }],
  ['KUURO Sounds Sample Pack/KUURO_labeled_processed/KUURO_fx/KUURO_animal_fx/KUURO_animal_fx_01_bird_chirp.wav', { kind: 'unknown', group: 'fx' }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/oneshots/vocal/non_lyrical/LYRE_vocal_oneshot_uh_oh_cute_kid_girl_vocal_shout.wav", { kind: 'oneshot', key: null, group: 'vocal' }],
  ["LYRE's Perfect Pop Sample Pack/LYRE_sample_pack/LYRE_tonal/LYRE_synth/LYRE_synth_loops/LYRE_chords/LYRE_synth_chords_song_starter_wubby_moog_100_Cmin.wav", { kind: 'loop', bpm: 100, key: 'Cm', group: 'harmony', instrument: 'synth' }],
  ["LYRE's Perfect Pop Sample Pack/LYRE_sample_pack/LYRE_tonal/LYRE_bass/LYRE_bass_loops/LYRE_bass_loop_dance_house_k_pop_deep_115_Emin.wav", { kind: 'loop', bpm: 115, key: 'Em', group: 'bass', instrument: 'bass' }],
  ['Lofi Future/Loops/Melodic_Stacks/SO_FU_160_melodic_stack_drifter_sky_Cmin.wav', { kind: 'loop', bpm: 160, key: 'Cm', group: 'melody', instrument: 'melody' }],
  ['KSHMR Songstarters Vol. 1/Pop/KSHMR_100_lonely_lullaby_drums_top_loop_Fmin.wav', { kind: 'loop', bpm: 100, key: 'Fm', group: 'drums', instrument: 'drums' }],
  ['Afro House & Vocals Vol. 2/Sample_Tools_by_Cr2_-_Afro_House___Vocals_Vol_2/Loops/Demo_Kits/122_Stars/STCR2_AHV2_122_Drum_FX_Build_Stars_Bm.wav', { kind: 'loop', bpm: 122, key: 'Bm', group: 'fx', variant: 'build' }],
  ['Lo-Fi Techno 2/SKU#SM292_-_SM224_-_Lo-Fi_Techno_2/top_loops/lft2_top_loop_tribal_tribbs_128.wav', { kind: 'loop', bpm: 128, key: null, group: 'drums', instrument: 'top', genres: ['lofi', 'techno'] }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/loops/drum_loops/LYRE_140_drum_kick_snare_cute_jersey_club.wav", { kind: 'loop', bpm: 140, group: 'drums', instrument: 'drums' }],
  ['Afro Lab presents Trap and Drill Rhythms/LEX_Sounds_TNDR/Loops/Full_Drum_Loops/LEX_TNDR_149_Full_Drum_Loop_King.wav', { kind: 'loop', bpm: 149, group: 'drums', variant: 'full', genres: ['afro', 'trap', 'drill'] }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/loops/vocal_loops/vocal_hooks/LYRE_125_vocal_hook_ah_run_group_wet_Cmin.wav", { kind: 'loop', bpm: 125, key: 'Cm', group: 'vocal', wet: true }],
  ['Lofi Discovery/Komorebi_Audio_-_Lofi_Discovery_-_Sample_Pack/Loops/Drums/No_Kick_Drum_Loop/KA_LOFI_82_No_Kick_Drum_Loop_Clouds.wav', { kind: 'loop', bpm: 82, group: 'drums', instrument: 'drums', variant: 'no_kick' }],
  ['lofi crates./Origin_Sound__-_lofi_crates/loops/drum_loops/OS_LFC_130_drum_loop_zest_alt.wav', { kind: 'loop', bpm: 130, group: 'drums' }],
  ['KUURO Sounds Sample Pack/KUURO_labeled_processed/KUURO_drums/KUURO_percussion/KUURO_percussion_09.wav', { kind: 'unknown', bpm: null, group: 'drums', instrument: 'perc' }],
  ["LYRE's Perfect Pop K-Pop Edition/LYRE_s_Perfect_Pop_-_K-Pop_Edition/loops/drum_loops/LYRE_145_drum_baddie_stompy_gnarly_vocal_chops.wav", { kind: 'loop', bpm: 145, group: 'drums', instrument: 'drums' }],
  ['Afro Jersey Club/SO_AJC/One_Shots/Perc/SO_AJC_perc_sticky_clave.wav', { kind: 'oneshot', bpm: null, group: 'drums', instrument: 'perc', genres: ['afro', 'jersey_club'] }],
  ['Afro Jersey Club/SO_AJC/Loops/Top_loops/SO_AJC_142_top_loop_stacks_wakeup.wav', { kind: 'loop', bpm: 142, group: 'drums', instrument: 'top' }],

  // ---- a second library (Splice folder): other naming habits
  ['Sounds of KSHMR Vol. 3/KSHMR_processed/KSHMR_Novelties/KSHMR_Vocals/KSHMR_Shouts/KSHMR_Shouts_Single/KSHMR_Vocal_Shout_31_Wahp_G#.wav', { kind: 'oneshot', bpm: null, key: 'G#', group: 'vocal' }],
  ['Malay Vol. 2 Sample Pack/MALAY_drums/MALAY_drum_loops/MALAY_108_drum_loop_billie_jean.wav', { kind: 'loop', bpm: 108, group: 'drums', instrument: 'drums' }],
  ['Ovy On The Drums Koala Sample Pack/OVYONTHEDRUMS_sample_pack/OVYONTHEDRUMS_drums/OVYONTHEDRUMS_drum_loops/OVYONTHEDRUMS_87_drum_loop_saxo_full.wav', { kind: 'loop', bpm: 87, group: 'drums', variant: 'full' }],
  ["Oliver Power Tools Decades - 80's/Oliver_-_Power_Tools_Decades_-_80_s/Loops/Drum_Fills/OLIVER_112_drum_fill_mixready_machine_eighties.wav", { kind: 'loop', bpm: 112, group: 'drums', variant: 'fill' }],
  ["Oliver - Power Tools Decades - 00's/Oliver_-_Power_Tools_Decades_-_00_s/Loops/Drum_Loops_Full/OLIVER_100_drums_drumline_marching_full.wav", { kind: 'loop', bpm: 100, group: 'drums', instrument: 'drums', variant: 'full' }],
  ['Warped Rhythms/Loops/drum_loops/RKU_WR_140_drum_loop_full_Slippery.wav', { kind: 'loop', bpm: 140, key: null, group: 'drums', variant: 'full' }],
  ['THICC DRUMS/Origin_Sound_-_Thicc_Drums/Drum_Hits/Kicks/OS_TD_Mutumbo_Kick.wav', { kind: 'oneshot', bpm: null, group: 'drums', instrument: 'kick' }],
  ['Capsun - Lo-Fi Soul & Future Beats/CPA_CAPSUN_Lo_Fi_Soul___Future_Beats/One_Shots/Synth/CLF_Synth_One_Shot_13_Fm.wav', { kind: 'oneshot', bpm: null, key: 'Fm', group: 'melody', instrument: 'synth', genres: ['lofi', 'future_beats', 'soul'] }],
  ['Malay Vol. 2 Sample Pack/MALAY_drums/MALAY_percussion_loops/MALAY_95_percussion_loop_perky.wav', { kind: 'loop', bpm: 95, group: 'drums', instrument: 'perc' }],
  ['MIDNIGHT - TRAP & HIP HOP/Origin_Sound_-_MIDNIGHT/one_shots/drum_hits/snare/OS_MN_snare_1998.wav', { kind: 'oneshot', bpm: null, group: 'drums', instrument: 'snare', genres: ['trap', 'hip_hop'] }],
  ['Robotaki 01 The Lost Tapes/ROBOTAKI_sample_pack/ROBOTAKI_tonal/ROBOTAKI_patterns/ROBOTAKI_pattern_loop_pyramids_fluteharm_80_Emin.wav', { kind: 'loop', bpm: 80, key: 'Em', group: 'music' }],
  ['Amps and Speakers Bible/RadioStaticNoSignal_ZA02.42.wav', { kind: 'unknown', bpm: null, group: 'texture' }],
  ['Bedroom Beats & Lofi Hip-Hop/CPA_Bedroom_Beats___LoFi_HipHop/Drum___Perc_Loops/Drum_Loops/BBL_90_drum_loop_alexs_groove.wav', { kind: 'loop', bpm: 90, group: 'drums', genres: ['lofi', 'hip_hop'] }],
  ["Mr. Carmack's don't buy this Splice Pack/MR_CARMACK_sample_pack/MR_CARMACK_drums/MR_CARMACK_top_loops/MR_CARMACK_top_loop_laferrari_fill_96.wav", { kind: 'loop', bpm: 96, group: 'drums', instrument: 'top' }],
  ['Ghost Trap 3/Audeobox_-_Ghost_Trap_3/Drums_One_Shots/Kicks/AB_GT3_Skimmy_Kick_One_Shot_Chucky.wav', { kind: 'oneshot', bpm: null, group: 'drums', instrument: 'kick' }],
  ['World Bass Moombahton by Basement Freaks/Black_Octopus_-_World_Bass_Moonbahton_by_Basement_Freaks/Music_Loops/100_-_Fm_-_Middle_East_Pizzi_Loop_01.wav', { kind: 'loop', bpm: 100, key: 'Fm', group: 'music', genres: ['moombahton', 'world_bass'] }],
  ['Vaski Sample Pack/VSK_sample_pack/VSK_drums/VSK_snare_3.wav', { kind: 'oneshot', bpm: null, group: 'drums', instrument: 'snare' }],
  ['Capsun - Lo-Fi Soul & Future Beats/CPA_CAPSUN_Lo_Fi_Soul___Future_Beats/One_Shots/Keys/CLF_Keys_One_Shot_15_Fm.wav', { kind: 'oneshot', key: 'Fm', group: 'harmony', instrument: 'keys' }],
  ['Philthy Horns - Philip Lassiter/Jammcard_Samples_-_Philthy_Horns_-_Philip_Lassiter_-_WAV/loops/horn_swell_&_glissando_loops/jc_ph_84_horn_swell_loop_clusterfudge_Dmin.wav', { kind: 'loop', bpm: 84, key: 'Dm', group: 'melody', instrument: 'horn' }],
  ['Oliver Power Tools Sample Pack III/OLIVER_VOL3_sample_pack/OLIVER_drums/OLIVER_drum_loops/OLIVER_percussion_loops/OLIVER_acoustic_traditional/OLIVER_100_percussion_loop_acoustic_sticks.wav', { kind: 'loop', bpm: 100, group: 'drums', instrument: 'perc' }],
  ['RARE - Tape Jams 3/Loops/Melodic_loops/Music_loops/RKU_RTJ3_80_music_loop_tape_catch_me.wav', { kind: 'loop', bpm: 80, key: null, group: 'music', flags: ['no-key'] }],
  ['refridgerator, a food house moment/Moment_-_refridgerator__a_food_house_moment/loops/tonal_loops/synth_loops/MO_FOOD_170_synth_loop_emo_01_Gmin.wav', { kind: 'loop', bpm: 170, key: 'Gm', group: 'melody', instrument: 'synth' }],
  ['Modal Jazz & Hip Hop/SNS_Modal_Hip_Hop/Melodic_Loops/Piano/SNS_MH_96_piano_just_cooling_back_Fm.wav', { kind: 'loop', bpm: 96, key: 'Fm', group: 'harmony', instrument: 'keys', genres: ['hip_hop', 'jazz'] }],
  ["Oliver Power Tools Decades - 80's/Oliver_-_Power_Tools_Decades_-_80_s/Loops/Clap_Loops/OLIVER_120_clap_loop_party_claps.wav", { kind: 'loop', bpm: 120, group: 'drums', instrument: 'clap' }],
  ['Tear Drops - Melodic Trap/Origin_Sound_-_Tear_Drops/one_shots/drum_hits/claps/OS_TD_clap_layer.wav', { kind: 'oneshot', group: 'drums', instrument: 'clap' }],
  ['Vocal Afro House/Dropgun_Samples_-_Vocal_Afro_House/One_Shots/Drum_One_Shots/Fills/DS_VAH_124_drum_fill_tanager_congo.wav', { kind: 'loop', bpm: 124, group: 'drums', variant: 'fill', flags: ['kind-conflict'] }],
  ['Midnight Swim - Lo-Fi Synthwave/NW-1011-FL-R_-_Midnight_Swim_-_Lo-Fi_Synthwave_-_WAV/one-shots/drum_one-shots/snares/nw_ms_snare_trash.wav', { kind: 'oneshot', group: 'drums', instrument: 'snare', genres: ['lofi', 'synthwave'] }],
  ['Chordz/Unmute_Chordz_Kits_Serum/kits/CHZ_KIT2_150_FB_PowerfullTrack__Bmin/Beat/CHZ_KIT2_150_DrumFill1.wav', { kind: 'loop', bpm: 150, key: null, group: 'drums', variant: 'fill', kit: 'kits/CHZ_KIT2_150_FB_PowerfullTrack__Bmin' }],
  ['Iconic Hip Hop Drums Vol. 1/Iconic_Hip_Hop_Drums_Vol._1/Iconic_Hi_Vol._1/ESM_Iconic_Hi_5_Hit_Hat_Cymbal_Vintage_Vinyl_Gritty.wav', { kind: 'oneshot', bpm: null, group: 'drums', instrument: 'hat' }],
  ['Oliver Power Tools Sample Pack III/OLIVER_VOL3_sample_pack/OLIVER_drums/OLIVER_drum_loops/OLIVER_drum_loops/OLIVER_future/OLIVER_65_drum_loop_future_creeper_full.wav', { kind: 'loop', bpm: 65, group: 'drums', variant: 'full' }],
];

for (const [path, want] of CASES) {
  const got = parsePath(path);
  const name = path.split('/').pop();
  for (const [field, value] of Object.entries(want)) {
    if (field === 'key') eq(got.key?.name ?? null, value, `${name}: key`);
    else if (field === 'flags') for (const f of value) eq(got.flags.includes(f), true, `${name}: flag ${f}`);
    else eq(got[field], value, `${name}: ${field}`);
  }
}

// ---- every path gets a stable, unique id
const ids = new Set(CASES.map(([p]) => parsePath(p).id));
eq(ids.size, CASES.length, 'ids are unique');
eq(parsePath(CASES[0][0]).id, parsePath(CASES[0][0]).id, 'ids are stable');

console.log(`samples: ${checks} checks passed`);
