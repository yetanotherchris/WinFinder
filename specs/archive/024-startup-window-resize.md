# 024 — Eliminate Startup Window Resize Delay

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Bug: when launching, there is a delay before the window resizes."

## Summary
Eliminate the visible flash/jump where WinFinder opens at its default `1040×660` centered geometry and then resizes/repositions after a delay. The main window now starts hidden, applies any saved size, position, and maximized state synchronously in Rust `setup` before showing, and opens cleanly at the default centered size when no saved state exists.

## Requirements
- [x] Start the main window hidden (`"visible": false` in `src-tauri/tauri.conf.json`) so it never renders at the default size/position before persisted geometry is applied.
- [x] Restore saved window position, size, and maximized state synchronously in Rust `.setup()` before calling `window.show()` and `window.set_focus()`.
- [x] Apply saved position before saved size when restoring onto a visible monitor so multi-monitor DPI transitions do not rescale the restored physical size.
- [x] Center the window after applying saved size if no saved `(x, y)` position exists or if the saved rect is off-screen.
- [x] When no saved window state exists (first launch or missing/corrupt `~/.winfinder`), show and focus the window cleanly at its default `1040×660` centered geometry.
- [x] Ignore `Resized` and `Moved` window events emitted during hidden startup creation and geometry restoration so persisted state is not overwritten or marked dirty prematurely.
- [x] Verify `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` pass cleanly.

## Edge Cases
- **First launch / missing or corrupt `~/.winfinder`:** `snapshot.window` is `None`; the window skips `restore_window_state` and calls `show()` + `set_focus()` at the default `1040×660` centered bounds.
- **Maximized window saved:** Normal width/height and position are restored while hidden, `window.maximize()` is invoked before `window.show()` (avoiding an unmaximized flash on Windows while still ensuring visibility on macOS/Linux), followed by `window.set_focus()`.
- **Disconnected external monitor:** `is_rect_visible_on_monitors` detects off-screen saved coordinates and falls back to `window.center()` after setting the saved size.
- **Multi-monitor mixed DPI:** Calling `set_position` before `set_size` places the window on the target monitor before sizing so Windows `WM_DPICHANGED` does not distort the saved physical dimensions.
- **Saved size without saved position (`x: None` or `y: None`):** Applies saved size and re-centers the window so it is centered at the restored dimensions.

## Implementation Notes
- **`src-tauri/tauri.conf.json`**: Added `"visible": false` to the `main` window definition.
- **`src-tauri/src/lib.rs`**:
  - Extracted `clamped_window_dimensions` and updated `restore_window_state` to set position before size when visible on an available monitor, center after sizing when position is absent or off-screen, and maximize before showing when `state.maximized` is true.
  - Added a startup readiness gate (`AtomicBool`) so window geometry events fired before `.setup()` completes do not clobber persisted `WindowState`.
  - Called `window.show()` and `window.set_focus()` at the end of `.setup()` unconditionally so the window always appears cleanly.
  - Added unit test `clamped_window_dimensions_enforces_minimums`.

## Amendments
- None.
