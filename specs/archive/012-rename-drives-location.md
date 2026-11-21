# 012 — Rename "WinFinder HD" to "Drives"

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Winfinder HD should be renamed to 'Drives'."

## Summary
Rename the local computer/drives sidebar entry, toolbar title, and breadcrumb label from `"WinFinder HD"` to `"Drives"` for clearer Windows terminology.

## Requirements
- [x] Rename the sidebar Locations item label from `"WinFinder HD"` to `"Drives"`.
- [x] Update the backend `virtual://computer` directory name and breadcrumb label to `"Drives"`.
- [x] Update pending navigation title fallback for `virtual://computer` to `"Drives"`.

## Edge Cases
- Ensure no remaining references to `"WinFinder HD"` appear anywhere in the UI or backend.

## Implementation Notes
- Key files: `src/components/Sidebar.tsx`, `src/App.tsx`, `src-tauri/src/lib.rs`.

## Amendments
- None.
