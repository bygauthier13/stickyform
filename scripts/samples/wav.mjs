// A small WAV reader and the signal measurements the sample library needs.
// Pure Node, no dependencies, read-only: it opens files and never writes one.

/** Parse a RIFF/WAVE buffer into { sampleRate, channels, bitDepth, format, frames, pcm }. */
export function readWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let fmt = null;
  let data = null;
  // Chunks can come in any order, and some packs put LIST or junk before the audio.
  for (let p = 12; p + 8 <= buf.length;) {
    const id = buf.toString('ascii', p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    const body = p + 8;
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body);
      const channels = buf.readUInt16LE(body + 2);
      const sampleRate = buf.readUInt32LE(body + 4);
      const bitDepth = buf.readUInt16LE(body + 14);
      // WAVE_FORMAT_EXTENSIBLE hides the real format in its GUID's first two bytes.
      if (format === 0xfffe && size >= 40) format = buf.readUInt16LE(body + 24);
      fmt = { format, channels, sampleRate, bitDepth };
    } else if (id === 'data') {
      data = buf.subarray(body, Math.min(body + size, buf.length));
    }
    p = body + size + (size % 2); // chunks are word-aligned
    if (fmt && data) break;
  }
  if (!fmt || !data) throw new Error('no fmt or data chunk');
  if (![1, 3].includes(fmt.format)) throw new Error(`unsupported encoding ${fmt.format}`);
  const bytes = fmt.bitDepth / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  return { ...fmt, frames, duration: frames / fmt.sampleRate, data, bytes };
}

/** Mono Float32 of the whole file, averaged across channels, in -1..1. */
export function toMono(w) {
  const { data, bytes, channels, frames, format } = w;
  const out = new Float32Array(frames);
  const scale = { 1: 1 / 128, 2: 1 / 32768, 3: 1 / 8388608, 4: 1 / 2147483648 }[bytes];
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * bytes;
      let v;
      if (format === 3) v = bytes === 8 ? data.readDoubleLE(o) : data.readFloatLE(o);
      else if (bytes === 1) v = (data[o] - 128) * scale;
      else if (bytes === 2) v = data.readInt16LE(o) * scale;
      else if (bytes === 3) v = ((data[o] | (data[o + 1] << 8) | (data[o + 2] << 16)) << 8 >> 8) * scale;
      else v = data.readInt32LE(o) * scale;
      sum += v;
    }
    out[i] = sum / channels;
  }
  return out;
}

/** Average every `factor` samples: cheap and good enough below the new Nyquist. */
export function downsample(x, factor) {
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += x[i * factor + j];
    out[i] = s / factor;
  }
  return out;
}

const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
export const toDb = (v) => (v > 0 ? Math.round(db(v) * 10) / 10 : null);

/** Peak, RMS and crest factor over the whole file. */
export function levels(x) {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    sum += x[i] * x[i];
  }
  const rms = Math.sqrt(sum / (x.length || 1));
  return { peakDb: toDb(peak), rmsDb: toDb(rms), crestDb: peak > 0 && rms > 0 ? Math.round((db(peak) - db(rms)) * 10) / 10 : null };
}

/** Where the sound actually starts and ends, in seconds, at -60 dBFS. */
export function trim(x, sampleRate, floor = 0.001) {
  let a = 0;
  let b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) < floor) a++;
  while (b > a && Math.abs(x[b]) < floor) b--;
  return { startSilence: a / sampleRate, endSilence: (x.length - 1 - b) / sampleRate, sounding: (b - a + 1) / sampleRate };
}

// ---------------------------------------------------------------- spectrum

/** In-place radix-2 FFT. `re`/`im` are Float64Array of the same power-of-two length. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

function hann(n) {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

/**
 * Average magnitude spectrum over the file, as Float64Array of size/2 bins.
 * Frames are skipped when they are near silent, so trailing air does not dilute it.
 */
export function spectrum(x, sampleRate, size = 4096, hop = 2048) {
  const w = hann(size);
  const mag = new Float64Array(size / 2);
  let frames = 0;
  for (let p = 0; p + size <= x.length; p += hop) {
    let energy = 0;
    for (let i = 0; i < size; i++) energy += x[p + i] * x[p + i];
    if (Math.sqrt(energy / size) < 0.0005) continue;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = x[p + i] * w[i];
    fft(re, im);
    for (let k = 0; k < size / 2; k++) mag[k] += Math.hypot(re[k], im[k]);
    frames++;
  }
  if (frames) for (let k = 0; k < mag.length; k++) mag[k] /= frames;
  return { mag, frames, binHz: sampleRate / size };
}

/** Spectral centroid in Hz: the "brightness" of the average spectrum. */
export function centroid(mag, binHz) {
  let num = 0;
  let den = 0;
  for (let k = 1; k < mag.length; k++) { num += k * binHz * mag[k]; den += mag[k]; }
  return den > 0 ? Math.round(num / den) : null;
}

