import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AlertTriangle } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { MainView } from "./components/MainView";
import { FileIcon } from "./components/FileIcon";
import {
  getCachedDirectory,
  invalidateCachedDirectory,
  listingsEqual,
  setCachedDirectory,
} from "./utils/dirCache";
import {
  countBuiltInFavorites,
  isPathInFavorites,
  isPathWithinRoot,
  MAX_FAVORITES_ITEMS,
  normalizePathKey,
  type FavoriteDropState,
} from "./utils/favorites";
import {
  buildDescendantChain,
  resolveViewAnchorChain,
} from "./utils/pathChain";
import type {
  CustomFavoritePanelId,
  DirectoryListing,
  FavoriteFolder,
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

function isCustomFavoritePanel(panel: PanelId): panel is CustomFavoritePanelId {
  return (
    panel.startsWith("fav:") &&
    panel.slice(4).trim().length > 0 &&
    !panel.slice(4).trim().startsWith("virtual://")
  );
}

function isTrackedPanel(panel: PanelId): panel is TrackedPanelId {
  return TRACKED_PANEL_SET.has(panel) || isCustomFavoritePanel(panel);
}

function getRootPathForPanel(
  panel: PanelId,
  locs: SidebarLocations | null
): string | null {
  if (panel.startsWith("fav:")) {
    return panel.slice(4);
  }
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
    default:
      return null;
  }
}

const LOCAL_FAVORITES_STORAGE_KEY = "winfinder.customFavorites";

function loadBrowserCustomFavorites(): FavoriteFolder[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is FavoriteFolder =>
        Boolean(item) &&
        typeof item.name === "string" &&
        typeof item.path === "string" &&
        item.path.trim().length > 0
    );
  } catch {
    return [];
  }
}

interface InAppFolderDrag {
  folder: FavoriteFolder;
  clientX: number;
  clientY: number;
  dropState: FavoriteDropState;
}

