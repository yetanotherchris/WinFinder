# 007 — Expandable Tree Hierarchy in List View

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Update List View to match macOS Finder so folders have a disclosure arrow on the left and expand items inline."

## Summary
Upgrade List View from a flat table into a macOS Finder-style hierarchical tree where folders can be expanded and collapsed inline via left-side disclosure chevrons.

## Requirements
- [x] Display a clickable disclosure chevron (`▸` / `▾`) to the left of every folder row in List View (with matching spacer alignment on file rows).
- [x] Clicking a folder's chevron loads and renders its children indented beneath it without navigating away from the current directory.
- [x] Support recursive multi-level expansion with depth-based indentation and active sort order applied at every level.
- [x] Preserve double-click on a folder row to navigate into that folder.

## Edge Cases
- Show an indented inline `"Loading…"` row while a subfolder is fetching, and an inline error row if reading fails.
- Reset expanded folder state when navigating to a new root directory or switching view modes.

## Implementation Notes
- Key files: `src/components/MainView.tsx` (`expandedFolders`, `toggleExpandFolder`, `flatListRows`), `src/index.css`.

## Amendments
- Updated in `013-actions-menu-and-share-cleanup.md` so expanded folders also respect and reset on the `Show Hidden Files` toggle.
