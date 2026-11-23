# 051 — Everything CLI Negation & Exclude Subfolders

- **Status:** Archived
- **Date:** 2026-11-23
- **Request:** "Extra support for Everything (ES) command line searching. In particular, I want to be able to negate: so search for '*.md' and exclude subfolders"

## Summary
Enhances Everything CLI (`es.exe`) and fallback directory search with proper multi-term, quoted-phrase, wildcard, and `!term` negation tokenization, plus a per-tab "Include subfolders" toggle in the search header bar so users can search only the current folder or include subfolders.

## Requirements
- [x] Tokenize search queries into separate `es.exe` arguments via `tokenize_everything_query`, preserving quoted phrases (`"my notes"`) and negated tokens (`!archive`, `!"old specs"`).
- [x] Pass `-parent <scope>` when excluding subfolders and `-path <scope>` when including subfolders in `query_everything_cli`.
- [x] Support `include_subfolders` filtering (`is_direct_child_of`) across `build_search_entries_from_paths`, `query_windows_search_index`, `walk_search_directory`, `perform_search`, and `search_directory`.
- [x] Support `!term` negation, quoted phrases, wildcards (`*`, `?`), `folder:`/`dir:`, `file:`, and `ext:` modifiers in the filesystem walk fallback (`wildcard_match_lower`, `match_walk_term`, `matches_walk_query`).
- [x] Add per-tab `searchIncludeSubfolders` state (default `true`) and an "Include subfolders" toggle checkbox in the search header bar that immediately re-runs the active search when toggled.
- [x] Add Rust unit tests covering `tokenize_everything_query` negation/quoting and `include_subfolders` / negation behavior in `build_search_entries_from_paths` and `walk_search_directory`.

## Edge Cases
- Queries containing `!`, `*`, `?`, or spaces bypass Windows Search SQL `LIKE '%query%'` and fall through cleanly to Everything CLI or the filesystem walk fallback so negation and wildcards work consistently.
- Negated quoted phrases (`!"old specs"`) are passed via `Command::raw_arg` on Windows (`es.exe`) with inner quotes stripped so `es.exe` receives the exact `!"..."` negation syntax.
- `is_direct_child_of` normalizes path keys before comparing parent directories so case/separator differences on Windows do not drop direct children when `include_subfolders` is `false`.
- Toggling "Include subfolders" when the search query is empty updates the tab preference without firing an empty search request.

## Implementation Notes
- `src-tauri/src/lib.rs`:
  - Added `EsQueryToken`, `tokenize_everything_query`, `wildcard_match_lower`, `match_walk_term`, `matches_walk_query`, and `is_direct_child_of`.
  - Added `include_subfolders` parameter across `query_everything_cli` (`-parent` vs `-path`), `build_search_entries_from_paths`, `query_windows_search_index`, `walk_search_directory`, `perform_search`, and `search_directory`.
  - Added `tokenize_everything_query_handles_negation_and_quotes` unit test and extended `build_search_entries_from_paths` / `walk_search_directory` tests.
- `src/App.tsx`:
  - Added `searchIncludeSubfolders` to `TabState` (default `true`), `handleToggleSearchSubfolders`, and passed `includeSubfolders` to `invoke("search_directory", ...)`.
- `src/components/MainView.tsx`:
  - Added `searchIncludeSubfolders` and `onToggleSearchSubfolders` props and rendered the "Include subfolders" checkbox toggle in the search header bar.
- `src/index.css`:
  - Added `.search-header-actions` and `.search-subfolders-toggle` styles (including dark theme hover state).

## Amendments
- Split out from combined work in original Spec 049 into standalone Spec 051.
