# 034 — Move README & Demo GIF into docs/

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Add the demo.gif to the README, move both into /docs"

## Summary
Move `README.md` and `demo.gif` from the repository root into `docs/` (`docs/README.md` and `docs/demo.gif`) and embed `demo.gif` prominently in `docs/README.md`.

## Requirements
- [x] Move `README.md` to `docs/README.md` using `git mv`.
- [x] Move `demo.gif` to `docs/demo.gif` using `git mv`.
- [x] Embed `demo.gif` prominently in `docs/README.md` using a relative Markdown image link (`![WinFinder Demo](demo.gif)`).
- [x] Verify all relative links inside `docs/README.md` are valid from `docs/README.md`.
- [x] Audit repository scripts and workflows for any references to root `README.md` or `demo.gif`.

## Edge Cases
- **GitHub README rendering:** GitHub automatically recognizes `docs/README.md` as the repository README when no root `README.md` is present, and resolves relative image links such as `demo.gif` against `docs/`.
- **Relative links:** `README.md` currently contains only an external GitHub URL (`https://github.com/yetanotherchris/WinFinder`) and no relative links to root files; the newly added `demo.gif` image link is relative to `docs/`.
- **Scripts & workflows:** Checked `.github/`, `scripts/`, `updatescoop.ps1`, `updateversion.ps1`, `winfinder.json`, and `package.json`; none reference root `README.md` or `demo.gif`. (References in `src/App.tsx` and `tests/e2e/fixtures/mockTauri.ts` are mock sample directory entries, not the repo README.)

## Implementation Notes
- Moved `README.md` -> `docs/README.md` and `demo.gif` -> `docs/demo.gif` with `git mv` to preserve git rename tracking.
- Added `![WinFinder Demo](demo.gif)` prominently beneath the intro paragraph in `docs/README.md`.
- Verified with `git grep -in "readme\|demo"` that no CI workflows, scripts, or packaging manifests reference root `README.md` or `demo.gif`.

## Amendments
- None.
