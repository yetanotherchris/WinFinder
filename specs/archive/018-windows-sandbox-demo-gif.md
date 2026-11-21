# 018 — Windows Sandbox Demo GIF

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Using 'wsb start' to start a sandbox, record a small video/mp4 (using snippet tool, or a preferred tool) of the application being used. Save this as a gif in the repository root directory."

## Summary
Launched a clean Windows Sandbox environment via `wsb start`, ran a standalone production WinFinder build inside it with seeded sample folders/files, recorded a ~21-second MP4 video of interactive application usage (browsing folders, sidebar navigation, switching between Icons/List/Columns/Gallery views, and Back navigation), and converted the recording into an optimized animated GIF saved at `demo.gif` in the repository root directory.

## Requirements
- [x] Build a standalone WinFinder release binary (`winfinder.exe`) that embeds the frontend assets and runs inside Windows Sandbox without requiring a dev server.
- [x] Start a Windows Sandbox instance using `wsb start` (coordinating with other agents to avoid concurrent sandbox conflicts).
- [x] Share the WinFinder binary, recording tool (`ffmpeg.exe`), and automation script into the Windows Sandbox via `wsb share` and execute the demo session via `wsb exec`.
- [x] Record a short MP4 video of WinFinder being actively used inside the sandbox (navigating directories, clicking sidebar items, switching between Icon/List/Columns/Gallery views, and using Back navigation).
- [x] Convert the recorded MP4 into a high-quality, reasonably sized animated GIF (`demo.gif`) saved at the repository root directory (`demo.gif`).
- [x] Stop and clean up the Windows Sandbox instance (`wsb stop`) after recording completes.
- [x] Visually verify extracted frames from `demo.gif` to confirm the recording is clean, legible, and accurately showcases WinFinder.

## Edge Cases
- **Single-instance Windows Sandbox constraint:** Coordinated on the swarm board with `@sandbox-tests` before calling `wsb start`, and stopped the sandbox via `wsb stop` immediately after recording.
- **Headless sandbox session startup:** `wsb start` boots headless until `wsb connect --id <id>` creates the active `WDAGUtilityAccount` desktop session; the workflow connects and waits for `ExistingLogin` readiness before executing GUI automation.
- **WebView2Loader dependency:** Bundled `WebView2Loader.dll` alongside `winfinder.exe` in the shared folder and built with `npx tauri build --no-bundle` so `dist/` is embedded without needing a dev server.
- **Frameless window cropping:** Used Win32 `GetClientRect` + `ClientToScreen` to crop `ffmpeg` `gdigrab` capture strictly to the 1040×658 WinFinder client area with zero desktop wallpaper bleed.
- **GIF file size & quality:** Converted using two-pass `ffmpeg` palette generation (`palettegen=max_colors=128:stats_mode=diff` + `paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`) at 12 fps and 920×582 resolution, resulting in a crisp ~766 KB `demo.gif` (249 frames, 20.75s).

## Implementation Notes
- Built standalone `winfinder.exe` via `npx tauri build --no-bundle`.
- Launched Windows Sandbox with `wsb start --raw`, shared the recording bundle (`winfinder.exe`, `WebView2Loader.dll`, `ffmpeg.exe`, automation script) via `wsb share -w`, connected with `wsb connect`, recorded `demo.mp4` via `wsb exec -r ExistingLogin`, and cleaned up with `wsb stop`.
- Saved final optimized animated GIF at `demo.gif` in the repository root.

## Amendments
- Added `WebView2Loader.dll` next to `winfinder.exe` and built via `npx tauri build --no-bundle` (instead of bare `cargo build --release`) so Tauri's `custom-protocol` embeds `dist/` cleanly inside Windows Sandbox.
- Used `GetClientRect` + `ClientToScreen` for exact client-area cropping instead of `GetWindowRect` to eliminate the 8px Windows 11 invisible resize border.
