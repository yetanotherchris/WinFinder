# 021 — Scoop Distribution & GitHub Actions Release Workflow

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "Using the Github actions and scripts from https://github.com/yetanotherchris/markdownmeister, create the GHA workflow for installing via scoop, which includes a GH release. As per the markdownmeister repo, the release and scoop file update should be triggered using 'vx.x.x' git tag, e.g. 'v1.1.1'"

## Summary
Add a GitHub Actions release workflow, root Scoop manifest (`winfinder.json`), and PowerShell release scripts adapted from `yetanotherchris/markdownmeister` so pushing a `vX.Y.Z` tag (e.g. `v1.1.1`) builds WinFinder for Windows x64, creates a GitHub Release, and updates the Scoop manifest and project version files on `main`.

## Requirements
- [x] Trigger GitHub Actions release workflow on strict semver git tags matching `v[0-9]+.[0-9]+.[0-9]+` (e.g. `v1.1.1`).
- [x] Validate tag format, confirm the tag is reachable from `main`, and refuse to overwrite an existing GitHub Release.
- [x] Build WinFinder on `windows-latest` using Node.js, Rust, and Tauri v2 (`npm run tauri build`), syncing the tag version into `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` prior to bundling.
- [x] Package `winfinder.exe` into `winfinder-<version>-windows-x64.zip` (and include built NSIS/MSI installers if present) as GitHub Release assets.
- [x] Create a draft GitHub Release, update `winfinder.json` (version, 64-bit download URL, and SHA256 hash) via `updatescoop.ps1`, sync version files via `updateversion.ps1`, commit updates to `main`, and publish the GitHub Release.
- [x] Provide a valid root `winfinder.json` Scoop manifest with Start Menu shortcut (`WinFinder`) and `winfinder` CLI shim, enabling `scoop bucket add winfinder https://github.com/yetanotherchris/WinFinder` and `scoop install winfinder`.
- [x] Document Scoop installation instructions in `README.md`.
- [x] Validate YAML syntax, JSON syntax, and PowerShell scripts locally.

## Edge Cases
- Tag not matching `vMAJOR.MINOR.PATCH` or not reachable from `main` fails in the cheap `validate` job before running the Windows Tauri build.
- Existing release for the pushed tag aborts early without overwriting assets.
- `updatescoop.ps1` verifies the zip artifact exists and that `shortcuts` is preserved in `winfinder.json` before writing UTF-8 (no BOM) LF-terminated JSON.
- `updateversion.ps1` updates only the `[package]` version in `src-tauri/Cargo.toml` so dependency versions are never accidentally modified.
- Draft release is only published after `winfinder.json` and version updates are committed to `main`, preventing a broken Scoop manifest if a step fails.

## Implementation Notes
- `.github/workflows/build-release.yml` — `validate`, `build` (`windows-latest` Tauri v2), and `release` (`ubuntu-latest` with `pwsh`) jobs modeled after `yetanotherchris/markdownmeister`.
- `winfinder.json` — Root Scoop manifest for `yetanotherchris/WinFinder`.
- `updatescoop.ps1` — Computes SHA256 of `winfinder-<version>-windows-x64.zip` using `.NET` `System.Security.Cryptography.SHA256` and updates `winfinder.json`.
- `updateversion.ps1` — Keeps `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` aligned with the release tag.
- `README.md` — Added Scoop installation section.

## Amendments
- Used `[System.Security.Cryptography.SHA256]` directly in `updatescoop.ps1` instead of `Get-FileHash` so SHA256 computation works reliably across both Windows PowerShell 5.1 and PowerShell 7 (`pwsh`) regardless of module autoloading.
- Replaced `markdownmeister`'s `updatepackagejson.ps1` with `updateversion.ps1` to keep all three Tauri v2 version manifests (`package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`) in sync with the release tag.
