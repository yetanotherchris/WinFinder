# 047 — App Icon PNG in Docs & README Header

- **Status:** Archived
- **Date:** 2026-11-22
- **Request:** "add the application icon to the docs folder as a PNG, and add this to the README above the "WinFinder" title header"

## Summary
Adds the high-resolution WinFinder application icon (`docs/icon.png`, 512×512) to the `docs/` directory and displays it cleanly above the `# WinFinder` title header in `docs/README.md`.

## Requirements
- [x] Copy the highest-resolution square application icon PNG (`src-tauri/icons/icon.png`, 512×512) to `docs/icon.png`.
- [x] Display `icon.png` above the `# WinFinder` title header in `docs/README.md` using a tasteful display size (`width="96"`) and `alt="WinFinder"`.

## Edge Cases
- The repository's README lives at `docs/README.md` (rendered automatically by GitHub) and already references sibling assets relatively (e.g., `demo.gif`). Using `src="icon.png"` ensures the image resolves both on GitHub and in local Markdown viewers.
- Using the 512×512 PNG scaled to `width="96"` keeps the icon sharp on high-DPI/Retina displays while maintaining a compact, balanced header proportion.

## Implementation Notes
- **`docs/icon.png`**: Copied from `src-tauri/icons/icon.png` (512×512 PNG, 57,714 bytes).
- **`docs/README.md`**: Added `<img src="icon.png" alt="WinFinder" width="96" />` above `# WinFinder`.

## Amendments
- None.