const FOLDER_DRAG_THRESHOLD_PX = 6;

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
  const [revealRequest, setRevealRequest] = useState<{
    anchorRoot: string;
    path: string;
    seq: number;
  } | null>(null);
  const [customFavorites, setCustomFavorites] = useState<FavoriteFolder[]>([]);
  const [inAppDrag, setInAppDrag] = useState<InAppFolderDrag | null>(null);
  const [osDragOverFavorites, setOsDragOverFavorites] = useState<boolean>(false);
  const [missingFavorite, setMissingFavorite] = useState<FavoriteFolder | null>(null);
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
  const favoritesSectionRef = useRef<HTMLDivElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const locationsRef = useRef<SidebarLocations | null>(locations);
  locationsRef.current = locations;
  const listingRef = useRef<DirectoryListing | null>(listing);
  listingRef.current = listing;
  const customFavoritesRef = useRef<FavoriteFolder[]>(customFavorites);
  customFavoritesRef.current = customFavorites;
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
  const listingRef = useRef<DirectoryListing | null>(listing);
  listingRef.current = listing;
  const selectedEntryRef = useRef<FileEntry | null>(selectedEntry);
  selectedEntryRef.current = selectedEntry;
  const expandedPathsRef = useRef<string[]>(expandedPaths);
  expandedPathsRef.current = expandedPaths;
  const columnPathsRef = useRef<string[]>(columnPaths);
  columnPathsRef.current = columnPaths;
  const revealSeqRef = useRef(0);

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

  const persistCustomFavorites = useCallback((next: FavoriteFolder[]) => {
    if (isTauriRuntime()) {
      void invoke("save_custom_favorites", { favorites: next });
    } else {
      try {
        window.localStorage.setItem(LOCAL_FAVORITES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors in browser preview
      }
    }
  }, []);

  const handleAddFavorites = useCallback(
    (incoming: FavoriteFolder[]) => {
      if (incoming.length === 0) return;
      const locs = locationsRef.current;
      const current = customFavoritesRef.current;
      const builtInCount = countBuiltInFavorites(locs);
      const remainingSlots = MAX_FAVORITES_ITEMS - (builtInCount + current.length);
      if (remainingSlots <= 0) return;

      const toAdd: FavoriteFolder[] = [];
      const seenNew = new Set<string>();
      for (const item of incoming) {
        if (toAdd.length >= remainingSlots) break;
        const trimmedPath = item.path.trim();
        if (!trimmedPath || trimmedPath.startsWith("virtual://")) continue;
        const key = normalizePathKey(trimmedPath);
        if (seenNew.has(key)) continue;
        if (isPathInFavorites(trimmedPath, locs, current)) continue;
        seenNew.add(key);
        const name = item.name.trim() || labelForPendingPath(trimmedPath, locs);
        toAdd.push({ name, path: trimmedPath });
      }

      if (toAdd.length === 0) return;
      const next = [...current, ...toAdd];
      customFavoritesRef.current = next;
      setCustomFavorites(next);
      persistCustomFavorites(next);
    },
    [persistCustomFavorites]
  );

  const handleRemoveFavorite = useCallback(
    (targetPath: string) => {
      const targetKey = normalizePathKey(targetPath);
      const next = customFavoritesRef.current.filter(
        (fav) => normalizePathKey(fav.path) !== targetKey
      );
      if (next.length === customFavoritesRef.current.length) return;
      customFavoritesRef.current = next;
      setCustomFavorites(next);

      // Prune saved panel state for the removed custom favorite
      const nextPanelStates: Partial<Record<TrackedPanelId, PanelState>> = {};
      for (const [panelKey, state] of Object.entries(
        panelStatesRef.current
      ) as Array<[TrackedPanelId, PanelState | undefined]>) {
        if (
          !state ||
          (panelKey.startsWith("fav:") &&
            normalizePathKey(panelKey.slice(4)) === targetKey)
        ) {
          continue;
        }
        nextPanelStates[panelKey] = state;
      }
      panelStatesRef.current = nextPanelStates;

      let activeWasRemoved = false;
      if (
        activePanelRef.current.startsWith("fav:") &&
        normalizePathKey(activePanelRef.current.slice(4)) === targetKey
      ) {
        activeWasRemoved = true;
        activePanelRef.current = "home";
        setActivePanel("home");
      }
      if (
        lastTrackedPanelRef.current.startsWith("fav:") &&
        normalizePathKey(lastTrackedPanelRef.current.slice(4)) === targetKey
      ) {
        lastTrackedPanelRef.current = "home";
      }

      persistCustomFavorites(next);
      persistPanelStates(activeWasRemoved ? "home" : undefined);
    },
    [persistCustomFavorites, persistPanelStates]
  );

  // Pointer-event-based in-app folder drag-and-drop into Favorites (WebView2 compatible)
  const handleStartFolderDrag = useCallback(
    (folder: FavoriteFolder, downEvent: React.PointerEvent) => {
      dragCleanupRef.current?.();

      const startX = downEvent.clientX;
      const startY = downEvent.clientY;
      const pointerId = downEvent.pointerId;
      let dragging = false;

      const evaluatePoint = (clientX: number, clientY: number): FavoriteDropState => {
        const el = favoritesSectionRef.current;
        if (!el) return "none";
        const rect = el.getBoundingClientRect();
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        if (!inside) return "none";

        const locs = locationsRef.current;
        const current = customFavoritesRef.current;
        if (isPathInFavorites(folder.path, locs, current)) {
          return "duplicate";
        }
        if (countBuiltInFavorites(locs) + current.length >= MAX_FAVORITES_ITEMS) {
          return "full";
        }
        return "accept";
      };

      const setBodyDragClasses = (dropState: FavoriteDropState | null) => {
        document.body.classList.remove(
          "is-dragging-folder",
          "is-dragging-folder-accept",
          "is-dragging-folder-blocked"
        );
        if (dropState === null) return;
        document.body.classList.add("is-dragging-folder");
        if (dropState === "accept") {
          document.body.classList.add("is-dragging-folder-accept");
        } else if (dropState === "duplicate" || dropState === "full") {
          document.body.classList.add("is-dragging-folder-blocked");
        }
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("blur", onCancel);
        window.removeEventListener("keydown", onKeyDown, true);
        setBodyDragClasses(null);
        setInAppDrag(null);
        dragCleanupRef.current = null;
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        if (!dragging) {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (Math.hypot(dx, dy) < FOLDER_DRAG_THRESHOLD_PX) return;
          dragging = true;
        }
        const dropState = evaluatePoint(moveEvent.clientX, moveEvent.clientY);
        setBodyDragClasses(dropState);
        setInAppDrag({
          folder,
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
          dropState,
        });
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        const wasDragging = dragging;
        const finalDropState = wasDragging
          ? evaluatePoint(upEvent.clientX, upEvent.clientY)
          : "none";
        cleanup();

        if (wasDragging) {
          const suppressClick = (clickEvent: MouseEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
          };
          window.addEventListener("click", suppressClick, { capture: true, once: true });
          window.setTimeout(() => {
            window.removeEventListener("click", suppressClick, true);
          }, 0);

          if (finalDropState === "accept") {
            handleAddFavorites([folder]);
          }
        }
      };

      const onCancel = () => {
        cleanup();
      };

      const onKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === "Escape" && dragging) {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
          cleanup();
        }
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("blur", onCancel);
      window.addEventListener("keydown", onKeyDown, true);
      dragCleanupRef.current = cleanup;
    },
    [handleAddFavorites]
  );

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
    };
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

      const rawFavorites = isTauriRuntime()
        ? (persisted?.customFavorites ?? [])
        : loadBrowserCustomFavorites();
      const maxCustom = Math.max(0, MAX_FAVORITES_ITEMS - countBuiltInFavorites(resolvedLocations));
      const initialFavorites: FavoriteFolder[] = [];
      for (const fav of rawFavorites) {
        if (initialFavorites.length >= maxCustom) break;
        if (!fav.path || fav.path.startsWith("virtual://")) continue;
        if (isPathInFavorites(fav.path, resolvedLocations, initialFavorites)) continue;
        initialFavorites.push({
          name: fav.name.trim() || labelForPendingPath(fav.path, resolvedLocations),
          path: fav.path.trim(),
        });
      }
      customFavoritesRef.current = initialFavorites;
      setCustomFavorites(initialFavorites);

      let initialPanel: TrackedPanelId =
        persisted?.activePanel && isTrackedPanel(persisted.activePanel)
          ? persisted.activePanel
          : "home";
      if (isCustomFavoritePanel(initialPanel)) {
        const favKey = normalizePathKey(initialPanel.slice(4));
        const matchedFav = initialFavorites.find(
          (fav) => normalizePathKey(fav.path) === favKey
        );
        if (!matchedFav) {
          initialPanel = "home";
        } else {
          let favRootExists = true;
          if (isTauriRuntime()) {
            try {
              favRootExists = await invoke<boolean>("check_directory_exists", {
                path: matchedFav.path,
              });
            } catch {
              favRootExists = false;
            }
          }
          initialPanel = favRootExists ? (`fav:${matchedFav.path}` as CustomFavoritePanelId) : "home";
        }
      }
      let rootPath = getRootPathForPanel(initialPanel, resolvedLocations);
      if (rootPath === null) {
        initialPanel = "home";
        rootPath = getRootPathForPanel("home", resolvedLocations) ?? "";
      }

      const savedPanel = panelStatesRef.current[initialPanel];
      const initialViewMode = savedPanel?.viewMode ?? DEFAULT_VIEW_MODE;
      const initialSort = savedPanel?.sort ?? DEFAULT_SORT;
      const validSavedLastPath =
        savedPanel?.lastPath && isPathWithinRoot(savedPanel.lastPath, rootPath)
          ? savedPanel.lastPath
          : null;
      const targetPath = await resolvePanelTarget(validSavedLastPath, rootPath);
      const sameAsSaved = Boolean(
        validSavedLastPath &&
          targetPath.toLowerCase() === validSavedLastPath.toLowerCase()
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

  // Native OS drag-and-drop into the Favorites section (Tauri Webview)
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const isPointInFavorites = (pos: { x: number; y: number }): boolean => {
      const el = favoritesSectionRef.current;
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssX = pos.x / dpr;
      const cssY = pos.y / dpr;
      return (
        cssX >= rect.left &&
        cssX <= rect.right &&
        cssY >= rect.top &&
        cssY <= rect.bottom
      );
    };

    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelled) return;
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setOsDragOverFavorites(isPointInFavorites(payload.position));
        } else if (payload.type === "leave") {
          setOsDragOverFavorites(false);
        } else if (payload.type === "drop") {
          const inside = isPointInFavorites(payload.position);
          setOsDragOverFavorites(false);
          if (inside && payload.paths.length > 0) {
            void (async () => {
              try {
                const validDirs = await invoke<FavoriteFolder[]>("validate_favorite_dirs", {
                  paths: payload.paths,
                });
                if (validDirs.length > 0) {
                  handleAddFavorites(validDirs);
                }
              } catch {
                // Ignore invalid drop payload
              }
            })();
          }
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {
        // Ignore if drag-drop listener is unavailable
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [handleAddFavorites]);

  const activePath = pendingPath ?? listing?.currentPath ?? "";

  const navigateTo = useCallback(
    async (path: string, panelOverride?: PanelId) => {
      const targetPanel = panelOverride ?? activePanelRef.current;
      if (activePath === path && activePanelRef.current === targetPanel && !error) return;
      setRevealRequest(null);
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
          const rootPath = getRootPathForPanel(targetPanel, locationsRef.current);
          const withinRoot = rootPath
            ? isPathWithinRoot(data.currentPath, rootPath)
            : true;
          updateTrackedPanelState(targetPanel, {
            lastPath:
              !withinRoot && isCustomFavoritePanel(targetPanel)
                ? rootPath
                : data.currentPath,
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

      if (panel.startsWith("fav:")) {
        if (isTauriRuntime()) {
          try {
            const exists = await invoke<boolean>("check_directory_exists", {
              path: rootPath,
            });
            if (!exists) {
              const targetKey = normalizePathKey(rootPath);
              const matched = customFavoritesRef.current.find(
                (f) => normalizePathKey(f.path) === targetKey
              );
              setMissingFavorite(
                matched ?? {
                  name: labelForPendingPath(rootPath, locations),
                  path: rootPath,
                }
              );
              return;
            }
          } catch {
            // Fall through to normal fetch if check fails unexpectedly
          }
        }
      }

      const wasSamePanel = activePanelRef.current === panel;
      activePanelRef.current = panel;
      setActivePanel(panel);
      setRevealRequest(null);

      if (isTrackedPanel(panel)) {
        const saved = panelStatesRef.current[panel];
        const nextViewMode = saved?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = saved?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        setViewMode(nextViewMode);
        setSortConfig(nextSort);

        const validSavedLastPath =
          saved?.lastPath && isPathWithinRoot(saved.lastPath, rootPath)
            ? saved.lastPath
            : null;

        // Clicking the already-active panel while inside a subfolder returns to its root
        let targetPath: string;
        if (wasSamePanel) {
          targetPath = rootPath;
        } else if (
          validSavedLastPath &&
          getCachedDirectory(validSavedLastPath, showHiddenRef.current)
        ) {
          // Fast path: already cached in memory; background revalidation handles external deletion
          targetPath = validSavedLastPath;
        } else {
          targetPath = await resolvePanelTarget(validSavedLastPath, rootPath);
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
            validSavedLastPath &&
            targetPath.toLowerCase() === validSavedLastPath.toLowerCase()
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
        const rootPath = getRootPathForPanel(panel, locationsRef.current);
        const currentPath = listingRef.current?.currentPath;
        if (
          !isCustomFavoritePanel(panel) ||
          !rootPath ||
          !currentPath ||
          isPathWithinRoot(currentPath, rootPath)
        ) {
          updateTrackedPanelState(panel, { expandedPaths: paths });
        }
      }
    },
    [updateTrackedPanelState]
  );

  const handleColumnPathsChange = useCallback(
    (paths: string[]) => {
      setColumnPaths(paths);
      const panel = activePanelRef.current;
      if (isTrackedPanel(panel)) {
        const rootPath = getRootPathForPanel(panel, locationsRef.current);
        const currentPath = listingRef.current?.currentPath;
        if (
          !isCustomFavoritePanel(panel) ||
          !rootPath ||
          !currentPath ||
          isPathWithinRoot(currentPath, rootPath)
        ) {
          updateTrackedPanelState(panel, { columnPaths: paths });
        }
      }
    },
    [updateTrackedPanelState]
  );

  const handleChangeViewMode = useCallback(
    (nextMode: ViewMode) => {
      const prevMode = viewModeRef.current;
      viewModeRef.current = nextMode;
      setViewMode(nextMode);
      const panel = activePanelRef.current;
      const currentListing = listingRef.current;

      const persistEphemeral = () => {
        const prev = ephemeralPanelStatesRef.current[panel];
        ephemeralPanelStatesRef.current[panel] = {
          viewMode: nextMode,
          sort: prev?.sort ?? sortConfigRef.current,
        };
      };

      if ((nextMode === "list" || nextMode === "columns") && currentListing) {
        const panelRoot = getRootPathForPanel(panel, locationsRef.current);
        const chain = resolveViewAnchorChain(
          currentListing.currentPath,
          currentListing.breadcrumbs,
          panelRoot
        );

        if (chain) {
          const nextExpanded = nextMode === "list" ? chain.descendantPaths : [];
          const nextColumns = nextMode === "columns" ? chain.descendantPaths : [];
          expandedPathsRef.current = nextExpanded;
          columnPathsRef.current = nextColumns;
          setExpandedPaths(nextExpanded);
          setColumnPaths(nextColumns);
          setRevealRequest({
            anchorRoot: chain.anchorRoot,
            path: chain.targetPath,
            seq: ++revealSeqRef.current,
          });

          if (isTrackedPanel(panel)) {
            updateTrackedPanelState(panel, {
              viewMode: nextMode,
              lastPath: chain.anchorRoot,
              expandedPaths: nextExpanded,
              columnPaths: nextColumns,
            });
          } else {
            persistEphemeral();
          }

          void fetchDirectory(chain.anchorRoot);
          return;
        }

        // Already anchored at root: keep tree and Miller columns in sync when toggling between List and Columns
        if (nextMode === "list" && prevMode === "columns" && columnPathsRef.current.length > 0) {
          const synced = [...columnPathsRef.current];
          expandedPathsRef.current = synced;
          setExpandedPaths(synced);
          setRevealRequest({
            anchorRoot: currentListing.currentPath,
            path: synced[synced.length - 1],
            seq: ++revealSeqRef.current,
          });
          if (isTrackedPanel(panel)) {
            updateTrackedPanelState(panel, {
              viewMode: nextMode,
              expandedPaths: synced,
            });
          } else {
            persistEphemeral();
          }
          return;
        }

        if (nextMode === "columns" && prevMode === "list") {
          const sel = selectedEntryRef.current;
          const targetDir =
            sel && sel.isDir
              ? sel.path
              : expandedPathsRef.current.length > 0
                ? expandedPathsRef.current[expandedPathsRef.current.length - 1]
                : null;
          const subChain = targetDir
            ? buildDescendantChain(currentListing.currentPath, targetDir)
            : null;
          if (subChain && subChain.length > 0) {
            columnPathsRef.current = subChain;
            setColumnPaths(subChain);
            setRevealRequest({
              anchorRoot: currentListing.currentPath,
              path: subChain[subChain.length - 1],
              seq: ++revealSeqRef.current,
            });
            if (isTrackedPanel(panel)) {
              updateTrackedPanelState(panel, {
                viewMode: nextMode,
                columnPaths: subChain,
              });
            } else {
              persistEphemeral();
            }
            return;
          }
        }
      }

      if (isTrackedPanel(panel)) {
        updateTrackedPanelState(panel, { viewMode: nextMode });
      } else {
        persistEphemeral();
      }
    },
    [fetchDirectory, updateTrackedPanelState]
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
      setRevealRequest(null);

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
          const rootPath = getRootPathForPanel(targetPanel, locationsRef.current);
          const withinRoot = rootPath
            ? isPathWithinRoot(data.currentPath, rootPath)
            : true;
          updateTrackedPanelState(targetPanel, {
            lastPath:
              !withinRoot && isCustomFavoritePanel(targetPanel)
                ? rootPath
                : data.currentPath,
          });
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

  // Keyboard support: Backspace or Alt+Left goes back; dialog Escape/Enter handling
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (missingFavorite) {
        if (e.key === "Escape") {
          e.preventDefault();
          setMissingFavorite(null);
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleRemoveFavorite(missingFavorite.path);
          setMissingFavorite(null);
        }
        return;
      }
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
  }, [handleBack, handleForward, handleRemoveFavorite, missingFavorite]);

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
        customFavorites={customFavorites}
        inAppDropState={inAppDrag?.dropState ?? "none"}
        osDragOverFavorites={osDragOverFavorites}
        favoritesSectionRef={favoritesSectionRef}
        width={sidebarWidth}
        onResizeWidth={setSidebarWidth}
        onSelectPanel={(panel) => void handleSelectPanel(panel)}
        onRemoveFavorite={handleRemoveFavorite}
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
          revealRequest={revealRequest}
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
          onStartFolderDrag={handleStartFolderDrag}
          isTrashView={activePath === "virtual://trash"}
          emptyingTrash={emptyingTrash}
          onEmptyTrash={() => void handleEmptyTrash()}
        />
      </div>

      {inAppDrag && (
        <div
          className={`folder-drag-ghost ${
            inAppDrag.dropState === "accept"
              ? "is-accept"
              : inAppDrag.dropState === "duplicate" || inAppDrag.dropState === "full"
                ? "is-blocked"
                : ""
          }`}
          style={{
            transform: `translate3d(${inAppDrag.clientX + 14}px, ${inAppDrag.clientY + 12}px, 0)`,
          }}
          aria-hidden="true"
        >
          <FileIcon
            name={inAppDrag.folder.name}
            isDir
            entryKind="folder"
            extension={null}
            iconDataUrl={null}
            size={18}
          />
          <span className="folder-drag-ghost-label">{inAppDrag.folder.name}</span>
          {inAppDrag.dropState === "accept" && (
            <span className="folder-drag-ghost-badge">+</span>
          )}
        </div>
      )}

      {missingFavorite && (
        <div
          className="finder-dialog-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setMissingFavorite(null);
            }
          }}
        >
          <div
            className="finder-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="missing-fav-title"
            aria-describedby="missing-fav-desc"
          >
            <div className="finder-dialog-icon" aria-hidden="true">
              <AlertTriangle size={28} strokeWidth={1.8} />
            </div>
            <h2 id="missing-fav-title" className="finder-dialog-title">
              &ldquo;{missingFavorite.name}&rdquo; can&apos;t be opened because the original folder can&apos;t be found.
            </h2>
            <p id="missing-fav-desc" className="finder-dialog-message">
              The directory <span className="finder-dialog-path">{missingFavorite.path}</span> no longer exists. Would you like to remove it from Favorites?
            </p>
            <div className="finder-dialog-actions">
              <button
                type="button"
                className="finder-dialog-btn"
                onClick={() => setMissingFavorite(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="finder-dialog-btn finder-dialog-btn-primary"
                onClick={() => {
                  handleRemoveFavorite(missingFavorite.path);
                  setMissingFavorite(null);
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
