# 044 — Settings Dialog Fixed Size

- **Status:** Archived
- **Date:** 2026-11-22
- **Request:** "Settings dialog should remain the same height and width, when switching panels (sidebar, general)"

## Summary
Give the Settings modal dialog fixed width and height dimensions so switching between the **General** and **Sidebar** panels never causes the dialog to jump or resize, while allowing the panel body to scroll cleanly if content overflows on smaller windows.

## Requirements
- [x] Maintain identical width (`440px`) and height (`600px`) on `.settings-dialog` when switching between the `General` and `Sidebar` tabs.
- [x] Keep the dialog responsive on smaller viewports via `max-width: calc(100vw - 40px)` and `max-height: calc(100vh - 40px)`.
- [x] Keep `.settings-dialog-header`, `.settings-tabs`, and `.settings-dialog-footer` fixed in size (`flex-shrink: 0`) while `.settings-dialog-body` fills the remaining space (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) and scrolls cleanly without compressing child groups (`flex-shrink: 0` on direct children).
- [x] Ensure consistent appearance in both Light and Dark themes (using CSS custom properties for `.settings-tabs`, `.settings-tab-btn`, `.settings-sidebar-item`, and `.settings-reset-link` hover/active states).
- [x] Pass `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Edge Cases
- **Small window height (down to `minHeight: 420px`):** `max-height: calc(100vh - 40px)` keeps the dialog inside the viewport while `.settings-dialog-body` scrolls vertically; header, tabs, and footer stay pinned and unclipped.
- **Dynamic content height changes:** Showing/hiding the `Everything CLI (es)` missing hint in `General` or the `Show All` reset button in `Sidebar` never alters the outer dialog dimensions.
- **Dark theme:** Tab bar background and hover/active states adapt via theme tokens (`--bg-settings-tabs`, `--sidebar-hover`, `--sidebar-active`, `--selection-tint`) instead of hardcoded light-mode values.

## Implementation Notes
- `src/index.css`: Added `--bg-settings-tabs` theme tokens for Light and Dark modes; gave `.settings-dialog` fixed `width: 440px; height: 600px;` with `max-width: calc(100vw - 40px); max-height: calc(100vh - 40px);`; set `flex-shrink: 0` on `.settings-dialog-header`, `.settings-tabs`, `.settings-dialog-footer`, and `.settings-dialog-body > *`; set `flex: 1 1 auto; min-height: 0; overflow-y: auto;` on `.settings-dialog-body`; updated `.settings-tabs`, `.settings-tab-btn`, `.settings-reset-link`, and `.settings-sidebar-item` to use theme CSS variables.

## Amendments
- None.
