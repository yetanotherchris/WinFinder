# 055 — Applications Disk Cache & WinFinder Settings Entry

- **Status:** Archived
- **Date:** 2026-11-25
- **Request:** "would it be inpractical to cache them to the config file, and then on startup in the background, refresh this so the application window has data straight away" + "does the apple finder have settings in its applications" + "can it be in the list as well, as part of this change" + "some shortcuts that were populated, for example comfyui, don't exist" + "omarchy is another example"

## Summary
Persist the Applications listing to a dedicated disk cache (`~/.winfinder/applications-cache.json`) so the Applications view populates immediately on startup while refreshing in the background, include a built-in **WinFinder Settings** entry in the Applications list that opens the Settings dialog, and filter out broken/dangling Windows Start Menu shortcuts whose target executable no longer exists on disk.

## Requirements
- [x] Persist Applications entries to a versioned cache file `~/.winfinder/applications-cache.json` (separate from `config.json`) using atomic write-and-rename.
- [x] On app startup, seed `AppsCache` immediately from `~/.winfinder/applications-cache.json` when present and valid, so `virtual://applications` renders without waiting for shell enumeration.
- [x] Run a background refresh on startup via `load_applications_entries()`; update in-memory cache and disk cache if entries changed, and emit `"applications-updated"` to the frontend.
- [x] Gracefully fall back to the existing wait-for-preload behavior when the cache file is missing, corrupt, or has a mismatched schema version.
- [x] Frontend listens for `"applications-updated"`, invalidates its cached listing for `virtual://applications`, and silently refreshes any tab currently showing `virtual://applications`.
- [x] Include a built-in **WinFinder Settings** entry (`path: "app://winfinder-settings"`, `entryKind: "app"`) in the Applications list (sorted alphabetically with other apps, deduplicated).
- [x] Opening **WinFinder Settings** from Applications (double-click, Enter, or Open action) opens WinFinder's `SettingsDialog` instead of invoking OS shell launch.
- [x] Render a crisp macOS-style Settings gear icon for **WinFinder Settings** in `FileIcon.tsx` across all view modes (Icons, List, Columns, Gallery).
- [x] Filter out broken/dangling Windows app shortcuts whose target executable or file no longer exists on disk (e.g., manually deleted apps like ComfyUI or Try Omarchy that left orphaned Start Menu shortcuts in `shell:AppsFolder`), while failing open for UWP/MSIX/Store apps and permission-restricted targets.
- [x] Add Rust unit tests covering disk cache load/save, version mismatch, corrupt file fallback, broken-target filtering helpers, and the WinFinder Settings entry.

## Edge Cases
- Cache file missing, unreadable, or corrupt JSON: silently ignored; falls back to `Loading` state and populates once background preload completes.
- Cache schema version mismatch: treated as a cache miss and overwritten after background refresh.
- Entries unchanged after background refresh: avoid unnecessary disk rewrite and avoid redundant `"applications-updated"` UI refresh.
- Background refresh error when valid disk cache is already loaded: preserves the cached entries instead of overwriting them with an error.
- Permission-restricted target folders (e.g., `C:\Program Files\WindowsApps`): `local_target_is_missing` checks `fs::metadata` specifically for `ErrorKind::NotFound` and fails open on `PermissionDenied` or other errors.
- Non-Windows platforms (macOS/Linux): WinFinder Settings entry is still included in Applications and opens `SettingsDialog`.
- Opening `app://winfinder-settings` via `open_item` IPC directly: returns `Ok(())` harmlessly rather than attempting to shell-execute an invalid AUMID.

## Implementation Notes
- **Backend (`src-tauri/src/lib.rs`)**:
  - Added `APPS_CACHE_VERSION = 1`, `AppsDiskCache`, `apps_cache_file_path_for_home`, `load_apps_disk_cache`, and atomic `save_apps_disk_cache`.
  - Updated `AppsCache` to seed immediately from disk on startup (`AppsCache::from_home`), refresh on a background thread (`start_preload`), and emit `"applications-updated"` when entries change.
  - Added `WINFINDER_SETTINGS_APP_PATH = "app://winfinder-settings"`, `winfinder_settings_entry()`, and `ensure_winfinder_settings_and_sort()` in both `load_applications_entries()` and `load_apps_disk_cache()`.
  - Added `win_shell::app_target_exists()` checking `PKEY_LINK_TARGET_PARSING_PATH`, direct local drive AUMIDs, and `{KnownFolderGUID}\relative` AUMIDs via `SHGetKnownFolderPath` + `fs::metadata` (`ErrorKind::NotFound` only).
  - Added 4 Rust unit tests covering disk cache, startup seeding & refresh, WinFinder Settings injection/sorting, and target-path/GUID helpers.
- **Frontend (`src/App.tsx`, `src/components/FileIcon.tsx`, `src/utils/dirCache.ts`)**:
  - Intercepted `app://winfinder-settings` in `handleOpenItem` to open `SettingsDialog`.
  - Subscribed to `"applications-updated"` to invalidate `virtual://applications` in `dirCache` and silently refresh any open Applications tabs.
  - Updated `entriesEqual` in `src/utils/dirCache.ts` to compare `entryKind` and `iconDataUrl`.
  - Added a macOS System Settings-style gear SVG icon in `src/components/FileIcon.tsx` for `WinFinder Settings`.

## Amendments
- Added broken/dangling Windows app shortcut filtering after the user reported orphaned Start Menu shortcuts (such as ComfyUI and Try Omarchy) still appearing in `shell:AppsFolder`.
- Renamed disk cache file from `apps-cache.json` to `applications-cache.json`.
- Removed the injected `WinFinder Settings` entry (and bumped `APPS_CACHE_VERSION` to `2`) after the user clarified they meant **Windows Settings**, which is already natively populated from `shell:AppsFolder` (`windows.immersivecontrolpanel_cw5n1h2txyewy!microsoft.windows.immersivecontrolpanel`).