/** Share of the energy below `hz` — two sub-heavy loops must never be stacked. */
export function lowRatio(mag, binHz, hz = 120) {
  let low = 0;
  let all = 0;
  for (let k = 1; k < mag.length; k++) { const e = mag[k] * mag[k]; all += e; if (k * binHz < hz) low += e; }
  return all > 0 ? Math.round((low / all) * 1000) / 1000 : null;
}

// ---------------------------------------------------------------- scale

export const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
/** The major scale as a pitch-class mask; its relative minor is the same seven notes. */
export const MAJOR_MASK = [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];

/**
 * Twelve pitch-class energies, from spectral peaks only.
 *
 * Peaks are taken per frame above a noise floor, refined by parabolic interpolation,
 * and dropped when they sit more than a quarter-tone off an equal-tempered note —
 * which throws away most of the drum and noise energy. Harmonics are deliberately
 * NOT summed: folding a peak's third harmonic back onto a fundamental adds a fifth,
 * and measurement showed that alone caused the +5 / +7 semitone confusion.
 */
export function chroma(x, sampleRate, size = 8192) {
  const hop = size / 2;
  const w = hann(size);
  const binHz = sampleRate / size;
  const acc = new Float64Array(12);
  let frames = 0;
  for (let p = 0; p + size <= x.length; p += hop) {
    let e = 0;
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < size; i++) { re[i] = x[p + i] * w[i]; e += x[p + i] * x[p + i]; }
    if (Math.sqrt(e / size) < 0.0005) continue;
    fft(re, im);
    const half = size / 2;
    const mag = new Float64Array(half);
    let max = 0;
    for (let k = 0; k < half; k++) { mag[k] = Math.hypot(re[k], im[k]); if (mag[k] > max) max = mag[k]; }
    if (max <= 0) continue;
    const c = new Float64Array(12);
    for (let k = 2; k < half - 1; k++) {
      if (mag[k] <= mag[k - 1] || mag[k] < mag[k + 1]) continue;
      if (mag[k] < max * 0.05) continue;
      const d = (0.5 * (mag[k - 1] - mag[k + 1])) / (mag[k - 1] - 2 * mag[k] + mag[k + 1] || 1e-9);
      const hz = (k + d) * binHz;
      if (hz < 65 || hz > 1200) continue;
      const midi = 69 + 12 * Math.log2(hz / 440);
      if (Math.abs(midi - Math.round(midi)) > 0.25) continue;
      c[((Math.round(midi) % 12) + 12) % 12] += mag[k];
    }
    const sum = c.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    for (let i = 0; i < 12; i++) acc[i] += c[i] / sum;
    frames++;
  }
  if (!frames) return null;
  for (let i = 0; i < 12; i++) acc[i] /= frames;
  return acc;
}

/** Share of the chroma energy outside the major scale whose root is `pc`. */
export function outsideScale(c, pc) {
  let out = 0;
  for (let i = 0; i < 12; i++) if (!MAJOR_MASK[(i - pc + 12) % 12]) out += c[i];
  return out;
}

/**
 * The seven-note scale that best contains a chroma vector, named by its major root
 * (D minor and F major are one answer, which is exactly how the engine treats them).
 *
 * **Measured accuracy: 47 % on 233 loops whose key is written in the file name, with
 * 18 % of the energy still outside the scale even at the correct answer.** Polyphonic
 * key detection from a plain FFT is not good enough to drive anything: this is
 * recorded as an indication, and must never be used to choose or transpose a sample.
 * A loop whose key is not in its name needs a proper key-detection tool, or an ear.
 */
export function guessScale(c) {
  if (!c) return null;
  const scored = [];
  for (let pc = 0; pc < 12; pc++) scored.push({ pc, outside: outsideScale(c, pc) });
  scored.sort((a, b) => a.outside - b.outside);
  const [best, second] = scored;
  return {
    majorRoot: NOTE[best.pc],
    pc: best.pc,
    alsoKnownAs: `${NOTE[best.pc]} major = ${NOTE[(best.pc + 9) % 12]} minor`,
    outsideRatio: Math.round(best.outside * 1000) / 1000,
    margin: Math.round((second.outside - best.outside) * 1000) / 1000,
    reliable: false,
  };
}

/**
 * How many bars of four beats the file lasts at `bpm`, and whether that is a whole
 * number — the test that tells a loop from a one-shot when the name does not.
 */
export function barsAt(duration, bpm) {
  if (!bpm || !duration) return null;
  const bars = (duration * bpm) / 240;
  const whole = Math.round(bars);
  if (whole < 1) return { bars: Math.round(bars * 100) / 100, whole: 0, errorPct: null, isLoop: false };
  return {
    bars: Math.round(bars * 100) / 100,
    whole,
    errorPct: Math.round(Math.abs(bars / whole - 1) * 1000) / 10,
    isLoop: Math.abs(bars / whole - 1) <= 0.02 && [1, 2, 4, 8, 16, 32].includes(whole),
  };
}
