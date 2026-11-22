# 048 — White Smiley Face on App Icon

- **Status:** Archived
- **Date:** 2026-11-22
- **Request:** "the smiling face on the logo is currently black. Change it to be white (including the docs file too). I think the demo.gif won't need recreating but please confirm"

## Summary
Update the WinFinder application icon so the Finder-style smiley face (eyes and smile) overlaid on the 4 Windows blue squares is crisp white with a subtle drop shadow, regenerate all Tauri desktop/bundle icon assets, and update `docs/icon.png` and `public/icon.png`.

## Requirements
- [x] Recolor the dark navy/black smiley face in `src-tauri/icons/icon.png` to pure white (`#FFFFFF`) with clean anti-aliasing and a subtle drop shadow so it remains legible across the center gap and on light backgrounds.
- [x] Regenerate all Tauri v2 desktop/bundle icon assets in `src-tauri/icons/` (`icon.ico`, `icon.icns`, `32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`, Windows Store logos), removing unused mobile (`android/`, `ios/`) folders.
- [x] Update `docs/icon.png` and `public/icon.png` to match the updated white-smiley icon.
- [x] Confirm `docs/demo.gif` does not need recreating (WinFinder uses a frameless window without a titlebar app icon, and the sandbox recording captures the app window directly).
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass.

## Edge Cases
- Center gap between bottom blue squares where the white smile crosses a transparent region: subtle dark-blue drop shadow preserves contrast on both light (GitHub README) and dark backgrounds.

## Implementation Notes
- Recolored `src-tauri/icons/icon.png` via Pillow with alpha-preserving linear un-blending and a subtle 28% dark-blue drop shadow, then regenerated all Tauri icon sizes via `npx tauri icon src-tauri/icons/icon.png`.
- Copied updated master PNG to `docs/icon.png` and `public/icon.png`.

## Amendments
- Clipped the white smile cleanly to the bottom two blue squares so the vertical center gap between them remains transparent and uninterrupted.
