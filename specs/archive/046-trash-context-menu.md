# 046 — Trash / Recycle Bin Context Menu

- **Status:** Archived
- **Date:** 2026-11-22
- **Request:** "the context menu for items in the trash looks incorrect. It should mimic the recycle bin context menu if possible"

## Summary
Fixes the native Windows shell context menu for items displayed in WinFinder's Trash (`virtual://trash`) view so it binds `IContextMenu` against the actual Windows Recycle Bin `IShellItem` under `FOLDERID_RecycleBinFolder`, presenting the genuine Recycle Bin menu (`Restore`, `Cut`, `Delete`, `Properties`) instead of a regular filesystem `$R...` context menu.

## Requirements
- [x] Resolve Trash items against `FOLDERID_RecycleBinFolder` (`SHGetKnownFolderItem` + `SHCreateItemFromRelativeName` with `BHID_EnumItems` fallback matching `SIGDN_FILESYSPATH`, `SIGDN_DESKTOPABSOLUTEPARSING`, or `SIGDN_PARENTRELATIVEPARSING`) rather than calling `SHCreateItemFromParsingName` on the raw `$R...` filesystem path.
- [x] Bind `IContextMenu` via `BHID_SFUIObject` on the resolved Recycle Bin `IShellItem` and populate the menu with `CMF_NORMAL | CMF_EXPLORE` (without `CMF_CANRENAME` and without injecting `"Open in New Tab"` for trashed folders).
- [x] Pass `isTrash` from the frontend (`App.tsx`) when right-clicking items in `virtual://trash`, and also detect Recycle Bin paths in Rust (`\$recycle.bin\`, Recycle Bin CLSID parsing name, `trash://`).
- [x] Ensure invoking Recycle Bin commands (such as `Restore` or `Delete`) returns `invoked: true` and refreshes the `virtual://trash` listing cleanly.
- [x] Gate all Windows Shell Recycle Bin logic behind `#[cfg(target_os = "windows")]`.

## Edge Cases
- Trashed folders do not receive the custom `"Open in New Tab"` menu item or `CMF_CANRENAME` flag.
- If `SHCreateItemFromRelativeName` fails for a Recycle Bin path format, `resolve_recycle_bin_shell_item` falls back to enumerating `FOLDERID_RecycleBinFolder` and matching normalized path keys across `SIGDN_FILESYSPATH`, `SIGDN_DESKTOPABSOLUTEPARSING`, and `SIGDN_PARENTRELATIVEPARSING`.
- If a Trash item was already restored or permanently deleted externally before right-clicking, `resolve_recycle_bin_shell_item` returns a clear error instead of showing a broken menu.
- Non-Windows platforms keep compiling cleanly with `show_context_menu` accepting the optional `is_trash` parameter as a no-op.

## Implementation Notes
- **`src-tauri/src/lib.rs`**:
  - Extended `win_shell::is_recycle_bin_path` to match `\$recycle.bin\`, Recycle Bin CLSID `::{645ff040-5081-101b-9f08-00aa002f954e}`, and `trash://`.
  - Added `win_shell::resolve_recycle_bin_shell_item` to obtain the genuine Recycle Bin `IShellItem` under `FOLDERID_RecycleBinFolder` (`SHCreateItemFromRelativeName` with `BHID_EnumItems` enumeration fallback).
  - Updated `win_shell::show_shell_context_menu` and `#[tauri::command] show_context_menu` to accept `is_trash: Option<bool>`, bind `IContextMenu` on the Recycle Bin `IShellItem`, omit `CMF_CANRENAME`, and skip injecting `"Open in New Tab"` for Trash items.
  - Added Windows unit test `is_recycle_bin_path_detects_recycle_bin_variants`.
- **`src/App.tsx`**:
  - Updated `handleContextMenu` to pass `isTrash: listing?.currentPath === "virtual://trash"` to `show_context_menu` and refresh `virtual://trash` when `res.invoked` is `true`.

## Amendments
- None.
