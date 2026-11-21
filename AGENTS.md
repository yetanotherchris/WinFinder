# AGENTS.md — WinFinder

## Project Overview

**WinFinder** is a macOS Finder-inspired desktop file manager built with **Tauri v2**, initially targeting Windows while designed to remain cross-platform (Windows, macOS, Linux).

The primary goal is to faithfully replicate the visual polish, typography, iconography, layout, and snappy feel of macOS Finder using native web technologies for the UI and Rust for filesystem and OS integration.

## Tech Stack

- **Desktop Framework:** [Tauri v2](https://v2.tauri.app/) (`src-tauri/`)
- **Backend:** Rust (edition 2021) — filesystem access, path resolution, OS integration
- **Frontend:** React 19 + TypeScript + Vite (`src/`)
- **Icons:** `lucide-react` (thin-stroke UI/toolbar/sidebar icons) + custom macOS-inspired SVGs (`src/components/FileIcon.tsx`)
- **Typography:** `@fontsource/inter` (free neo-grotesque closest to Apple SF Pro) with system fallback (`-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif`)

## Repository Structure

```text
WinFinder/
├── AGENTS.md                   # This file — conventions and architecture guide
├── index.html                  # Vite HTML entry point
├── package.json                # Frontend dependencies & scripts
├── vite.config.ts              # Vite configuration for Tauri v2
├── tsconfig.json               # TypeScript compiler config
├── src/                        # Frontend React/TypeScript source
│   ├── main.tsx                # App bootstrap & font imports
│   ├── App.tsx                 # Root layout & navigation state
│   ├── index.css               # macOS Finder design tokens & styles
│   ├── types.ts                # Shared TS types mirroring Rust commands
│   └── components/
│       ├── Sidebar.tsx         # Left Finder sidebar + window controls
│       ├── Toolbar.tsx         # Top Finder toolbar + drag region
│       ├── MainView.tsx        # Main directory view + path/status bar
│       └── FileIcon.tsx        # macOS-style folder & file SVG icons
└── src-tauri/                  # Tauri v2 Rust backend
    ├── Cargo.toml              # Rust dependencies
    ├── build.rs                # Tauri build script
    ├── tauri.conf.json         # Window, app, and bundle configuration
    ├── capabilities/
    │   └── default.json        # Tauri v2 window/IPC permissions
    ├── icons/                  # Application icons
    └── src/
        ├── main.rs             # Binary entry point
        └── lib.rs              # Tauri commands & filesystem logic
```

## Common Commands

```bash
# Install frontend dependencies
npm install

# Run the desktop app in development mode (Vite + Tauri Rust backend)
npm run tauri dev

# Run frontend only in browser (UI iteration; Tauri IPC falls back gracefully)
npm run dev

# Type-check & build frontend
npm run build

# Check Rust backend compilation
cargo check --manifest-path src-tauri/Cargo.toml

# Build production installer/binary
npm run tauri build
```

## Architecture & Coding Conventions

### Rust Backend (`src-tauri/`)
- Keep all filesystem, path, and OS-specific logic in Rust commands exposed via `#[tauri::command]`.
- Return `Result<T, String>` from Tauri commands with clear, user-friendly error messages.
- Use `std::path::Path` / `PathBuf` rather than hardcoded path separators (`\` or `/`) so code remains cross-platform.
- Gate OS-specific behavior (such as Windows `FILE_ATTRIBUTE_HIDDEN` / `FILE_ATTRIBUTE_SYSTEM` checks) behind `#[cfg(target_os = "windows")]` so macOS/Linux builds stay clean.
- Mirror all serialized Rust structs (`#[derive(Serialize)]` with `#[serde(rename_all = "camelCase")]`) in `src/types.ts`.

### Frontend (`src/`)
- Keep components focused, typed, and declarative.
- Never assume Windows-only paths in UI logic; rely on structured path/breadcrumb data returned by Rust.
- Use `data-tauri-drag-region` on non-interactive titlebar/toolbar regions so the frameless window drags naturally.
- Keep styling consistent with macOS Finder's visual language:
  - Crisp hairline dividers (`1px solid rgba(0, 0, 0, 0.08)`).
  - Subtle sidebar surface (`#ECECEF`) separated from a pure white (`#FFFFFF`) content canvas.
  - macOS accent blue (`#0063E1` / `#0A84FF`) for active selections and sidebar Favorites icons.
  - Antialiased Inter / SF Pro typography at compact macOS sizes (`11px` section headers, `12px`–`13px` labels, `15px` toolbar title).
- Only use free, permissively licensed icons and fonts (e.g., `lucide-react`, custom SVGs, `@fontsource/inter`).

## Current Scope (Prototype)
- Frameless Finder-style window with working window controls (close, minimize, maximize, drag).
- Left sidebar and top toolbar visually matching macOS Finder (filler items for non-implemented actions).
- Default Icon View browsing `~/` (the user's home directory) and its subfolders, with Back/Forward navigation and clickable path breadcrumbs.
- Context menus, drag-and-drop, file operations (copy/move/delete/rename), additional view modes (List/Column/Gallery), and search are intentionally deferred until after the prototype is validated.
