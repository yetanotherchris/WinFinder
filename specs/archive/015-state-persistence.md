# 015 — Application State Persistence (`~/.winfinder`)

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "The application saves its state to ~/.winfinder as a JSON file. It should do this for the following: 1. window resize/size 2. window position 3. each of the panels states. This includes the view (list, icons etc.), sorting, last folder open (this should be each of the views, exception 'application' and 'drives', 'network' that exist in the left hand panel). For 3. - a case may exist where the folder no longer exists. It should if possible find the parent folder in this case, and if one doesn't exist just go to the root directory for that item, e.g. documents, downloads, home."

## Summary
Persist WinFinder's window geometry (size, position, maximized state) and per-panel browsing state (view mode, sort configuration, and last opened folder) to `~/.winfinder` as a JSON file, restoring them on launch and when switching between tracked sidebar panels.

## Requirements
- [x] Persist application state to `~/.winfinder` as formatted JSON.
- [x] Save and restore window size (width, height), position (x, y), and maximized state across app restarts.
- [x] Validate restored window bounds against available monitors so the window is never restored off-screen or smaller than its minimum size.
- [x] Ignore minimized / zero-dimension window geometry events so minimized coordinates (e.g. `-32000, -32000` on Windows) do not corrupt saved bounds.
- [x] Save and restore per-panel state (`viewMode`, `sort`, `lastPath`) for each tracked sidebar panel: `recents`, `desktop`, `documents`, `downloads`, and `home`.
- [x] Exclude `applications`, `drives`, and `network` from panel state persistence.
- [x] Persist and restore the last active tracked panel on startup (defaulting to `home`).
- [x] When restoring a panel's `lastPath` and that folder no longer exists, walk up to the nearest existing parent directory; if none exists, fall back to that panel's root directory (e.g. Desktop, Documents, Downloads, Home).
- [x] Switching between tracked sidebar panels restores each panel's saved view mode, sort configuration, and last opened folder.
- [x] Clicking the already-active sidebar panel while inside a subfolder returns to that panel's root directory.

## Edge Cases
- Missing, empty, or corrupted `~/.winfinder`: silently fall back to default window geometry and default panel states without crashing or showing an error.
- Disconnected external monitor: if saved `(x, y)` lies outside all currently connected monitors, center the window instead.
- Minimized window on close: retain the last normal (non-minimized, non-maximized) size and position.
- Rapid window resize/drag events: debounce writes (~300ms) and flush synchronously on window close.
- Deleted subfolder or disconnected drive in `lastPath`: walk up `Path::parent()` until an existing directory is found, falling back to the panel's root directory (or home directory if the root itself is missing).
- Browser-only dev mode (`npm run dev` without Tauri): gracefully fall back to in-memory defaults without calling Tauri IPC.

## Implementation Notes
- **`src-tauri/src/lib.rs`**:
  - Added `WindowState`, `PersistedSortConfig`, `PanelState`, `PersistedAppState`, and thread-safe `AppStateStore` with a single-thread `Condvar` 300ms debounced writer and atomic temp-file rename writes to `~/.winfinder`.
  - Restores window size, position (validated against `available_monitors()`), and maximized state in Tauri `.setup()` before UI render; tracks `WindowEvent::Resized`, `WindowEvent::Moved`, and synchronously flushes on `CloseRequested`/`Destroyed`.
  - Added `load_app_state`, `save_panel_states`, and `resolve_panel_path` Tauri commands, enforcing the `TRACKED_PANELS` allowlist (`recents`, `desktop`, `documents`, `downloads`, `home`) so `applications`, `drives`, and `network` are never persisted.
- **`src/types.ts`**: Added `PanelId`, `TrackedPanelId`, `PanelState`, and `PersistedAppState`.
- **`src/components/Sidebar.tsx`**: Switched sidebar selection/highlighting to use `activePanel` and `onSelectPanel(panelId)`.
- **`src/App.tsx`**: Restores `activePanel` and per-panel `viewMode`, `sortConfig`, and resolved `lastPath` on startup and on sidebar panel switches; persists changes for tracked panels only; stores `{ path, panel }` in navigation history so Back/Forward restores panel view/sort state too.

## Amendments
- Extended Back/Forward navigation history entries to store `{ path, panel }` so navigating back/forward across panels restores each panel's view mode and sort configuration.
- Added `expandedPaths` to `PanelState` so folders expanded inline in List View persist per tracked panel across sidebar switches and app restarts (automatically pruning any expanded paths that no longer exist), and delayed the List View `"Loading…"` placeholder row by 120ms to eliminate single-frame flicker when expanding local folders.
- Added `columnPaths` to `PanelState` so open Miller Columns sub-panes persist per tracked panel across sidebar switches and app restarts (hydrating synchronously from `dirCache` on frame 0 and truncating at the first missing folder if deleted on disk).
- Changed the background `~/.winfinder` writer from a 300ms debounce to a 5-second dirty flush interval (still flushing synchronously on window close).
- Isolated excluded panels (`applications`, `drives`, `network`) with session-only in-memory view/sort state (defaulting to Icons view) so switching from a favourite in Columns/List view no longer bleeds into Drives/Applications/Network.
