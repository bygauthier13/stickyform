# StickySound

A form that composes a layered soundtrack while people answer it (Web Audio, vanilla JS, no backend), plus a
school-survey edition (`school.html`), an MP3 export, and a sample-library indexing toolkit.

**Start here: read `.claude/skills/sticky-sound/SKILL.md`** (also available as `/sticky-sound`). It holds the project's
memory: what exists, how it works, decisions already made, what is open, and how to work with the owner.

Essentials

- Develop on branch `claude/brave-volta-8atohg` (the repo's default branch; there is no `main`). Do not open a pull
  request unless the owner asks; the base-branch question is still open.
- `npm start` → http://localhost:5173 (StickySound) and `/school.html` (school edition). `npm test` runs the pure tests.
- The owner writes in French. Reply in French unless they write in English.
- **Never touch the owner's files outside this repository.** Their sample library and music projects (Logic Pro and
  others) are strictly read-only for us: never move, rename, delete, overwrite, re-tag or change permissions on any of
  them. Reading is fine; anything we produce (analysis, converted copies) is written inside this repository only
  (`data/`, `assets/library/`, both git-ignored). If a command would write anywhere else, stop and ask.
- **This repository is public.** Never commit personal data, pricing or business strategy, file paths from the owner's
  computer, or the conversation log. That context lives in a private file (see the skill's `reference/private-context.md`).
