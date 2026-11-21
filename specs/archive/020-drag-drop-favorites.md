# 020 — Drag & Drop Directories into Favorites

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "You should be able to drag and drop directories into the favourites section of the left panel bar. There should be a maximum number of 10 items for this. If this directory no longer exists when you click on it, a warning dialogue should appear asking if you want to remove the item from favourites"

## Summary
Allow users to drag and drop directories (from the main directory view or from the OS file manager) into the Favorites section of the left sidebar, persisting custom favorites in `~/.winfinder` with a maximum of 10 total Favorites items, and showing a Finder-style warning dialog with a Remove option when clicking a favorite whose directory no longer exists on disk.

## Requirements
- [x] Support dragging directories from the MainView (Icon, List, Columns, and Gallery views) and dropping them into the Favorites section of the left sidebar.
- [x] Support dragging directories from the OS (e.g. Windows Explorer) into the Favorites section via Tauri's native drag-and-drop events.
- [x] Show clear macOS Finder-style drop target visual feedback (section highlight and blue insertion indicator) while dragging over Favorites.
- [x] Enforce a maximum of 10 total items in the Favorites section (built-in favorites + custom favorites <= 10), ignoring drops beyond the limit and displaying clear feedback when full.
- [x] Prevent duplicate favorites (both against existing custom favorites and built-in Favorites paths like Home, Desktop, Documents, Downloads) and ignore non-directory drops.
- [x] Persist custom favorites across app restarts in `~/.winfinder` (with `localStorage` fallback in browser-only dev mode).
- [x] Clicking a custom favorite navigates to that directory and highlights it in the sidebar.
- [x] When clicking a custom favorite whose directory no longer exists on disk, show a Finder-style warning dialog asking whether to remove the item from Favorites (with Remove and Cancel actions).
- [x] Allow removing a custom favorite via right-click context menu ("Remove from Favorites").

## Edge Cases
- Dropping files, virtual locations (`virtual://...`), or applications onto Favorites: rejected / ignored.
- Dropping a directory that is already in Favorites (case-insensitive path match on Windows, trailing separators normalized): ignored with duplicate feedback.
- Dropping multiple folders from the OS when fewer than `10 - currentCount` slots remain: only add valid non-duplicate folders up to the 10-item cap.
- Clicking a favorite after its folder was deleted or renamed externally: `check_directory_exists` returns `false`, current view stays intact, and the warning dialog prompts to Remove or Cancel.
- Removing the currently active custom favorite: falls back active panel selection cleanly.
- Existing `~/.winfinder` state files without `customFavorites`: deserialize cleanly with an empty list via `#[serde(default)]`.

## Implementation Notes
- **`src-tauri/src/lib.rs`**: Added `FavoriteFolder` struct, `custom_favorites` field on `PersistedAppState` with path-normalized deduplication and `MAX_FAVORITES = 10` cap, immediate atomic persistence in `AppStateStore::update_custom_favorites`, and Tauri commands `save_custom_favorites`, `check_directory_exists`, and `validate_favorite_dirs`.
- **`src/types.ts`**: Added `FavoriteFolder`, `CustomFavoritePanelId`, and `customFavorites` on `PersistedAppState`.
- **`src/utils/favorites.ts`**: Shared constants (`MAX_FAVORITES_ITEMS = 10`, `FAVORITE_DRAG_MIME`) and cross-platform path normalization/deduplication helpers.
- **`src/components/MainView.tsx`**: Made real directory items draggable across Icon, List, Columns, and Gallery views.
- **`src/components/Sidebar.tsx`**: Added Favorites drop zone handling, macOS Finder-style blue highlight and insertion indicator, full/duplicate hints, custom favorite rendering, and right-click Remove menu.
- **`src/App.tsx`**: Managed custom favorites state, `~/.winfinder` + `localStorage` persistence, Tauri `getCurrentWebview().onDragDropEvent` OS drag-and-drop listener, missing-folder check on click, and Finder-style warning dialog with Escape/Enter keyboard support.
- **`src/index.css`**: Added styles for Favorites drop feedback, insertion indicator, sidebar context menu, and warning modal dialog.

## Amendments
- **2026-11-21 (WebView2 In-App Drag Fix):** Replaced HTML5 `draggable={true}` / `onDragOver` / `onDrop` for in-app folder dragging with a pointer-event-based drag system (`onPointerDown` with a 6px movement threshold on `window` `pointermove`, `pointerup`, and `Escape` cancel). On Windows Tauri v2, `dragDropEnabled: true` replaces WebView2's `IDropTarget` with Tauri's native OS drop handler, causing HTML5 drags to display the Windows no-entry cursor and never fire `onDragOver`/`onDrop`. The pointer-event drag renders a macOS Finder-style floating drag ghost, hit-tests `favoritesSectionRef` to drive the `accept` / `duplicate` / `full` Favorites drop states and cursors (`grabbing` / `copy` / `not-allowed`), and preserves Tauri's `getCurrentWebview().onDragDropEvent` for dragging folders from Windows Explorer.
