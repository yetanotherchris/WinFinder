# 036 — Everything CLI Search Setting

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Setting that uses Everything Command-Line Interface. Setting checks it's installed, and is enabled if it is. Small label saying to install if it's not in the path."

## Summary
Adds a Search setting in the Settings dialog to use the Voidtools Everything Command-Line Interface (`es` / `es.exe`) for directory search. WinFinder checks whether `es` is available on `PATH`, enables the setting by default when installed (while allowing the user to toggle it), disables it with a small helper label when not found in `PATH`, and wires `search_directory` to query `es` with graceful fallback.

## Requirements
- [x] Add a `check_everything_cli_installed` Tauri command in `src-tauri/src/lib.rs` that checks whether Everything CLI (`es.exe` / `es`) is installed and available on `PATH`.
- [x] Add `use_everything_cli: Option<bool>` (`useEverythingCli?: boolean | null`) to `AppSettings` in Rust and TypeScript so it defaults to enabled when `es` is installed while preserving explicit user toggles.
- [x] Add a "Search" section in `SettingsDialog.tsx` with a toggle for Everything CLI (`es`) that checks availability when opened, is enabled when installed, and is disabled with a small helper label telling the user to install Everything CLI (`es`) if it is not in `PATH`.
- [x] Wire `search_directory` / `perform_search` in `src-tauri/src/lib.rs` so that when Everything CLI search is enabled and available on Windows, it queries `es` scoped to the active directory and returns results in the existing `DirectoryListing` / `FileEntry` format, falling back gracefully to Windows Search / filesystem walk on error or non-Windows.
- [x] Add Rust unit tests covering `PATH` detection, `AppSettings` deserialization defaults, and Everything CLI output parsing.
- [x] Verify `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml`, and `cargo test --manifest-path src-tauri/Cargo.toml` pass cleanly.

## Edge Cases
- Legacy `~/.winfinder` state files without `useEverythingCli` deserialize cleanly with `None` (defaulting to enabled when `es` is installed).
- If `es.exe` is installed on `PATH` but the Everything background service is not running (non-zero exit code) or spawning fails, search falls back transparently to Windows Search and bounded filesystem walk.
- If `es.exe` is uninstalled after previously being enabled, the Settings toggle displays as disabled with the install hint and search falls back gracefully.
- On macOS/Linux (`#[cfg(not(target_os = "windows"))]`), `check_everything_cli_installed` returns `false` and search uses the cross-platform filesystem walk without compilation issues.
- In browser preview mode (`npm run dev`), the Settings dialog handles the absence of Tauri IPC gracefully and displays the disabled state and helper label.

## Implementation Notes
- `src-tauri/src/lib.rs`:
  - Extended `AppSettings` with `use_everything_cli: Option<bool>` (`camelCase`).
  - Added `find_executable_in_paths`, Windows-gated `find_everything_cli_in_path` (`es.exe` / `es.cmd` / `es.bat` on `PATH`), and `check_everything_cli_installed` Tauri command.
  - Added `build_search_entries_from_paths` and Windows-gated `query_everything_cli` (running `es` with `CREATE_NO_WINDOW`, `-n`, `-path <scope>`, and `<query>`).
  - Updated `search_directory` and `perform_search` to read `use_everything_cli` from `AppStateStore` and try Everything CLI first on Windows before falling back to Windows Search and bounded BFS walk.
  - Added unit tests for `AppSettings` defaults, `PATH` executable lookup, and search entry parsing, plus fixed a pre-existing `PersistedAppState` test literal missing the `settings` field.
- `src/types.ts`: Added `useEverythingCli?: boolean | null` to `AppSettings`.
- `src/App.tsx`: Updated `DEFAULT_SETTINGS`, `loadBrowserSettings`, and persisted settings hydration for `useEverythingCli`.
- `src/components/SettingsDialog.tsx`: Added "Search" section with `Use Everything CLI (es)` toggle that invokes `check_everything_cli_installed` on open, defaults to enabled when installed, and disables the switch with a small install-in-PATH hint when missing.
- `src/index.css`: Added spacing between Settings sections, disabled row/switch styles, and `.settings-row-hint` styling.

## Amendments
- None
