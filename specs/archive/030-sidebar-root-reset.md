# 030 — Reset Sidebar Panel to Root When Navigating Outside Subtree

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Bug: if the user navigates away from a view's root directory, the next time they click on the view it should reset to the root view. For example I click on 'downloads', then in the bottom bar click and navigate to 'c:\'. Next time I click on downloads it should show the downloads folder not 'C:\'. Currently if you click the 'downloads' button twice, this behaviour does work (it resets to the downloads directory), just not once."

## Summary
Ensure that navigating outside a tracked sidebar panel's root directory (e.g., clicking `C:\` in the bottom path bar while on `Downloads`) does not overwrite that panel's saved `lastPath` with an out-of-subtree path, so the next single click on that sidebar item always resets to the panel's root directory while preserving valid subfolder memory within the panel's subtree.

## Requirements
- [x] Add cross-platform subtree membership check (`isPathWithinRoot` in frontend and `is_path_within_root` in Rust) that handles Windows case-insensitivity, drive roots (`C:\`), trailing/mixed slashes, virtual paths (`virtual://...`), and prefix boundaries (e.g., `Downloads2` is not within `Downloads`).
- [x] When navigating via `navigateTo` or Back/Forward history (`navigateHistoryTo`) to a directory outside the active tracked panel's root subtree, reset that panel's saved `lastPath` to its root path rather than saving the out-of-root path.
- [x] Do not persist `expandedPaths` or `columnPaths` onto a tracked panel while the currently displayed path is outside that panel's root subtree.
- [x] When selecting a tracked sidebar panel (single click) or restoring state on startup, ignore any saved `lastPath` outside that panel's root subtree (including cached fast-path entries and persisted `~/.winfinder` state) and navigate directly to the panel's root directory on the first click.
- [x] Enforce the same subtree constraint in Rust's `resolve_existing_dir` / `resolve_panel_path` so walking up missing parents never escapes above the panel's root directory.
- [x] Preserve valid subfolder memory when navigating within a panel's root subtree (e.g., `Downloads\Subfolder` is remembered when switching to another panel and back, and clicking the already-active panel resets to its root on a single click).
- [x] Add Rust unit tests covering `is_path_within_root` and `resolve_existing_dir` subtree boundaries.

## Edge Cases
- Existing `~/.winfinder` files from earlier versions containing an out-of-root `lastPath` (e.g., `"downloads": { "lastPath": "C:\\" }`): automatically rejected by both frontend subtree checks and Rust `resolve_existing_dir`, falling back to the panel's root directory.
- Prefix collisions (e.g., `C:\Users\chris\Downloads2` vs `C:\Users\chris\Downloads`): rejected via path-separator boundary check.
- Drive roots (`C:\`, `/`) and virtual roots (`virtual://recents`): handled without double-slash or false-positive prefix bugs.
- Deleted subfolder whose parent walk-up would escape above `root_path`: stops at `root_path` and falls back to `root_path` (or `home_dir()` if `root_path` itself does not exist).
- Browser-only dev mode (`npm run dev`): `isPathWithinRoot` works for `~/...` mock paths as well as OS paths.

## Implementation Notes
- **`src/utils/favorites.ts`**: Added `isPathWithinRoot(path, rootPath)` with normalized slash/case handling, drive-root handling, virtual path handling, and separator boundary checks.
- **`src/App.tsx`**:
  - Guarded `navigateTo` and `navigateHistoryTo` so navigating outside a tracked panel's root subtree resets that panel's persisted `lastPath` to `rootPath` instead of storing the out-of-root path.
  - Guarded `handleSelectPanel` (both cached fast-path and `resolvePanelTarget` path) and initial startup restoration so any saved `lastPath` outside the panel's root subtree is ignored and falls back to `rootPath` on a single click.
  - Guarded `handleExpandedPathsChange` and `handleColumnPathsChange` so list/column sub-state from out-of-root browsing is not saved onto the tracked panel.
  - Used `normalizePathKey` for active-path equality checks to avoid case/trailing-slash mismatches on Windows.
- **`src-tauri/src/lib.rs`**:
  - Added `normalize_for_subtree_check` and `is_path_within_root`.
  - Updated `resolve_existing_dir` (used by `resolve_panel_path`) to reject any `saved_path` outside `root_path` and stop parent walk-up before escaping above `root_path`.
  - Added unit tests `is_path_within_root_windows_cases` and `resolve_existing_dir_rejects_saved_path_outside_root`.

## Amendments
- None.
