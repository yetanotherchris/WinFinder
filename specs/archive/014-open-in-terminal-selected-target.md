# 014 — Open in Terminal Uses Selected Item Target

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Open in Terminal doesn't use the selected item, just the parent (e.g., Documents). If a file is selected it should open the file's parent directory."

## Summary
Update **Open in Terminal** in the Actions menu so that selecting a folder/drive opens the terminal directly inside that folder, selecting a file opens the terminal in the file's parent directory, and having no selection falls back to the current directory.

## Requirements
- [x] When a real folder or drive is selected, open Terminal with that folder/drive as its working directory.
- [x] When a real file is selected, resolve its parent directory and open Terminal there (including for files in expanded List View subfolders, Miller Columns, or `Recents`).
- [x] When nothing (or an app) is selected, fall back to opening Terminal in the current real directory.
- [x] Enable **Open in Terminal** in the Actions menu whenever either the current directory is real OR a real filesystem item is selected.

## Edge Cases
- If a file's parent directory cannot be resolved or no longer exists, return a clear error message.
- Cross-platform support preserved for Windows (`wt.exe` / PowerShell fallback), macOS (`open -a Terminal`), and Linux (`x-terminal-emulator`).

## Implementation Notes
- Key files: `src-tauri/src/lib.rs` (`open_in_terminal`), `src/App.tsx` (`handleOpenInTerminal`), `src/components/Toolbar.tsx`.

## Amendments
- None.
