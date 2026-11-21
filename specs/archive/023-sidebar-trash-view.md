# 023 — Sidebar Trash View & Empty Action

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "A trash item should be added in the left panel. It should have an empty button, like MacOs Finder, in the top right, placed on a header panel."

## Summary
Add a Trash (Recycle Bin) entry to the left sidebar panel that opens a dedicated Trash view listing items currently in the OS Trash/Recycle Bin, complete with a macOS Finder-style header panel containing an "Empty" button in the top right and a confirmation prompt before permanently emptying the Trash.

## Requirements
- [x] Add a Trash item in the left sidebar panel under Locations with a trash icon and active selection state.
- [x] Add Rust backend support for listing OS Trash contents via `virtual://trash` in `list_directory` (Windows Recycle Bin via Shell COM `FOLDERID_RecycleBinFolder`, with macOS `~/.Trash` and Linux XDG Trash fallbacks).
- [x] Add a Rust backend `empty_trash` command (Windows `SHEmptyRecycleBinW`, with macOS and Linux fallbacks) registered in Tauri's invoke handler.
- [x] Display a macOS Finder-style header panel at the top of the Trash view with an "Empty" button aligned to the top right.
- [x] Disable the "Empty" button when the Trash is empty (or while loading/emptying).
- [x] Prompt the user for confirmation before permanently emptying the Trash, and refresh the Trash view afterward.
- [x] Show a Trash icon in the path bar breadcrumb when viewing Trash.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` succeed cleanly.

## Edge Cases
- **Empty Trash:** Shows "Trash is empty" empty state and disables the "Empty" button.
- **Already empty on Windows:** `SHEmptyRecycleBinW` may return `E_UNEXPECTED` when the Recycle Bin is already empty; treated gracefully as `Ok(())`.
- **Duplicate display names in Trash:** Multiple deleted items can share the same original filename; unique filesystem/parsing paths are used as entry paths so React keys and selection do not collide.
- **Browser preview mode (`!isTauriRuntime()`):** Provides mock Trash entries and working mock empty behavior so the UI can be verified outside Tauri.
- **Cross-platform builds:** All Windows Win32/Shell API calls are gated behind `#[cfg(target_os = "windows")]`, and macOS/Linux fallbacks use `std::path::Path` / `PathBuf` without hardcoded separators.

## Implementation Notes
- **Backend (`src-tauri/src/lib.rs`):** Added `win_shell::enumerate_recycle_bin` (using `SHGetKnownFolderItem(&FOLDERID_RecycleBinFolder, ...)` and `IEnumShellItems`), `win_shell::empty_recycle_bin` (using `SHEmptyRecycleBinW`), cross-platform `list_trash` and `clear_dir_contents`, wired `"virtual://trash"` in `list_directory`, and exposed/registered the async `empty_trash` Tauri command.
- **Frontend (`src/types.ts`, `src/components/Sidebar.tsx`, `src/components/MainView.tsx`, `src/App.tsx`, `src/index.css`):** Added `"trash"` to `PanelId`, added the Trash sidebar button under Locations, added the macOS Finder-style `.trash-header-panel` with top-right `.trash-empty-btn` and `.finder-modal-dialog` confirmation alert in `MainView.tsx`, wired `handleEmptyTrash` with cache invalidation and refresh in `App.tsx`, and added a `Trash2` breadcrumb icon.

## Amendments
- Used a custom macOS-styled modal alert dialog (`role="alertdialog"`) instead of browser `window.confirm()` for consistent visual polish and reliable behavior in Tauri webviews.
