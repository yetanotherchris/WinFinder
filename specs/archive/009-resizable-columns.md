# 009 — Resizable Columns & Sidebar

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Implement macOS Finder-style configurable column widths (drag-to-resize and double-click auto-fit across List View, Column View, and Sidebar)."

## Summary
Add macOS Finder-style drag-to-resize and double-click auto-fit interactions to List View columns, Miller Columns (including `Alt`-drag / `Alt`-double-click for all columns), and the left Sidebar.

## Requirements
- [x] Support dragging column header dividers in List View to resize Name, Date Modified, Size, and Kind columns within sensible min/max bounds.
- [x] Support double-clicking a List View column divider to auto-fit that column to its widest visible content.
- [x] Support dragging Miller Column dividers to resize a single column, or `Alt`-dragging to resize all Miller Columns together.
- [x] Support double-clicking a Miller Column divider to auto-fit that column, or `Alt`-double-clicking to auto-fit all visible columns.
- [x] Support dragging the right edge of the Sidebar to resize its width, and double-clicking to reset it to the default (`204px`).

## Edge Cases
- Prevent accidental text selection and keep the resize cursor active globally while dragging.
- Measure text widths accurately so auto-fit accounts for icons, disclosure chevrons, and indentation depth.

## Implementation Notes
- Key files: `src/components/MainView.tsx`, `src/components/Sidebar.tsx`, `src/App.tsx`, `src/utils/format.ts` (`measureTextPx`), `src/index.css`.

## Amendments
- None.
