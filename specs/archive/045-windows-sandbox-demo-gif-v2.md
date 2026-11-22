# 045 — Windows Sandbox Demo GIF v2

- **Status:** Archived
- **Date:** 2026-11-22
- **Request:** "Create a new demo.gif that demonstrates all the functionality, using the same windows sandbox method that was used in a previous spec."

## Summary
Created a reproducible Windows Sandbox demo recording workflow (`scripts/record-demo-gif.ps1` + `scripts/sandbox-demo-guest.ps1`) and regenerated `docs/demo.gif` to showcase all key WinFinder functionality, including recent additions: Icons, expandable List, Miller Columns, and Gallery View with rich inline previews (PNG diagram, Markdown, syntax-highlighted TypeScript & `.csproj` XML, plain text), multi-tab browsing, Trash sidebar navigation, Search with the Path column, inline rename (`F2`), and the fixed-size Settings dialog opened via the `"..."` Actions menu (General & Sidebar tabs, Everything CLI setting, and Light/Dark mode toggle).

## Requirements
- [x] Build a standalone WinFinder release binary (`winfinder.exe` + `WebView2Loader.dll`) via `npx tauri build --no-bundle` for execution inside Windows Sandbox.
- [x] Provide a reproducible Windows Sandbox demo recording script (`scripts/record-demo-gif.ps1` and `scripts/sandbox-demo-guest.ps1`) that seeds clean demo fixture files inside the sandbox, launches WinFinder, automates an interactive showcase tour via Windows UI Automation + Win32 input, records the exact WinFinder client area via `ffmpeg` `gdigrab`, and encodes an optimized animated GIF to `docs/demo.gif`.
- [x] Showcase core & newly merged WinFinder functionality in `docs/demo.gif`:
  - [x] Folder browsing and view modes: Icons, List (with expandable `Design Assets` folder), Miller Columns (`Source Code`), and Gallery View with rich previews (`01-Architecture.png`, `02-README.md`, `03-explorer.ts`, `04-WinFinder.csproj`, `05-Release-Notes.txt`).
  - [x] Tabs (`Ctrl+T` new tab, `Trash` tab, switching back to `Documents` tab).
  - [x] Search (`.ts` query displaying results with the `Path` column).
  - [x] Settings dialog opened via the `"..."` Actions menu (showing fixed size across General and Sidebar tabs, toggling Dark mode, and displaying the Everything CLI setting).
  - [x] Inline Rename (`F2` renaming `05-Notes.txt` -> `05-Release-Notes.txt`) and Sidebar / Trash navigation.
- [x] Stop and clean up the Windows Sandbox instance (`wsb stop`) after recording completes.
- [x] Visually verify extracted keyframes from `docs/demo.gif` and confirm reasonable file size for GitHub README viewing (`900×571`, 376 frames, 37.6s, 1.70 MB).
- [x] Ensure `docs/README.md` embeds `docs/demo.gif` cleanly (`![WinFinder Demo](demo.gif)`).

## Edge Cases
- **Single-instance Windows Sandbox constraint:** Checked `wsb list --raw` before launching and stopped the sandbox in a `finally` block (`wsb stop --id <id>`).
- **Non-blocking `wsb connect`:** Launched `wsb connect --id <id>` via `Start-Process` so the host script immediately polls `wsb exec --run-as ExistingLogin` readiness without blocking on the RDP window.
- **Hidden-at-startup Tauri window:** Because `tauri.conf.json` sets `"visible": false` until frontend readiness, the guest script enumerates top-level windows for the WinFinder PID until `IsWindowVisible` is true and client dimensions are `>= 600×400` (`1040×660`).
- **Exact frameless window cropping:** Used Win32 `GetClientRect` + `ClientToScreen` to crop `ffmpeg` `gdigrab` strictly to the `1040×660` WinFinder client area with zero desktop wallpaper or border bleed.
- **Clean MP4 finalization:** Disabled unused stderr pipe redirection when spawning `ffmpeg` so sending `q` to stdin flushes the MP4 `moov` atom immediately on exit.
- **GIF file size & quality:** Trimmed idle wait frames and encoded using two-pass `ffmpeg` palette generation (`palettegen=max_colors=128:stats_mode=diff` + `paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`) at 10 fps and `900×571` resolution (~1.70 MB, 376 frames, 37.6s).

## Implementation Notes
- Added `scripts/record-demo-gif.ps1` (host orchestrator: staging, `wsb start`/`share`/`connect`/`exec`/`stop`, two-pass GIF encoding, keyframe extraction).
- Added `scripts/sandbox-demo-guest.ps1` (guest fixture seeder including generated PNG architecture diagram + Markdown/TS/csproj/TXT/Trash fixtures, UIA + Win32 choreography, and `gdigrab` recording).
- Replaced `docs/demo.gif` with the newly recorded and verified `900×571` animated GIF (`1,784,492` bytes, 376 frames, 37.6s).
- Verified `docs/README.md` already embeds `![WinFinder Demo](demo.gif)`.

## Amendments
- Used `Start-Process` for `wsb connect` (non-blocking) and `EnumWindows` + `IsWindowVisible` for locating the visible Tauri window once rendered.
- Disabled `RedirectStandardError` on the guest `ffmpeg` process to prevent .NET pipe buffer deadlock during `q` shutdown.
- Trimmed idle startup and search-wait segments from the recorded MP4 before final two-pass GIF encoding so the GIF stays brisk (37.6s) and compact (1.70 MB).
