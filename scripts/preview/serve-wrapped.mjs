// Serves a built preview page the way the claude.ai viewer frames it: inside the publish
// skeleton, under a strict Content-Security-Policy (no network, inline script and style only).
// If it works here it works in the viewer.
//
//   node scripts/preview/serve-wrapped.mjs dist-preview/school.html [port]
import http from 'node:http';
import { readFileSync } from 'node:fs';

const [file, port = '5171'] = process.argv.slice(2);
if (!file) {
  console.error('usage: node scripts/preview/serve-wrapped.mjs <page.html> [port]');
  process.exit(1);
}
const page = readFileSync(file, 'utf8');
const skeleton = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif;background:#f7f7f5;color:#111}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${page}</body></html>`;
http
  .createServer((req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; media-src blob: data:; connect-src 'none'; frame-src 'none'",
    });
    res.end(skeleton);
  })
  .listen(Number(port), () => console.log(`wrapped preview on http://localhost:${port}/`));
