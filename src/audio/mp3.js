// MP3 export, entirely in the browser.
//
// The finished track is an AudioBuffer; this turns it into a real .mp3 with ID3
// tags (title, artist, album, comment). The encoder (lamejs, LGPL) is a separate
// file loaded on demand, so nobody pays for it until a track exists. Encoding is
// done in short slices that hand the thread back often, so the page stays smooth
// while it runs in the background after the track is ready.

const FRAME = 1152; // samples per MPEG-1 Layer III frame
const SLICE = FRAME * 8;

let lamePromise = null;
const loadLame = () => (lamePromise ??= import('../../assets/vendor/lamejs/lamejs.js'));

const toInt16 = (src, from, to) => {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) {
    const v = src[i];
    out[i - from] = Math.round((v > 1 ? 1 : v < -1 ? -1 : v) * 32767);
  }
  return out;
};

// ---------------------------------------------------------------- ID3v2.3

const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const syncsafe = (n) => [(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127];

/** ASCII text goes as ISO-8859-1; anything else as UTF-16 with a byte-order mark. */
function textBytes(text) {
  if (/^[\x20-\x7e]*$/.test(text)) return [0, ...Array.from(text, (c) => c.charCodeAt(0))];
  const out = [1, 0xff, 0xfe];
  for (const unit of text) for (let i = 0; i < unit.length; i++) out.push(unit.charCodeAt(i) & 255, unit.charCodeAt(i) >> 8);
  return out;
}

function frame(id, body) {
  return [...Array.from(id, (c) => c.charCodeAt(0)), ...u32(body.length), 0, 0, ...body];
}

/** Build an ID3v2.3 tag. Unknown or empty fields are left out. */
export function id3Tag({ title, artist, album, year, comment } = {}) {
  const frames = [];
  const text = (id, v) => v && frames.push(...frame(id, textBytes(String(v))));
  text('TIT2', title);
  text('TPE1', artist);
  text('TALB', album);
  text('TYER', year);
  if (comment) {
    const t = textBytes(String(comment));
    frames.push(...frame('COMM', [t[0], 101, 110, 103, ...(t[0] ? [0xff, 0xfe, 0, 0] : [0]), ...t.slice(1)]));
  }
  if (!frames.length) return new Uint8Array(0);
  frames.push(...frame('TENC', textBytes('StickySound')));
  return new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, ...syncsafe(frames.length), ...frames]);
}

// ---------------------------------------------------------------- encoder

/**
 * @param {{ numberOfChannels:number, sampleRate:number, length:number, getChannelData:(c:number)=>Float32Array }} buffer
 * @param {{ kbps?:number, tags?:object, onProgress?:(f:number)=>void }} [opts]
 * @returns {Promise<Blob>} audio/mpeg
 */
export async function encodeMp3(buffer, { kbps = 128, tags, onProgress } = {}) {
  const { Mp3Encoder } = await loadLame();
  const channels = Math.min(2, buffer.numberOfChannels);
  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : null;
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, kbps);

  const parts = [id3Tag(tags)];
  let lastYield = performance.now();
  for (let from = 0; from < buffer.length; from += SLICE) {
    const to = Math.min(buffer.length, from + SLICE);
    const bytes = right ? encoder.encodeBuffer(toInt16(left, from, to), toInt16(right, from, to)) : encoder.encodeBuffer(toInt16(left, from, to));
    if (bytes.length) parts.push(new Uint8Array(bytes));
    // hand the thread back every ~10 ms of work
    if (performance.now() - lastYield > 10) {
      onProgress?.(from / buffer.length);
      await new Promise((r) => setTimeout(r, 0));
      lastYield = performance.now();
    }
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  onProgress?.(1);
  return new Blob(parts, { type: 'audio/mpeg' });
}
