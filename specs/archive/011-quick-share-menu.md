# 011 — Toolbar Quick Share Popover Menu

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Implement Option 2 for the toolbar Share button: a Quick Share popover menu with Share with Windows…, Copy File/Folder, Copy Path, and Show in File Explorer."

## Summary
Replace the filler toolbar Share button with a Finder-style popover menu offering native Windows Share, clipboard file/folder copy (`CF_HDROP`), path copy, and File Explorer reveal for the selected filesystem item.

## Requirements
- [x] Disable the Share toolbar button unless a real filesystem item (file, folder, or drive) is selected.
- [x] Provide **Share with Windows…** invoking the native Windows Share sheet (`IDataTransferManagerInterop::ShowShareUIForWindow`) for selected files.
- [x] Provide **Copy File / Copy Folder** placing the item onto the Windows clipboard (`CF_HDROP`) so it can be pasted in Explorer or other apps.
- [x] Provide **Copy Path** copying the item's full path string to the clipboard.
- [x] Provide **Show in File Explorer** revealing the item in Windows File Explorer (`/select,<path>`).

## Edge Cases
- **Share with Windows…** is disabled for folders/drives where Windows' `StorageFile` share sheet does not apply.
- **Copy File / Copy Folder** is disabled for drive roots.
- Clearing the selection automatically closes the Share popover.

## Implementation Notes
- Key files: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` (`share_with_os`, `copy_file_to_clipboard`, `reveal_in_file_manager`), `src/App.tsx`, `src/components/Toolbar.tsx`, `src/index.css`.

## Amendments
- **2026-11-21 (`013-actions-menu-and-share-cleanup.md`):** Removed *Show in File Explorer* from the Share popover menu and moved it into the Actions (`⋯`) menu.
