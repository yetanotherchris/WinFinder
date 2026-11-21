# 010 — Native Windows OS Context Menu

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Make the right-click context menu show the default Windows OS context menu for the highlighted item."

## Summary
Invoke the native Windows Shell context menu (`IContextMenu` + `TrackPopupMenuEx`) when right-clicking any file, folder, drive, or app across all four views, refreshing the directory after a shell command is executed.

## Requirements
- [x] Right-clicking an item in Icons, List, Columns, or Gallery view selects that item and opens the native Windows OS context menu at the cursor position.
- [x] Execute the chosen shell verb cleanly on the main GUI thread.
- [x] Automatically refresh the current real directory if a context menu command was invoked (e.g., rename, delete, extract, new file).
- [x] Keep the WebView browser context menu suppressed on non-item areas.

## Edge Cases
- Virtual locations (`virtual://...`) do not trigger a filesystem refresh after invocation, and non-Windows targets return cleanly without crashing.
- Installed app items (`app://<aumid>`) resolve via `FOLDERID_AppsFolder` relative shell items so native app context menus work too.

## Implementation Notes
- Key files: `src-tauri/src/lib.rs` (`show_context_menu`, `win_shell::show_shell_context_menu` via `run_on_main_thread`), `src/App.tsx`, `src/components/MainView.tsx`.

## Amendments
- None.
