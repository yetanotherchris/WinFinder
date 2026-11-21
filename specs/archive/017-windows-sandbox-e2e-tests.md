# 017 — Windows Sandbox E2E Tests

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "I have windows sandbox installed. Using 'wsb start' to start a sandbox, I want you to write a spec for test scenarios. Use playwright (or another tool) to run each test scenario. Then run the tests. In the spec include the instructions for installing windowssandbox."

## Summary
Define and implement an automated end-to-end (E2E) Playwright test suite for WinFinder and an orchestration script that launches a disposable Windows Sandbox environment via `wsb start` to run the suite in isolation, complete with setup instructions for installing Windows Sandbox.

## Prerequisites: Installing Windows Sandbox

### System Requirements
- **OS:** Windows 10 Pro, Enterprise, or Education (build 18305 or later), or Windows 11 Pro, Enterprise, or Education. *(Windows Home editions do not include Windows Sandbox.)*
- **Architecture:** AMD64 or ARM64.
- **Virtualization:** Hardware virtualization enabled in BIOS/UEFI (Intel VT-x / AMD-V).
- **Hardware:** At least 4 GB RAM (8 GB recommended), 1 GB free disk space (SSD recommended), and at least 2 CPU cores.

### Step 1: Verify Virtualization Is Enabled
Open PowerShell and run:
```powershell
systeminfo | findstr /i "Hyper-V"
```
Confirm that **Virtualization Enabled In Firmware** is `Yes` (or that a hypervisor has been detected). If not, reboot into BIOS/UEFI and enable Intel VT-x / AMD-V.

### Step 2: Enable the Windows Sandbox Feature
**Option A — PowerShell (Recommended, Run as Administrator):**
```powershell
Enable-WindowsOptionalFeature -FeatureName "Containers-DisposableClientVM" -All -Online
```
When prompted, restart the computer to complete installation.

**Option B — Windows Features GUI:**
1. Press `Win + R`, type `optionalfeatures.exe`, and press **Enter**.
2. Scroll down and check **Windows Sandbox**.
3. Click **OK** and restart the computer when prompted.

### Step 3: Install / Update the Windows Sandbox CLI (`wsb`)
On Windows 11 24H2 and later, the `wsb` command-line interface is shipped with the **Windows Sandbox** Microsoft Store package:
1. Open the **Microsoft Store** (or run `winget upgrade --id 9N8G7TSCL18R`) and ensure **Windows Sandbox** is up to date.
2. Verify `wsb` is available in PowerShell:
   ```powershell
   wsb --version
   wsb --help
   ```
   *(If `wsb` is not on your `PATH`, invoke it via `"$env:LOCALAPPDATA\Microsoft\WindowsApps\wsb.exe"`.)*

### Step 4: Quick Smoke Test
```powershell
# Start a disposable sandbox and print its JSON metadata (including Id)
wsb start --raw

# List running sandboxes
wsb list

# Stop the sandbox by Id
wsb stop --id <sandbox-id>
```

> **Note:** Windows Sandbox supports only one active instance per host at a time. Always stop an existing instance before starting a new one.

## Requirements
- [x] Document complete Windows Sandbox installation, virtualization check, and `wsb` CLI setup instructions in this spec.
- [x] Configure Playwright (`@playwright/test` and `playwright.config.ts`) to launch WinFinder and run E2E tests cleanly.
- [x] Implement comprehensive E2E test scenarios (`tests/e2e/winfinder.spec.ts`) covering:
  - [x] **S1 — Initial Load & Shell Layout:** Sidebar, toolbar, main canvas, path bar, status bar, default Icons view, and item count.
  - [x] **S2 — Sidebar Navigation & Active State:** Switching across Favorites (`Recents`, `Applications`, `Desktop`, `Documents`, `Downloads`, `Home`) and Locations (`Drives`, `Network`) updates active state, toolbar title, and breadcrumbs.
  - [x] **S3 — Folder Navigation, Breadcrumbs & Back/Forward History:** Double-clicking folders updates title/breadcrumbs, Back/Forward buttons traverse history, and clicking ancestor breadcrumbs navigates directly.
  - [x] **S4 — View Mode Switching:** Switching between `Icons`, `List`, `Columns`, and `Gallery` updates `aria-pressed`, canvas view classes, and mode-specific views.
  - [x] **S5 — Sorting Controls & Sort Menu:** Changing sort field (`Name`, `Kind`, `Date Modified`, `Size`), sort direction (`Ascending`/`Descending`), `Keep Folders on Top`, and clicking List view column headers reorders entries.
  - [x] **S6 — Item Selection, Status Bar & Share Menu:** Selecting an entry updates status bar selection text and enables Share menu (`Copy File`/`Copy Folder`, `Copy Path`); clicking empty canvas clears selection.
  - [x] **S7 — Actions Menu & Show Hidden Files:** Opening Actions (`...`) popover, creating a `New Folder`, toggling `Show Hidden Files` (revealing hidden entries), and dismissing menus with `Escape`.
  - [x] **S8 — List View Inline Disclosure & Sidebar Resize:** Expanding/collapsing folders inline in List view (`aria-expanded`) and resizing/resetting the sidebar width.
  - [x] **S9 — Browser Context Menu Suppression & Browser Fallback:** Verifying default browser context menu is prevented on items/canvas and that WinFinder renders gracefully outside the Tauri runtime.
