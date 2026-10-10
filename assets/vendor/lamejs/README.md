# lamejs (MP3 encoder)

`lamejs.js` is `dist/lamejs.js` from **@breezystack/lamejs 1.2.7** (a maintained ES-module build of
[lamejs](https://github.com/zhuker/lamejs), itself a JavaScript port of the LAME encoder), **unmodified**.

- Licence: LGPL-3.0 (see `LICENSE`). The file is shipped as its own script, loaded on demand
  (`import()` in `src/audio/mp3.js`), so it can be replaced by any compatible build.
- Used only to turn the finished track into a downloadable `.mp3`, entirely in the visitor's browser.

Acknowledgement (as the LAME licence asks): this product uses **LAME** — https://lame.sourceforge.net —
through lamejs. Any changes to LAME itself must be released back to the LAME project under the LGPL.
