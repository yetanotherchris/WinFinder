import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { MainView } from "./components/MainView";
import {
  getCachedDirectory,
  invalidateCachedDirectory,
  listingsEqual,
  setCachedDirectory,
} from "./utils/dirCache";
import type {
  DirectoryListing,
  FileEntry,
  PanelId,
  PanelState,
  PersistedAppState,
  SidebarLocations,
  SortConfig,
  TrackedPanelId,
  ViewMode,
} from "./types";

const DEFAULT_VIEW_MODE: ViewMode = "icons";
const DEFAULT_SORT: SortConfig = {
  field: "name",
  direction: "asc",
  foldersFirst: true,
};

const TRACKED_PANEL_SET = new Set<PanelId>([
  "recents",
  "desktop",
  "documents",
  "downloads",
  "home",
]);

function isTrackedPanel(panel: PanelId): panel is TrackedPanelId {
  return TRACKED_PANEL_SET.has(panel);
}

function getRootPathForPanel(
  panel: PanelId,
  locs: SidebarLocations | null
): string | null {
  switch (panel) {
    case "recents":
      return "virtual://recents";
    case "applications":
      return "virtual://applications";
    case "desktop":
      return locs?.desktopPath ?? null;
    case "documents":
      return locs?.documentsPath ?? null;
    case "downloads":
      return locs?.downloadsPath ?? null;
    case "home":
      return locs?.homePath ?? "";
    case "drives":
      return "virtual://computer";
    case "network":
      return "virtual://network";
    case "trash":
      return "virtual://trash";
  }
}

interface HistoryEntry {
  path: string;
  panel: PanelId;
}

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const MOCK_LOCATIONS: SidebarLocations = {
  homePath: "~",
  homeName: "Home",
  desktopPath: "~/Desktop",
  documentsPath: "~/Documents",
  downloadsPath: "~/Downloads",
};

const MOCK_PREVIEW_LISTING: DirectoryListing = {
  currentPath: "~",
  currentName: "Home",
  homePath: "~",
  homeName: "Home",
  breadcrumbs: [{ name: "Home", path: "~" }],
  entries: [
    { name: "Desktop", path: "~/Desktop", isDir: true, entryKind: "folder", extension: null, size: 0, modifiedMs: Date.now() - 3600_000, iconDataUrl: null },
    { name: "Documents", path: "~/Documents", isDir: true, entryKind: "folder", extension: null, size: 0, modifiedMs: Date.now() - 7200_000, iconDataUrl: null },
    { name: "Downloads", path: "~/Downloads", isDir: true, entryKind: "folder", extension: null, size: 0, modifiedMs: Date.now() - 1800_000, iconDataUrl: null },
    { name: "Music", path: "~/Music", isDir: true, entryKind: "folder", extension: null, size: 0, modifiedMs: Date.now() - 86400_000, iconDataUrl: null },
    { name: "Pictures", path: "~/Pictures", isDir: true, entryKind: "folder", extension: null, size: 0, modifiedMs: Date.now() - 172800_000, iconDataUrl: null },
    { name: "Videos", path: "~/Videos", isDir: true, entryKind: "folder", extension: null, size: 0, modifiedMs: Date.now() - 259200_000, iconDataUrl: null },
    { name: "README.md", path: "~/README.md", isDir: false, entryKind: "file", extension: "md", size: 1024, modifiedMs: Date.now() - 600_000, iconDataUrl: null },
  ],
  emptyMessage: null,
};

function labelForPendingPath(targetPath?: string, locations?: SidebarLocations | null): string {
  if (!targetPath) return locations?.homeName || "Home";
  if (targetPath === "virtual://recents") return "Recents";
  if (targetPath === "virtual://applications") return "Applications";
  if (targetPath === "virtual://computer") return "Drives";
  if (targetPath === "virtual://network") return "Network";
  if (targetPath === "virtual://trash") return "Trash";
  const parts = targetPath.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || targetPath;
}

