# 040 — Sidebar Visibility Settings

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "New settings panel - this is to configure which items are visible in the left panel"

## Summary
Add a macOS Finder-style **Sidebar** tab inside the Settings dialog that lets users toggle the visibility of built-in items in the left sidebar (Favorites and Locations), persisting their preferences in app state/config and applying changes live.

## Requirements
- [x] Add a tabbed navigation header in `SettingsDialog` with **General** and **Sidebar** tabs styled after macOS Finder Settings.
- [x] In the **Sidebar** tab, display checkboxes with matching Finder icons grouped under **Favorites** (`Recents`, `Applications`, `Desktop`, `Documents`, `Downloads`, `Home`) and **Locations** (`Drives`, `Network`, `Trash`).
- [x] Persist `sidebarVisibility` inside `AppSettings` (Rust `src-tauri/src/lib.rs`, TypeScript `src/types.ts`, and browser preview `localStorage`), defaulting all items to visible (`true`) for backward compatibility with existing configs.
- [x] Apply visibility changes live to `Sidebar.tsx` without requiring a restart.
- [x] Automatically hide an entire sidebar section (`Favorites` or `Locations`) when none of its items are visible (respecting custom favorites in `Favorites`).
- [x] Provide a quick **Show All** action in the Sidebar settings tab when one or more items are hidden.
- [x] Pass `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Edge Cases
- **Legacy config / partial JSON:** Missing `settings`, missing `sidebarVisibility`, or partial `sidebarVisibility` objects default omitted keys to `true` in both Rust (`#[serde(default = "default_true")]`) and TypeScript (`normalizeSidebarVisibility`).
- **Currently active panel hidden:** Unchecking the currently active panel removes it from the left sidebar without disrupting the user's current directory view.
- **Unavailable OS folders:** If `locations?.desktopPath`, `documentsPath`, or `downloadsPath` is `null` on the host OS, the item is not shown in the sidebar and is clearly disabled in the Settings list with an `Unavailable` label.
- **Custom Favorites:** User-pinned custom favorites remain visible in the Favorites section even if all built-in Favorites are unchecked; the Favorites section only hides when both built-in visible items and custom favorites are empty (and no drag-to-favorites drop is active).
- **Favorites item cap:** `countBuiltInFavorites` continues counting total built-in favorites so hiding and re-enabling built-in items cannot exceed `MAX_FAVORITES_ITEMS`.

## Implementation Notes
- `src/types.ts`: Added `SidebarVisibilitySettings` interface and `sidebarVisibility: SidebarVisibilitySettings` field on `AppSettings`.
- `src/utils/sidebarVisibility.ts`: Added `DEFAULT_SIDEBAR_VISIBILITY`, `normalizeSidebarVisibility`, and `hasHiddenSidebarItems`.
- `src-tauri/src/lib.rs`: Added `SidebarVisibilitySettings` (with `#[serde(rename_all = "camelCase", default)]` and `#[serde(default = "default_true")]` per field) to `AppSettings`, plus unit tests for legacy/partial config defaults and roundtrip serialization; also fixed missing `settings` field in an existing `PersistedAppState` test initializer.
- `src/components/SettingsDialog.tsx`: Added macOS Finder-style `General` and `Sidebar` tabs (`role="tablist"` / `role="tab"` / `role="tabpanel"`), Sidebar visibility checklist grouped by Favorites and Locations with matching icons, and a `Show All` reset action when any item is hidden.
- `src/components/Sidebar.tsx`: Applied `visibility` prop live to built-in Favorites and Locations items and hid empty sections.
- `src/App.tsx`: Hydrated and normalized `sidebarVisibility` from Tauri persisted state and browser `localStorage`, and passed `settings.sidebarVisibility` to `<Sidebar>` and `locations` to `<SettingsDialog>`.
- `src/index.css`: Added styles for `.settings-tabs`, `.settings-tab-btn`, `.settings-sidebar-*`, and `.macos-checkbox`.

## Amendments
- None.
