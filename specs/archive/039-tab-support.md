# 039 — Tab Support

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Tab support. Open in new tab in context menu, if not available then use the "..." menu. Ctrl+click a directory opens in a new tab."

## Summary
Adds macOS Finder-style tabbed browsing to WinFinder. Each tab maintains its own independent navigation history, current directory or virtual location, selection, view mode, sort configuration, list/column expansion state, and search state.

## Requirements
- [x] Each tab maintains independent navigation history, current path/virtual location, active sidebar panel, selection, view mode, sort config, expanded/column paths, and search state.
- [x] Render a clean macOS Finder-style tab bar below the toolbar with tab switching, close tab button, middle-click close, and a `+` new tab button.
- [x] Tab bar automatically appears when multiple tabs are open and can also be toggled via the `...` Actions menu (`Show Tab Bar`) when a single tab is open.
- [x] `Ctrl+click` (or `Cmd+click` on macOS) on a directory in MainView (Icons, List, Columns, Gallery, and Path Bar breadcrumbs) opens that directory in a new tab.
- [x] `Ctrl+click` (or `Cmd+click` on macOS) on Sidebar Favorites and Locations opens that location in a new tab.
- [x] "Open in New Tab" is available in the native Windows shell context menu for directories, in the Sidebar right-click context menu, and in the toolbar `...` Actions menu (for a selected directory, plus "New Tab" / "Duplicate Tab").
- [x] Keyboard shortcuts: `Ctrl+T` opens a new tab, `Ctrl+W` closes the active tab (when multiple tabs are open), and `Ctrl+Tab` / `Ctrl+Shift+Tab` cycle tabs.

## Edge Cases
- Closing the active tab selects an adjacent tab; closing the last remaining tab is prevented so the window stays usable.
- Opening a missing custom favorite in a new tab triggers the existing missing-favorite prompt without leaving an orphaned broken tab.
- Async directory loads in one tab do not overwrite or cancel loads in another tab (per-tab request IDs and loading timers).
- Switching between two tabs showing the same directory in List or Columns view restores each tab's own expanded folders / Miller columns via `tabId` dependency in `MainView`.
- Virtual locations (`virtual://recents`, `virtual://applications`, `virtual://computer`, `virtual://network`, `virtual://trash`) can be opened in tabs cleanly.
- Non-Windows / browser preview mode gracefully supports tabs, `Ctrl+click`, Sidebar context menu, and `...` Actions menu without native shell context menu.

## Implementation Notes
- `src/components/TabBar.tsx`: New macOS Finder-style tab bar component with location icons, active tab highlight, left-aligned close button, middle-click close, and `+` new tab button.
- `src/App.tsx`: Refactored per-view state into `TabState[]` + `activeTabId`, with per-tab request IDs and timers (`requestIdByTabRef`, `loadingTimerByTabRef`, `searchRequestIdByTabRef`, `searchDebounceByTabRef`), `openFolderInNewTab`, `openPanelInNewTab`, `handleNewTab`, `handleCloseTab`, `handleSelectTab`, `handleCycleTab`, and keyboard shortcuts (`Ctrl+T`, `Ctrl+W`, `Ctrl+Tab`, `Ctrl+Shift+Tab`).
- `src/components/MainView.tsx`: Added `tabId` and `onOpenFolderInNewTab` props; wired `Ctrl+click` / `Cmd+click` and middle-click on directories across Icons, List, Columns, Gallery views and Path Bar breadcrumbs; skipped starting folder drag when `Ctrl`/`Cmd` is held.
- `src/components/Sidebar.tsx`: Added `onOpenPanelInNewTab` prop; wired `Ctrl+click` / `Cmd+click`, middle-click, and right-click context menu (`Open in New Tab`, plus `Remove from Favorites` for custom favorites) across all Favorites and Locations items.
- `src/components/Toolbar.tsx`: Added `New Tab`, `Open in New Tab` (for selected directory, or `Duplicate Tab` when no directory is selected), and `Show Tab Bar` toggle to the `...` Actions menu.
- `src-tauri/src/lib.rs` & `src/types.ts`: Updated `show_context_menu` / `show_shell_context_menu` to insert a native `"Open in New Tab"` item + separator at the top of the Windows shell context menu for non-virtual directories and return `ContextMenuResult { invoked, openInNewTab }`.
- `src/index.css`: Added Finder tab bar styles (`.finder-tabbar`, `.finder-tab`, `.finder-tab-close`, `.finder-tab-new-btn`).

## Amendments
- Also added middle-click support on directories, breadcrumbs, sidebar items (open in new tab), and tabs (close tab) for ergonomic parity with modern desktop file managers and browsers.
