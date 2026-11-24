# 054 — Beige App Icon Shortcut Sync & Taskbar Refresh Guidance

- **Status:** Archived
- **Date:** 2026-11-24
- **Request:** "The icon colour change setting appears to work with running the app using npm, not running after installing via scoop. Can you investigate this?" + "unpinning/re-pinning instructions should be under the settings option, and also saying to restart the app. yes go ahead"

## Summary
Fixes the "Classic beige app icon" setting for Scoop/shortcut-installed and taskbar-pinned Windows builds by writing a beige `.ico` file to `~/.winfinder/app-icon-beige.ico`, syncing existing Windows Start Menu and pinned taskbar `.lnk` shortcuts via `IShellLinkW` + `SHChangeNotify`, and showing clear restart + unpin/re-pin guidance under the Settings toggle.

## Requirements
- [x] Encode the recolored 256×256 beige app icon into a valid `.ico` file (`~/.winfinder/app-icon-beige.ico`) using the existing `png` crate.
- [x] On Windows (`#[cfg(target_os = "windows")]`), update existing `WinFinder.lnk` shortcuts (Scoop Start Menu, standard Start Menu, and Pinned Taskbar) via `IShellLinkW` / `IPersistFile` to point to `~/.winfinder/app-icon-beige.ico` when enabled, or restore `<target_exe>,0` when disabled, and notify Explorer via `SHChangeNotify`.
- [x] Apply the window icon both before and after `window.show()` in `setup()` (syncing shortcuts once) and on toggle in `save_settings()`.
- [x] Add a note under the "Classic beige app icon" option in `SettingsDialog.tsx` instructing the user to restart WinFinder and, if pinned to the Windows taskbar, unpin and re-pin the icon.
- [x] Update `winfinder.json` `post_uninstall` to also remove `~/.winfinder/app-icon-beige.ico` on Scoop uninstall.
- [x] Add a unit test verifying `.ico` header/payload generation from the recolored embedded PNG.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly.

## Edge Cases
- Only updates `.lnk` files that already exist; never creates new Start Menu or taskbar shortcuts.
- If a shortcut cannot be loaded or saved (e.g., locked by another process), failures are ignored gracefully so toggling the setting never breaks.
- Non-Windows platforms continue to use `window.set_icon()` without compiling Windows COM/Shell code.
- Legacy or non-pinned launches still receive immediate `window.set_icon()` updates.

## Implementation Notes
- `src-tauri/src/lib.rs`: Added `encode_rgba_to_ico`, `write_beige_icon_ico`, and `win_shell::sync_windows_shortcuts_icon` (`IShellLinkW` + `IPersistFile` + `SHChangeNotify`), updated `apply_app_icon` and its call sites in `setup()` and `save_settings()`, and added `beige_app_icon_ico_encoding_produces_valid_ico_header`.
- `src/components/SettingsDialog.tsx` & `src/index.css`: Added `.settings-row-note` under the "Classic beige app icon" option instructing users to restart WinFinder and unpin/re-pin if pinned to the Windows taskbar.
- `winfinder.json`: Updated `post_uninstall` to also remove `~/.winfinder/app-icon-beige.ico`.

## Amendments
- None
