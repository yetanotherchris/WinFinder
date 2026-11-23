# 052 — Core File Operations: Copy/Paste, Delete to Trash, and Folder Background Context Menu

- **Status:** Archived
- **Date:** 2026-11-23
- **Request:** "1. Copy (CTRL+C) and CTRL+V should work with files, and folders; 5. DEL key support for deleting files; 6. Context menu support for a folder (e.g. the white background of the panel) to create a folder or file similar to Windows Explorer."

## Summary
Adds core desktop file management operations to WinFinder: `Ctrl+C` / `Ctrl+V` clipboard copy and paste for files and folders (interoperating with Windows `CF_HDROP` and `Preferred DropEffect`), `Delete` key support to move selected files and folders to the OS Recycle Bin/Trash, and a folder background context menu for creating new folders/files and running common folder actions.

## Requirements
- [x] **Copy & Paste (`Ctrl+C` / `Ctrl+V`)**: Pressing `Ctrl+C` copies the selected file or folder to the OS clipboard (`CF_HDROP` on Windows, with an in-memory fallback on non-Windows); pressing `Ctrl+V` pastes files/folders from the OS clipboard (including items copied or cut from Windows Explorer) into the current directory with automatic conflict naming (`name - Copy.ext`, `name - Copy (2).ext`) and recursive directory copy support.
- [x] **Delete Key Support (`Delete`)**: Pressing `Delete` on a selected file or folder moves it to the OS Recycle Bin/Trash (`SHFileOperationW` with `FO_DELETE` + `FOF_ALLOWUNDO` on Windows; `~/.Trash` on macOS and XDG Trash on Linux) and refreshes the active view.
- [x] **Folder Background Context Menu**: Right-clicking the empty background of a real directory panel (including Miller Column panes) opens a clean context menu supporting New Folder, New Text Document (`.txt`), New Markdown File (`.md`), Paste (`Ctrl+V`), Refresh, Open in Terminal, Copy Folder Path, and Show in File Explorer; newly created folders/files immediately enter inline rename mode.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly.

## Edge Cases
- Copy/Paste prevents copying or moving a folder into itself or one of its own descendants.
- Pasting into a folder where the target name already exists generates unique ` - Copy` / ` - Copy (N)` names instead of overwriting; cut-paste moves across volumes fall back to recursive copy + remove and clear the Windows clipboard after moving.
- `Ctrl+C`, `Ctrl+V`, and `Delete` are ignored when focus is inside text inputs (inline rename, search bar, Go to Path modal) or on non-filesystem items (`virtual://`, `app://`, `trash://`, drives).
- Folder background context menu is suppressed on virtual views, Trash, and Search results, and closes on outside click, `Escape`, window blur, or view/path changes.

## Implementation Notes
- `src-tauri/src/lib.rs`:
  - Added `win_shell::ClipboardFiles`, `win_shell::get_clipboard_files` (`CF_HDROP` + `Preferred DropEffect`), `win_shell::clear_clipboard`, and `win_shell::move_to_recycle_bin` (`SHFileOperationW` + `FO_DELETE` + `FOF_ALLOWUNDO`).
  - Added `unique_copy_destination`, `copy_dir_recursive`, `copy_fs_item_to_dir`, `move_fs_item_to_dir`, and `create_new_file_in_dir` helpers, plus Tauri commands `paste_from_clipboard`, `delete_item`, and `create_new_file`, and hardened `copy_file_to_clipboard` with virtual-path guards and non-Windows fallback.
  - Added unit test `copy_and_create_file_helpers_work_safely`.
- `src/App.tsx`:
  - Added `refreshSeq` state, `mockClipboardRef`, `handlePaste`, `handleDeleteEntry`, `handleNewFile`, updated `handleCopyFile` and `handleNewFolder` (supporting `targetDirOverride` and `startRename`), and wired `Ctrl+C`, `Ctrl+V`, and `Delete` keyboard shortcuts plus background context menu callbacks.
- `src/components/MainView.tsx`:
  - Added `bgMenu` state, `openBackgroundContextMenu`, `refreshSeq` dependency for Miller Columns/expanded folders refresh, and the `.bg-context-menu` popover with actions for New Folder, New Text Document, New Markdown File, Paste, Refresh, Open in Terminal, Copy Folder Path, and Show in File Explorer.
- `src/index.css`:
  - Added light and dark theme styles for `.bg-context-menu`, `.bg-context-menu-item`, `.bg-context-menu-shortcut`, and `.bg-context-menu-sep`.

## Amendments
- None.
