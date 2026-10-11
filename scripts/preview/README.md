# Preview builds (claude.ai Artifact links)

A single-file copy of an edition that can be published as a private Artifact link, so the product can
be tried on a phone without running anything.

```sh
npm i -D esbuild
node scripts/preview/build.mjs school          # → dist-preview/school.html   (git-ignored)
node scripts/preview/build.mjs stickysound     # → dist-preview/stickysound.html
node scripts/preview/serve-wrapped.mjs dist-preview/school.html   # test it under the viewer's strict CSP
```

Publish with the Artifact tool: `file_path` = the built page, `capabilities: {"downloads": true}`, an `icon`
(first publish only). Republishing the **same file path** keeps the URL.

## Why a special build

The viewer frames the page with a strict CSP and no network: one inline script and style, fonts as `data:` URIs,
no `fetch`, no `<a download>`. So the build inlines everything (esbuild also inlines the lazily imported MP3
encoder) and replaces the download block of the reveal (`download-patch.txt`): the file goes through the
`downloads` capability, and because `.wav` and `.mp3` are not on that capability's allowlist the same file is
offered inside a store-only `.zip`. A real deployment serves plain files and downloads the `.wav` / `.mp3` directly.

## Testing a preview

`serve-wrapped.mjs` reproduces the framing. Drive it with Playwright, stubbing `window.claude.use('downloads')`
(reject `.wav`/`.mp3` with `{code: 'rejected_extension'}`, record what is saved afterwards), play the whole journey,
click Download, unzip the result and check it with `ffprobe`. The last preview passed this on desktop and phone with
no console messages: the zip held a valid 2 min 9 s MP3 with its ID3 tags.
