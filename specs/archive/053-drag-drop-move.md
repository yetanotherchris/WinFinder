# 053 — Drag and Drop Move of Files & Folders

- **Status:** Archived
- **Date:** 2026-11-23
- **Request:** "Drag and drop of files and folders to move a folder into another folder or a file into a folder."

## Summary
Extends WinFinder's pointer-event in-app drag-and-drop to support dragging both files and folders into target folders (across Icons, List, Columns, Gallery, and Path Bar breadcrumbs) to move them on disk, while preserving existing folder-to-Favorites sidebar drag-and-drop.

## Requirements
- [x] Add Rust filesystem move helpers (`copy_dir_recursive`, `move_fs_item_to_dir`) and the `move_item` Tauri command supporting files and folders with `fs::rename` and cross-volume copy-then-remove fallback.
- [x] Generalize in-app pointer-event drag-and-drop (`InAppItemDrag`, `handleStartItemDrag`, `handleMoveItem`) to support dragging both files and folders, showing a `"Move to <Folder>"` badge on the drag ghost when hovering a valid destination folder.
- [x] Highlight valid drop target folders (`.is-drop-target`) via `data-drop-folder-path` / `data-drop-folder-name` across Icons, List, Columns (both folder rows and column bodies), Gallery, and Path Bar breadcrumbs.
- [x] Preserve existing folder-to-Favorites drag-and-drop in the sidebar without regression.
- [x] Refresh directory caches and active/column views (`refreshSeq`) immediately after a move completes, and display an error banner if the move fails.
- [x] Add Rust unit tests covering `move_fs_item_to_dir` (file moves, folder moves, no-op same-parent moves, conflict refusal, and self/descendant cycle protection).

## Edge Cases
- Prevents moving a folder into itself or any of its own descendants (validated both during drag hover evaluation and in Rust `move_fs_item_to_dir`).
- Dropping an item onto its own current parent directory is ignored during drag hover and treated as a safe no-op in Rust.
- Refuses to overwrite an existing file or folder with the same name in the destination folder and surfaces a clear error message in the UI banner.
- Cross-volume moves automatically fall back from `fs::rename` to recursive copy + source removal.
- Virtual items (`virtual://`, `app://`, `trash://`), drives, locked folders, and items currently undergoing inline rename are excluded from dragging or dropping as appropriate.

## Implementation Notes
- `src-tauri/src/lib.rs`: Added `copy_dir_recursive`, `move_fs_item_to_dir`, `move_item` Tauri command, and `move_fs_item_to_dir_moves_files_and_folders_safely` unit test.
- `src/App.tsx`: Generalized `InAppFolderDrag` to `InAppItemDrag`, replaced `handleStartFolderDrag` with `handleStartItemDrag`, added `handleMoveItem`, `moveItemHandlerRef`, `refreshSeq`, and updated the drag ghost to render file/folder icons and the `"Move to <Folder>"` badge.
- `src/components/MainView.tsx`: Generalized `getFolderDragProps` to `getItemDragProps` with `isDraggableEntry`, `isDroppableFolder`, `isDropTarget`, `dropTargetFolderPath`, `refreshSeq`, and `data-drop-folder-path` / `data-drop-folder-name` + `.is-drop-target` highlighting across Icons, List, Columns, Gallery, and Path Bar breadcrumbs.
- `src/index.css`: Added `.is-drop-target` visual highlight styles for Icons, List, Columns, Gallery, and Path Bar breadcrumbs, plus `.folder-drag-ghost-move-hint` light/dark badge styles.

## Amendments
- Split out from combined feature work into its own dedicated spec (`053`) with cleanly scoped `move_fs_item_to_dir` and dedicated unit tests.
