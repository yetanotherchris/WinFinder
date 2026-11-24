# 049 — Beige App Icon Setting

- **Status:** Archived
- **Date:** 2026-11-23
- **Request:** "A new setting that lets you set the app icon to a beige colour (same colours as the Windows explorer beige) with a black smiling face instead of the current white smiling face with blue. If this setting is toggled on (default off), the app icon changes dynamically in windows"

## Summary
Adds a "Classic beige app icon" Appearance setting (`useBeigeAppIcon`, default `false`) that dynamically recolors the embedded 256×256 app icon into a Windows Explorer beige 4-square icon with a black smiling face and applies it to the window and taskbar on startup and whenever toggled.

## Requirements
- [x] Add `useBeigeAppIcon` / `use_beige_app_icon` (default `false`) to `AppSettings` in Rust (`src-tauri/src/lib.rs`), TypeScript (`src/types.ts`), and frontend state/persistence (`src/App.tsx`).
- [x] Move `png = "0.18"` to cross-platform `[dependencies]` in `src-tauri/Cargo.toml`.
- [x] Dynamically decode the embedded `128x128@2x.png`, recolor the blue squares to a Windows Explorer beige/manila gradient and the white smiling face to black (`decode_png_rgba`, `recolor_icon_to_explorer_beige`, `apply_app_icon`), and apply it via `window.set_icon` during app startup (`setup`) and in `save_settings`.
- [x] Add a "Classic beige app icon" toggle switch under Settings > Appearance in `src/components/SettingsDialog.tsx` with a `.settings-row-divider` separator in `src/index.css`.
- [x] Add unit tests `beige_app_icon_recolor_transforms_embedded_png` and `app_settings_defaults_beige_icon_false`.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly.

## Edge Cases
- Legacy `~/.winfinder/config.json` files missing `useBeigeAppIcon` default to `false` via `#[serde(default)]` and `Boolean(parsed?.useBeigeAppIcon)`.
- Toggling the setting off restores the original blue + white smiling face icon immediately without requiring an app restart.
- Decoding and recoloring run cross-platform using the `png` crate without OS-specific icon asset duplication.

## Implementation Notes
- `src-tauri/Cargo.toml`: Moved `png = "0.18"` from Windows-only dependencies to cross-platform `[dependencies]`.
- `src-tauri/src/lib.rs`: Added `use_beige_app_icon: bool` to `AppSettings`, embedded `../icons/128x128@2x.png`, implemented `decode_png_rgba`, `recolor_icon_to_explorer_beige`, and `apply_app_icon`, wired icon application in `setup` and `save_settings`, and added unit tests `beige_app_icon_recolor_transforms_embedded_png` and `app_settings_defaults_beige_icon_false`.
- `src/types.ts`: Added `useBeigeAppIcon: boolean` to `AppSettings`.
- `src/App.tsx`: Added `useBeigeAppIcon: false` to `DEFAULT_SETTINGS` and hydrated it in `loadBrowserSettings()` and Tauri `initialSettings`.
- `src/components/SettingsDialog.tsx`: Added `toggleBeigeAppIcon` and the "Classic beige app icon" switch row under Appearance.
- `src/index.css`: Added `.settings-row-divider` styling.

## Amendments
- Generated the Windows Explorer beige + black smiley icon dynamically in Rust from the embedded `src-tauri/icons/128x128@2x.png` via `png` decoding + pixel recoloring rather than storing a duplicate PNG binary asset, keeping the repository clean and ensuring pixel-identical geometry with the main app icon.
- Adjusted the yellow/beige gradient to `#FFD55C` -> `#FABE1C` sampled directly from the Windows 11 File Explorer icon.
