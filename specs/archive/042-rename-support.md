# 042 — Rename Support

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Add inline rename support triggered from the Windows shell context menu (Rename verb), F2 shortcut, and Toolbar Actions menu, backed by a cross-platform Rust `rename_item` command."

## Summary
Adds native inline file and folder renaming across all WinFinder views (Icon, List, Column, and Gallery). Users can initiate rename via the native Windows shell context menu (`Rename`), pressing `F2` on a selected item, or choosing `Rename…` from the toolbar Actions (`...`) menu, with safe cross-platform filesystem renaming in Rust.

## Requirements
- [x] Include `CMF_CANRENAME` in Windows `IContextMenu::QueryContextMenu` for regular filesystem entries (excluding virtual Apps, Trash, and Drives).
- [x] Inspect the chosen shell context menu command verb via `IContextMenu::GetCommandString` (`GCS_VERBW` / `GCS_VERBA`) before `InvokeCommand`; when the verb is `"rename"` (case-insensitive), skip shell invocation and return `renameRequested: true` in `ContextMenuResult`.
- [x] Add cross-platform `#[tauri::command] fn rename_item(path: String, new_name: String) -> Result<String, String>` using `std::path::Path` / `fs::rename`, validating non-empty names, rejecting path separators and invalid filename characters, handling case-only renames safely on Windows/macOS, preventing accidental overwrites of different existing entries, and returning the new path.
- [x] Mirror `renameRequested: boolean` in `ContextMenuResult` in `src/types.ts`.
- [x] Implement inline rename in `MainView.tsx` across Icon, List, Column, and Gallery views:
  - [x] Trigger from context menu (`renameRequested: true`), `F2` on a selected non-virtual item, and `"Rename…"` in the toolbar `"..."` Actions menu.
  - [x] Auto-focus the inline input and select the filename stem (excluding extension for files; full name for folders).
  - [x] Commit on `Enter` or blur via `rename_item` (skipping IPC when unchanged), refresh the listing, and keep the renamed item selected.
  - [x] Cancel cleanly on `Escape`.
  - [x] Display clear, dismissible error feedback if renaming fails.
  - [x] Style inline rename inputs cleanly for both Light and Dark themes.

## Edge Cases
- Virtual locations (`virtual://recents`, `virtual://applications`, `virtual://computer`, `virtual://network`, `virtual://trash`), apps (`app://`), drives (`entryKind === "drive"`), and Recycle Bin entries cannot be renamed; `CMF_CANRENAME` is omitted, `F2` is ignored, and `"Rename…"` is disabled.
- Empty or whitespace-only names, `.` / `..`, path separators (`/` or `\`), control characters, Windows reserved characters (`<>:"|?*`), trailing dots/spaces, and Windows reserved device names (`CON`, `NUL`, `COM1`, etc.) return clear validation errors.
- Case-only renames (e.g. `readme.md` -> `README.md`) use a safe two-step temporary rename on case-insensitive filesystems so the case change is applied without overwriting or failing.
- Renaming to an existing different entry's name fails cleanly without overwriting.
- Dotfiles (e.g. `.gitignore`) select the entire name on rename rather than an empty stem.
- Renaming items inside expanded List View folders or Miller Columns sub-columns refreshes the containing folder and preserves selection.

## Implementation Notes
- **`src-tauri/src/lib.rs`**:
  - Added `CMF_CANRENAME` to `QueryContextMenu` flags for regular filesystem files/folders (excluding virtual paths, apps, drives, and Recycle Bin paths).
  - Added `get_context_menu_verb` using `IContextMenu::GetCommandString` (`GCS_VERBW` with `GCS_VERBA` fallback) to intercept the `"rename"` verb and return `rename_requested: true` in `ContextMenuResult` without calling `InvokeCommand`.
  - Added `validate_rename_name`, `rename_fs_item`, and the registered Tauri command `rename_item(path, new_name) -> Result<String, String>`, with unit test `rename_fs_item_validates_renames_and_prevents_overwrites`.
- **`src/types.ts`**: Added `renameRequested: boolean` to `ContextMenuResult`.
- **`src/App.tsx`**: Added `renamingPath` and `renameError` state, `isRenamableEntry`, `handleStartRename`, `handleCancelRename`, `handleCommitRename` (including cache invalidation, expanded/column path updates, listing refresh, and selection preservation), `F2` shortcut handling, and context menu `renameRequested` handling.
- **`src/components/Toolbar.tsx`**: Added `"Rename…"` (`F2`) item to the `"..."` Actions menu.
- **`src/components/MainView.tsx`**: Added `InlineRenameInput` (auto-focus + stem selection, `Enter`/blur commit, `Escape` cancel) across Icon, List, Column, and Gallery views, sub-column/expanded-folder refresh after nested renames, and a dismissible `renameError` banner.
- **`src/index.css`**: Styled `.rename-inline-input` variants and `.rename-error-banner` for both Light and Dark themes.

## Amendments
- Fixed two pre-existing `AppSettings` test struct literals in `src-tauri/src/lib.rs` to use `..AppSettings::default()` so `cargo test` compiles and runs cleanly.
