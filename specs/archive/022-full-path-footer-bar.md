# 022 — Full Path Footer Bar

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "The bottom footer bar should display the full path. Currently it only displays 2 segments. For example in documents it displays 'chris'..'documents'."

## Summary
Update the bottom path bar to always display the complete filesystem path from root/drive to the current directory (for example, `C:\ > Users > chris > Documents` on Windows or `/ > Users > chris > Documents` on macOS/Linux) instead of anchoring and truncating breadcrumbs at the user's home directory.

## Requirements
- [x] Always build full filesystem breadcrumbs from root/drive to the current directory in Rust (`build_breadcrumbs`), without collapsing or anchoring at the home directory.
- [x] Preserve single-item virtual breadcrumbs for virtual views (`Recents`, `Applications`, `Drives`, `Network`).
- [x] Keep every ancestor breadcrumb segment clickable to navigate directly to that directory.
- [x] Render appropriate icons for root drives (`HardDrive`), network UNC roots (`Globe`), the user's home directory segment (`Home`), and regular folders (`Folder`) regardless of segment index.
- [x] Handle very deep paths gracefully with non-shrinking segments, horizontal scrolling, auto-scroll to keep the current directory visible, and subtle scrollbar styling.
- [x] Add unit tests for `build_breadcrumbs` covering home subdirectories, root drives, and deep paths.

## Edge Cases
- **Virtual views:** `virtual://recents`, `virtual://applications`, `virtual://computer`, and `virtual://network` remain single-segment breadcrumbs.
- **Root directory:** Navigating to `C:\` (Windows) or `/` (macOS/Linux) displays a single root drive breadcrumb.
- **Very deep paths:** Segments do not shrink or collapse to 2 items; the path bar scrolls horizontally (including vertical-to-horizontal mouse wheel scrolling) and automatically scrolls to the rightmost (current) segment on navigation.
- **Cross-platform paths:** Breadcrumbs are built exclusively in Rust via `std::path::Path::components()`, with no hardcoded path separators in UI logic.

## Implementation Notes
- `src-tauri/src/lib.rs`: Updated `build_breadcrumbs` to iterate `current.components()` from filesystem root instead of `strip_prefix(home)`, and added unit tests (`build_breadcrumbs_full_windows_path_inside_home`, `build_breadcrumbs_windows_root_and_deep_path`, `build_breadcrumbs_full_unix_path`).
- `src/components/MainView.tsx`: Updated `renderBreadcrumbIcon` to match `homePath` at any index and support POSIX `/` and UNC roots; added `pathbarRef` auto-scroll to the rightmost segment on breadcrumb changes and mouse-wheel horizontal scrolling; added `title={crumb.path}` tooltips on breadcrumb buttons.
- `src/index.css`: Added `flex-shrink: 0` on `.pathbar-crumb` and refined `.finder-pathbar` horizontal overflow scrollbar styling (`overflow-y: hidden`, thin 4px scrollbar).
- Verified with `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml`.

## Amendments
- Added vertical-to-horizontal mouse wheel scrolling on `.finder-pathbar` and `title={crumb.path}` tooltips on breadcrumb buttons for better usability on deep paths.
