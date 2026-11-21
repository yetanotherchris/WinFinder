# 006 — Toolbar View Modes & Sort Menu

- **Status:** Archived
- **Date:** 2026-11-20
- **Request:** "Implement the 4 view mode icons in the top bar (Icons, List, Columns, Gallery), plus the Sort menu."

## Summary
Implement all four macOS Finder view modes in the segmented toolbar switcher alongside a Sort popover menu that controls sorting across every view.

## Requirements
- [x] Implement **Icons** view (responsive grid).
- [x] Implement **List** view (table with Name, Date Modified, Size, and Kind columns and clickable sortable headers).
- [x] Implement **Columns** view (Miller Columns with nested folder columns and a right-hand file preview/metadata inspector).
- [x] Implement **Gallery** view (hero preview stage, metadata summary, horizontal filmstrip, and Left/Right arrow-key navigation).
- [x] Implement the **Sort** popover menu supporting *Name*, *Kind*, *Date Modified*, *Size*, *Ascending / Descending*, and *Keep Folders on Top*.
- [x] Return file modification timestamps (`modifiedMs`) from the backend for display and sorting.

## Edge Cases
- Entering Gallery view with no item selected automatically selects the first item.
- Navigating to a new root location resets Miller sub-columns and preview state.
- Clicking outside the Sort popover or pressing `Escape` dismisses it.

## Implementation Notes
- Key files: `src-tauri/src/lib.rs`, `src/types.ts`, `src/utils/format.ts`, `src/App.tsx`, `src/components/Toolbar.tsx`, `src/components/MainView.tsx`, `src/index.css`.

## Amendments
- List View was subsequently upgraded to support inline expandable folder chevrons (see `007-expandable-list-view.md`) and resizable columns (see `009-resizable-columns.md`).
