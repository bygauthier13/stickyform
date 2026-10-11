// Saving the generated WAV. On the real page the browser downloads it directly.
// The claude.ai preview build swaps this module for scripts/preview/drill-save.js
// (the viewer only lets a page save files through its `downloads` capability).

/** Label of the download button. */
export const SAVE_LABEL = 'Download WAV';

const pending = new Set();

/**
 * Offer `blob` to the person as `filename`.
 * @returns {Promise<boolean>} true when handed to the browser, false if the person declined
 */
export async function saveFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  pending.add(url);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.className = 'sr-only';
  document.body.append(a);
  a.click();
  a.remove();
  // keep the URL alive long enough for the download to start, then free the memory
  setTimeout(() => {
    URL.revokeObjectURL(url);
    pending.delete(url);
  }, 60000);
  return true;
}

/** Free every object URL still held (called when the results screen goes away). */
export function releaseSaved() {
  for (const url of pending) URL.revokeObjectURL(url);
  pending.clear();
}
