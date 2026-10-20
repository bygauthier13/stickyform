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
    // Playwright keeps its browsers in different places per platform, and the folder
    // name carries a build number the installed Playwright may not be pinned to.
    const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), '.cache', 'ms-playwright'),
      path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')].filter(Boolean);
    const RELATIVE = ['chrome-linux/chrome', 'chrome-linux64/chrome',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-headless-shell-mac-arm64/chrome-headless-shell',
      'chrome-headless-shell-mac-x64/chrome-headless-shell',
      'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-win/chrome.exe'];
    for (const base of roots) {
      if (!fs.existsSync(base)) continue;
      const builds = fs.readdirSync(base).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)).sort().reverse();
      for (const d of builds) {
        for (const rel of RELATIVE) {
          const executablePath = path.join(base, d, rel);
          if (fs.existsSync(executablePath)) return chromium.launch({ ...options, executablePath });
        }
      }
    }
    throw e;
  }
}

module.exports = { loadPlaywright, launch };
