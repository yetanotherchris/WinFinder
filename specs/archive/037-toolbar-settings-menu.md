# 037 — Remove Standalone Toolbar Settings Button

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Settings icon can be removed. It can stay in the actions menu. / Settings available from the actions ('...') menu (this is already done I believe)."

## Summary
Remove the redundant standalone Settings gear icon button from the top toolbar so the toolbar stays uncluttered and faithful to macOS Finder, while retaining Settings access inside the toolbar actions (`...`) menu and via the `Ctrl+,` / `⌘,` keyboard shortcut.

## Requirements
- [x] Remove the standalone Settings gear icon button from the top toolbar (`src/components/Toolbar.tsx`).
- [x] Keep Settings accessible and functional in the toolbar actions (`...`) popover menu (`Settings…`), closing the popover and opening `SettingsDialog`.
- [x] Preserve the `Ctrl+,` / `⌘,` keyboard shortcut for opening Settings.
- [x] Remove any unused imports, props, or CSS rules that were only used by the standalone toolbar Settings button (verify none remain orphaned).

## Edge Cases
- Opening Settings from the actions (`...`) menu works regardless of whether the current location is a real directory, a virtual view (Recents, Applications, Drives, Network, Trash), or an active search view.
- Keyboard shortcut label in the actions menu reflects platform conventions (`⌘,` on macOS, `Ctrl+,` on Windows/Linux).
- Toolbar spacing between the actions (`...`) menu and the Search control remains balanced via `.toolbar-spacer-sm`.

## Implementation Notes
- `src/components/Toolbar.tsx`: Removed the standalone Settings `<button>` from `.toolbar-right`; retained the `Settings` icon import and `onOpenSettings` prop because both are still used by the `Settings…` menu item inside the actions (`...`) popover. Updated the `Settings…` shortcut hint to match the platform-aware format used by `Go to Path…`.
- `src/App.tsx` and `src/index.css`: Verified `onOpenSettings`, `SettingsDialog`, `Ctrl+,`/`Cmd+,` shortcut handling, and `.toolbar-spacer-sm` remain in active use with no orphaned rules or props.

## Amendments
- None.
