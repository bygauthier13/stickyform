# Working with the owner, and in this environment

## The owner

- Musician/producer and entrepreneur, **not a developer**. Writes in **French** (tutoiement), sometimes English; ask
  nothing in English unless they do. Gets lost with long multi-step instructions ("je suis un peu perdu"): give **one
  action at a time**, exact clicks or a copy-paste block, and say what to send back. Simpler is better.
- Likes: honest limits ("I couldn't listen"), a **link to try things on their phone**, plain explanations (they asked what a
  PR is), decisions framed with a recommendation, short answers. Dislikes re-asked questions.
- Quality gate for sound is **their ears**. After any sound change, say what to listen for.
- They said not to worry about the Splice licence for their own use ("tant que c'est une musique complète à la fin");
  don't reopen it, but never put raw sample files in git.

## Git

- Branch `claude/brave-volta-8atohg` only; commit with the session's attribution trailers; push with
  `git push -u origin claude/brave-volta-8atohg`. **No pull request unless asked.** No `main` exists yet.
- The repo is **public**. Keep out: personal data, pricing/strategy, the owner's file paths, the conversation log, raw samples.

## Sandbox facts

- Cloud container; ephemeral scratch directory. No access to Drive/iCloud/Dropbox/WeTransfer (proxy 403); GitHub works.
  Network settings: session title-bar menu → Edit → Network access. `read_documentation` explains the page.
- Playwright is pre-installed globally (`/opt/node22/lib/node_modules`) with Chromium in `/opt/pw-browsers`; `ffmpeg`/`ffprobe`
  exist; ESLint is in `/opt/node-tools/node_modules/.bin`. Run long jobs with `run_in_background` (see lessons).
- Chat attachments: images arrive, text files may not. Large pasted text is fine.

## Previews (claude.ai Artifact links)

`node scripts/preview/build.mjs school` → `dist-preview/school.html`; check it with
`node scripts/preview/smoke.cjs school [mobile]` (drill edition: `build.mjs drill`, then `smoke-drill.cjs [mobile]`); publish with the Artifact tool (`capabilities: {"downloads": true}`;
icon on first publish; same file path keeps the URL). Previews are private to the owner until they share them.
Load the `artifact-capabilities` skill before passing `capabilities`.

## Before saying "done"

`npm test`, ESLint clean, the relevant e2e (`test:e2e`, `test:e2e:school`), and for UI changes a screenshot on desktop
**and** a 390×844 phone, including a question taller than the screen.
