# 008 — Suppress Default Browser Context Menu

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Remove the default WebView browser context menu that appears on right-click."

## Summary
Disable the WebView's default browser right-click menu across the entire WinFinder window so the app maintains a native desktop feel.

## Requirements
- [x] Suppress the browser context menu (`onContextMenu` → `preventDefault()`) at the root window container.
- [x] Ensure right-clicking empty canvas, sidebar, toolbar, or items never displays browser actions (Inspect, Print, Reload, etc.).

## Edge Cases
- Item-level right-click handlers can still explicitly intercept and trigger native OS menus (added in `010-native-os-context-menu.md`) without falling back to the browser menu.

## Implementation Notes
- Key files: `src/App.tsx`.

## Amendments
- None.
