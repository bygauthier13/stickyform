// Preview build only — replaces src/drill/ui/save.js in the claude.ai Artifact copy.
//
// The viewer blocks downloads a page starts itself; files go through its
// `downloads` capability, whose allowlist has no .wav. So the very same WAV is
// offered inside a store-only .zip (uncompressed: the WAV inside is byte-identical).
// A real deployment serves drill.html, which downloads the .wav directly.

export const SAVE_LABEL = 'Download WAV (.zip)';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

async function makeZip(name, blob) {
  const data = new Uint8Array(await blob.arrayBuffer());
  const nameBytes = new TextEncoder().encode(name);
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const crc = crc32(data);
  const put = (view, fields) => fields.forEach(([o, v, n]) => (n === 4 ? view.setUint32(o, v, true) : view.setUint16(o, v, true)));
  const local = new DataView(new ArrayBuffer(30));
  put(local, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, time, 2], [12, date, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, nameBytes.length, 2], [28, 0, 2]]);
  const central = new DataView(new ArrayBuffer(46));
  put(central, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, time, 2], [14, date, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, nameBytes.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, 0, 4]]);
  const end = new DataView(new ArrayBuffer(22));
  put(end, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, 1, 2], [10, 1, 2], [12, 46 + nameBytes.length, 4], [16, 30 + nameBytes.length + data.length, 4], [20, 0, 2]]);
  return new Blob([local, nameBytes, data, central, nameBytes, end], { type: 'application/zip' });
}

/**
 * @returns {Promise<boolean>} true when the viewer accepted the save, false when they declined
 */
export async function saveFile(blob, filename) {
  const downloads = await Promise.resolve(window.claude?.use?.('downloads')).catch(() => null);
  if (!downloads) throw new Error('Downloads are not available in this view');
  try {
    await downloads.save({ filename: filename.replace(/\.wav$/i, '') + '.zip', data: await makeZip(filename, blob) });
    return true;
  } catch (err) {
    if (err?.code === 'declined') return false;
    throw err;
  }
}

export function releaseSaved() {}
