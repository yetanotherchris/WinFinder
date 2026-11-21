# 028 — CLI Path Argument

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Add a command line argument like explorer.exe that opens the app at a specific path. e.g. 'winfinder ~/' or 'winfinder .' or 'winfinder d:\blah\blah'"

## Summary
Allow launching WinFinder from the command line with an optional path argument (similar to `explorer.exe <path>`) so the application opens directly at the specified directory instead of the last persisted panel/path.

## Requirements
- [x] Parse `std::env::args().skip(1)` in Rust to capture an optional initial target path argument, ignoring flag arguments starting with `-`.
- [x] Resolve `~`, `~/...`, `~\...`, `.` / relative paths (against current working directory), and absolute paths (e.g. `d:\blah\blah`) using `std::path::PathBuf` and canonicalization, stripping Windows `\\?\` verbatim prefixes cleanly.
- [x] If the resolved target is a file, open its parent directory.
- [x] If the target does not exist or cannot be resolved to an existing directory, fall back gracefully to the normal startup directory (`None`).
- [x] Expose a `get_initial_path` Tauri command returning `Option<String>`.
- [x] Update `App.tsx` startup initialization so that when an initial CLI path is provided, WinFinder opens directly at that path (overriding saved startup panel/path) and highlights the matching sidebar panel if applicable.
- [x] Add Rust unit tests covering path resolution (`~`, `~/foo`, `.`, relative, absolute, file-to-parent, nonexistent fallback, flag skipping, verbatim prefix stripping).

## Edge Cases
- Flag arguments (e.g. `--debug`, `-v`) before or instead of a path are ignored; the first non-flag, non-empty argument is treated as the target path.
- `~` alone, `~/`, `~\`, `~/sub`, and `~\sub` expand against `dirs::home_dir()`.
- Relative paths (`.`, `..`, `./subdir`) resolve against `std::env::current_dir()`.
- Windows verbatim prefixes (`\\?\C:\...` and `\\?\UNC\server\share`) from `std::fs::canonicalize` are normalized to standard paths (`C:\...`, `\\server\share`) so breadcrumbs and path comparisons work cleanly.
- If a file path is passed, its parent directory is opened.
- If the argument does not exist or points to an invalid path, `get_initial_path` returns `None` and normal persisted startup runs unchanged.
- Matching sidebar panel detection checks Desktop, Documents, Downloads, custom Favorites, and Home (preferring the longest matching prefix so subfolders inside Desktop/Documents/Downloads/Favorites highlight their specific panel rather than Home), falling back to `"network"` for UNC paths (`\\...`) and `"drives"` for other paths outside Home/Favorites.
- `get_initial_path` clones the managed `InitialPath` state rather than consuming it so React StrictMode double-effects in development retain the initial path.

## Implementation Notes
- `src-tauri/src/cli.rs`: Pure path-parsing and resolution module (`extract_cli_path_arg`, `strip_verbatim_prefix`, `resolve_cli_path_with`) with comprehensive unit tests.
- `src-tauri/src/lib.rs`: Added `InitialPath` managed state populated from `std::env::args().skip(1)` in `run()`, exposed `get_initial_path` Tauri command, and registered it in `tauri::generate_handler!`.
- `src/App.tsx`: Added `isSameOrSubpath` / `matchPanelForPath` helpers and updated startup initialization to query `get_initial_path`, override saved startup panel/path when present, and highlight the matching sidebar panel.

## Amendments
- Extracted CLI path parsing, resolution, and unit tests into `src-tauri/src/cli.rs` (imported via `mod cli;` in `src-tauri/src/lib.rs`) for modularity and standalone `rustc --test` execution in addition to `cargo test`.
