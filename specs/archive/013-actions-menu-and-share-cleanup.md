# 013 — Toolbar Actions Menu & Share Menu Cleanup

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Implement Option 2 for the Actions (`⋯`) button (New Folder, Show Hidden Files, Open in Terminal, Copy Current Folder Path, Show in File Explorer, Refresh), and remove Show in File Explorer from the Share menu."

## Summary
Replace the filler toolbar Actions (`⋯`) button with a lightweight folder-utilities popover menu, wire hidden-file visibility across all views, and remove *Show in File Explorer* from the Share popover.

## Requirements
- [x] Remove **Show in File Explorer** from the **Share** popover menu.
- [x] Implement the **Actions (`⋯`)** popover menu containing:
  - **New Folder** — creates `New folder` (or `New folder (2)`, etc.) in the current directory, refreshes, and selects it.
  - **Show Hidden Files** — toggles hidden/system file visibility with a checkmark across the active directory, expanded List View folders, and Miller Columns.
  - **Open in Terminal** — launches Windows Terminal (`wt.exe`) with PowerShell fallback.
  - **Copy Current Folder Path** — copies the active directory path to the clipboard.
  - **Show in File Explorer** — reveals the selected item (`/select,<path>`) or opens the current folder directly when nothing is selected.
  - **Refresh** — reloads the current directory.
- [x] Disable folder-only actions on virtual views (`Recents`, `Applications`, `Drives`, `Network`).
- [x] Ensure Sort, Share, and Actions popovers mutually close each other and dismiss on outside click or `Escape`.

## Edge Cases
- Toggling `Show Hidden Files` resets expanded List View subfolders and Miller sub-columns so stale filtered/unfiltered children are not mixed.
- Creating a new folder handles name collisions up to `New folder (999)`.

## Implementation Notes
- Key files: `src-tauri/src/lib.rs` (`create_new_folder`, `open_in_terminal`, `list_directory` `show_hidden`, `reveal_in_file_manager` `select`), `src/App.tsx`, `src/components/Toolbar.tsx`, `src/components/MainView.tsx`.

## Amendments
- **2026-11-21 (`014-open-in-terminal-selected-target.md`):** Updated *Open in Terminal* to open the selected folder or the parent directory of a selected file instead of always using `listing.currentPath`.
