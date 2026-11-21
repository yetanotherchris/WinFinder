# 005 — Filter Non-Application Clutter from Applications View

- **Status:** Archived
- **Date:** 2026-11-20
- **Request:** "List the apps currently found and filter out non-application clutter that shouldn't be in the Applications list."

## Summary
Curate the Windows `shell:AppsFolder` enumeration so `Applications` displays real desktop and Store apps instead of Start Menu documentation links, uninstallers, WSL GUI shortcuts, game links, admin tools, and duplicates.

## Requirements
- [x] Exclude web links (`http://`, `https://`), documentation/help/config files (`.url`, `.chm`, `.html`, `.pdf`, `.txt`, `.md`, `.ini`), and FAQ/manual/license entries.
- [x] Exclude auto-generated WSL Linux GUI app shortcuts (e.g. `... (Ubuntu-24.04)`) while keeping the distro terminal itself.
- [x] Exclude uninstallers, updaters, error reporters, and installation helpers.
- [x] Exclude Steam, Epic Games, and GeForce NOW individual game shortcuts.
- [x] Exclude driver control panels, `.msc`/`.cpl`/`.bat` entries, Visual Studio/Node dev prompts, and legacy Windows admin snap-ins.
- [x] Deduplicate entries by case-insensitive display name.

## Edge Cases
- Filtering and deduplication run before extracting icon bitmaps so excluded entries do not slow down startup preloading.

## Implementation Notes
- Key files: `src-tauri/src/lib.rs` (`win_shell::should_include_app` and `seen_names` deduplication in `enumerate_apps`).

## Amendments
- None.
