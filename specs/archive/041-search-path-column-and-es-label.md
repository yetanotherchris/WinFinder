# 041 — Search Results Path Column & Everything CLI Install Hint

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Update the Settings dialog Everything CLI install hint to mention `use scoop install everything-cli`, and add a `Path` column when displaying search results."

## Summary
Polishes two search-related UX details: updates the missing Everything CLI (`es`) helper label in Settings to instruct users to install via Scoop (`scoop install everything-cli`), and adds a resizable `Path` column to the List view when displaying search results so users can immediately see each match's parent folder.

## Requirements
- [x] Update the Everything CLI (`es`) missing-in-PATH helper label in `src/components/SettingsDialog.tsx` to instruct the user to use `scoop install everything-cli` to install, styled cleanly for both Light and Dark themes.
- [x] Add a cross-platform `getParentPath` helper in `src/utils/format.ts` to extract the parent directory path for each search result.
- [x] In `src/components/MainView.tsx`, include a `Path` column in List view when displaying search results (`isSearchView`), showing each result's parent directory path with ellipsis truncation, full-path tooltip (`title={entry.path}`), column resizing, and double-click auto-fit.
- [x] Ensure normal (non-search) directory browsing in List view remains unaffected (no `Path` column rendered).
- [x] Style the `Path` column and Settings inline code hint for both Light and Dark themes in `src/index.css`.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` succeed cleanly.

## Edge Cases
- Root-level Windows paths (e.g. `C:\Windows`), UNC paths (`\\server\share\file`), POSIX paths (`/etc`), and browser-preview mock paths (`~/README.md`) resolve cleanly in `getParentPath`.
- Inline expanded folder status rows ("Loading…" / errors) in List view include a matching `col-path` spacer cell when in search mode so grid columns stay aligned.
- Long paths truncate cleanly with ellipsis (`text-overflow: ellipsis`) without breaking row height or horizontal scrolling, while hovering reveals the full path via `title`.
- Exiting search mode immediately restores the standard 4-column List view (`Name`, `Date Modified`, `Size`, `Kind`).

## Implementation Notes
- `src/components/SettingsDialog.tsx`: Updated `#setting-everything-cli-hint` copy to mention `scoop install everything-cli`.
- `src/utils/format.ts`: Added `getParentPath`.
- `src/components/MainView.tsx`: Added `path` column width state, resize/auto-fit support, and conditional `Path` column rendering in List view when `isSearchView` is active.
- `src/index.css`: Styled `.list-cell.col-path`, `.list-col-hdr.col-static`, and `.settings-row-hint code` for Light and Dark themes.

## Amendments
- None
