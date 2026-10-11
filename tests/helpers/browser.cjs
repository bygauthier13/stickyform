// Shared by the end-to-end scripts: find Playwright, and launch a Chromium even when the installed
// Playwright pins a browser build that isn't on this machine (a pre-installed Chromium is used then).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function loadPlaywright() {
  for (const p of [process.cwd(), '/opt/node22/lib/node_modules', '/opt/node-tools/node_modules']) {
    try {
      return require(require.resolve('playwright', { paths: [p] }));
    } catch {
      /* next */
    }
  }
  console.error('Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

async function launch(chromium, options = {}) {
  try {
    return await chromium.launch(options);
  } catch (e) {
    if (!/Executable doesn't exist/.test(String(e.message))) throw e;
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
    const builds = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
    for (const d of builds) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe']) {
        const executablePath = path.join(base, d, rel);
        if (fs.existsSync(executablePath)) return chromium.launch({ ...options, executablePath });
      }
    }
    throw e;
  }
}

module.exports = { loadPlaywright, launch };
