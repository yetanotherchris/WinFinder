# 016 — In-Memory Directory Cache & Deferred Loading Indicator

- **Status:** In Progress
- **Date:** 2026-11-21
- **Request:** "there is a short delay in rendering the view when you open directories in say, 'home', then click 'downloads' then click 'home' again (home meaning 'chris' on my computer). Can the views be cached in some way while the app is open? Or some tricks to speed it up"

## Summary
Add an in-memory stale-while-revalidate (SWR) directory listing cache shared across main navigation, List View expanded folders, and Miller Columns, combined with a deferred (`120ms`) loading indicator so previously visited directories render instantaneously with zero flicker while staying fresh against disk changes.

## Requirements
- [x] Cache `DirectoryListing` results in memory (keyed by normalized path + `showHidden`) for the lifetime of the app session.
- [x] On cache hit when navigating or switching sidebar panels (e.g. Home → Downloads → Home), render the cached directory immediately on frame 0 with no loading spinner, and silently revalidate from disk in the background.
- [x] Skip redundant React re-renders when background revalidation returns identical directory entries.
- [x] Hydrate List View `expandedPaths` synchronously from the in-memory cache when switching back to a panel, while silently revalidating each expanded folder in the background.
- [x] Use the same cache for List View expand/collapse toggles and Miller Columns sub-columns.
- [x] Defer showing the loading spinner (`120ms`) on uncached navigations and Miller Columns so fast local folders (including empty directories) transition in a single crisp paint without flashing `"Loading…"`.
- [x] Invalidate/refresh cached entries on explicit Refresh, New Folder, or OS context menu actions, and fall back via `resolve_panel_path` if a cached folder is deleted on disk.

## Edge Cases
- Folder deleted externally while cached: background revalidation detects the error, invalidates the cache entry, and resolves to the nearest existing parent or panel root.
- `showHidden` toggled: cache keys include `showHidden` so hidden and non-hidden views never bleed into each other.
- Virtual views (`virtual://applications`, `virtual://recents`, `virtual://computer`, `virtual://network`): `Applications` already has backend caching; `Recents`, `Drives`, and `Network` still benefit from instant SWR display + background refresh.
- Rapid clicks / navigation races: `requestIdRef` ensures stale background revalidations never overwrite a newer navigation.

## Implementation Notes
- **`src/utils/dirCache.ts`**: In-memory `Map<string, DirectoryListing>` keyed by normalized path + `showHidden`, with `getCachedDirectory`, `setCachedDirectory`, `invalidateCachedDirectory`, `entriesEqual`, and `listingsEqual`.
- **`src/App.tsx`**: Upgraded `fetchDirectory` to stale-while-revalidate (instant render on cache hit + silent background refresh + external deletion recovery via `resolvePanelTarget`), skipped pre-flight `resolve_panel_path` IPC on cached panel switches, deferred uncached loading spinner by `120ms`, and invalidated cache on Refresh, New Folder, and OS context menu invocations.
- **`src/components/MainView.tsx`**: Synchronously hydrates List View `expandedPaths` from `dirCache` on frame 0 (eliminating pop-in when switching back to a panel), uses SWR cache for List View expand/collapse and Miller Columns sub-columns, and defers uncached Miller Columns loading indicator by `120ms`.

## Amendments
- None.
