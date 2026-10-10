// MP3 export: the file must be a well-formed MPEG stream with correct ID3 tags.
//   npm test
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { id3Tag, encodeMp3 } from '../src/audio/mp3.js';

let checks = 0;
const ok = (cond, msg) => {
  checks++;
  assert.ok(cond, msg);
};
const eq = (a, b, msg) => {
  checks++;
  assert.deepEqual(a, b, msg);
};

// a short stereo test tone shaped like an AudioBuffer
const sr = 44100;
const secs = 3;
const n = sr * secs;
const chans = [new Float32Array(n), new Float32Array(n)];
for (let i = 0; i < n; i++) {
  const t = i / sr;
  chans[0][i] = 0.4 * Math.sin(2 * Math.PI * 440 * t);
  chans[1][i] = 0.3 * Math.sin(2 * Math.PI * 554 * t);
}
const buffer = { numberOfChannels: 2, sampleRate: sr, length: n, getChannelData: (c) => chans[c] };

/** Read the text frames back out of an ID3v2.3 tag. */
function readTag(bytes) {
  eq(String.fromCharCode(...bytes.slice(0, 3)), 'ID3', 'tag starts with ID3');
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const frames = {};
  let p = 10;
  while (p < 10 + size) {
    const id = String.fromCharCode(...bytes.slice(p, p + 4));
    const len = (bytes[p + 4] << 24) | (bytes[p + 5] << 16) | (bytes[p + 6] << 8) | bytes[p + 7];
    const body = bytes.slice(p + 10, p + 10 + len);
    if (id === 'COMM') frames[id] = body;
    else frames[id] = body[0] === 0 ? String.fromCharCode(...body.slice(1)) : Buffer.from(body.slice(3)).toString('utf16le');
    p += 10 + len;
  }
  return { size: 10 + size, frames };
}

// ---- tags
{
  const tag = id3Tag({ title: "Maya's Song", artist: 'Elmwood Academy', year: '2026' });
  const { size, frames } = readTag(tag);
  eq(size, tag.length, 'declared size matches');
  eq(frames.TIT2, "Maya's Song", 'title');
  eq(frames.TPE1, 'Elmwood Academy', 'artist');
  eq(frames.TYER, '2026', 'year');
  const uni = readTag(id3Tag({ title: 'Zoë’s Song' }));
  eq(uni.frames.TIT2, 'Zoë’s Song', 'non-ASCII titles survive (UTF-16)');
  eq(id3Tag({}).length, 0, 'no tags, no tag');
}

// ---- the encoded stream
const progress = [];
const blob = await encodeMp3(buffer, { kbps: 128, tags: { title: 'Test', artist: 'Tester' }, onProgress: (f) => progress.push(f) });
ok(blob.type === 'audio/mpeg', 'mime type');
const bytes = new Uint8Array(await blob.arrayBuffer());
const { size: tagSize, frames } = readTag(bytes);
eq(frames.TIT2, 'Test', 'tag is first in the file');

// walk every MPEG frame: they must tile the rest of the file exactly
let p = tagSize;
let count = 0;
while (p + 4 <= bytes.length) {
  ok(bytes[p] === 0xff && (bytes[p + 1] & 0xe0) === 0xe0, `frame sync at byte ${p}`);
  const version = (bytes[p + 1] >> 3) & 3; // 3 = MPEG-1
  const layer = (bytes[p + 1] >> 1) & 3; // 1 = Layer III
  const bitrate = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bytes[p + 2] >> 4];
  const rate = [44100, 48000, 32000][(bytes[p + 2] >> 2) & 3];
  const padding = (bytes[p + 2] >> 1) & 1;
  eq([version, layer, bitrate, rate], [3, 1, 128, sr], 'MPEG-1 Layer III, 128 kbps, 44.1 kHz');
  p += Math.floor((144000 * bitrate) / rate) + padding;
  count++;
}
eq(p, bytes.length, 'frames tile the file with nothing left over');
const encodedSecs = (count * 1152) / sr;
ok(Math.abs(encodedSecs - secs) < 0.12, `duration ${encodedSecs.toFixed(3)} s is within a few frames of ${secs} s`);
ok(progress.length > 0 && progress.at(-1) === 1 && progress.every((v, i) => !i || v >= progress[i - 1]), 'progress rises to 1');

// a mono buffer works too
const mono = await encodeMp3({ numberOfChannels: 1, sampleRate: sr, length: sr, getChannelData: () => chans[0] }, { kbps: 96 });
ok(mono.size > 5000, 'mono encodes');

console.log(`mp3: ${checks} checks passed (${(bytes.length / 1024).toFixed(0)} KB for ${secs} s)`);
