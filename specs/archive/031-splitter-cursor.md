# 031 — Native Windows Splitter Cursor

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "The splitter cursor appears to be an old low-res one. Can it be the default windows splitter icon."

## Summary
Replace CSS `col-resize` with `ew-resize` on all horizontal splitter/column resize handles and active drag states so Windows/WebView2 displays the crisp native system horizontal resize cursor (`IDC_SIZEWE`) instead of Chromium's legacy low-resolution split-bar bitmap cursor.

## Requirements
- [x] Sidebar resize handle (`.sidebar-resize-handle`) uses `cursor: ew-resize`.
- [x] List View column resize handles (`.col-resize-handle`) use `cursor: ew-resize`.
- [x] Column View (Miller Columns) resize handles (`.miller-resize-handle`) use `cursor: ew-resize`.
- [x] Global active-resize body class (`body.is-resizing-col` and `body.is-resizing-col *`) uses `cursor: ew-resize !important`.
- [x] No remaining `col-resize` cursor declarations in the frontend stylesheet or components.

## Edge Cases
- On Windows (WebView2/Chromium), `col-resize` maps to a built-in low-DPI Chromium bitmap resource, whereas `ew-resize` maps directly to the native Windows `IDC_SIZEWE` system cursor (which scales cleanly with HiDPI/custom Windows cursor themes).
- On macOS and Linux, `ew-resize` continues to render the native horizontal resize cursor.

## Implementation Notes
- Key file: `src/index.css` (`body.is-resizing-col`, `.sidebar-resize-handle`, `.col-resize-handle`, `.miller-resize-handle`).

## Amendments
- None.
