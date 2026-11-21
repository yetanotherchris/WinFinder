# 003 — Functional Sidebar Locations, Applications View & Centered Window Controls

- **Status:** Archived
- **Date:** 2026-11-20
- **Request:** "Implement Applications so clicking it shows installed apps, implement the remaining left sidebar icons, and fix the red/yellow/green traffic-light hover symbols (`+`, `-`, `×`) so they are centered."

## Summary
Replace all remaining sidebar filler items with live OS-backed locations (including Windows installed applications with real icons and launching) and fix alignment of the traffic-light window control hover glyphs.

## Requirements
- [x] Implement `Applications` view enumerating installed OS applications with their icons and supporting double-click launch.
- [x] Implement `Recents`, `Desktop`, `Documents`, `Downloads`, Home, Computer/Drives, and `Network` sidebar locations.
- [x] Support double-clicking regular files to open them with the OS default handler.
- [x] Center the `×`, `−`, and `+` hover glyphs precisely inside the red, yellow, and green window control circles.

## Edge Cases
- If no network drives are mapped, `Network` displays `"No network drives connected"`.
- If an OS user directory (e.g., `Downloads`) is unavailable, handle it gracefully without crashing.
- Windows-specific `shell:AppsFolder` and logical drive enumeration are gated behind `#[cfg(target_os = "windows")]`.

## Implementation Notes
- Key files: `src-tauri/src/lib.rs`, `src/types.ts`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/FileIcon.tsx`, `src/index.css`.
- Replaced text characters in traffic-light buttons with crisp centered inline 8×8 SVGs.

## Amendments
- None.
