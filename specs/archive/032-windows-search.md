# 032 — Windows Search

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Add a simple default implementation for search. It can use the built in windows search for now."

## Summary
Adds a macOS Finder-style expandable search bar in the toolbar backed by a `search_directory` Tauri command that queries the built-in Windows Search Index (`SystemIndex` via `Search.CollatorDSO`) with a fast bounded recursive filesystem fallback, displaying results cleanly in `MainView`.

## Requirements
- [x] Replace the prototype filler Search button in `Toolbar.tsx` with an interactive macOS Finder-style expandable search input.
- [x] Support expanding/focusing search via clicking the magnifying glass icon or pressing `Ctrl+F` / `Cmd+F`.
- [x] Provide a clear `×` button and `Escape` key handling to clear/close search and return to the current folder.
- [x] Ensure typing Backspace or arrow keys inside the search input does not trigger Back navigation or Gallery arrow navigation.
- [x] Add `search_directory` Tauri command in `src-tauri/src/lib.rs` accepting `query`, `scope_path`, and `show_hidden`.
- [x] On Windows (`#[cfg(target_os = "windows")]`), query the built-in Windows Search Index (`Search.CollatorDSO` / `SystemIndex`) scoped to the active directory (or Home for virtual views).
- [x] Fall back to a fast bounded breadth-first recursive filesystem walk when Windows Search is unavailable, unindexed, or returns no results (and on macOS/Linux), capped at 200 results.
- [x] Display search results in `MainView` reusing existing view modes (`Icons`, `List`, `Columns`, `Gallery`) with a clear search header (`Search: "<query>"`, scope, result count, and Clear button).
- [x] Support selecting, opening files, and navigating into matched folders (clearing search on navigation).
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly.

## Edge Cases
- Empty or whitespace-only queries immediately clear search and return to the current folder without invoking the backend.
- Virtual views (`virtual://recents`, `virtual://applications`, `virtual://computer`, `virtual://network`, `virtual://trash`) default their search scope to the user's home directory.
- Out-of-order async search responses are discarded via a monotonic request ID.
- Special SQL/quote characters in queries or paths are safely escaped and passed via environment variables rather than interpolated into shell commands.
- Unindexed folders, disabled Windows Search service, or very large directory trees are handled gracefully via bounded BFS fallback with entry/directory/time caps.
- Browser preview mode (`npm run dev` without Tauri) filters mock entries cleanly for UI testing.

## Implementation Notes
- `src-tauri/src/lib.rs`: `search_directory` command, Windows Search OLE DB helper (`query_windows_search_index`), bounded BFS fallback (`walk_search_directory`), unit tests for SQL escaping and fallback search.
- `src/components/Toolbar.tsx`: expandable Finder-style search input with focus management, clear button, and `Escape` handling.
- `src/App.tsx`: search state, `Ctrl+F` / `Cmd+F` shortcut, debounced invocation, stale-request guard, input-aware Backspace guard.
- `src/components/MainView.tsx`: search header banner (`Search: "<query>"`), clear action, input-aware Gallery arrow guard.
- `src/index.css`: macOS Finder-style toolbar search pill and search results header bar styles.

## Amendments
- None
