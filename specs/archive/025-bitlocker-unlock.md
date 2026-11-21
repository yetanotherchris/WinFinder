# 025 — BitLocker Locked Drive Detection & Native Unlock Prompt

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "If possible when clicking a drive that is bitlocker locked, it prompts using WinAPI to unlock using bitlocker."

## Summary
Detect Windows BitLocker-locked volumes when enumerating or opening drives and invoke the native Windows BitLocker unlock prompt via WinAPI (`ShellExecuteExW` with the `"unlock-bde"` shell verb, with `bdeunlock.exe` fallback), then refresh and navigate into the drive automatically once unlocked.

## Requirements
- [x] Gate all Windows BitLocker detection and unlock WinAPI logic behind `#[cfg(target_os = "windows")]` with clean no-op/fallback behavior on macOS and Linux.
- [x] Detect BitLocker-locked drives when listing drives (`virtual://computer`) and when attempting to read a directory on a locked volume (`FVE_E_LOCKED_VOLUME` `0x80310000`, `GetVolumeInformationW`, and `IShellItem2` `System.Volume.BitLockerProtection == 6` fallback).
- [x] Expose `isLocked` on `FileEntry` and display a visual lock badge on locked drive icons (and `"Locked Volume"` kind label).
- [x] Provide a Tauri command `unlock_bitlocker_drive` that invokes the native Windows BitLocker unlock dialog via WinAPI (`ShellExecuteExW` with `"unlock-bde"` on the drive root, falling back to `bdeunlock.exe <drive>:`), waits for the unlock process without freezing the UI, and reports whether the drive was unlocked.
- [x] When opening/clicking a BitLocker-locked drive (in Icon, List, Columns, Gallery views, or direct navigation/favorites), trigger the native unlock prompt and automatically refresh/navigate into the drive if unlocked.
- [x] Handle cancellation or failure gracefully with a clear, non-crashing status/error message and option to retry unlocking.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly, plus unit tests for drive root extraction and BitLocker error classification.

## Edge Cases
- **Non-Windows platforms:** `isLocked` is always `false`; `unlock_bitlocker_drive` returns a clean non-crashing response stating BitLocker unlock is only available on Windows.
- **Cancelled unlock prompt:** If the user cancels the Windows BitLocker dialog, WinFinder does not crash or hang; it stays usable and shows a clear dismissible notice (or inline error in Columns/List expansion) with an Unlock retry button.
- **Subfolder on a locked drive:** Navigating to a favorite or breadcrumb path inside a locked drive (e.g., `D:\Work`) extracts the drive root (`D:\`), prompts to unlock, and retries opening the original target path once unlocked.
- **Concurrent unlock triggers:** Guard against spawning duplicate simultaneous BitLocker unlock dialogs for the same drive.
- **Empty removable/CD-ROM drives:** `ERROR_NOT_READY` is not misclassified as BitLocker-locked.

## Implementation Notes
- `src-tauri/Cargo.toml`: Enabled `Win32_System_Threading` feature on `windows` (`PROPERTYKEY` is in `Win32_Foundation` in `windows` 0.62).
- `src-tauri/src/lib.rs`: Added `is_locked` to `FileEntry`, `UnlockDriveResult` struct, cross-platform `extract_windows_drive_root`, Windows-gated `win_shell::is_drive_bitlocker_locked`, `win_shell::check_bitlocker_locked_error`, `win_shell::prompt_bitlocker_unlock`, `BITLOCKER_LOCKED:` error prefix in `list_fs_directory`, `unlock_bitlocker_drive` Tauri command, and Rust unit tests.
- `src/types.ts`, `src/utils/dirCache.ts`, `src/utils/format.ts`, `src/components/FileIcon.tsx`, `src/components/MainView.tsx`, `src/App.tsx`, `src/index.css`: Wired locked state UI, amber padlock badge on locked drive icons, `"Locked Volume"` kind label, BitLocker unlock flow across Icon/List/Columns/Gallery views, and dismissible status/retry banner.

## Amendments
- Used `windows::Win32::Foundation::PROPERTYKEY` directly without needing `Win32_UI_Shell_PropertiesSystem` in `Cargo.toml`.
