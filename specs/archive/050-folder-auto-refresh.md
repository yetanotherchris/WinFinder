# 050 — Automatic Folder Refresh (Filesystem Watcher)

- **Status:** Archived
- **Date:** 2026-11-23
- **Request:** "A folder doesn't automatically pickup new files or folders when they're written to disk. Can it automatically refresh either on a timer, or using a filesystem (e.g. winapi) hook"

## Summary
Watches the currently active filesystem directory using Windows `FindFirstChangeNotificationW` + `WaitForMultipleObjects` (with a lightweight polling fallback on non-Windows) and emits debounced `directory-changed` events so external file and folder creations, deletions, renames, and modifications appear automatically without manual refresh.

## Requirements
- [x] Watch the active real directory on Windows via `FindFirstChangeNotificationW` + `WaitForMultipleObjects` monitoring file name, directory name, size, last-write, and attribute changes.
- [x] Debounce rapid bursts of filesystem notifications (~220ms) before emitting `directory-changed` events to the frontend.
- [x] Provide a lightweight cross-platform polling fallback (2-second interval comparing directory mtime and entry count) when not on Windows or if the native watcher fails to start.
- [x] Expose a `watch_directory` Tauri command managed by `DirWatcherManager` that switches watches cleanly on navigation and stops the watcher on virtual/search views or window close.
- [x] Silently refresh the active directory listing on `directory-changed` events in `src/App.tsx`, preserving selection and avoiding disruption while an inline rename is active.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly.

## Edge Cases
- Virtual paths (`virtual://...`) and active search views do not start a filesystem watcher; switching to them stops any active watcher thread cleanly.
- Switching between folders signals the Win32 stop event (`CreateEventW` / `SetEvent`) and joins the previous watcher thread before starting the new one; closing the main window also stops the watcher cleanly.
- Active inline rename edits (`renamingPathRef.current`) suppress incoming `directory-changed` refreshes so user input is never interrupted.
- Transient `list_directory` errors while external writers hold locks are safely ignored.

## Implementation Notes
- `src-tauri/Cargo.toml`: Added `Win32_Security` feature to `windows` (required for `CreateEventW`).
- `src-tauri/src/lib.rs`:
  - Imported `tauri::Emitter`.
  - Added `win_shell::WinDirWatchHandle` and `win_shell::start_directory_watcher` (`FindFirstChangeNotificationW` + `WaitForMultipleObjects` with 220ms burst debounce).
  - Added `DirWatcherManager`, `ActiveWatcher`, `dir_fingerprint`, and the `watch_directory` Tauri command.
  - Managed `Arc<DirWatcherManager>` in `run()` and stopped it on `WindowEvent::CloseRequested` / `WindowEvent::Destroyed`.
- `src/App.tsx`:
  - Imported `listen` from `@tauri-apps/api/event` and added `renamingPathRef`.
  - Wired `watchedDirPath` to invoke `watch_directory` whenever the active real directory changes.
  - Added a `directory-changed` event listener that invalidates the directory cache and silently refreshes the active listing when entries have changed.

## Amendments
- None.
