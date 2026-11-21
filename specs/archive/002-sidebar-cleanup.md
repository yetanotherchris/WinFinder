# 002 — Remove macOS-Only Sidebar & Toolbar Items

- **Status:** Archived
- **Date:** 2026-11-20
- **Request:** "Remove tags, iCloud, and AirDrop from the UI."

## Summary
Strip macOS-exclusive items (`AirDrop`, `iCloud`, `Tags`, and toolbar `Edit Tags`) so WinFinder presents a clean, Windows-relevant interface without dead macOS-only controls.

## Requirements
- [x] Remove `AirDrop` and `iCloud` entries from the sidebar.
- [x] Remove the `Tags` section from the sidebar.
- [x] Remove the `Edit Tags` button from the top toolbar.
- [x] Preserve balanced vertical/horizontal spacing across the remaining sidebar and toolbar controls.

## Edge Cases
- No stray section headers or orphan dividers remain after removing `Tags`.

## Implementation Notes
- Key files: `src/components/Sidebar.tsx`, `src/components/Toolbar.tsx`, `src/index.css`.

## Amendments
- None.
