# 035 — Config Path (`~/.winfinder/config.json`) and Scoop Uninstall Cleanup

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Config file should be ~/.winfinder/config.json and scoop should remove this file on uninstall."

## Summary
Move WinFinder's persisted configuration and state file from `~/.winfinder` to `~/.winfinder/config.json`, migrating any legacy `~/.winfinder` file cleanly, and configure the Scoop manifest (`winfinder.json`) to remove `~/.winfinder/config.json` (and `~/.winfinder` if empty) on `scoop uninstall`.

## Requirements
- [x] Store WinFinder's persisted config/state at `~/.winfinder/config.json` using cross-platform `Path`/`PathBuf` resolution.
- [x] Automatically create the `~/.winfinder` directory when saving config if it does not exist.
- [x] Cleanly migrate an existing legacy `~/.winfinder` regular file into `~/.winfinder/config.json` on startup without losing user settings or state.
- [x] Update UI/code references (such as the Settings dialog storage hint) to display `~/.winfinder/config.json`.
- [x] Update the Scoop manifest (`winfinder.json`) with a `post_uninstall` hook guarded by `$cmd -eq 'uninstall'` that removes `~/.winfinder/config.json` and removes `~/.winfinder` if empty.
- [x] Guard `post_uninstall` in `updatescoop.ps1` so release automation never drops it.
- [x] Add Rust unit tests covering fresh load/save, directory creation, and legacy `~/.winfinder` file migration.

## Edge Cases
- **Legacy `~/.winfinder` file:** Previously `~/.winfinder` was a regular file, which collides with creating a `~/.winfinder` directory. On load, if `~/.winfinder` is a regular file, move it to a temporary backup (`~/.winfinder.legacy.tmp`), create `~/.winfinder/`, move the backup to `~/.winfinder/config.json`, and roll back if directory creation fails.
- **Corrupted legacy or config JSON:** Fall back to `PersistedAppState::default()` without crashing; remove invalid legacy backup so the new directory is clean.
- **Scoop `update` vs `uninstall`:** Scoop runs `post_uninstall` during both `scoop update` and `scoop uninstall`. Guarding with `if ($cmd -eq 'uninstall')` ensures user config is preserved during `scoop update` and only removed on true uninstall.
- **Non-empty `~/.winfinder` directory on uninstall:** Only delete `~/.winfinder` if no other files (including hidden files) remain in it after deleting `config.json`.
- **Missing home directory:** If `dirs::home_dir()` returns `None`, operate in-memory with defaults without panicking.

## Implementation Notes
- `src-tauri/src/lib.rs`:
  - Added `config_file_path_for_home` resolving `<home>/.winfinder/config.json` via `Path::join`.
  - Added `migrate_legacy_config_file` to safely migrate an existing legacy `~/.winfinder` regular file into `~/.winfinder/config.json` via a temporary backup with rollback on directory creation failure.
  - Refactored `AppStateStore::load` through `AppStateStore::from_home` for clean testability and updated `save_now` to create the `~/.winfinder` parent directory and write atomically via `config.json.tmp`.
  - Added unit tests `config_store_creates_dot_winfinder_dir_and_saves_config_json`, `config_store_migrates_legacy_dot_winfinder_file`, and `config_store_handles_corrupt_legacy_dot_winfinder_file` (and fixed missing `settings` field in existing `sanitize_keeps_valid_custom_favorite_state_and_prunes_removed` test).
- `src/components/SettingsDialog.tsx`: Updated storage hint text to `Saved to ~/.winfinder/config.json`.
- `src/App.tsx`: Updated comment referencing `~/.winfinder/config.json`.
- `winfinder.json`: Added `post_uninstall` hook guarded by `if ($cmd -eq 'uninstall')` that deletes `$env:USERPROFILE\.winfinder\config.json` and deletes `$env:USERPROFILE\.winfinder` if empty.
- `updatescoop.ps1`: Added guard ensuring `post_uninstall` is never silently dropped during automated release manifest updates.

## Amendments
- None.
