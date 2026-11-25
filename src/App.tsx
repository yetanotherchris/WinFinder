import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { AlertTriangle } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { TabBar, type TabBarItem } from "./components/TabBar";
import { MainView } from "./components/MainView";
import { FileIcon } from "./components/FileIcon";
import { SettingsDialog } from "./components/SettingsDialog";
import { GoToPathModal } from "./components/GoToPathModal";
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
import {
  DEFAULT_SIDEBAR_VISIBILITY,
  normalizeSidebarVisibility,
} from "./utils/sidebarVisibility";
import type {
  AppSettings,
  BitlockerNotice,
  ContextMenuResult,
  CustomFavoritePanelId,
  DirectoryListing,
  FavoriteFolder,
  FileEntry,
  PanelId,
  PanelState,
  PersistedAppState,
  ResolvedGoToPath,
  SidebarLocations,
  SortConfig,
  ThemeMode,
  TrackedPanelId,
  UnlockDriveResult,
  ViewMode,
} from "./types";

const BITLOCKER_LOCKED_PREFIX = "BITLOCKER_LOCKED:";

function parseBitlockerLockedDrive(err: unknown): string | null {
  const raw = typeof err === "string" ? err : String(err);
  if (raw.startsWith(BITLOCKER_LOCKED_PREFIX)) {
    const root = raw.slice(BITLOCKER_LOCKED_PREFIX.length).trim();
    return root || null;
  }
  return null;
}

function normalizeTheme(value: unknown): ThemeMode {
  return value === "dark" ? "dark" : "light";
}

const DEFAULT_SETTINGS: AppSettings = {
  useWindowsWindowControls: false,
  sidebarVisibility: DEFAULT_SIDEBAR_VISIBILITY,
  useEverythingCli: null,
  theme: "light",
  useBeigeAppIcon: false,
};

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
const LOCAL_SETTINGS_STORAGE_KEY = "winfinder.settings";

function loadBrowserSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(LOCAL_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      useWindowsWindowControls: Boolean(parsed?.useWindowsWindowControls),
      sidebarVisibility: normalizeSidebarVisibility(parsed?.sidebarVisibility),
      useEverythingCli:
        typeof parsed?.useEverythingCli === "boolean"
          ? parsed.useEverythingCli
          : null,
      theme: normalizeTheme(parsed?.theme),
      useBeigeAppIcon: Boolean(parsed?.useBeigeAppIcon),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

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

interface InAppItemDrag {
  entry: FileEntry;
  clientX: number;
  clientY: number;
  dropState: FavoriteDropState;
  dropTargetFolderPath: string | null;
  dropTargetFolderName: string | null;
}

const FOLDER_DRAG_THRESHOLD_PX = 6;

interface HistoryEntry {
  path: string;
  panel: PanelId;
}

interface RevealRequest {
  anchorRoot: string;
  path: string;
  seq: number;
}

interface TabState {
  id: string;
  activePanel: PanelId;
  listing: DirectoryListing | null;
  pendingPath: string | null;
  history: HistoryEntry[];
  historyIndex: number;
  selectedEntry: FileEntry | null;
  viewMode: ViewMode;
  sortConfig: SortConfig;
  expandedPaths: string[];
  columnPaths: string[];
  revealRequest: RevealRequest | null;
  loading: boolean;
  error: string | null;
  bitlockerNotice: BitlockerNotice | null;
  searchOpen: boolean;
  searchQuery: string;
  searchIncludeSubfolders: boolean;
  searchListing: DirectoryListing | null;
  searchLoading: boolean;
  searchError: string | null;
}

function createTabState(id: string, overrides?: Partial<TabState>): TabState {
  return {
    id,
    activePanel: "home",
    listing: null,
    pendingPath: null,
    history: [],
    historyIndex: -1,
    selectedEntry: null,
    viewMode: DEFAULT_VIEW_MODE,
    sortConfig: DEFAULT_SORT,
    expandedPaths: [],
    columnPaths: [],
    revealRequest: null,
    loading: true,
    error: null,
    bitlockerNotice: null,
    searchOpen: false,
    searchQuery: "",
    searchIncludeSubfolders: true,
    searchListing: null,
    searchLoading: false,
    searchError: null,
    ...overrides,
  };
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

function isSameOrSubpath(targetKey: string, rootKey: string): boolean {
  if (!rootKey) return false;
  if (targetKey === rootKey) return true;
  const sep =
    rootKey.endsWith("\\") || rootKey.endsWith("/")
      ? ""
      : rootKey.includes("\\")
        ? "\\"
        : "/";
  return targetKey.startsWith(`${rootKey}${sep}`);
}

function matchPanelForPath(
  targetPath: string,
  locs: SidebarLocations | null,
  customFavorites: FavoriteFolder[]
): PanelId {
  const targetKey = normalizePathKey(targetPath);
  const candidates: Array<{ panel: PanelId; key: string }> = [];

  if (locs?.desktopPath) {
    candidates.push({ panel: "desktop", key: normalizePathKey(locs.desktopPath) });
  }
  if (locs?.documentsPath) {
    candidates.push({ panel: "documents", key: normalizePathKey(locs.documentsPath) });
  }
  if (locs?.downloadsPath) {
    candidates.push({ panel: "downloads", key: normalizePathKey(locs.downloadsPath) });
  }
  for (const fav of customFavorites) {
    candidates.push({ panel: `fav:${fav.path}`, key: normalizePathKey(fav.path) });
  }
  if (locs?.homePath) {
    candidates.push({ panel: "home", key: normalizePathKey(locs.homePath) });
  }

  let best: { panel: PanelId; keyLen: number } | null = null;
  for (const candidate of candidates) {
    if (isSameOrSubpath(targetKey, candidate.key)) {
      if (!best || candidate.key.length > best.keyLen) {
        best = { panel: candidate.panel, keyLen: candidate.key.length };
      }
    }
  }

  if (best) return best.panel;
  if (targetPath.startsWith("\\\\")) return "network";
  return "drives";
}

function panelForAnyPath(
  targetPath: string,
  locs: SidebarLocations | null,
  customFavorites: FavoriteFolder[]
): PanelId {
  if (targetPath === "virtual://recents") return "recents";
  if (targetPath === "virtual://applications") return "applications";
  if (targetPath === "virtual://computer") return "drives";
  if (targetPath === "virtual://network") return "network";
  if (targetPath === "virtual://trash") return "trash";
  return matchPanelForPath(targetPath, locs, customFavorites);
}

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

function isRenamableEntry(entry: FileEntry | null, isTrash: boolean): boolean {
  if (!entry || isTrash) return false;
  if (entry.entryKind !== "file" && entry.entryKind !== "folder") return false;
  if (
    entry.path.startsWith("virtual://") ||
    entry.path.startsWith("app://") ||
    entry.path.startsWith("trash://")
  ) {
    return false;
  }
  return true;
}

function replacePathPrefix(candidate: string, oldPrefix: string, newPrefix: string): string {
  const candKey = normalizePathKey(candidate);
  const oldKey = normalizePathKey(oldPrefix);
  if (candKey === oldKey) return newPrefix;
  if (isSameOrSubpath(candKey, oldKey)) {
    const trimmedOld = oldPrefix.replace(/[\\/]+$/, "");
    const trimmedNew = newPrefix.replace(/[\\/]+$/, "");
    return `${trimmedNew}${candidate.slice(trimmedOld.length)}`;
  }
  return candidate;
}

function getParentDirPath(itemPath: string): string | null {
  const trimmed = itemPath.replace(/[\\/]+$/, "");
  const lastSep = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (lastSep <= 0) return null;
  const parent = trimmed.slice(0, lastSep);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent;
}

export const App: React.FC = () => {
  const [locations, setLocations] = useState<SidebarLocations | null>(null);
  const [tabs, setTabs] = useState<TabState[]>(() => [createTabState("tab-1")]);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");
  const [tabBarPinned, setTabBarPinned] = useState<boolean>(false);
  const nextTabIdRef = useRef<number>(2);
  const tabsRef = useRef<TabState[]>(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef<string>(activeTabId);
  activeTabIdRef.current = activeTabId;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const listing = activeTab.listing;
  const pendingPath = activeTab.pendingPath;
  const activePanel = activeTab.activePanel;
  const history = activeTab.history;
  const historyIndex = activeTab.historyIndex;
  const selectedEntry = activeTab.selectedEntry;
  const viewMode = activeTab.viewMode;
  const sortConfig = activeTab.sortConfig;
  const expandedPaths = activeTab.expandedPaths;
  const columnPaths = activeTab.columnPaths;
  const revealRequest = activeTab.revealRequest;
  const loading = activeTab.loading;
  const error = activeTab.error;
  const bitlockerNotice = activeTab.bitlockerNotice;
  const searchOpen = activeTab.searchOpen;
  const searchQuery = activeTab.searchQuery;
  const searchIncludeSubfolders = activeTab.searchIncludeSubfolders;
  const searchListing = activeTab.searchListing;
  const searchLoading = activeTab.searchLoading;
  const searchError = activeTab.searchError;

  const updateTab = useCallback(
    (tabId: string, updater: Partial<TabState> | ((prev: TabState) => TabState)) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== tabId) return tab;
          return typeof updater === "function" ? updater(tab) : { ...tab, ...updater };
        })
      );
    },
    []
  );

  const updateActiveTab = useCallback(
    (updater: Partial<TabState> | ((prev: TabState) => TabState)) => {
      updateTab(activeTabIdRef.current, updater);
    },
    [updateTab]
  );

  const setSelectedEntry = useCallback(
    (entry: FileEntry | null) => {
      updateActiveTab({ selectedEntry: entry });
    },
    [updateActiveTab]
  );

  const setError = useCallback(
    (nextError: string | null) => {
      updateActiveTab({ error: nextError });
    },
    [updateActiveTab]
  );

  const setBitlockerNotice = useCallback(
    (notice: BitlockerNotice | null) => {
      updateActiveTab({ bitlockerNotice: notice });
    },
    [updateActiveTab]
  );

  const [sidebarWidth, setSidebarWidth] = useState<number>(204);
  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [customFavorites, setCustomFavorites] = useState<FavoriteFolder[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [isWindowMaximized, setIsWindowMaximized] = useState<boolean>(false);
  const [inAppDrag, setInAppDrag] = useState<InAppItemDrag | null>(null);
  const [osDragOverFavorites, setOsDragOverFavorites] = useState<boolean>(false);
  const [missingFavorite, setMissingFavorite] = useState<FavoriteFolder | null>(null);
  const [goToPathOpen, setGoToPathOpen] = useState<boolean>(false);
  const [emptyingTrash, setEmptyingTrash] = useState<boolean>(false);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);
  const renamingPathRef = useRef<string | null>(renamingPath);
  renamingPathRef.current = renamingPath;
  const [refreshSeq, setRefreshSeq] = useState<number>(0);
  const mockClipboardRef = useRef<FileEntry | null>(null);
  const moveItemHandlerRef = useRef<((entry: FileEntry, destDir: string) => Promise<void>) | null>(
    null
  );
  const unlockingDriveRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchRequestIdByTabRef = useRef<Map<string, number>>(new Map());
  const searchDebounceByTabRef = useRef<Map<string, number>>(new Map());
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
  const requestIdByTabRef = useRef<Map<string, number>>(new Map());
  const loadingTimerByTabRef = useRef<Map<string, number>>(new Map());
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

  const handleUpdateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    if (isTauriRuntime()) {
      void invoke("save_settings", { settings: next });
    } else {
      try {
        window.localStorage.setItem(LOCAL_SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage errors in browser preview
      }
    }
  }, []);

  useEffect(() => {
    const theme = normalizeTheme(settings.theme);
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  }, [settings.theme]);

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
      }
      setTabs((prev) =>
        prev.map((tab) =>
          tab.activePanel.startsWith("fav:") &&
          normalizePathKey(tab.activePanel.slice(4)) === targetKey
            ? { ...tab, activePanel: "home" }
            : tab
        )
      );
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

  // Pointer-event-based in-app drag-and-drop for files and folders (into folders, breadcrumbs, or Favorites)
  const handleStartItemDrag = useCallback(
    (entry: FileEntry, downEvent: React.PointerEvent) => {
      dragCleanupRef.current?.();

      const startX = downEvent.clientX;
      const startY = downEvent.clientY;
      const pointerId = downEvent.pointerId;
      let dragging = false;

      const evaluatePoint = (
        clientX: number,
        clientY: number
      ): {
        dropState: FavoriteDropState;
        dropTargetFolderPath: string | null;
        dropTargetFolderName: string | null;
      } => {
        // 1. Check Favorites sidebar drop zone (folders only)
        if (entry.isDir) {
          const favEl = favoritesSectionRef.current;
          if (favEl) {
            const rect = favEl.getBoundingClientRect();
            const inside =
              clientX >= rect.left &&
              clientX <= rect.right &&
              clientY >= rect.top &&
              clientY <= rect.bottom;
            if (inside) {
              const locs = locationsRef.current;
              const current = customFavoritesRef.current;
              if (isPathInFavorites(entry.path, locs, current)) {
                return {
                  dropState: "duplicate",
                  dropTargetFolderPath: null,
                  dropTargetFolderName: null,
                };
              }
              if (countBuiltInFavorites(locs) + current.length >= MAX_FAVORITES_ITEMS) {
                return {
                  dropState: "full",
                  dropTargetFolderPath: null,
                  dropTargetFolderName: null,
                };
              }
              return {
                dropState: "accept",
                dropTargetFolderPath: null,
                dropTargetFolderName: null,
              };
            }
          }
        }

        // 2. Check folder drop targets in main view / breadcrumbs / Miller columns
        const elements = document.elementsFromPoint(clientX, clientY);
        const srcKey = normalizePathKey(entry.path);
        const srcParent = getParentDirPath(entry.path);
        const srcParentKey = srcParent ? normalizePathKey(srcParent) : null;

        for (const el of elements) {
          const targetEl = (el as HTMLElement).closest?.("[data-drop-folder-path]") as HTMLElement | null;
          if (!targetEl) continue;
          const targetPath = targetEl.getAttribute("data-drop-folder-path");
          if (!targetPath || targetPath.startsWith("virtual://")) continue;
          const targetKey = normalizePathKey(targetPath);
          if (targetKey === srcKey) continue;
          if (srcParentKey && targetKey === srcParentKey) continue;
          if (entry.isDir && isPathWithinRoot(targetPath, entry.path)) continue;

          const targetName =
            targetEl.getAttribute("data-drop-folder-name") ||
            labelForPendingPath(targetPath, locationsRef.current);
          return {
            dropState: "none",
            dropTargetFolderPath: targetPath,
            dropTargetFolderName: targetName,
          };
        }

        return {
          dropState: "none",
          dropTargetFolderPath: null,
          dropTargetFolderName: null,
        };
      };

      const setBodyDragClasses = (
        dropState: FavoriteDropState | null,
        hasFolderTarget: boolean
      ) => {
        document.body.classList.remove(
          "is-dragging-folder",
          "is-dragging-folder-accept",
          "is-dragging-folder-blocked"
        );
        if (dropState === null) return;
        document.body.classList.add("is-dragging-folder");
        if (dropState === "accept" || hasFolderTarget) {
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
        setBodyDragClasses(null, false);
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
        const evalRes = evaluatePoint(moveEvent.clientX, moveEvent.clientY);
        setBodyDragClasses(evalRes.dropState, evalRes.dropTargetFolderPath !== null);
        setInAppDrag({
          entry,
          clientX: moveEvent.clientX,
          clientY: moveEvent.clientY,
          dropState: evalRes.dropState,
          dropTargetFolderPath: evalRes.dropTargetFolderPath,
          dropTargetFolderName: evalRes.dropTargetFolderName,
        });
      };

      const onPointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        const wasDragging = dragging;
        const finalEval = wasDragging
          ? evaluatePoint(upEvent.clientX, upEvent.clientY)
          : { dropState: "none" as FavoriteDropState, dropTargetFolderPath: null, dropTargetFolderName: null };
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

          if (entry.isDir && finalEval.dropState === "accept") {
            handleAddFavorites([{ name: entry.name, path: entry.path }]);
          } else if (finalEval.dropTargetFolderPath) {
            void moveItemHandlerRef.current?.(entry, finalEval.dropTargetFolderPath);
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

  const handleUnlockBitlockerDrive = useCallback(
    async (targetPath: string, driveRootHint?: string): Promise<boolean> => {
      if (!isTauriRuntime()) return false;
      const driveKey = (driveRootHint ?? targetPath).trim().toLowerCase();
      if (unlockingDriveRef.current === driveKey) {
        return false;
      }
      unlockingDriveRef.current = driveKey;
      try {
        const result = await invoke<UnlockDriveResult>("unlock_bitlocker_drive", {
          path: driveRootHint ?? targetPath,
        });
        if (result.unlocked) {
          setBitlockerNotice(null);
          setError(null);
          invalidateCachedDirectory("virtual://computer");
          invalidateCachedDirectory(result.driveRoot);
          invalidateCachedDirectory(targetPath);
          return true;
        }
        setBitlockerNotice({
          driveRoot: result.driveRoot,
          targetPath,
          message:
            result.message ??
            `Drive ${result.driveRoot} is locked with BitLocker.`,
        });
        return false;
      } catch (unlockErr) {
        const msg =
          typeof unlockErr === "string" ? unlockErr : String(unlockErr);
        setBitlockerNotice({
          driveRoot: driveRootHint ?? targetPath,
          targetPath,
          message: msg,
        });
        return false;
      } finally {
        if (unlockingDriveRef.current === driveKey) {
          unlockingDriveRef.current = null;
        }
      }
    },
    []
  );

  const fetchDirectory = useCallback(
    async (
      targetPath?: string,
      options?: {
        tabId?: string;
        overrideShowHidden?: boolean;
        forceRefresh?: boolean;
        fallbackRoot?: string;
        fallbackPanel?: TrackedPanelId;
      }
    ): Promise<DirectoryListing | null> => {
      const tabId = options?.tabId ?? activeTabIdRef.current;
      const reqId = (requestIdByTabRef.current.get(tabId) ?? 0) + 1;
      requestIdByTabRef.current.set(tabId, reqId);
      const includeHidden = options?.overrideShowHidden ?? showHiddenRef.current;
      const forceRefresh = options?.forceRefresh ?? false;

      const existingTimer = loadingTimerByTabRef.current.get(tabId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
        loadingTimerByTabRef.current.delete(tabId);
      }

      updateTab(tabId, {
        error: null,
        bitlockerNotice: null,
        selectedEntry: null,
      });

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
          updateTab(tabId, {
            listing: mockTrashListing,
            pendingPath: null,
            loading: false,
          });
          return mockTrashListing;
        }
        const mockListing: DirectoryListing =
          targetPath && targetPath !== "~"
            ? {
                ...MOCK_PREVIEW_LISTING,
                currentPath: targetPath,
                currentName: labelForPendingPath(targetPath, locationsRef.current),
                breadcrumbs: targetPath.startsWith("virtual://")
                  ? [{ name: labelForPendingPath(targetPath, locationsRef.current), path: targetPath }]
                  : [
                      { name: "Home", path: "~" },
                      { name: labelForPendingPath(targetPath, locationsRef.current), path: targetPath },
                    ],
              }
            : MOCK_PREVIEW_LISTING;
        updateTab(tabId, {
          listing: mockListing,
          pendingPath: null,
          loading: false,
        });
        return mockListing;
      }

      const cached =
        !forceRefresh && targetPath
          ? getCachedDirectory(targetPath, includeHidden)
          : undefined;

      if (cached) {
        // Stale-while-revalidate: render cached directory immediately with zero flicker
        updateTab(tabId, {
          listing: cached,
          pendingPath: null,
          loading: false,
        });

        void (async () => {
          try {
            const fresh = await invoke<DirectoryListing>("list_directory", {
              path: targetPath ?? null,
              showHidden: includeHidden,
            });
            setCachedDirectory(targetPath ?? fresh.currentPath, includeHidden, fresh);
            if (reqId !== requestIdByTabRef.current.get(tabId)) return;
            if (!listingsEqual(cached, fresh)) {
              updateTab(tabId, { listing: fresh });
            }
          } catch {
            if (targetPath) invalidateCachedDirectory(targetPath);
            if (reqId !== requestIdByTabRef.current.get(tabId)) return;
            if (options?.fallbackRoot && targetPath) {
              const recovered = await resolvePanelTarget(targetPath, options.fallbackRoot);
              if (reqId === requestIdByTabRef.current.get(tabId) && recovered !== targetPath) {
                if (options.fallbackPanel) {
                  updateTrackedPanelState(options.fallbackPanel, {
                    lastPath: recovered,
                    expandedPaths: [],
                    columnPaths: [],
                  });
                }
                void fetchDirectory(recovered, {
                  tabId,
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
      const timerId = window.setTimeout(() => {
        if (reqId === requestIdByTabRef.current.get(tabId)) {
          updateTab(tabId, {
            pendingPath: targetPath ?? "",
            loading: true,
          });
        }
      }, 120);
      loadingTimerByTabRef.current.set(tabId, timerId);

      try {
        const result = await invoke<DirectoryListing>("list_directory", {
          path: targetPath ?? null,
          showHidden: includeHidden,
        });
        const activeTimer = loadingTimerByTabRef.current.get(tabId);
        if (activeTimer !== undefined) {
          window.clearTimeout(activeTimer);
          loadingTimerByTabRef.current.delete(tabId);
        }
        setCachedDirectory(targetPath ?? result.currentPath, includeHidden, result);
        if (reqId !== requestIdByTabRef.current.get(tabId)) {
          return null;
        }
        updateTab(tabId, {
          listing: result,
          pendingPath: null,
          loading: false,
        });
        return result;
      } catch (err) {
        const activeTimer = loadingTimerByTabRef.current.get(tabId);
        if (activeTimer !== undefined) {
          window.clearTimeout(activeTimer);
          loadingTimerByTabRef.current.delete(tabId);
        }
        if (reqId !== requestIdByTabRef.current.get(tabId)) {
          return null;
        }
        const lockedDriveRoot = parseBitlockerLockedDrive(err);
        if (lockedDriveRoot) {
          updateTab(tabId, {
            pendingPath: null,
            loading: false,
          });
          const unlocked = await handleUnlockBitlockerDrive(
            targetPath ?? lockedDriveRoot,
            lockedDriveRoot
          );
          if (reqId !== requestIdByTabRef.current.get(tabId)) {
            return null;
          }
          if (unlocked) {
            try {
              const retried = await invoke<DirectoryListing>("list_directory", {
                path: targetPath ?? lockedDriveRoot,
                showHidden: includeHidden,
              });
              setCachedDirectory(
                targetPath ?? retried.currentPath,
                includeHidden,
                retried
              );
              if (reqId !== requestIdByTabRef.current.get(tabId)) {
                return null;
              }
              updateTab(tabId, {
                listing: retried,
                pendingPath: null,
                loading: false,
              });
              return retried;
            } catch (retryErr) {
              if (reqId !== requestIdByTabRef.current.get(tabId)) {
                return null;
              }
              updateTab(tabId, {
                error: typeof retryErr === "string" ? retryErr : String(retryErr),
                pendingPath: null,
                loading: false,
              });
              return null;
            }
          }
          return null;
        }
        updateTab(tabId, {
          error: typeof err === "string" ? err : String(err),
          pendingPath: null,
          loading: false,
        });
        return null;
      }
    },
    [handleUnlockBitlockerDrive, resolvePanelTarget, updateTab, updateTrackedPanelState]
  );

  // Initial load: resolve sidebar locations, restore persisted state & open last panel/folder
  useEffect(() => {
    let active = true;
    (async () => {
      let resolvedLocations: SidebarLocations | null = null;
      let persisted: PersistedAppState | null = null;
      let cliInitialPath: string | null = null;

      if (isTauriRuntime()) {
        const [locsResult, stateResult, initialPathResult] = await Promise.allSettled([
          invoke<SidebarLocations>("get_sidebar_locations"),
          invoke<PersistedAppState>("load_app_state"),
          invoke<string | null>("get_initial_path"),
        ]);
        if (locsResult.status === "fulfilled") {
          resolvedLocations = locsResult.value;
          if (active) setLocations(resolvedLocations);
        }
        if (stateResult.status === "fulfilled") {
          persisted = stateResult.value;
        }
        if (
          initialPathResult.status === "fulfilled" &&
          typeof initialPathResult.value === "string" &&
          initialPathResult.value.trim().length > 0
        ) {
          cliInitialPath = initialPathResult.value.trim();
        }
      } else {
        resolvedLocations = MOCK_LOCATIONS;
        setLocations(MOCK_LOCATIONS);
      }

      if (!active) return;

      if (persisted?.panels) {
        panelStatesRef.current = persisted.panels;
      }

      const initialSettings: AppSettings = isTauriRuntime()
        ? {
            useWindowsWindowControls: Boolean(
              persisted?.settings?.useWindowsWindowControls
            ),
            sidebarVisibility: normalizeSidebarVisibility(
              persisted?.settings?.sidebarVisibility
            ),
            useEverythingCli:
              typeof persisted?.settings?.useEverythingCli === "boolean"
                ? persisted.settings.useEverythingCli
                : null,
            theme: normalizeTheme(persisted?.settings?.theme),
            useBeigeAppIcon: Boolean(persisted?.settings?.useBeigeAppIcon),
          }
        : loadBrowserSettings();
      setSettings(initialSettings);

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

      if (cliInitialPath) {
        const matchedPanel = matchPanelForPath(
          cliInitialPath,
          resolvedLocations,
          initialFavorites
        );
        const savedMatched = isTrackedPanel(matchedPanel)
          ? panelStatesRef.current[matchedPanel]
          : undefined;
        const initialViewMode = savedMatched?.viewMode ?? DEFAULT_VIEW_MODE;
        const initialSort = savedMatched?.sort ?? DEFAULT_SORT;

        if (!active) return;

        if (isTrackedPanel(matchedPanel)) {
          lastTrackedPanelRef.current = matchedPanel;
        } else if (persisted?.activePanel && isTrackedPanel(persisted.activePanel)) {
          lastTrackedPanelRef.current = persisted.activePanel;
        }
        activePanelRef.current = matchedPanel;
        updateTab("tab-1", {
          activePanel: matchedPanel,
          viewMode: initialViewMode,
          sortConfig: initialSort,
          expandedPaths: [],
          columnPaths: [],
        });

        const data = await fetchDirectory(cliInitialPath, { tabId: "tab-1" });
        if (active && data) {
          updateTab("tab-1", {
            history: [{ path: data.currentPath, panel: matchedPanel }],
            historyIndex: 0,
          });
          if (isTrackedPanel(matchedPanel)) {
            updateTrackedPanelState(matchedPanel, {
              viewMode: initialViewMode,
              sort: initialSort,
              lastPath: data.currentPath,
              expandedPaths: [],
              columnPaths: [],
            });
          }
        }
        return;
      }

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
      const candidateSavedPath =
        savedPanel?.lastPath && isPathWithinRoot(savedPanel.lastPath, rootPath)
          ? savedPanel.lastPath
          : null;
      const targetPath = await resolvePanelTarget(candidateSavedPath, rootPath);
      const sameAsSaved = Boolean(
        candidateSavedPath &&
          normalizePathKey(targetPath) === normalizePathKey(candidateSavedPath)
      );
      const initialExpanded = sameAsSaved ? (savedPanel?.expandedPaths ?? []) : [];
      const initialColumns = sameAsSaved ? (savedPanel?.columnPaths ?? []) : [];

      if (!active) return;

      lastTrackedPanelRef.current = initialPanel;
      activePanelRef.current = initialPanel;
      updateTab("tab-1", {
        activePanel: initialPanel,
        viewMode: initialViewMode,
        sortConfig: initialSort,
        expandedPaths: initialExpanded,
        columnPaths: initialColumns,
      });

      const data = await fetchDirectory(targetPath || undefined, { tabId: "tab-1" });
      if (active && data) {
        updateTab("tab-1", {
          history: [{ path: data.currentPath, panel: initialPanel }],
          historyIndex: 0,
        });
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
  }, [fetchDirectory, resolvePanelTarget, updateTab, updateTrackedPanelState]);

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
  const trimmedSearch = searchQuery.trim();
  const isSearchMode = searchOpen && trimmedSearch.length > 0;
  const isTrashView = !isSearchMode && activePath === "virtual://trash";

  useEffect(() => {
    setRenamingPath(null);
    setRenameError(null);
  }, [activeTab.id, activePath]);

  const clearSearch = useCallback(
    (tabId?: string) => {
      const targetTabId = tabId ?? activeTabIdRef.current;
      searchRequestIdByTabRef.current.set(
        targetTabId,
        (searchRequestIdByTabRef.current.get(targetTabId) ?? 0) + 1
      );
      const pendingDebounce = searchDebounceByTabRef.current.get(targetTabId);
      if (pendingDebounce !== undefined) {
        window.clearTimeout(pendingDebounce);
        searchDebounceByTabRef.current.delete(targetTabId);
      }
      updateTab(targetTabId, {
        searchOpen: false,
        searchQuery: "",
        searchListing: null,
        searchLoading: false,
        searchError: null,
        selectedEntry: null,
      });
    },
    [updateTab]
  );

  const handleOpenSearch = useCallback(() => {
    updateActiveTab({ searchOpen: true });
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  }, [updateActiveTab]);

  const runSearch = useCallback(
    async (rawQuery: string, overrideShowHidden?: boolean, tabIdOverride?: string) => {
      const tabId = tabIdOverride ?? activeTabIdRef.current;
      const q = rawQuery.trim();
      const reqId = (searchRequestIdByTabRef.current.get(tabId) ?? 0) + 1;
      searchRequestIdByTabRef.current.set(tabId, reqId);
      if (!q) {
        updateTab(tabId, {
          searchListing: null,
          searchLoading: false,
          searchError: null,
        });
        return;
      }

      const tab = tabsRef.current.find((t) => t.id === tabId);
      const tabListing = tab?.listing ?? listingRef.current;
      const scopePath =
        tabListing && tabListing.currentPath && !tabListing.currentPath.startsWith("virtual://")
          ? tabListing.currentPath
          : (locationsRef.current?.homePath ?? null);
      const includeHidden = overrideShowHidden ?? showHiddenRef.current;

      updateTab(tabId, {
        searchError: null,
        selectedEntry: null,
      });

      if (!isTauriRuntime()) {
        const lower = q.toLowerCase();
        const matches = MOCK_PREVIEW_LISTING.entries.filter((e) =>
          e.name.toLowerCase().includes(lower)
        );
        updateTab(tabId, {
          searchListing: {
            currentPath: `virtual://search?q=${q}`,
            currentName: `Search: "${q}"`,
            homePath: "~",
            homeName: "Home",
            breadcrumbs: tabListing?.breadcrumbs ?? MOCK_PREVIEW_LISTING.breadcrumbs,
            entries: matches,
            emptyMessage: `No items matching "${q}"`,
          },
          searchLoading: false,
        });
        return;
      }

      updateTab(tabId, { searchLoading: true });
      const includeSubfolders = tab?.searchIncludeSubfolders ?? true;
      try {
        const result = await invoke<DirectoryListing>("search_directory", {
          query: q,
          scopePath,
          showHidden: includeHidden,
          includeSubfolders,
        });
        if (reqId !== searchRequestIdByTabRef.current.get(tabId)) return;
        updateTab(tabId, {
          searchListing: result,
          searchLoading: false,
        });
      } catch (err) {
        if (reqId !== searchRequestIdByTabRef.current.get(tabId)) return;
        updateTab(tabId, {
          searchError: typeof err === "string" ? err : String(err),
          searchLoading: false,
        });
      }
    },
    [updateTab]
  );

  const handleToggleSearchSubfolders = useCallback(() => {
    const tabId = activeTabIdRef.current;
    const currentTab = tabsRef.current.find((t) => t.id === tabId);
    const nextVal = !(currentTab?.searchIncludeSubfolders ?? true);
    updateTab(tabId, { searchIncludeSubfolders: nextVal });
    const q = (currentTab?.searchQuery ?? "").trim();
    if (q) {
      // Update ref snapshot synchronously before invoking search
      tabsRef.current = tabsRef.current.map((t) =>
        t.id === tabId ? { ...t, searchIncludeSubfolders: nextVal } : t
      );
      void runSearch(q, undefined, tabId);
    }
  }, [runSearch, updateTab]);

  const handleSearchQueryChange = useCallback(
    (next: string) => {
      const tabId = activeTabIdRef.current;
      updateTab(tabId, { searchQuery: next });
      const pendingDebounce = searchDebounceByTabRef.current.get(tabId);
      if (pendingDebounce !== undefined) {
        window.clearTimeout(pendingDebounce);
        searchDebounceByTabRef.current.delete(tabId);
      }
      if (!next.trim()) {
        searchRequestIdByTabRef.current.set(
          tabId,
          (searchRequestIdByTabRef.current.get(tabId) ?? 0) + 1
        );
        updateTab(tabId, {
          searchListing: null,
          searchLoading: false,
          searchError: null,
        });
        return;
      }
      const timerId = window.setTimeout(() => {
        searchDebounceByTabRef.current.delete(tabId);
        void runSearch(next, undefined, tabId);
      }, 280);
      searchDebounceByTabRef.current.set(tabId, timerId);
    },
    [runSearch, updateTab]
  );

  const handleSearchSubmit = useCallback(() => {
    const tabId = activeTabIdRef.current;
    const pendingDebounce = searchDebounceByTabRef.current.get(tabId);
    if (pendingDebounce !== undefined) {
      window.clearTimeout(pendingDebounce);
      searchDebounceByTabRef.current.delete(tabId);
    }
    void runSearch(searchQuery, undefined, tabId);
  }, [runSearch, searchQuery]);

  useEffect(() => {
    const loadingTimers = loadingTimerByTabRef.current;
    const searchTimers = searchDebounceByTabRef.current;
    return () => {
      loadingTimers.forEach((timerId) => window.clearTimeout(timerId));
      loadingTimers.clear();
      searchTimers.forEach((timerId) => window.clearTimeout(timerId));
      searchTimers.clear();
    };
  }, []);

  const navigateTo = useCallback(
    async (path: string, panelOverride?: PanelId, selectPath?: string | null) => {
      const tabId = activeTabIdRef.current;
      clearSearch(tabId);
      const targetPanel = panelOverride ?? activePanelRef.current;
      const isSameDir =
        normalizePathKey(activePath) === normalizePathKey(path) &&
        activePanelRef.current === targetPanel &&
        !error;

      if (isSameDir) {
        if (selectPath && listing) {
          const selectKey = normalizePathKey(selectPath);
          const matched = listing.entries.find((e) => normalizePathKey(e.path) === selectKey);
          if (matched) {
            updateTab(tabId, { selectedEntry: matched });
          }
        }
        return;
      }
      updateTab(tabId, {
        revealRequest: null,
        expandedPaths: [],
        columnPaths: [],
      });
      const data = await fetchDirectory(path, { tabId });
      if (data) {
        let matchedEntry: FileEntry | null = null;
        if (selectPath) {
          const selectKey = normalizePathKey(selectPath);
          matchedEntry =
            data.entries.find((e) => normalizePathKey(e.path) === selectKey) ?? null;
        }
        updateTab(tabId, (prev) => {
          const nextHistory = prev.history.slice(0, prev.historyIndex + 1);
          nextHistory.push({ path: data.currentPath, panel: targetPanel });
          return {
            ...prev,
            selectedEntry: matchedEntry ?? prev.selectedEntry,
            history: nextHistory,
            historyIndex: prev.historyIndex + 1,
          };
        });
        if (isTrackedPanel(targetPanel)) {
          const rootPath = getRootPathForPanel(targetPanel, locationsRef.current);
          const withinRoot =
            rootPath !== null && isPathWithinRoot(data.currentPath, rootPath);
          updateTrackedPanelState(targetPanel, {
            lastPath: withinRoot ? data.currentPath : rootPath,
            expandedPaths: [],
            columnPaths: [],
          });
        }
      }
    },
    [activePath, clearSearch, error, fetchDirectory, listing, updateTab, updateTrackedPanelState]
  );

  const handleGoToPathSubmit = useCallback(
    async (rawPath: string): Promise<string | null> => {
      const trimmed = rawPath.trim();
      if (!trimmed) {
        return "Please enter a folder or file path.";
      }

      if (!isTauriRuntime()) {
        const unquoted = trimmed.replace(/^["']|["']$/g, "").trim();
        if (!unquoted) {
          return "Please enter a folder or file path.";
        }
        const mockEntry = MOCK_PREVIEW_LISTING.entries.find(
          (e) =>
            normalizePathKey(e.path) === normalizePathKey(unquoted) ||
            e.name.toLowerCase() === unquoted.toLowerCase()
        );
        if (unquoted === "~" || unquoted === MOCK_LOCATIONS.homePath) {
          setGoToPathOpen(false);
          await navigateTo("~");
          return null;
        }
        if (mockEntry) {
          setGoToPathOpen(false);
          if (mockEntry.isDir) {
            await navigateTo(mockEntry.path);
          } else {
            await navigateTo("~", undefined, mockEntry.path);
          }
          return null;
        }
        return `The folder "${unquoted}" can't be found.`;
      }

      const baseDir =
        listing && !listing.currentPath.startsWith("virtual://")
          ? listing.currentPath
          : null;

      try {
        const resolved = await invoke<ResolvedGoToPath>("resolve_go_to_path", {
          rawPath,
          baseDir,
        });
        setGoToPathOpen(false);
        await navigateTo(resolved.directoryPath, undefined, resolved.selectFilePath);
        return null;
      } catch (err) {
        return typeof err === "string" ? err : String(err);
      }
    },
    [listing, navigateTo]
  );

  const handleSelectPanel = useCallback(
    async (panel: PanelId) => {
      const tabId = activeTabIdRef.current;
      clearSearch(tabId);
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
      updateTab(tabId, {
        activePanel: panel,
        revealRequest: null,
      });

      if (isTrackedPanel(panel)) {
        const saved = panelStatesRef.current[panel];
        const nextViewMode = saved?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = saved?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        updateTab(tabId, {
          viewMode: nextViewMode,
          sortConfig: nextSort,
        });

        // Clicking the already-active panel while inside a subfolder (or outside its root) returns to its root.
        // Switching to a tracked panel only restores saved.lastPath if it lies within that panel's root subtree.
        const savedWithinRoot = Boolean(
          saved?.lastPath && isPathWithinRoot(saved.lastPath, rootPath)
        );
        const validSavedPath = savedWithinRoot ? saved?.lastPath : null;

        let targetPath: string;
        if (wasSamePanel) {
          targetPath = rootPath;
        } else if (
          validSavedPath &&
          getCachedDirectory(validSavedPath, showHiddenRef.current)
        ) {
          // Fast path: already cached in memory; background revalidation handles external deletion
          targetPath = validSavedPath;
        } else {
          targetPath = await resolvePanelTarget(validSavedPath, rootPath);
        }

        if (normalizePathKey(activePath) === normalizePathKey(targetPath) && !error) {
          updateTrackedPanelState(panel, {
            viewMode: nextViewMode,
            sort: nextSort,
            lastPath: targetPath,
          });
          return;
        }

        const restoreSubState = Boolean(
          !wasSamePanel &&
            validSavedPath &&
            normalizePathKey(targetPath) === normalizePathKey(validSavedPath)
        );
        const nextExpanded = restoreSubState ? (saved?.expandedPaths ?? []) : [];
        const nextColumns = restoreSubState ? (saved?.columnPaths ?? []) : [];
        updateTab(tabId, {
          expandedPaths: nextExpanded,
          columnPaths: nextColumns,
        });

        const data = await fetchDirectory(targetPath || undefined, {
          tabId,
          fallbackRoot: rootPath,
          fallbackPanel: panel,
        });
        if (data) {
          updateTab(tabId, (prev) => {
            const nextHistory = prev.history.slice(0, prev.historyIndex + 1);
            nextHistory.push({ path: data.currentPath, panel });
            return {
              ...prev,
              history: nextHistory,
              historyIndex: prev.historyIndex + 1,
            };
          });
          updateTrackedPanelState(panel, {
            viewMode: nextViewMode,
            sort: nextSort,
            lastPath: data.currentPath,
            expandedPaths: nextExpanded,
            columnPaths: nextColumns,
          });
        }
      } else {
        // Excluded panels ("applications", "drives", "network"): keep session-only view/sort, never persist to ~/.winfinder/config.json
        const ephemeral = ephemeralPanelStatesRef.current[panel];
        const nextViewMode = ephemeral?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = ephemeral?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        updateTab(tabId, {
          viewMode: nextViewMode,
          sortConfig: nextSort,
          expandedPaths: [],
          columnPaths: [],
        });
        if (normalizePathKey(activePath) === normalizePathKey(rootPath) && !error) return;
        const data = await fetchDirectory(rootPath, { tabId });
        if (data) {
          updateTab(tabId, (prev) => {
            const nextHistory = prev.history.slice(0, prev.historyIndex + 1);
            nextHistory.push({ path: data.currentPath, panel });
            return {
              ...prev,
              history: nextHistory,
              historyIndex: prev.historyIndex + 1,
            };
          });
        }
      }
    },
    [
      activePath,
      clearSearch,
      error,
      fetchDirectory,
      locations,
      resolvePanelTarget,
      updateTab,
      updateTrackedPanelState,
    ]
  );

  const openFolderInNewTab = useCallback(
    async (targetPath: string, panelOverride?: PanelId) => {
      if (!targetPath) return;
      const locs = locationsRef.current;
      const matchedPanel =
        panelOverride ?? panelForAnyPath(targetPath, locs, customFavoritesRef.current);
      const saved = isTrackedPanel(matchedPanel)
        ? panelStatesRef.current[matchedPanel]
        : ephemeralPanelStatesRef.current[matchedPanel];
      const nextViewMode = saved?.viewMode ?? viewModeRef.current;
      const nextSort = saved?.sort ?? sortConfigRef.current;

      const newId = `tab-${nextTabIdRef.current++}`;
      const newTab = createTabState(newId, {
        activePanel: matchedPanel,
        pendingPath: targetPath,
        viewMode: nextViewMode,
        sortConfig: nextSort,
        loading: false,
      });

      activeTabIdRef.current = newId;
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);

      const data = await fetchDirectory(targetPath, { tabId: newId });
      if (data) {
        updateTab(newId, {
          history: [{ path: data.currentPath, panel: matchedPanel }],
          historyIndex: 0,
        });
      }
    },
    [fetchDirectory, updateTab]
  );

  const openPanelInNewTab = useCallback(
    async (panel: PanelId) => {
      const locs = locationsRef.current;
      const rootPath = getRootPathForPanel(panel, locs);
      if (rootPath === null) return;

      if (panel.startsWith("fav:") && isTauriRuntime()) {
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
                name: labelForPendingPath(rootPath, locs),
                path: rootPath,
              }
            );
            return;
          }
        } catch {
          // Fall through to normal fetch if check fails unexpectedly
        }
      }

      const saved = isTrackedPanel(panel)
        ? panelStatesRef.current[panel]
        : ephemeralPanelStatesRef.current[panel];
      const nextViewMode = saved?.viewMode ?? DEFAULT_VIEW_MODE;
      const nextSort = saved?.sort ?? DEFAULT_SORT;

      const newId = `tab-${nextTabIdRef.current++}`;
      const newTab = createTabState(newId, {
        activePanel: panel,
        pendingPath: rootPath || null,
        viewMode: nextViewMode,
        sortConfig: nextSort,
        loading: false,
      });

      activeTabIdRef.current = newId;
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newId);

      const data = await fetchDirectory(rootPath || undefined, { tabId: newId });
      if (data) {
        updateTab(newId, {
          history: [{ path: data.currentPath, panel }],
          historyIndex: 0,
        });
      }
    },
    [fetchDirectory, updateTab]
  );

  const handleNewTab = useCallback(() => {
    const current = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
    const currentTabPath = current?.pendingPath ?? current?.listing?.currentPath ?? "";
    if (currentTabPath) {
      void openFolderInNewTab(currentTabPath, current?.activePanel);
    } else {
      void openPanelInNewTab("home");
    }
  }, [openFolderInNewTab, openPanelInNewTab]);

  const handleCloseTab = useCallback((tabId: string) => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length <= 1) return;
    const idx = currentTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;

    const loadTimer = loadingTimerByTabRef.current.get(tabId);
    if (loadTimer !== undefined) {
      window.clearTimeout(loadTimer);
      loadingTimerByTabRef.current.delete(tabId);
    }
    const searchTimer = searchDebounceByTabRef.current.get(tabId);
    if (searchTimer !== undefined) {
      window.clearTimeout(searchTimer);
      searchDebounceByTabRef.current.delete(tabId);
    }
    requestIdByTabRef.current.delete(tabId);
    searchRequestIdByTabRef.current.delete(tabId);

    const nextTabs = currentTabs.filter((t) => t.id !== tabId);
    setTabs(nextTabs);
    if (activeTabIdRef.current === tabId) {
      const nextActive = nextTabs[Math.min(idx, nextTabs.length - 1)] ?? nextTabs[0];
      activeTabIdRef.current = nextActive.id;
      setActiveTabId(nextActive.id);
    }
  }, []);

  const handleSelectTab = useCallback((tabId: string) => {
    activeTabIdRef.current = tabId;
    setActiveTabId(tabId);
  }, []);

  const handleCycleTab = useCallback((delta: 1 | -1) => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length <= 1) return;
    const idx = currentTabs.findIndex((t) => t.id === activeTabIdRef.current);
    const nextIdx = (idx + delta + currentTabs.length) % currentTabs.length;
    const nextId = currentTabs[nextIdx].id;
    activeTabIdRef.current = nextId;
    setActiveTabId(nextId);
  }, []);

  const handleExpandedPathsChange = useCallback(
    (paths: string[]) => {
      updateActiveTab({ expandedPaths: paths });
      const panel = activePanelRef.current;
      if (isTrackedPanel(panel)) {
        const rootPath = getRootPathForPanel(panel, locationsRef.current);
        if (rootPath !== null && isPathWithinRoot(activePath, rootPath)) {
          updateTrackedPanelState(panel, { expandedPaths: paths });
        }
      }
    },
    [activePath, updateActiveTab, updateTrackedPanelState]
  );

  const handleColumnPathsChange = useCallback(
    (paths: string[]) => {
      updateActiveTab({ columnPaths: paths });
      const panel = activePanelRef.current;
      if (isTrackedPanel(panel)) {
        const rootPath = getRootPathForPanel(panel, locationsRef.current);
        if (rootPath !== null && isPathWithinRoot(activePath, rootPath)) {
          updateTrackedPanelState(panel, { columnPaths: paths });
        }
      }
    },
    [activePath, updateActiveTab, updateTrackedPanelState]
  );

  const handleChangeViewMode = useCallback(
    (nextMode: ViewMode) => {
      const tabId = activeTabIdRef.current;
      const prevMode = viewModeRef.current;
      viewModeRef.current = nextMode;
      updateTab(tabId, { viewMode: nextMode });
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
          updateTab(tabId, {
            expandedPaths: nextExpanded,
            columnPaths: nextColumns,
            revealRequest: {
              anchorRoot: chain.anchorRoot,
              path: chain.targetPath,
              seq: ++revealSeqRef.current,
            },
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

          void fetchDirectory(chain.anchorRoot, { tabId });
          return;
        }

        // Already anchored at root: keep tree and Miller columns in sync when toggling between List and Columns
        if (nextMode === "list" && prevMode === "columns" && columnPathsRef.current.length > 0) {
          const synced = [...columnPathsRef.current];
          expandedPathsRef.current = synced;
          updateTab(tabId, {
            expandedPaths: synced,
            revealRequest: {
              anchorRoot: currentListing.currentPath,
              path: synced[synced.length - 1],
              seq: ++revealSeqRef.current,
            },
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
            updateTab(tabId, {
              columnPaths: subChain,
              revealRequest: {
                anchorRoot: currentListing.currentPath,
                path: subChain[subChain.length - 1],
                seq: ++revealSeqRef.current,
              },
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
    [fetchDirectory, updateTab, updateTrackedPanelState]
  );

  const handleChangeSort = useCallback(
    (nextSort: SortConfig) => {
      sortConfigRef.current = nextSort;
      updateActiveTab({ sortConfig: nextSort });
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
    [updateActiveTab, updateTrackedPanelState]
  );

  const handleOpenItem = useCallback(
    async (entry: FileEntry) => {
      if (!isTauriRuntime()) return;
      try {
        await invoke("open_item", {
          path: entry.path,
          entryKind: entry.entryKind,
        });
      } catch (err) {
        setError(typeof err === "string" ? err : String(err));
      }
    },
    [setError]
  );

  const handleStartRename = useCallback(
    (entry: FileEntry | null) => {
      if (!isRenamableEntry(entry, isTrashView) || !entry) return;
      setRenameError(null);
      setSelectedEntry(entry);
      setRenamingPath(entry.path);
    },
    [isTrashView, setSelectedEntry]
  );

  const handleCancelRename = useCallback(() => {
    setRenamingPath(null);
  }, []);

  const handleCommitRename = useCallback(
    async (entry: FileEntry, rawNewName: string): Promise<string | null> => {
      const trimmed = rawNewName.trim();
      if (!trimmed) {
        setRenamingPath(null);
        setRenameError("Name cannot be empty.");
        return null;
      }
      if (trimmed === entry.name) {
        setRenamingPath(null);
        return null;
      }

      if (!isTauriRuntime()) {
        const parent = getParentDirPath(entry.path);
        const sep = entry.path.includes("\\") ? "\\" : "/";
        const newPath = parent
          ? `${parent.replace(/[\\/]+$/, "")}${sep}${trimmed}`
          : trimmed;
        const ext =
          entry.isDir || !trimmed.includes(".")
            ? null
            : trimmed.slice(trimmed.lastIndexOf(".") + 1).toLowerCase() || null;
        const updatedEntry: FileEntry = {
          ...entry,
          name: trimmed,
          path: newPath,
          extension: ext,
        };
        setRenamingPath(null);
        setRenameError(null);
        updateActiveTab((prev) => ({
          ...prev,
          listing: prev.listing
            ? {
                ...prev.listing,
                entries: prev.listing.entries.map((item) =>
                  normalizePathKey(item.path) === normalizePathKey(entry.path)
                    ? updatedEntry
                    : item
                ),
              }
            : prev.listing,
          selectedEntry: updatedEntry,
        }));
        return newPath;
      }

      try {
        const newPath = await invoke<string>("rename_item", {
          path: entry.path,
          newName: trimmed,
        });
        setRenamingPath(null);
        setRenameError(null);

        invalidateCachedDirectory(entry.path);
        const parentDir = getParentDirPath(entry.path);
        if (parentDir) {
          invalidateCachedDirectory(parentDir);
        }

        if (entry.isDir) {
          const nextExpanded = expandedPathsRef.current.map((p) =>
            replacePathPrefix(p, entry.path, newPath)
          );
          const nextColumns = columnPathsRef.current.map((p) =>
            replacePathPrefix(p, entry.path, newPath)
          );
          if (nextExpanded.some((p, i) => p !== expandedPathsRef.current[i])) {
            handleExpandedPathsChange(nextExpanded);
          }
          if (nextColumns.some((p, i) => p !== columnPathsRef.current[i])) {
            handleColumnPathsChange(nextColumns);
          }
        }

        if (isSearchMode) {
          await runSearch(searchQuery);
          const tab = tabsRef.current.find((t) => t.id === activeTabIdRef.current);
          const matched = tab?.searchListing?.entries.find(
            (e) => normalizePathKey(e.path) === normalizePathKey(newPath)
          );
          if (matched) {
            setSelectedEntry(matched);
          }
        } else if (listing) {
          invalidateCachedDirectory(listing.currentPath);
          const refreshed = await fetchDirectory(listing.currentPath, { forceRefresh: true });
          if (refreshed) {
            const matched = refreshed.entries.find(
              (e) => normalizePathKey(e.path) === normalizePathKey(newPath)
            );
            if (matched) {
              setSelectedEntry(matched);
            }
          }
        }

        return newPath;
      } catch (err) {
        setRenamingPath(null);
        setRenameError(typeof err === "string" ? err : String(err));
        return null;
      }
    },
    [
      fetchDirectory,
      handleColumnPathsChange,
      handleExpandedPathsChange,
      isSearchMode,
      listing,
      runSearch,
      searchQuery,
      setSelectedEntry,
      updateActiveTab,
    ]
  );

  const handleContextMenu = useCallback(
    async (entry: FileEntry) => {
      if (!isTauriRuntime()) return;
      const currentPath = listing?.currentPath ?? null;
      const isTrashItem = currentPath === "virtual://trash";
      try {
        const res = await invoke<ContextMenuResult>("show_context_menu", {
          path: entry.path,
          entryKind: entry.entryKind,
          isDir: entry.isDir,
          isTrash: isTrashItem,
        });
        if (res.openInNewTab) {
          void openFolderInNewTab(entry.path);
          return;
        }
        if (res.renameRequested) {
          handleStartRename(entry);
          return;
        }
        if (
          res.invoked &&
          currentPath &&
          (currentPath === "virtual://trash" || !currentPath.startsWith("virtual://"))
        ) {
          invalidateCachedDirectory(currentPath);
          void fetchDirectory(currentPath, { forceRefresh: true });
        }
      } catch {
        // Ignore if shell context menu cannot be shown for a virtual entry
      }
    },
    [fetchDirectory, handleStartRename, listing, openFolderInNewTab]
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
    if (
      !entry ||
      entry.entryKind === "app" ||
      entry.entryKind === "drive" ||
      entry.path.startsWith("virtual://") ||
      entry.path.startsWith("trash://")
    ) {
      return;
    }
    if (!isTauriRuntime()) {
      mockClipboardRef.current = entry;
      return;
    }
    try {
      await invoke("copy_file_to_clipboard", { path: entry.path });
    } catch (err) {
      setRenameError(typeof err === "string" ? err : String(err));
    }
  }, []);

  const handlePaste = useCallback(
    async (targetDirOverride?: string) => {
      const destDir = targetDirOverride ?? listing?.currentPath ?? null;
      if (!destDir || destDir.startsWith("virtual://") || isSearchMode || isTrashView) return;

      if (!isTauriRuntime()) {
        const clip = mockClipboardRef.current;
        if (!clip || !listing) return;
        const copyName = clip.isDir
          ? `${clip.name} - Copy`
          : clip.name.includes(".")
            ? `${clip.name.slice(0, clip.name.lastIndexOf("."))} - Copy${clip.name.slice(clip.name.lastIndexOf("."))}`
            : `${clip.name} - Copy`;
        const sep = destDir.includes("\\") ? "\\" : "/";
        const copiedEntry: FileEntry = {
          ...clip,
          name: copyName,
          path: `${destDir.replace(/[\\/]+$/, "")}${sep}${copyName}`,
          modifiedMs: Date.now(),
        };
        updateActiveTab((prev) => ({
          ...prev,
          listing: prev.listing
            ? { ...prev.listing, entries: [...prev.listing.entries, copiedEntry] }
            : prev.listing,
          selectedEntry: copiedEntry,
        }));
        return;
      }

      try {
        const createdPaths = await invoke<string[]>("paste_from_clipboard", {
          destinationDir: destDir,
        });
        if (createdPaths.length === 0) return;
        invalidateCachedDirectory(destDir);
        setRefreshSeq((s) => s + 1);
        if (listing && normalizePathKey(listing.currentPath) === normalizePathKey(destDir)) {
          const refreshed = await fetchDirectory(listing.currentPath, { forceRefresh: true });
          if (refreshed) {
            const firstKey = normalizePathKey(createdPaths[0]);
            const matched = refreshed.entries.find(
              (e) => normalizePathKey(e.path) === firstKey
            );
            if (matched) {
              setSelectedEntry(matched);
            }
          }
        }
      } catch (err) {
        setRenameError(typeof err === "string" ? err : String(err));
      }
    },
    [fetchDirectory, isSearchMode, isTrashView, listing, setSelectedEntry, updateActiveTab]
  );

  const handleDeleteEntry = useCallback(
    async (entry: FileEntry | null) => {
      if (!isRenamableEntry(entry, isTrashView) || !entry) return;

      if (!isTauriRuntime()) {
        updateActiveTab((prev) => ({
          ...prev,
          listing: prev.listing
            ? {
                ...prev.listing,
                entries: prev.listing.entries.filter(
                  (e) => normalizePathKey(e.path) !== normalizePathKey(entry.path)
                ),
              }
            : prev.listing,
          selectedEntry: null,
        }));
        return;
      }

      try {
        await invoke("delete_item", { path: entry.path });
        invalidateCachedDirectory(entry.path);
        const parentDir = getParentDirPath(entry.path);
        if (parentDir) {
          invalidateCachedDirectory(parentDir);
        }
        invalidateCachedDirectory("virtual://trash");
        setSelectedEntry(null);
        setRefreshSeq((s) => s + 1);
        if (isSearchMode) {
          await runSearch(searchQuery);
        } else if (listing && !listing.currentPath.startsWith("virtual://")) {
          invalidateCachedDirectory(listing.currentPath);
          await fetchDirectory(listing.currentPath, { forceRefresh: true });
        }
      } catch (err) {
        setRenameError(typeof err === "string" ? err : String(err));
      }
    },
    [fetchDirectory, isSearchMode, isTrashView, listing, runSearch, searchQuery, setSelectedEntry, updateActiveTab]
  );

  const handleMoveItem = useCallback(
    async (entry: FileEntry, destinationDir: string) => {
      if (!isRenamableEntry(entry, isTrashView)) return;
      if (!destinationDir || destinationDir.startsWith("virtual://")) return;

      if (!isTauriRuntime()) {
        updateActiveTab((prev) => ({
          ...prev,
          listing: prev.listing
            ? {
                ...prev.listing,
                entries: prev.listing.entries.filter(
                  (e) => normalizePathKey(e.path) !== normalizePathKey(entry.path)
                ),
              }
            : prev.listing,
          selectedEntry: null,
        }));
        return;
      }

      try {
        await invoke<string>("move_item", {
          sourcePath: entry.path,
          destinationDir,
        });
        invalidateCachedDirectory(entry.path);
        const parentDir = getParentDirPath(entry.path);
        if (parentDir) {
          invalidateCachedDirectory(parentDir);
        }
        invalidateCachedDirectory(destinationDir);
        setSelectedEntry(null);
        setRefreshSeq((s) => s + 1);
        if (isSearchMode) {
          await runSearch(searchQuery);
        } else if (listing && !listing.currentPath.startsWith("virtual://")) {
          invalidateCachedDirectory(listing.currentPath);
          await fetchDirectory(listing.currentPath, { forceRefresh: true });
        }
      } catch (err) {
        setRenameError(typeof err === "string" ? err : String(err));
      }
    },
    [fetchDirectory, isSearchMode, isTrashView, listing, runSearch, searchQuery, setSelectedEntry, updateActiveTab]
  );
  moveItemHandlerRef.current = handleMoveItem;

  const handleCopyPath = useCallback(async (entry: FileEntry) => {
    try {
      await navigator.clipboard.writeText(entry.path);
    } catch {
      // Clipboard API unavailable
    }
  }, []);

  const handleNewFolder = useCallback(
    async (targetDirOverride?: string, startRename = false) => {
      const parentPath = targetDirOverride ?? listing?.currentPath ?? null;
      if (!parentPath || parentPath.startsWith("virtual://")) return;
      if (!isTauriRuntime()) {
        const sep = parentPath.includes("\\") ? "\\" : "/";
        const createdEntry: FileEntry = {
          name: "New folder",
          path: `${parentPath.replace(/[\\/]+$/, "")}${sep}New folder`,
          isDir: true,
          entryKind: "folder",
          extension: null,
          size: 0,
          modifiedMs: Date.now(),
          iconDataUrl: null,
        };
        updateActiveTab((prev) => ({
          ...prev,
          listing: prev.listing
            ? { ...prev.listing, entries: [...prev.listing.entries, createdEntry] }
            : prev.listing,
          selectedEntry: createdEntry,
        }));
        if (startRename) handleStartRename(createdEntry);
        return;
      }
      try {
        const createdPath = await invoke<string>("create_new_folder", {
          parentPath,
        });
        invalidateCachedDirectory(parentPath);
        setRefreshSeq((s) => s + 1);
        if (listing && normalizePathKey(listing.currentPath) === normalizePathKey(parentPath)) {
          const refreshed = await fetchDirectory(listing.currentPath, { forceRefresh: true });
          if (refreshed) {
            const createdEntry = refreshed.entries.find(
              (e) => normalizePathKey(e.path) === normalizePathKey(createdPath)
            );
            if (createdEntry) {
              setSelectedEntry(createdEntry);
              if (startRename) {
                handleStartRename(createdEntry);
              }
            }
          }
        }
      } catch (err) {
        setRenameError(typeof err === "string" ? err : String(err));
      }
    },
    [fetchDirectory, handleStartRename, listing, setSelectedEntry, updateActiveTab]
  );

  const handleNewFile = useCallback(
    async (baseName: string, extension: string | null, targetDirOverride?: string) => {
      const parentPath = targetDirOverride ?? listing?.currentPath ?? null;
      if (!parentPath || parentPath.startsWith("virtual://")) return;
      if (!isTauriRuntime()) {
        const fileName = extension ? `${baseName}.${extension}` : baseName;
        const sep = parentPath.includes("\\") ? "\\" : "/";
        const createdEntry: FileEntry = {
          name: fileName,
          path: `${parentPath.replace(/[\\/]+$/, "")}${sep}${fileName}`,
          isDir: false,
          entryKind: "file",
          extension,
          size: 0,
          modifiedMs: Date.now(),
          iconDataUrl: null,
        };
        updateActiveTab((prev) => ({
          ...prev,
          listing: prev.listing
            ? { ...prev.listing, entries: [...prev.listing.entries, createdEntry] }
            : prev.listing,
          selectedEntry: createdEntry,
        }));
        handleStartRename(createdEntry);
        return;
      }
      try {
        const createdPath = await invoke<string>("create_new_file", {
          parentPath,
          baseName,
          extension,
        });
        invalidateCachedDirectory(parentPath);
        setRefreshSeq((s) => s + 1);
        if (listing && normalizePathKey(listing.currentPath) === normalizePathKey(parentPath)) {
          const refreshed = await fetchDirectory(listing.currentPath, { forceRefresh: true });
          if (refreshed) {
            const createdEntry = refreshed.entries.find(
              (e) => normalizePathKey(e.path) === normalizePathKey(createdPath)
            );
            if (createdEntry) {
              setSelectedEntry(createdEntry);
              handleStartRename(createdEntry);
            }
          }
        }
      } catch (err) {
        setRenameError(typeof err === "string" ? err : String(err));
      }
    },
    [fetchDirectory, handleStartRename, listing, setSelectedEntry, updateActiveTab]
  );

  const handleToggleShowHidden = useCallback(() => {
    const next = !showHiddenRef.current;
    setShowHidden(next);
    if (listing) {
      void fetchDirectory(listing.currentPath, { overrideShowHidden: next });
    }
    if (isSearchMode) {
      void runSearch(searchQuery, next);
    }
  }, [fetchDirectory, isSearchMode, listing, runSearch, searchQuery]);

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
    if (isSearchMode) {
      void runSearch(searchQuery);
      return;
    }
    if (listing) {
      invalidateCachedDirectory(listing.currentPath);
      void fetchDirectory(listing.currentPath, { forceRefresh: true });
    } else {
      void fetchDirectory(undefined, { forceRefresh: true });
    }
  }, [fetchDirectory, isSearchMode, listing, runSearch, searchQuery]);

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
      const tabId = activeTabIdRef.current;
      clearSearch(tabId);
      const entry = history[nextIndex];
      if (!entry) return;
      const targetPanel = entry.panel;
      activePanelRef.current = targetPanel;

      if (isTrackedPanel(targetPanel)) {
        const saved = panelStatesRef.current[targetPanel];
        const nextViewMode = saved?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = saved?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        const sameAsSaved = Boolean(
          saved?.lastPath &&
            entry.path.toLowerCase() === saved.lastPath.toLowerCase()
        );
        updateTab(tabId, {
          activePanel: targetPanel,
          revealRequest: null,
          viewMode: nextViewMode,
          sortConfig: nextSort,
          expandedPaths: sameAsSaved ? (saved?.expandedPaths ?? []) : [],
          columnPaths: sameAsSaved ? (saved?.columnPaths ?? []) : [],
        });
      } else {
        const ephemeral = ephemeralPanelStatesRef.current[targetPanel];
        const nextViewMode = ephemeral?.viewMode ?? DEFAULT_VIEW_MODE;
        const nextSort = ephemeral?.sort ?? DEFAULT_SORT;
        viewModeRef.current = nextViewMode;
        sortConfigRef.current = nextSort;
        updateTab(tabId, {
          activePanel: targetPanel,
          revealRequest: null,
          viewMode: nextViewMode,
          sortConfig: nextSort,
          expandedPaths: [],
          columnPaths: [],
        });
      }

      const data = await fetchDirectory(entry.path, { tabId });
      if (data) {
        updateTab(tabId, { historyIndex: nextIndex });
        if (isTrackedPanel(targetPanel)) {
          const rootPath = getRootPathForPanel(targetPanel, locationsRef.current);
          const withinRoot =
            rootPath !== null && isPathWithinRoot(data.currentPath, rootPath);
          updateTrackedPanelState(targetPanel, {
            lastPath: withinRoot ? data.currentPath : rootPath,
          });
        }
      }
    },
    [clearSearch, fetchDirectory, history, updateTab, updateTrackedPanelState]
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
    } else {
      setIsWindowMaximized((prev) => !prev);
    }
  }, []);

  // Track window maximized state for Windows caption Restore/Maximize icon
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    const win = getCurrentWindow();

    const syncMaximized = () => {
      void win
        .isMaximized()
        .then((max) => {
          if (!cancelled) setIsWindowMaximized(max);
        })
        .catch(() => {
          // Ignore if window state query fails
        });
    };

    syncMaximized();
    void win
      .onResized(() => {
        if (!cancelled) syncMaximized();
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {
        // Ignore if resize listener is unavailable
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Watch the active filesystem directory for external changes and silently refresh
  const watchedDirPath =
    !isSearchMode && listing?.currentPath && !listing.currentPath.startsWith("virtual://")
      ? listing.currentPath
      : null;

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void invoke("watch_directory", { path: watchedDirPath });
  }, [watchedDirPath]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void listen<string>("directory-changed", (event) => {
      if (cancelled) return;
      const changedPath = event.payload;
      if (!changedPath || renamingPathRef.current) return;
      invalidateCachedDirectory(changedPath);
      const current = listingRef.current;
      if (
        current &&
        !current.currentPath.startsWith("virtual://") &&
        normalizePathKey(current.currentPath) === normalizePathKey(changedPath)
      ) {
        const tabId = activeTabIdRef.current;
        const includeHidden = showHiddenRef.current;
        void invoke<DirectoryListing>("list_directory", {
          path: current.currentPath,
          showHidden: includeHidden,
        })
          .then((fresh) => {
            if (cancelled) return;
            setCachedDirectory(fresh.currentPath, includeHidden, fresh);
            if (
              listingRef.current &&
              normalizePathKey(listingRef.current.currentPath) ===
                normalizePathKey(fresh.currentPath) &&
              !listingsEqual(listingRef.current, fresh)
            ) {
              updateTab(tabId, (prev) => {
                const prevSelKey = prev.selectedEntry
                  ? normalizePathKey(prev.selectedEntry.path)
                  : null;
                const preservedSel = prevSelKey
                  ? (fresh.entries.find((e) => normalizePathKey(e.path) === prevSelKey) ?? null)
                  : null;
                return {
                  ...prev,
                  listing: fresh,
                  selectedEntry: preservedSel,
                };
              });
              setRefreshSeq((n) => n + 1);
            }
          })
          .catch(() => {
            // Ignore transient read errors while external writers are active
          });
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
        // Ignore if event listener is unavailable
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [updateTab]);

  // Silently refresh any open Applications tabs when background app scan updates the cache
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    void listen("applications-updated", () => {
      if (cancelled) return;
      invalidateCachedDirectory("virtual://applications");
      const hasAppsTab = tabsRef.current.some(
        (tab) => tab.listing?.currentPath === "virtual://applications"
      );
      if (!hasAppsTab) return;

      const includeHidden = showHiddenRef.current;
      void invoke<DirectoryListing>("list_directory", {
        path: "virtual://applications",
        showHidden: includeHidden,
      })
        .then((fresh) => {
          if (cancelled) return;
          setCachedDirectory("virtual://applications", includeHidden, fresh);
          for (const tab of tabsRef.current) {
            if (tab.listing?.currentPath !== "virtual://applications") continue;
            if (listingsEqual(tab.listing, fresh)) continue;
            updateTab(tab.id, (prev) => {
              if (prev.listing?.currentPath !== "virtual://applications") return prev;
              const prevSelKey = prev.selectedEntry
                ? normalizePathKey(prev.selectedEntry.path)
                : null;
              const preservedSel = prevSelKey
                ? (fresh.entries.find((e) => normalizePathKey(e.path) === prevSelKey) ?? null)
                : null;
              return {
                ...prev,
                listing: fresh,
                selectedEntry: preservedSel,
              };
            });
          }
        })
        .catch(() => {
          // Ignore transient refresh errors
        });
    })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch(() => {
        // Ignore if event listener is unavailable
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [updateTab]);

  // Keyboard support: Ctrl/Cmd+C/V copy & paste; Delete to Trash; Ctrl/Cmd+F opens search; Ctrl/Cmd+Shift+G opens Go to Path; Ctrl+, opens Settings; Backspace or Alt+Left goes back; dialog Escape/Enter handling
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
      if (settingsOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setSettingsOpen(false);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setGoToPathOpen(true);
        return;
      }

      if (goToPathOpen) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        handleOpenSearch();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleNewTab();
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === "w" &&
        tabsRef.current.length > 1
      ) {
        e.preventDefault();
        handleCloseTab(activeTabIdRef.current);
        return;
      }

      if (e.ctrlKey && !e.altKey && e.key === "Tab" && tabsRef.current.length > 1) {
        e.preventDefault();
        handleCycleTab(e.shiftKey ? -1 : 1);
        return;
      }

      const target = e.target as HTMLElement | null;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        Boolean(target?.isContentEditable);
      if (isEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "c") {
        const currentSel = selectedEntryRef.current;
        if (currentSel && isRenamableEntry(currentSel, isTrashView)) {
          e.preventDefault();
          void handleCopyFile(currentSel);
          return;
        }
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "v") {
        if (!isSearchMode && !isTrashView && listingRef.current && !listingRef.current.currentPath.startsWith("virtual://")) {
          e.preventDefault();
          void handlePaste();
          return;
        }
      }

      if (e.key === "Delete" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const currentSel = selectedEntryRef.current;
        if (currentSel && isRenamableEntry(currentSel, isTrashView)) {
          e.preventDefault();
          void handleDeleteEntry(currentSel);
          return;
        }
      }

      if (e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const currentSel = selectedEntryRef.current;
        if (isRenamableEntry(currentSel, isTrashView)) {
          e.preventDefault();
          handleStartRename(currentSel);
          return;
        }
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
  }, [
    goToPathOpen,
    handleBack,
    handleCloseTab,
    handleCopyFile,
    handleCycleTab,
    handleDeleteEntry,
    handleForward,
    handleNewTab,
    handleOpenSearch,
    handlePaste,
    handleRemoveFavorite,
    handleStartRename,
    isSearchMode,
    isTrashView,
    missingFavorite,
    settingsOpen,
  ]);

  const isPendingNavigation = loading && pendingPath !== null;
  const displayTitle = isSearchMode
    ? `Search: "${trimmedSearch}"`
    : isPendingNavigation
      ? labelForPendingPath(pendingPath, locations)
      : listing?.currentName ?? "Home";
  const loadingMessage = isSearchMode
    ? `Searching for "${trimmedSearch}"…`
    : pendingPath === "virtual://applications"
      ? "Loading applications…"
      : "Loading…";
  const searchScopeName =
    listing && listing.currentPath && !listing.currentPath.startsWith("virtual://")
      ? listing.currentName
      : (locations?.homeName ?? "Home");

  const showTabBar = tabs.length > 1 || tabBarPinned;
  const tabBarItems: TabBarItem[] = tabs.map((tab) => {
    const tabTrimmedSearch = tab.searchQuery.trim();
    const tabIsSearch = tab.searchOpen && tabTrimmedSearch.length > 0;
    const tabPath = tab.pendingPath ?? tab.listing?.currentPath ?? "";
    const tabIsPending = tab.loading && tab.pendingPath !== null;
    const tabTitle = tabIsSearch
      ? `Search: "${tabTrimmedSearch}"`
      : tabIsPending
        ? labelForPendingPath(tab.pendingPath ?? undefined, locations)
        : tab.listing?.currentName ?? labelForPendingPath(tab.pendingPath ?? undefined, locations);
    return {
      id: tab.id,
      title: tabTitle,
      path: tabPath,
      isSearch: tabIsSearch,
    };
  });

  return (
    <div className="finder-window" onContextMenu={(e) => e.preventDefault()}>
      <Sidebar
        locations={locations}
        activePanel={activePanel}
        customFavorites={customFavorites}
        visibility={settings.sidebarVisibility}
        inAppDropState={inAppDrag?.dropState ?? "none"}
        osDragOverFavorites={osDragOverFavorites}
        favoritesSectionRef={favoritesSectionRef}
        width={sidebarWidth}
        onResizeWidth={setSidebarWidth}
        onSelectPanel={(panel) => void handleSelectPanel(panel)}
        onOpenPanelInNewTab={(panel) => void openPanelInNewTab(panel)}
        onRemoveFavorite={handleRemoveFavorite}
        useWindowsWindowControls={settings.useWindowsWindowControls}
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
          useWindowsWindowControls={settings.useWindowsWindowControls}
          isWindowMaximized={isWindowMaximized}
          onBack={() => void handleBack()}
          onForward={() => void handleForward()}
          onChangeViewMode={handleChangeViewMode}
          onChangeSort={handleChangeSort}
          onShareWithOs={(entry) => void handleShareWithOs(entry)}
          onCopyFile={(entry) => void handleCopyFile(entry)}
          onCopyPath={(entry) => void handleCopyPath(entry)}
          onNewTab={handleNewTab}
          onOpenInNewTab={(p) => void openFolderInNewTab(p)}
          tabBarVisible={showTabBar}
          canToggleTabBar={tabs.length === 1}
          onToggleTabBar={() => setTabBarPinned((prev) => !prev)}
          onNewFolder={() => void handleNewFolder()}
          canRenameSelected={isRenamableEntry(selectedEntry, isTrashView)}
          onRename={() => handleStartRename(selectedEntry)}
          onGoToPath={() => setGoToPathOpen(true)}
          onToggleShowHidden={handleToggleShowHidden}
          onOpenInTerminal={() => void handleOpenInTerminal()}
          onCopyCurrentPath={() => void handleCopyCurrentPath()}
          onShowInExplorer={() => void handleShowInExplorer()}
          onRefresh={handleRefresh}
          onOpenSettings={() => setSettingsOpen(true)}
          onWindowClose={handleWindowClose}
          onWindowMinimize={handleWindowMinimize}
          onWindowMaximize={handleWindowMaximize}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          searchInputRef={searchInputRef}
          onOpenSearch={handleOpenSearch}
          onSearchQueryChange={handleSearchQueryChange}
          onSearchSubmit={handleSearchSubmit}
          onCloseSearch={() => clearSearch()}
        />

        {showTabBar && (
          <TabBar
            tabs={tabBarItems}
            activeTabId={activeTab.id}
            homePath={listing?.homePath ?? locations?.homePath ?? ""}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
            onNewTab={handleNewTab}
          />
        )}

        <MainView
          tabId={activeTab.id}
          currentPath={isSearchMode ? (searchListing?.currentPath ?? `virtual://search?q=${trimmedSearch}`) : activePath}
          entries={
            isSearchMode
              ? (searchListing?.entries ?? [])
              : isPendingNavigation
                ? []
                : (listing?.entries ?? [])
          }
          breadcrumbs={
            isSearchMode
              ? (searchListing?.breadcrumbs ?? listing?.breadcrumbs ?? [])
              : isPendingNavigation && pendingPath
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
          loading={isSearchMode ? searchLoading : loading}
          loadingMessage={loadingMessage}
          error={isSearchMode ? searchError : error}
          emptyMessage={
            isSearchMode
              ? (searchListing?.emptyMessage ?? `No items matching "${trimmedSearch}"`)
              : (listing?.emptyMessage ?? null)
          }
          onSelect={setSelectedEntry}
          onOpenFolder={(p) => void navigateTo(p)}
          onOpenFolderInNewTab={(p) => void openFolderInNewTab(p)}
          onOpenItem={(entry) => void handleOpenItem(entry)}
          onContextMenu={(entry) => void handleContextMenu(entry)}
          onChangeSort={handleChangeSort}
          onExpandedPathsChange={handleExpandedPathsChange}
          onColumnPathsChange={handleColumnPathsChange}
          onStartItemDrag={handleStartItemDrag}
          dropTargetFolderPath={inAppDrag?.dropTargetFolderPath ?? null}
          refreshSeq={refreshSeq}
          onNewFolderInDir={(dir, startRename) => void handleNewFolder(dir, startRename)}
          onNewFileInDir={(dir, baseName, ext) => void handleNewFile(baseName, ext, dir)}
          onPasteInDir={(dir) => void handlePaste(dir)}
          onRefresh={handleRefresh}
          onOpenInTerminalDir={(dir) => {
            if (isTauriRuntime()) void invoke("open_in_terminal", { path: dir });
          }}
          onCopyFolderPath={(dir) => {
            void navigator.clipboard.writeText(dir).catch(() => {});
          }}
          onRevealFolderInExplorer={(dir) => {
            if (isTauriRuntime()) void invoke("reveal_in_file_manager", { path: dir, select: false });
          }}
          renamingPath={renamingPath}
          renameError={renameError}
          onCommitRename={handleCommitRename}
          onCancelRename={handleCancelRename}
          onDismissRenameError={() => setRenameError(null)}
          isTrashView={isTrashView}
          emptyingTrash={emptyingTrash}
          onEmptyTrash={() => void handleEmptyTrash()}
          bitlockerNotice={bitlockerNotice}
          onUnlockDrive={handleUnlockBitlockerDrive}
          onDismissBitlockerNotice={() => setBitlockerNotice(null)}
          onRetryUnlockDrive={() => {
            if (bitlockerNotice) {
              void navigateTo(bitlockerNotice.targetPath);
            }
          }}
          searchQuery={isSearchMode ? trimmedSearch : null}
          searchScopeName={isSearchMode ? searchScopeName : null}
          searchIncludeSubfolders={searchIncludeSubfolders}
          onToggleSearchSubfolders={handleToggleSearchSubfolders}
          onClearSearch={() => clearSearch()}
        />
      </div>

      {inAppDrag && (
        <div
          className={`folder-drag-ghost ${
            inAppDrag.dropState === "accept" || inAppDrag.dropTargetFolderPath
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
            name={inAppDrag.entry.name}
            isDir={inAppDrag.entry.isDir}
            entryKind={inAppDrag.entry.entryKind}
            extension={inAppDrag.entry.extension}
            iconDataUrl={inAppDrag.entry.iconDataUrl}
            size={18}
          />
          <span className="folder-drag-ghost-label">{inAppDrag.entry.name}</span>
          {inAppDrag.dropState === "accept" && (
            <span className="folder-drag-ghost-badge">+</span>
          )}
          {inAppDrag.dropTargetFolderName && (
            <span className="folder-drag-ghost-move-hint">
              Move to {inAppDrag.dropTargetFolderName}
            </span>
          )}
        </div>
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          locations={locations}
          onChange={handleUpdateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <GoToPathModal
        isOpen={goToPathOpen}
        onClose={() => setGoToPathOpen(false)}
        onSubmit={handleGoToPathSubmit}
      />

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
