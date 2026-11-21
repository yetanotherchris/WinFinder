# 029 — Settings Dialog & Windows Window Controls

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Add a settings dialog which saves to the ~/.winfinder JSON file. Add one setting: toggle use Windows taskbar buttons. When enabled these are on the right side, and the red/green/yellow Mac ones are hidden."

## Summary
Adds a macOS-styled Settings dialog persisted in `~/.winfinder` with a toggle to switch window caption controls between macOS traffic lights (top-left of the sidebar) and Windows-style Minimize / Maximize / Close buttons (top-right of the toolbar).

## Requirements
- [x] Persist a `settings` object inside `~/.winfinder` (`PersistedAppState` with `#[serde(default)]` for backwards compatibility), including `useWindowsWindowControls: boolean` (default `false`).
- [x] Expose a `save_settings` Tauri command that updates and persists settings to `~/.winfinder`, with a `localStorage` fallback in browser dev mode.
- [x] Provide ways to open the Settings dialog: a "Settings…" option in the Toolbar Actions menu, a subtle Settings button in the toolbar, and the `Ctrl+,` / `Cmd+,` keyboard shortcut.
- [x] Render a clean macOS-styled Settings modal dialog with a toggle switch for "Use Windows window controls" and a clear description of its effect; support closing via Escape, backdrop click, close button, or Done button.
- [x] When `useWindowsWindowControls` is enabled, hide the macOS red/yellow/green traffic lights in `Sidebar.tsx` (keeping the sidebar drag strip intact) and render Windows-style Minimize, Maximize/Restore, and Close (red hover) caption buttons on the top-right of `Toolbar.tsx` wired to the Tauri window handlers.

## Edge Cases
- Existing `~/.winfinder` files without a `settings` field deserialize cleanly with default values (`useWindowsWindowControls: false`).
- In browser preview mode (non-Tauri runtime), settings persist in `localStorage` under `winfinder.settings` and window maximize state toggles locally for visual verification.
- Opening Settings while another modal is open or pressing Backspace/Alt+Arrow while Settings is open does not trigger background navigation.

## Implementation Notes
- `src-tauri/src/lib.rs`: `AppSettings` struct, `PersistedAppState.settings`, `AppStateStore::update_settings`, `save_settings` command, and unit tests for backwards-compatible deserialization and serialization round-trip.
- `src/types.ts`: `AppSettings` interface and optional `settings` field on `PersistedAppState`.
- `src/components/SettingsDialog.tsx`: macOS-styled Settings modal with accessible toggle switch (`role="switch"`).
- `src/components/Sidebar.tsx`, `src/components/Toolbar.tsx`, `src/App.tsx`, `src/index.css`: conditional traffic lights vs. top-right Windows caption buttons (with Maximize/Restore state tracking), Settings triggers in Actions menu + toolbar button + `Ctrl+,`/`Cmd+,` shortcut.

## Amendments
- None
