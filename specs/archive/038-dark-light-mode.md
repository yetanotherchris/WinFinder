# 038 — Dark / Light Mode in Settings

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Dark/light mode in settings"

## Summary
Adds a Light / Dark appearance mode selector to the Settings dialog, persists the user's chosen theme in the WinFinder config file (with `localStorage` fallback in browser preview), and applies crisp macOS Finder-inspired Light and Dark themes across the entire UI via CSS custom properties and `data-theme`.

## Requirements
- [x] Add `theme: "light" | "dark"` (default `"light"`) to `AppSettings` in both Rust (`src-tauri/src/lib.rs`) and TypeScript (`src/types.ts`), maintaining backwards compatibility when loading existing config files without a `theme` field.
- [x] Persist the selected theme via `save_settings` so it survives app restarts (and via `localStorage` in browser preview mode), sanitizing invalid values to `"light"`.
- [x] Add an Appearance section in `SettingsDialog.tsx` with a macOS-styled Light / Dark segmented selector (`role="radiogroup"`) that updates the theme live.
- [x] Apply `data-theme="light"` / `data-theme="dark"` and matching `color-scheme` on `document.documentElement` whenever `settings.theme` changes.
- [x] Refactor `src/index.css` to use semantic CSS custom properties with `:root` (Light) and `:root[data-theme="dark"]` (Dark) palettes covering Sidebar, Toolbar, MainView (Icon, List, Column, Gallery views, headers, selection highlights, status/path bar), Settings dialog, modals, popovers/menus, search/path inputs, scrollbars, banners, and dividers.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly (and `cargo test --no-run` compiles cleanly).

## Edge Cases
- Existing config files without a `theme` field or with an unrecognized value default/sanitize cleanly to `"light"`.
- In non-Tauri browser preview mode, theme preference persists in `localStorage` under `winfinder.settings`.
- All dialogs, popovers, BitLocker banner, Trash header, search bar, and Go To Path modal remain high-contrast and legible in both Light and Dark modes.

## Implementation Notes
- `src-tauri/src/lib.rs`: Added `theme: String` (default `"light"`) to `AppSettings`, `sanitize_theme()` applied in `PersistedAppState::sanitize()` and `AppStateStore::update_settings()`, fixed missing `settings` field in an existing `PersistedAppState` test initializer, and added unit tests for default, round-trip, and sanitization behavior.
- `src/types.ts`: Added `ThemeMode = "light" | "dark"` and `theme: ThemeMode` on `AppSettings`.
- `src/App.tsx`: Loaded/normalized `settings.theme` from Tauri `load_app_state` or browser `localStorage`, and synced `data-theme` and `colorScheme` on `document.documentElement`.
- `src/components/SettingsDialog.tsx`: Added Appearance section with Light / Dark segmented radio control (`Sun` / `Moon` icons from `lucide-react`).
- `src/index.css`: Defined full Light (`:root`, `:root[data-theme="light"]`) and macOS Finder Dark (`:root[data-theme="dark"]`) CSS custom property palettes and wired all surfaces, borders, text, controls, popovers, modals, inputs, banners, and scrollbars to them.

## Amendments
- Fixed a pre-existing missing `settings: AppSettings::default()` field in `src-tauri/src/lib.rs` test `PersistedAppState` struct literal so `cargo test` compiles cleanly.
