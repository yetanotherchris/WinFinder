# 001 — WinFinder macOS Finder Prototype

- **Status:** Archived
- **Date:** 2026-11-20
- **Request:** "Create AGENTS.md and a Tauri v2 prototype app called WinFinder replicating macOS Finder's look (sidebar, top toolbar with filler icons, free fonts/icons, frameless window) with the default view browsing `~/` and its subfolders. Ignore context menus for now."

## Summary
Bootstrap the WinFinder Tauri v2 desktop application with `AGENTS.md` and a high-fidelity macOS Finder-inspired UI prototype capable of browsing the user's home directory (`~/`) and subfolders in Icon View.

## Requirements
- [x] Create `AGENTS.md` documenting project overview, tech stack, repository layout, commands, and coding conventions.
- [x] Scaffold a Tauri v2 + React + TypeScript + Vite desktop app targeting Windows while keeping filesystem logic cross-platform.
- [x] Render a frameless window with working traffic-light window controls (close, minimize, maximize) and draggable titlebar/toolbar regions.
- [x] Build a macOS Finder-style left sidebar and top toolbar using free, permissively licensed fonts (`@fontsource/inter`) and icons (`lucide-react` + custom SVGs).
- [x] Display `~/` in Icon View by default, hiding hidden/system files, with double-click folder navigation, Back/Forward history, and a clickable bottom path bar.

## Edge Cases
- Unreadable directories return a user-friendly error message without crashing.
- Empty folders display a clean empty state message.
- When running in a plain browser via `npm run dev`, Tauri IPC falls back gracefully to mock preview data.

## Implementation Notes
- Key files: `AGENTS.md`, `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/components/Toolbar.tsx`, `src/components/MainView.tsx`, `src/components/FileIcon.tsx`, `src/index.css`.
- Generated Finder-inspired app icons in `src-tauri/icons/`.

## Amendments
- Changed `src-tauri/Cargo.toml` `[lib] crate-type` to `["rlib"]` to avoid MinGW PE/COFF export ordinal overflow when linking on Windows.
