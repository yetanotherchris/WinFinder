# 027 — Go to Path Action

- **Status:** Archived
- **Date:** 2026-11-21
- **Request:** "A new actions menu option to 'go to path' with a textbox you paste the path into"

## Summary
Add a macOS Finder-inspired "Go to Path…" action to the toolbar's Actions menu (and `Ctrl+Shift+G` / `Cmd+Shift+G` shortcut) that opens a modal dialog with an auto-focused path input, resolves and validates the entered path cross-platform via Rust, and navigates to the target folder (or selects the target file in its parent folder).

## Requirements
- [x] Add a **"Go to Path…"** item to the toolbar Actions menu (`Toolbar.tsx`), enabled from both real directories and virtual views.
- [x] Support keyboard shortcut `Ctrl+Shift+G` / `Cmd+Shift+G` to open the Go to Path dialog.
- [x] Clicking the menu item or pressing the shortcut opens a macOS Finder-style modal dialog ("Go to the folder:") with an auto-focused text input where users can type or paste a path.
- [x] Implement a cross-platform Rust command (`resolve_go_to_path`) that strips surrounding quotes (e.g. `"C:\Users\..."`), expands `~` / `~/...`, expands environment variables (`%VAR%`, `$VAR`, `${VAR}`), resolves relative paths against the current directory (or home directory when in a virtual view), and normalizes `.` / `..` segments.
- [x] Pressing `Enter` or clicking **Go** navigates to the resolved directory; if the target is a file, navigates to its parent directory and selects that file.
- [x] If the path is empty or does not exist, keep the dialog open and display a clear inline error message inside the dialog.
- [x] Pressing `Escape`, clicking **Cancel**, or clicking the backdrop closes the dialog without navigating.
- [x] Ensure typing/pressing `Backspace` inside the dialog input does not trigger global back navigation.

## Edge Cases
- Quoted paths copied from Windows File Explorer ("Copy as path"), e.g. `"C:\Users\chris\Documents"`.
- Bare drive letters on Windows (e.g. `C:`) normalized to drive root (`C:\`).
- Relative paths entered while viewing a virtual view (`virtual://recents`, `virtual://trash`, etc.) resolve relative to the user's home directory.
- Entering a path to an existing file opens its parent directory and highlights/selects the file (even if the user is already viewing that parent directory).
- Non-existent paths or unreadable targets show an inline error inside the modal without dismissing it.
- Browser preview mode (`npm run dev` without Tauri runtime) falls back gracefully without crashing.

## Implementation Notes
- Backend: `src-tauri/src/lib.rs` (`ResolvedGoToPath`, `resolve_go_to_path`, `strip_wrapping_quotes`, `expand_env_vars`, `normalize_path_lexical`, `resolve_user_path`, and unit tests).
- Types: `src/types.ts` (`ResolvedGoToPath`).
- UI: `src/components/GoToPathModal.tsx`, `src/components/Toolbar.tsx`, `src/App.tsx`, `src/index.css`.

## Amendments
- None
