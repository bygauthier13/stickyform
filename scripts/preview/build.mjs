// Builds one self-contained HTML page of an edition, for a claude.ai Artifact preview link.
//
//   npm i -D esbuild                           (once)
//   node scripts/preview/build.mjs school      → dist-preview/school.html
//   node scripts/preview/build.mjs stickysound → dist-preview/stickysound.html
//
// The repository is not modified: the build works on a temporary copy of src/.
// Differences from the real app, all forced by the viewer's sandbox (see README.md here):
//   · one inline <script> and <style>, fonts as data: URIs, no network at all
//   · downloads go through the `downloads` capability, zipped when the file type is refused
//   · document.body.dataset.screen is set from script (the page has no <body> tag of its own)
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const HERE = fileURLToPath(new URL('./', import.meta.url));

const EDITIONS = {
  stickysound: { html: 'index.html', entry: 'src/main.js', css: ['base', 'landing', 'form', 'results'], title: 'StickySound' },
  school: { html: 'school.html', entry: 'src/school.js', css: ['base', 'landing', 'form', 'results', 'school'], title: 'StickySound for Schools' },
};
const name = process.argv[2];
const edition = EDITIONS[name];
if (!edition) {
  console.error(`usage: node scripts/preview/build.mjs <${Object.keys(EDITIONS).join('|')}>`);
  process.exit(1);
}

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  console.error('esbuild is not installed. Run: npm i -D esbuild');
  process.exit(1);
}

const WORK = join(tmpdir(), `stickysound-preview-${name}`);
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
cpSync(join(ROOT, 'src'), join(WORK, 'src'), { recursive: true });
cpSync(join(ROOT, 'assets/vendor'), join(WORK, 'assets/vendor'), { recursive: true }); // the MP3 encoder, imported lazily by src/audio/mp3.js

const patch = (file, fn) => {
  const p = join(WORK, file);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
};

// ---- 1. the screen marker, set from script
patch('src/app.js', (s) => {
  const marker = /( *)\/\/ -+ boot\n/;
  if (!marker.test(s)) throw new Error('boot marker not found in src/app.js');
  return s.replace(marker, (m, indent) => `${m}${indent}document.body.dataset.screen = 'landing';\n`);
});

// ---- 2. the download block of the reveal
patch('src/components/results.js', (s) => {
  const a = s.indexOf('  // --------------------------------------------------------------- download');
  const b = s.indexOf("  restartLink.addEventListener('click'");
  if (a < 0 || b < 0) throw new Error('download block not found in src/components/results.js');
  return s.slice(0, a) + readFileSync(join(HERE, 'download-patch.txt'), 'utf8') + s.slice(b);
});

// ---- 3. one classic script (esbuild inlines the lazily imported MP3 encoder)
const out = await esbuild.build({ entryPoints: [join(WORK, edition.entry)], bundle: true, format: 'iife', target: 'es2022', minify: true, legalComments: 'none', write: false });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

// ---- 4. CSS, fonts inlined
const css = edition.css
  .map((n) => readFileSync(join(ROOT, `src/styles/${n}.css`), 'utf8'))
  .join('\n')
  .replace(/url\('\.\.\/\.\.\/assets\/fonts\/([^']+)'\)/g, (_, f) => `url(data:font/woff2;base64,${readFileSync(join(ROOT, 'assets/fonts', f)).toString('base64')})`);

// ---- 5. markup: the body of the page, minus scripts, with a logo link that doesn't navigate
let html = readFileSync(join(ROOT, edition.html), 'utf8');
html = html.slice(html.indexOf('<body'));
html = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</body>'));
html = html.replace(/<script[\s\S]*?<\/script>/g, '').replace('href="./"', 'href="#main"').replace('aria-label="StickySound — start over"', 'aria-label="StickySound"');

const page = `<title>${edition.title}</title>\n<style>\n${css}\n</style>\n${html}\n<script>\n${js}\n</script>\n`;
mkdirSync(join(ROOT, 'dist-preview'), { recursive: true });
const file = join(ROOT, 'dist-preview', `${name}.html`);
writeFileSync(file, page);
console.log(`${file}  ${(page.length / 1024).toFixed(0)} KB  (js ${(js.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(0)} KB)`);
