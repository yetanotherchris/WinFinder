# 033 — Tree & Columns View Ancestor Sync

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Bug: when you navigate to directory in icons view e.g. 'documents/github', then switch to list view, the full tree isn't displayed, on the directories for the 'github' directory. It should display the entire tree, scrolling too if possible. This same bug happens in columns view."

## Summary
When switching from Icons or Gallery view into List view or Columns view while inside a nested subdirectory of the active panel's root (for example, `Documents/GitHub`), WinFinder now anchors the view at the active panel's root directory, expands or opens the full ancestor chain down to the active directory, highlights/selects the target directory, and scrolls it into view.

## Requirements
- [x] Switching to **List view** while inside a descendant of the active panel's root anchors the tree at the panel's root directory, pre-expands every ancestor directory along the path to the current directory (including the current directory), selects/highlights the target directory, and scrolls it into view.
- [x] Switching to **Columns view** while inside a descendant of the active panel's root anchors column 0 at the panel's root directory, populates `columnPaths` with the full descendant chain so all ancestor columns are displayed with each parent selecting its child, selects the target directory, vertically scrolls parent columns to their selected item, and horizontally scrolls to the rightmost active column.
- [x] Switching between **List view** and **Columns view** preserves the expanded/selected directory chain across both views.
- [x] Handles virtual views (`Recents`, `Applications`, `Drives`, `Network`, `Trash`), custom favorites (`fav:<path>`), and paths outside the active panel's root cleanly without breaking (anchoring at drive root when browsing inside `Drives`, and keeping the current path when outside a real panel root).
- [x] Uses case-insensitive / normalized path key matching on Windows for expanded folder lookups and Miller column selection/trail highlighting.
- [x] Persists updated `lastPath`, `expandedPaths`, and `columnPaths` for tracked panels.

## Edge Cases
- **Virtual views** (`virtual://recents`, `virtual://applications`, `virtual://computer`, `virtual://network`, `virtual://trash`): no ancestor chain to expand; view mode switches directly without re-anchoring.
- **Drives panel (`virtual://computer`) navigated into a real drive path** (e.g. `C:\Users\chris\Documents\GitHub`): anchors at the drive root (`C:\`) and expands/opens the chain down to the target directory.
- **Custom favorites (`fav:<path>`)**: anchors at the custom favorite's root path when inside any of its descendants.
- **Paths outside the active panel's root** (e.g. clicking an ancestor breadcrumb above `Documents`): stays anchored at the current directory cleanly without jumping unexpectedly.
- **Empty target directories or hidden folders**: target row/column still expands/opens cleanly without errors.
- **Cache miss on anchor root**: waits for `currentPath` to match `anchorRoot` before running the reveal/select/scroll effect so stale listings do not prematurely consume the reveal request.

## Implementation Notes
- `src/utils/pathChain.ts`: `resolveViewAnchorChain` and `buildDescendantChain` helpers using `normalizePathKey`.
- `src/App.tsx`: `handleChangeViewMode` computes anchor root and descendant chain, updates `expandedPaths`/`columnPaths`, triggers `fetchDirectory(anchorRoot)`, and passes `revealRequest` to `MainView`.
- `src/components/MainView.tsx`: normalized path keys for `expandedFolders` and Miller column selection/trail state; reveal `useEffect` selects and scrolls the target row in List view (`scrollIntoView({ block: "center" })`) and scrolls selected rows + horizontal container in Columns view.

## Amendments
- None