- [x] Provide a Windows Sandbox runner script (`scripts/run-sandbox-tests.ps1`) that uses `wsb start`, `wsb share`, `wsb exec`, and `wsb stop` to execute the Playwright test suite inside an isolated Windows Sandbox VM and collect results.
- [x] Run the Playwright E2E test suite (including inside Windows Sandbox via `wsb start`) and verify all scenarios pass.
- [x] Ensure `npm run build` continues to pass cleanly.

## Edge Cases
- **Single-Instance Sandbox Lock:** `scripts/run-sandbox-tests.ps1` inspects `wsb list --raw` before calling `wsb start` and fails fast with a clear message if another sandbox is running (or accepts `-ReuseExisting`).
- **Read-Only Workspace Inside Sandbox:** Because the host repository is shared read-only (`C:\WinFinder`) to preserve isolation, Vite's dev server cannot create `node_modules/.vite-temp`. Setting `WINFINDER_SERVE_DIST=1` switches `playwright.config.ts` to a zero-dependency read-only static server (`scripts/serve-dist.mjs`) serving the production `dist/` build.
- **No Network Inside Sandbox / Fast Startup:** Sharing the host's Node.js runtime (`C:\nodejs`) and Playwright Chromium cache (`%LOCALAPPDATA%\ms-playwright` -> `C:\ms-playwright`) read-only via `wsb share` allows all 10 E2E tests to run inside the disposable VM without downloading browsers.
- **Tauri IPC Mocking in Browser E2E:** `tests/e2e/fixtures/mockTauri.ts` injects a deterministic `__TAURI_INTERNALS__` mock covering `get_sidebar_locations`, `load_app_state`, `save_panel_states`, `resolve_panel_path`, `list_directory`, `create_new_folder`, `empty_trash`, and action commands, while `S9b` verifies the non-Tauri browser fallback.
- **Cleanup on Failure:** `scripts/run-sandbox-tests.ps1` uses `try / finally` to guarantee `wsb stop` is called even on failure.

## Implementation Notes
- **Files added/updated:**
  - `playwright.config.ts` — Playwright Chromium configuration with `list` + JSON reporters and automatic `webServer` (Vite dev server locally, `scripts/serve-dist.mjs` when `WINFINDER_SERVE_DIST=1`).
  - `tests/e2e/fixtures/mockTauri.ts` — Deterministic Tauri v2 IPC mock fixture.
  - `tests/e2e/winfinder.spec.ts` — 10 Playwright E2E test cases covering scenarios S1–S9 and S9b.
  - `scripts/serve-dist.mjs` — Lightweight read-only Node HTTP server for serving `dist/` inside Windows Sandbox.
  - `scripts/run-sandbox-tests.ps1` — PowerShell orchestrator using `wsb start --raw`, `wsb share`, `wsb exec --run-as System`, and `wsb stop`.
  - `package.json` — Added `@playwright/test` devDependency and `test:e2e` / `test:e2e:sandbox` npm scripts.
  - `.gitignore` — Added `test-results` and `playwright-report`.
- **Verification Results:**
  - Host (`npx playwright test --workers=4`): **10/10 passed** (5.0s).
  - Windows Sandbox (`npm run test:e2e:sandbox` via `wsb start`): **10/10 passed** inside disposable sandbox VM, JSON report written to `test-results/sandbox/results.json`, sandbox cleanly stopped via `wsb stop`.
  - Production build (`npm run build`): passed cleanly.

## Amendments
- Added `scripts/serve-dist.mjs` and `WINFINDER_SERVE_DIST=1` mode in `playwright.config.ts` so the repository can remain strictly read-only when shared into Windows Sandbox via `wsb share`.
- Defaulted `scripts/run-sandbox-tests.ps1` to `--run-as System` (with optional `-RunAs ExistingLogin`) so tests execute headlessly after `wsb start` without requiring an interactive `wsb connect` RDP session.
