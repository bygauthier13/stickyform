// Minimal 16-bit PCM WAV encoder (with TPDF dither and an INFO chunk).

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

function infoChunk(fields) {
  const enc = new TextEncoder();
  const parts = [];
  for (const [id, text] of Object.entries(fields)) {
    const data = enc.encode(text + '\0');
    const padded = data.length % 2 ? data.length + 1 : data.length;
    const chunk = new Uint8Array(8 + padded);
    const v = new DataView(chunk.buffer);
    writeString(v, 0, id);
    v.setUint32(4, data.length, true);
    chunk.set(data, 8);
    parts.push(chunk);
  }
  const size = 4 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(8 + size);
  const v = new DataView(out.buffer);
  writeString(v, 0, 'LIST');
  v.setUint32(4, size, true);
  writeString(v, 8, 'INFO');
  let o = 12;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * @param {AudioBuffer} buffer
 * @param {Record<string,string>} [info] RIFF INFO tags, e.g. { INAM: 'Title' }
 * @returns {Blob} audio/wav
 */
export function encodeWav(buffer, info = {}) {
  const channels = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const frames = buffer.length;
  const dataBytes = frames * channels * 2;
  const list = Object.keys(info).length ? infoChunk(info) : new Uint8Array(0);

  // RIFF layout:  RIFF header · fmt chunk · LIST/INFO chunk · data chunk header · samples
  const head = new ArrayBuffer(36);
  const v = new DataView(head);
  writeString(v, 0, 'RIFF');
  v.setUint32(4, 36 + list.length + dataBytes, true);
  writeString(v, 8, 'WAVE');
  writeString(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, channels, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * channels * 2, true);
  v.setUint16(32, channels * 2, true);
  v.setUint16(34, 16, true);
  const dataHead = new ArrayBuffer(8);
  const dv = new DataView(dataHead);
  writeString(dv, 0, 'data');
  dv.setUint32(4, dataBytes, true);

  const pcm = new ArrayBuffer(dataBytes);
  const out = new DataView(pcm);
  const data = [];
  for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));
  let seed = 0x2f6e2b1;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      // ±1 LSB triangular dither keeps the quiet reverb tail free of quantisation grain
      const dither = (rand() - rand()) / 32768;
      const s = Math.max(-1, Math.min(1, data[c][i] + dither));
      out.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([head, list, dataHead, pcm], { type: 'audio/wav' });
}
