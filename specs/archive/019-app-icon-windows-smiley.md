# 019 — App Icon: Windows 4 Blue Squares with Finder Smiley Face

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "The app icon should have the windows 4 squares in blue, with the current Apple-like smiley face over the top"

## Summary
Replace the WinFinder application icon with a custom icon combining the iconic Windows 2×2 four blue squares as the base with the Apple Finder-style smiley face overlaid on top, and regenerate all Tauri desktop/taskbar/bundle icon assets and browser favicon.

## Requirements
- [x] Design and generate a crisp 1024×1024 master app icon (`src-tauri/icons/icon.png`) featuring the 4 Windows blue squares in a 2×2 grid with the current Apple Finder-like dark navy smiley face (two vertical oval eyes and curved smile) overlaid cleanly on top.
- [x] Regenerate all required Tauri v2 icon formats and sizes in `src-tauri/icons/` (`32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, `icon.ico` with multi-resolution sizes `16, 24, 32, 48, 64, 256`, `icon.icns`, and Windows Store logos).
- [x] Update `src-tauri/tauri.conf.json` bundle icon list to reference the complete icon set (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`).
- [x] Add a matching favicon (`public/icon.png` + `<link rel="icon">` in `index.html`) so web/dev preview also displays the updated icon.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` succeed cleanly.

## Edge Cases
- Small icon sizes (16×16 and 32×32 in `icon.ico` and Windows taskbar): ensured the 4-square cross gap and smiley face features remain distinct and high-contrast at low resolutions.
- Transparency around the 4 squares and outer corners so the icon sits cleanly on both light and dark Windows taskbars, macOS Docks, and desktop wallpapers.
- Cross-platform Tauri bundle compatibility (`.ico` for Windows, `.icns` for macOS, `.png` sizes for Linux).

## Implementation Notes
- Master 1024×1024 icon rendered at 2× supersampling (2048×2048 downsampled with Lanczos) with a diagonal Windows 11 blue gradient across 4 rounded-corner squares and the dark navy Finder smiley overlaid on top.
- Used `tauri icon src-tauri/icons/icon.png` to generate the full desktop & Windows Store icon set (removed unused `android/` and `ios/` subdirectories).
- Key files: `src-tauri/icons/*`, `src-tauri/tauri.conf.json`, `index.html`, `public/icon.png`.

## Amendments
- Removed generated `src-tauri/icons/android/` and `src-tauri/icons/ios/` subdirectories since WinFinder targets desktop platforms.