export const App: React.FC = () => {
  const [locations, setLocations] = useState<SidebarLocations | null>(null);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<PanelId>("home");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(204);
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW_MODE);
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [sortConfig, setSortConfig] = useState<SortConfig>(DEFAULT_SORT);
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [columnPaths, setColumnPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [emptyingTrash, setEmptyingTrash] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const mockTrashEntriesRef = useRef<FileEntry[]>([
    {
      name: "Old Draft.docx",
      path: "trash://mock-1",
      isDir: false,
      entryKind: "file",
      extension: "docx",
      size: 24576,
      modifiedMs: Date.now() - 5400_000,
      iconDataUrl: null,
    },
    {
      name: "Archived Notes",
      path: "trash://mock-2",
      isDir: true,
      entryKind: "folder",
      extension: null,
      size: 0,
      modifiedMs: Date.now() - 86400_000,
      iconDataUrl: null,
    },
  ]);
  const requestIdRef = useRef(0);
  const loadingTimerRef = useRef<number | null>(null);
  const showHiddenRef = useRef(showHidden);
  showHiddenRef.current = showHidden;
  const activePanelRef = useRef<PanelId>(activePanel);
  activePanelRef.current = activePanel;
  const lastTrackedPanelRef = useRef<TrackedPanelId>("home");
  const panelStatesRef = useRef<Partial<Record<TrackedPanelId, PanelState>>>({});
  const ephemeralPanelStatesRef = useRef<
    Partial<Record<PanelId, { viewMode: ViewMode; sort: SortConfig }>>
  >({});
  const viewModeRef = useRef<ViewMode>(viewMode);
  viewModeRef.current = viewMode;
  const sortConfigRef = useRef<SortConfig>(sortConfig);
  sortConfigRef.current = sortConfig;

  const persistPanelStates = useCallback((trackedPanel?: TrackedPanelId) => {
    if (trackedPanel) {
      lastTrackedPanelRef.current = trackedPanel;
    }
    if (!isTauriRuntime()) return;
    void invoke("save_panel_states", {
      activePanel: lastTrackedPanelRef.current,
      panels: panelStatesRef.current,
    });
  }, []);

  const updateTrackedPanelState = useCallback(
    (
      panel: TrackedPanelId,
      patch: Partial<PanelState>,
      alsoSetActive = true
    ) => {
      const prev = panelStatesRef.current[panel];
      panelStatesRef.current = {
        ...panelStatesRef.current,
        [panel]: {
          viewMode: patch.viewMode ?? prev?.viewMode ?? viewModeRef.current,
          sort: patch.sort ?? prev?.sort ?? sortConfigRef.current,
          lastPath:
            patch.lastPath !== undefined ? patch.lastPath : (prev?.lastPath ?? null),
          expandedPaths:
            patch.expandedPaths !== undefined
              ? patch.expandedPaths
              : (prev?.expandedPaths ?? []),
          columnPaths:
            patch.columnPaths !== undefined
              ? patch.columnPaths
              : (prev?.columnPaths ?? []),
        },
      };
      persistPanelStates(alsoSetActive ? panel : undefined);
    },
    [persistPanelStates]
  );

  const resolvePanelTarget = useCallback(
    async (savedPath: string | null | undefined, rootPath: string): Promise<string> => {
      if (!savedPath) return rootPath;
      if (!isTauriRuntime()) return savedPath;
      try {
        return await invoke<string>("resolve_panel_path", {
          savedPath,
          rootPath,
        });
      } catch {
        return rootPath;
      }
    },
    []
  );

  const fetchDirectory = useCallback(
    async (
      targetPath?: string,
      options?: {
        overrideShowHidden?: boolean;
        forceRefresh?: boolean;
        fallbackRoot?: string;
        fallbackPanel?: TrackedPanelId;
      }
    ): Promise<DirectoryListing | null> => {
      const reqId = ++requestIdRef.current;
      const includeHidden = options?.overrideShowHidden ?? showHiddenRef.current;
      const forceRefresh = options?.forceRefresh ?? false;

      if (loadingTimerRef.current !== null) {
        window.clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }

      setError(null);
      setSelectedEntry(null);

      if (!isTauriRuntime()) {
        if (targetPath === "virtual://trash") {
          const mockTrashListing: DirectoryListing = {
            currentPath: "virtual://trash",
            currentName: "Trash",
            homePath: "~",
            homeName: "Home",
            breadcrumbs: [{ name: "Trash", path: "virtual://trash" }],
            entries: [...mockTrashEntriesRef.current],
            emptyMessage: "Trash is empty",
          };
          setListing(mockTrashListing);
          setPendingPath(null);
          setLoading(false);
          return mockTrashListing;
        }
        setListing(MOCK_PREVIEW_LISTING);
        setPendingPath(null);
        setLoading(false);
        return MOCK_PREVIEW_LISTING;
      }

      const cached =
        !forceRefresh && targetPath
          ? getCachedDirectory(targetPath, includeHidden)
          : undefined;

      if (cached) {
        // Stale-while-revalidate: render cached directory immediately with zero flicker
        setListing(cached);
        setPendingPath(null);
        setLoading(false);

        void (async () => {
          try {
            const fresh = await invoke<DirectoryListing>("list_directory", {
              path: targetPath ?? null,
              showHidden: includeHidden,
            });
            setCachedDirectory(targetPath ?? fresh.currentPath, includeHidden, fresh);
            if (reqId !== requestIdRef.current) return;
            if (!listingsEqual(cached, fresh)) {
              setListing(fresh);
            }
          } catch {
            if (targetPath) invalidateCachedDirectory(targetPath);
            if (reqId !== requestIdRef.current) return;
            if (options?.fallbackRoot && targetPath) {
              const recovered = await resolvePanelTarget(targetPath, options.fallbackRoot);
              if (reqId === requestIdRef.current && recovered !== targetPath) {
                if (options.fallbackPanel) {
                  updateTrackedPanelState(options.fallbackPanel, {
                    lastPath: recovered,
                    expandedPaths: [],
                    columnPaths: [],
                  });
                }
                void fetchDirectory(recovered, {
                  overrideShowHidden: includeHidden,
                  forceRefresh: true,
                });
              }
            }
          }
        })();

        return cached;
      }

      // Cache miss: defer showing spinner by 120ms so fast local folders (including empty ones) don't flash
      loadingTimerRef.current = window.setTimeout(() => {
        if (reqId === requestIdRef.current) {
          setPendingPath(targetPath ?? "");
          setLoading(true);
        }
      }, 120);

      try {
        const result = await invoke<DirectoryListing>("list_directory", {
          path: targetPath ?? null,
          showHidden: includeHidden,
        });
        if (loadingTimerRef.current !== null) {
          window.clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }
        setCachedDirectory(targetPath ?? result.currentPath, includeHidden, result);
        if (reqId !== requestIdRef.current) {
          return null;
        }
        setListing(result);
        setPendingPath(null);
        setLoading(false);
        return result;
      } catch (err) {
        if (loadingTimerRef.current !== null) {
          window.clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = null;
        }
        if (reqId !== requestIdRef.current) {
          return null;
        }
        setError(typeof err === "string" ? err : String(err));
        setPendingPath(null);
        setLoading(false);
        return null;
      }
    },
    [resolvePanelTarget, updateTrackedPanelState]
  );

  // Initial load: resolve sidebar locations, restore persisted state & open last panel/folder
  useEffect(() => {
    let active = true;
    (async () => {
      let resolvedLocations: SidebarLocations | null = null;
      let persisted: PersistedAppState | null = null;

      if (isTauriRuntime()) {
        const [locsResult, stateResult] = await Promise.allSettled([
          invoke<SidebarLocations>("get_sidebar_locations"),
          invoke<PersistedAppState>("load_app_state"),
        ]);
        if (locsResult.status === "fulfilled") {
          resolvedLocations = locsResult.value;
          if (active) setLocations(resolvedLocations);
        }
        if (stateResult.status === "fulfilled") {
          persisted = stateResult.value;
        }
      } else {
        resolvedLocations = MOCK_LOCATIONS;
        setLocations(MOCK_LOCATIONS);
      }

      if (!active) return;

      if (persisted?.panels) {
        panelStatesRef.current = persisted.panels;
      }

      let initialPanel: TrackedPanelId =
        persisted?.activePanel && isTrackedPanel(persisted.activePanel)
          ? persisted.activePanel
          : "home";
      let rootPath = getRootPathForPanel(initialPanel, resolvedLocations);
      if (rootPath === null) {
        initialPanel = "home";
        rootPath = getRootPathForPanel("home", resolvedLocations) ?? "";
      }

      const savedPanel = panelStatesRef.current[initialPanel];
      const initialViewMode = savedPanel?.viewMode ?? DEFAULT_VIEW_MODE;
      const initialSort = savedPanel?.sort ?? DEFAULT_SORT;
      const targetPath = await resolvePanelTarget(savedPanel?.lastPath, rootPath);
      const sameAsSaved = Boolean(
        savedPanel?.lastPath &&
          targetPath.toLowerCase() === savedPanel.lastPath.toLowerCase()
      );
      const initialExpanded = sameAsSaved ? (savedPanel?.expandedPaths ?? []) : [];
      const initialColumns = sameAsSaved ? (savedPanel?.columnPaths ?? []) : [];

      if (!active) return;

      lastTrackedPanelRef.current = initialPanel;
      activePanelRef.current = initialPanel;
      setActivePanel(initialPanel);
      setViewMode(initialViewMode);
      setSortConfig(initialSort);
      setExpandedPaths(initialExpanded);
      setColumnPaths(initialColumns);

      const data = await fetchDirectory(targetPath || undefined);
      if (active && data) {
        setHistory([{ path: data.currentPath, panel: initialPanel }]);
        setHistoryIndex(0);
        updateTrackedPanelState(initialPanel, {
          viewMode: initialViewMode,
          sort: initialSort,
          lastPath: data.currentPath,
          expandedPaths: initialExpanded,
          columnPaths: initialColumns,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchDirectory, resolvePanelTarget, updateTrackedPanelState]);

  const activePath = pendingPath ?? listing?.currentPath ?? "";

  const navigateTo = useCallback(
    async (path: string, panelOverride?: PanelId) => {
      const targetPanel = panelOverride ?? activePanelRef.current;
      if (activePath === path && activePanelRef.current === targetPanel && !error) return;
      setExpandedPaths([]);
      setColumnPaths([]);
      const data = await fetchDirectory(path);
      if (data) {
        setHistory((prev) => {
          const next = prev.slice(0, historyIndex + 1);
          next.push({ path: data.currentPath, panel: targetPanel });
          return next;
        });
        setHistoryIndex((idx) => idx + 1);
        if (isTrackedPanel(targetPanel)) {
          updateTrackedPanelState(targetPanel, {
            lastPath: data.currentPath,
            expandedPaths: [],
            columnPaths: [],
          });
        }
      }
    },
    [activePath, error, fetchDirectory, historyIndex, updateTrackedPanelState]
  );

  const handleSelectPanel = useCallback(
    async (panel: PanelId) => {
      const rootPath = getRootPathForPanel(panel, locations);
      if (rootPath === null) return;

      const wasSamePanel = activePanelRef.current === panel;
      activePanelRef.current = panel;
      setActivePanel(panel);

      if (isTrackedPanel(panel)) {
        const saved = panelStatesRef.current[panel];
        const nextViewMode = saved?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = saved?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        setViewMode(nextViewMode);
        setSortConfig(nextSort);

        // Clicking the already-active panel while inside a subfolder returns to its root
        let targetPath: string;
        if (wasSamePanel) {
          targetPath = rootPath;
        } else if (
          saved?.lastPath &&
          getCachedDirectory(saved.lastPath, showHiddenRef.current)
        ) {
          // Fast path: already cached in memory; background revalidation handles external deletion
          targetPath = saved.lastPath;
        } else {
          targetPath = await resolvePanelTarget(saved?.lastPath, rootPath);
        }

        if (activePath === targetPath && !error) {
          updateTrackedPanelState(panel, {
            viewMode: nextViewMode,
            sort: nextSort,
            lastPath: targetPath,
          });
          return;
        }

        const restoreSubState = Boolean(
          !wasSamePanel &&
            saved?.lastPath &&
            targetPath.toLowerCase() === saved.lastPath.toLowerCase()
        );
        const nextExpanded = restoreSubState ? (saved?.expandedPaths ?? []) : [];
        const nextColumns = restoreSubState ? (saved?.columnPaths ?? []) : [];
        setExpandedPaths(nextExpanded);
        setColumnPaths(nextColumns);

        const data = await fetchDirectory(targetPath || undefined, {
          fallbackRoot: rootPath,
          fallbackPanel: panel,
        });
        if (data) {
          setHistory((prev) => {
            const next = prev.slice(0, historyIndex + 1);
            next.push({ path: data.currentPath, panel });
            return next;
          });
          setHistoryIndex((idx) => idx + 1);
          updateTrackedPanelState(panel, {
            viewMode: nextViewMode,
            sort: nextSort,
            lastPath: data.currentPath,
            expandedPaths: nextExpanded,
            columnPaths: nextColumns,
          });
        }
      } else {
        // Excluded panels ("applications", "drives", "network"): keep session-only view/sort, never persist to ~/.winfinder
        const ephemeral = ephemeralPanelStatesRef.current[panel];
        const nextViewMode = ephemeral?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = ephemeral?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        setViewMode(nextViewMode);
        setSortConfig(nextSort);
        setExpandedPaths([]);
        setColumnPaths([]);
        if (activePath === rootPath && !error) return;
        const data = await fetchDirectory(rootPath);
        if (data) {
          setHistory((prev) => {
            const next = prev.slice(0, historyIndex + 1);
            next.push({ path: data.currentPath, panel });
            return next;
          });
          setHistoryIndex((idx) => idx + 1);
        }
      }
    },
    [
      activePath,
      error,
      fetchDirectory,
      historyIndex,
      locations,
      resolvePanelTarget,
      updateTrackedPanelState,
    ]
  );

  const handleExpandedPathsChange = useCallback(
    (paths: string[]) => {
      setExpandedPaths(paths);
      const panel = activePanelRef.current;
      if (isTrackedPanel(panel)) {
        updateTrackedPanelState(panel, { expandedPaths: paths });
      }
    },
    [updateTrackedPanelState]
  );

  const handleColumnPathsChange = useCallback(
    (paths: string[]) => {
      setColumnPaths(paths);
      const panel = activePanelRef.current;
      if (isTrackedPanel(panel)) {
        updateTrackedPanelState(panel, { columnPaths: paths });
      }
    },
    [updateTrackedPanelState]
  );

  const handleChangeViewMode = useCallback(
    (nextMode: ViewMode) => {
      viewModeRef.current = nextMode;
      setViewMode(nextMode);
      const panel = activePanelRef.current;
      if (isTrackedPanel(panel)) {
        updateTrackedPanelState(panel, { viewMode: nextMode });
      } else {
        const prev = ephemeralPanelStatesRef.current[panel];
        ephemeralPanelStatesRef.current[panel] = {
          viewMode: nextMode,
          sort: prev?.sort ?? sortConfigRef.current,
        };
      }
    },
    [updateTrackedPanelState]
  );

  const handleChangeSort = useCallback(
    (nextSort: SortConfig) => {
      sortConfigRef.current = nextSort;
      setSortConfig(nextSort);
      const panel = activePanelRef.current;
      if (isTrackedPanel(panel)) {
        updateTrackedPanelState(panel, { sort: nextSort });
      } else {
        const prev = ephemeralPanelStatesRef.current[panel];
        ephemeralPanelStatesRef.current[panel] = {
          viewMode: prev?.viewMode ?? viewModeRef.current,
          sort: nextSort,
        };
      }
    },
    [updateTrackedPanelState]
  );

  const handleOpenItem = useCallback(async (entry: FileEntry) => {
    if (!isTauriRuntime()) return;
    try {
      await invoke("open_item", {
        path: entry.path,
        entryKind: entry.entryKind,
      });
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    }
  }, []);

  const handleContextMenu = useCallback(
    async (entry: FileEntry) => {
      if (!isTauriRuntime()) return;
      try {
        const invoked = await invoke<boolean>("show_context_menu", {
          path: entry.path,
          entryKind: entry.entryKind,
        });
        if (
          invoked &&
          listing &&
          (listing.currentPath === "virtual://trash" || !listing.currentPath.startsWith("virtual://"))
        ) {
          invalidateCachedDirectory(listing.currentPath);
          void fetchDirectory(listing.currentPath, { forceRefresh: true });
        }
      } catch {
        // Ignore if shell context menu cannot be shown for a virtual entry
      }
    },
    [fetchDirectory, listing]
  );

  const handleShareWithOs = useCallback(async (entry: FileEntry) => {
    if (!isTauriRuntime()) return;
    try {
      await invoke("share_with_os", { path: entry.path });
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    }
  }, []);

  const handleCopyFile = useCallback(async (entry: FileEntry) => {
    if (!isTauriRuntime()) return;
    try {
      await invoke("copy_file_to_clipboard", { path: entry.path });
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    }
  }, []);

  const handleCopyPath = useCallback(async (entry: FileEntry) => {
    try {
      await navigator.clipboard.writeText(entry.path);
    } catch {
      // Clipboard API unavailable
    }
  }, []);

  const handleNewFolder = useCallback(async () => {
    if (!isTauriRuntime() || !listing || listing.currentPath.startsWith("virtual://")) return;
    try {
      const createdPath = await invoke<string>("create_new_folder", {
        parentPath: listing.currentPath,
      });
      invalidateCachedDirectory(listing.currentPath);
      const refreshed = await fetchDirectory(listing.currentPath, { forceRefresh: true });
      if (refreshed) {
        const createdEntry = refreshed.entries.find(
          (e) => e.path.toLowerCase() === createdPath.toLowerCase()
        );
        if (createdEntry) {
          setSelectedEntry(createdEntry);
        }
      }
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    }
  }, [fetchDirectory, listing]);

  const handleToggleShowHidden = useCallback(() => {
    const next = !showHiddenRef.current;
    setShowHidden(next);
    if (listing) {
      void fetchDirectory(listing.currentPath, { overrideShowHidden: next });
    }
  }, [fetchDirectory, listing]);

  const handleOpenInTerminal = useCallback(async () => {
    if (!isTauriRuntime()) return;
    const hasRealSelection = Boolean(
      selectedEntry &&
        selectedEntry.entryKind !== "app" &&
        !selectedEntry.path.startsWith("virtual://")
    );
    const targetPath =
      hasRealSelection && selectedEntry
        ? selectedEntry.path
        : listing && !listing.currentPath.startsWith("virtual://")
          ? listing.currentPath
          : null;
    if (!targetPath) return;
    try {
      await invoke("open_in_terminal", { path: targetPath });
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    }
  }, [listing, selectedEntry]);

  const handleCopyCurrentPath = useCallback(async () => {
    if (!listing || listing.currentPath.startsWith("virtual://")) return;
    try {
      await navigator.clipboard.writeText(listing.currentPath);
    } catch {
      // Clipboard API unavailable
    }
  }, [listing]);

  const handleShowInExplorer = useCallback(async () => {
    if (!isTauriRuntime() || !listing || listing.currentPath.startsWith("virtual://")) return;
    try {
      const hasRealSelection = Boolean(
        selectedEntry &&
          selectedEntry.entryKind !== "app" &&
          selectedEntry.entryKind !== "drive" &&
          !selectedEntry.path.startsWith("virtual://")
      );
      if (hasRealSelection && selectedEntry) {
        await invoke("reveal_in_file_manager", { path: selectedEntry.path, select: true });
      } else {
        await invoke("reveal_in_file_manager", { path: listing.currentPath, select: false });
      }
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    }
  }, [listing, selectedEntry]);

  const handleRefresh = useCallback(() => {
    if (listing) {
      invalidateCachedDirectory(listing.currentPath);
      void fetchDirectory(listing.currentPath, { forceRefresh: true });
    } else {
      void fetchDirectory(undefined, { forceRefresh: true });
    }
  }, [fetchDirectory, listing]);

  const handleEmptyTrash = useCallback(async () => {
    if (emptyingTrash) return;
    setEmptyingTrash(true);
    setError(null);
    try {
      if (isTauriRuntime()) {
        await invoke("empty_trash");
      } else {
        mockTrashEntriesRef.current = [];
      }
      invalidateCachedDirectory("virtual://trash");
      await fetchDirectory("virtual://trash", { forceRefresh: true });
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setEmptyingTrash(false);
    }
  }, [emptyingTrash, fetchDirectory]);

  const navigateHistoryTo = useCallback(
    async (nextIndex: number) => {
      const entry = history[nextIndex];
      if (!entry) return;
      const targetPanel = entry.panel;
      activePanelRef.current = targetPanel;
      setActivePanel(targetPanel);

      if (isTrackedPanel(targetPanel)) {
        const saved = panelStatesRef.current[targetPanel];
        const nextViewMode = saved?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = saved?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        setViewMode(nextViewMode);
        setSortConfig(nextSort);
        const sameAsSaved = Boolean(
          saved?.lastPath &&
            entry.path.toLowerCase() === saved.lastPath.toLowerCase()
        );
        setExpandedPaths(sameAsSaved ? (saved?.expandedPaths ?? []) : []);
        setColumnPaths(sameAsSaved ? (saved?.columnPaths ?? []) : []);
      } else {
        const ephemeral = ephemeralPanelStatesRef.current[targetPanel];
        const nextViewMode = ephemeral?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = ephemeral?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        setViewMode(nextViewMode);
        setSortConfig(nextSort);
        setExpandedPaths([]);
        setColumnPaths([]);
      }

      const data = await fetchDirectory(entry.path);
      if (data) {
        setHistoryIndex(nextIndex);
        if (isTrackedPanel(targetPanel)) {
          updateTrackedPanelState(targetPanel, { lastPath: data.currentPath });
        }
      }
    },
    [fetchDirectory, history, updateTrackedPanelState]
  );

  const handleBack = useCallback(async () => {
    if (historyIndex <= 0) return;
    await navigateHistoryTo(historyIndex - 1);
  }, [historyIndex, navigateHistoryTo]);

  const handleForward = useCallback(async () => {
    if (historyIndex >= history.length - 1) return;
    await navigateHistoryTo(historyIndex + 1);
  }, [history.length, historyIndex, navigateHistoryTo]);

  const handleWindowClose = useCallback(() => {
    if (isTauriRuntime()) {
      void getCurrentWindow().close();
    }
  }, []);

  const handleWindowMinimize = useCallback(() => {
    if (isTauriRuntime()) {
      void getCurrentWindow().minimize();
    }
  }, []);

  const handleWindowMaximize = useCallback(() => {
    if (isTauriRuntime()) {
      void getCurrentWindow().toggleMaximize();
    }
  }, []);

  // Keyboard support: Backspace or Alt+Left goes back
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey && e.key === "ArrowLeft") || (e.key === "Backspace" && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        void handleBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        void handleForward();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleBack, handleForward]);

  const isPendingNavigation = loading && pendingPath !== null;
  const displayTitle = isPendingNavigation
    ? labelForPendingPath(pendingPath, locations)
    : listing?.currentName ?? "Home";
  const loadingMessage =
    pendingPath === "virtual://applications"
      ? "Loading applications…"
      : "Loading…";

  return (
    <div className="finder-window" onContextMenu={(e) => e.preventDefault()}>
      <Sidebar
        locations={locations}
        activePanel={activePanel}
        width={sidebarWidth}
        onResizeWidth={setSidebarWidth}
        onSelectPanel={(panel) => void handleSelectPanel(panel)}
        onWindowClose={handleWindowClose}
        onWindowMinimize={handleWindowMinimize}
        onWindowMaximize={handleWindowMaximize}
      />

      <div className="finder-content-column">
        <Toolbar
          title={displayTitle}
          currentPath={activePath}
          canGoBack={historyIndex > 0}
          canGoForward={historyIndex < history.length - 1}
          viewMode={viewMode}
          sortConfig={sortConfig}
          showHidden={showHidden}
          selectedEntry={selectedEntry}
          onBack={() => void handleBack()}
          onForward={() => void handleForward()}
          onChangeViewMode={handleChangeViewMode}
          onChangeSort={handleChangeSort}
          onShareWithOs={(entry) => void handleShareWithOs(entry)}
          onCopyFile={(entry) => void handleCopyFile(entry)}
          onCopyPath={(entry) => void handleCopyPath(entry)}
          onNewFolder={() => void handleNewFolder()}
          onToggleShowHidden={handleToggleShowHidden}
          onOpenInTerminal={() => void handleOpenInTerminal()}
          onCopyCurrentPath={() => void handleCopyCurrentPath()}
          onShowInExplorer={() => void handleShowInExplorer()}
          onRefresh={handleRefresh}
        />

        <MainView
          currentPath={activePath}
          entries={isPendingNavigation ? [] : listing?.entries ?? []}
          breadcrumbs={
            isPendingNavigation && pendingPath
              ? [{ name: displayTitle, path: pendingPath }]
              : listing?.breadcrumbs ?? []
          }
          homePath={listing?.homePath ?? locations?.homePath ?? ""}
          selectedPath={selectedEntry?.path ?? null}
          viewMode={viewMode}
          sortConfig={sortConfig}
          showHidden={showHidden}
          expandedPaths={expandedPaths}
          columnPaths={columnPaths}
          loading={loading}
          loadingMessage={loadingMessage}
          error={error}
          emptyMessage={listing?.emptyMessage ?? null}
          onSelect={setSelectedEntry}
          onOpenFolder={(p) => void navigateTo(p)}
          onOpenItem={(entry) => void handleOpenItem(entry)}
          onContextMenu={(entry) => void handleContextMenu(entry)}
          onChangeSort={handleChangeSort}
          onExpandedPathsChange={handleExpandedPathsChange}
          onColumnPathsChange={handleColumnPathsChange}
          isTrashView={activePath === "virtual://trash"}
          emptyingTrash={emptyingTrash}
          onEmptyTrash={() => void handleEmptyTrash()}
        />
      </div>
    </div>
  );
};

export default App;
