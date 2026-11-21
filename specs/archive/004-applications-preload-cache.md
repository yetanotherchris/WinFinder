# 004 — Startup Preloading & Caching for Applications

- **Status:** Archived
- **Date:** 2026-11-20
- **Request:** "Preload applications on launch. If the user clicks Applications while it is still preloading, indicate that they are loading. Only load once at start, not again, and never hang the UI."

## Summary
Load installed applications once in the background when WinFinder starts, cache the result for the session, and make directory listing non-blocking with a visible loading indicator if `Applications` is opened before preloading finishes.

## Requirements
- [x] Begin enumerating installed applications on a background thread immediately at app startup.
- [x] Cache the enumerated application list in memory so subsequent visits to `Applications` return immediately without re-scanning.
- [x] Execute directory listing off the main UI thread so clicking `Applications` never freezes the window.
- [x] Display a responsive `"Loading applications…"` spinner state if the user opens `Applications` before preloading completes.
- [x] Ignore stale responses if the user navigates to another folder before a pending load finishes.

## Edge Cases
- If startup enumeration fails, cache the error and show a user-friendly error message when `Applications` is selected.
- Rapidly switching between sidebar locations uses a request counter to avoid race-condition overwrites.

## Implementation Notes
- Key files: `src-tauri/src/lib.rs` (`AppsCache` with `Mutex` + `Condvar`, `async fn list_directory` via `spawn_blocking`), `src/App.tsx` (`pendingPath`, `requestIdRef`), `src/components/MainView.tsx`.

## Amendments
- None.
