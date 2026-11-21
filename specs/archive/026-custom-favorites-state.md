# 026 — Custom Favorites State Persistence

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Save state for the custom favorites, so when you click on it the previous directory you were on is shown."

## Summary
Extend WinFinder's per-panel state persistence (`~/.winfinder` via Rust `AppStateStore` and React state) so custom sidebar favorites (`fav:<path>`) save and restore their browsing state (`lastPath`, `viewMode`, `sort`, `expandedPaths`, `columnPaths`) across panel switches and app restarts, while resetting to the favorite's root if the user navigated outside its subtree and cleaning up saved state when a custom favorite is removed.

## Requirements
- [x] Treat custom favorite panels (`fav:<path>`) as tracked panels in both TypeScript (`TrackedPanelId`) and Rust (`AppStateStore`).
- [x] Persist `lastPath`, `viewMode`, `sort`, `expandedPaths`, and `columnPaths` for custom favorites in `~/.winfinder` and restore them when switching panels, using Back/Forward history, or restarting the app.
- [x] When navigating to a descendant subfolder inside a custom favorite (e.g. `MyFav/sub`), clicking that custom favorite restores `lastPath` (along with matching `expandedPaths` and `columnPaths`).
- [x] When navigating outside a custom favorite's root subtree (e.g. clicking `C:\` in the path bar), reset the favorite's saved `lastPath` to its root so clicking the favorite opens its root directory.
- [x] When clicking a custom favorite, check `check_directory_exists` for the favorite's root first (showing the missing-favorite dialog if deleted), and fall back to the nearest existing parent within the favorite's root (or the root itself) if `lastPath` no longer exists.
- [x] Clicking the already-active custom favorite panel while inside a subfolder returns to that favorite's root directory.
- [x] On app startup, if the persisted `activePanel` is a custom favorite that still exists in `customFavorites` and on disk, restore it; otherwise fall back to `home`.
- [x] Clean up saved panel state in both memory and `~/.winfinder` whenever a custom favorite is removed.

## Edge Cases
- Custom favorite root deleted on disk: clicking it shows the existing missing-favorite dialog; on app startup, falls back to `home`.
- Saved `lastPath` subfolder deleted on disk while favorite root still exists: `resolve_panel_path` walks up to the nearest existing ancestor inside the favorite's root, falling back to the favorite's root.
- Saved `lastPath` outside the favorite's root (e.g. via path bar navigation or manual edit of `~/.winfinder`): ignored/reset so the favorite opens at its root directory.
- Windows case-insensitivity and trailing slashes: path comparisons and custom favorite key matching use normalized path keys and path-segment boundaries (so `C:\Projects2` is never treated as inside `C:\Projects`).
- Removing a custom favorite while it is active or inactive: prunes its `fav:<path>` entry from `panels` and resets `activePanel` to `home` if it was active.
- Orphaned `fav:<path>` keys in `~/.winfinder` not present in `customFavorites`: automatically pruned during `PersistedAppState::sanitize`.

## Implementation Notes
- **`src/types.ts`**: Extended `TrackedPanelId` to include `CustomFavoritePanelId` (`fav:${string}`).
- **`src/utils/favorites.ts`**: Added `isPathWithinRoot(targetPath, rootPath)` with segment-boundary and cross-platform separator/casing handling.
- **`src/App.tsx`**: Updated `isTrackedPanel`, startup restoration, `navigateTo`, `handleSelectPanel`, `navigateHistoryTo`, `handleExpandedPathsChange`, `handleColumnPathsChange`, and `handleRemoveFavorite` to track, validate, restore, and clean up custom favorite panel state.
- **`src-tauri/src/lib.rs`**: Updated `is_tracked_panel`, `PersistedAppState::sanitize`, `resolve_existing_dir`, and added Rust unit tests covering custom favorite persistence, sanitization, pruning, and subtree path resolution.

## Amendments
- None.
