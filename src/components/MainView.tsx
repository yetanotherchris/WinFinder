import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Home,
  Folder,
  Clock,
  LayoutGrid,
  HardDrive,
  Globe,
  Trash2,
  Lock,
  X,
  Search,
} from "lucide-react";
import type {
  BitlockerNotice,
  BreadcrumbItem,
  DirectoryListing,
  FavoriteFolder,
  FileEntry,
  SortConfig,
  SortField,
  ViewMode,
} from "../types";

const BITLOCKER_LOCKED_PREFIX = "BITLOCKER_LOCKED:";

function parseBitlockerLockedDrive(err: unknown): string | null {
  const raw = typeof err === "string" ? err : String(err);
  if (raw.startsWith(BITLOCKER_LOCKED_PREFIX)) {
    const root = raw.slice(BITLOCKER_LOCKED_PREFIX.length).trim();
    return root || null;
  }
  return null;
}
import {
  formatDateModified,
  formatFileSize,
  getKindLabel,
  measureTextPx,
  sortEntries,
} from "../utils/format";
import { FileIcon } from "./FileIcon";
import {
  entriesEqual,
  getCachedDirectory,
  invalidateCachedDirectory,
  setCachedDirectory,
} from "../utils/dirCache";
import { normalizePathKey } from "../utils/favorites";

interface RevealRequest {
  anchorRoot: string;
  path: string;
  seq: number;
}

interface MainViewProps {
  tabId?: string;
  currentPath: string;
  entries: FileEntry[];
  breadcrumbs: BreadcrumbItem[];
  homePath: string;
  selectedPath: string | null;
  viewMode: ViewMode;
  sortConfig: SortConfig;
  showHidden: boolean;
  expandedPaths: string[];
  columnPaths: string[];
  revealRequest?: RevealRequest | null;
  loading: boolean;
  loadingMessage?: string;
  error: string | null;
  emptyMessage: string | null;
  onSelect: (entry: FileEntry | null) => void;
  onOpenFolder: (path: string) => void;
  onOpenFolderInNewTab?: (path: string) => void;
  onOpenItem: (entry: FileEntry) => void;
  onContextMenu: (entry: FileEntry) => void;
  onChangeSort: (next: SortConfig) => void;
  onExpandedPathsChange: (paths: string[]) => void;
  onColumnPathsChange: (paths: string[]) => void;
  onStartFolderDrag?: (folder: FavoriteFolder, e: React.PointerEvent) => void;
  isTrashView?: boolean;
  emptyingTrash?: boolean;
  onEmptyTrash?: () => void;
  bitlockerNotice?: BitlockerNotice | null;
  onUnlockDrive?: (targetPath: string, driveRoot?: string) => Promise<boolean>;
  onDismissBitlockerNotice?: () => void;
  onRetryUnlockDrive?: () => void;
  searchQuery?: string | null;
  searchScopeName?: string | null;
  onClearSearch?: () => void;
}

interface MillerColumn {
  path: string;
  entries: FileEntry[];
  selectedPath: string | null;
  loading: boolean;
  error: string | null;
}

interface ExpandedFolderState {
  path: string;
  entries: FileEntry[];
  loading: boolean;
  error: string | null;
}

type FlatListRow =
  | { kind: "entry"; entry: FileEntry; depth: number }
  | { kind: "status"; key: string; text: string; depth: number };

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function renderBreadcrumbIcon(crumb: BreadcrumbItem, index: number, homePath: string) {
  if (crumb.path === "virtual://recents") {
    return <Clock size={12} strokeWidth={2} className="pathbar-icon home-icon" />;
  }
  if (crumb.path === "virtual://applications") {
    return <LayoutGrid size={12} strokeWidth={2} className="pathbar-icon home-icon" />;
  }
  if (
    crumb.path === "virtual://computer" ||
    (index === 0 && (/^[A-Za-z]:\\?$/.test(crumb.path) || crumb.path === "/"))
  ) {
    return <HardDrive size={12} strokeWidth={2} className="pathbar-icon drive-icon" />;
  }
  if (crumb.path === "virtual://network" || (index === 0 && crumb.path.startsWith("\\\\"))) {
    return <Globe size={12} strokeWidth={2} className="pathbar-icon drive-icon" />;
  }
  if (crumb.path === "virtual://trash") {
    return <Trash2 size={12} strokeWidth={2} className="pathbar-icon drive-icon" />;
  }
  if (homePath && crumb.path.toLowerCase() === homePath.toLowerCase()) {
    return <Home size={12} strokeWidth={2} className="pathbar-icon home-icon" />;
  }
  return <Folder size={12} strokeWidth={2} className="pathbar-icon folder-icon" />;
}

export const MainView: React.FC<MainViewProps> = ({
  tabId = "default",
  currentPath,
  entries,
  breadcrumbs,
  homePath,
  selectedPath,
  viewMode,
  sortConfig,
  showHidden,
  expandedPaths,
  columnPaths,
  revealRequest = null,
  loading,
  loadingMessage,
  error,
  emptyMessage,
  onSelect,
  onOpenFolder,
  onOpenFolderInNewTab,
  onOpenItem,
  onContextMenu,
  onChangeSort,
  onExpandedPathsChange,
  onColumnPathsChange,
  onStartFolderDrag,
  isTrashView = false,
  emptyingTrash = false,
  onEmptyTrash,
  bitlockerNotice = null,
  onUnlockDrive,
  onDismissBitlockerNotice,
  onRetryUnlockDrive,
  searchQuery = null,
  searchScopeName = null,
  onClearSearch,
}) => {
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);

  useEffect(() => {
    if (!isTrashView) {
      setConfirmEmptyOpen(false);
    }
  }, [isTrashView]);

  useEffect(() => {
    if (!confirmEmptyOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConfirmEmptyOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmEmptyOpen]);

  const isDraggableFavoriteFolder = (entry: FileEntry): boolean =>
    !isTrashView && entry.isDir && !entry.path.startsWith("virtual://");

  const getFolderDragProps = (entry: FileEntry) => {
    if (!isDraggableFavoriteFolder(entry)) return {};
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
        if ((e.target as HTMLElement | null)?.closest(".list-disclosure-btn")) return;
        onStartFolderDrag?.({ name: entry.name, path: entry.path }, e);
      },
    };
  };
  const sortedEntries = useMemo(
    () => sortEntries(entries, sortConfig),
    [entries, sortConfig]
  );

  // Miller Columns sub-columns state (columns beyond index 0)
  const [subColumns, setSubColumns] = useState<MillerColumn[]>([]);
  const [columnPreview, setColumnPreview] = useState<FileEntry | null>(null);
  const columnsScrollRef = useRef<HTMLDivElement | null>(null);
  const pathbarRef = useRef<HTMLDivElement | null>(null);
  const columnReqIdRef = useRef(0);

  // Keep the rightmost (current) breadcrumb visible when navigating into deep paths
  useEffect(() => {
    const el = pathbarRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [breadcrumbs]);

  // Resizable column widths (List View & Miller Columns)
  const [listColWidths, setListColWidths] = useState({
    name: 340,
    date: 170,
    size: 92,
    kind: 160,
  });
  const [defaultMillerWidth, setDefaultMillerWidth] = useState<number>(230);
  const [millerWidths, setMillerWidths] = useState<Record<number, number>>({});

  // List View inline folder disclosure state & Miller Columns persistence refs
  const [expandedFolders, setExpandedFolders] = useState<Record<string, ExpandedFolderState>>({});
  const listRowElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastHandledRevealSeqRef = useRef<number>(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const expandedPathsRef = useRef<string[]>(expandedPaths);
  expandedPathsRef.current = expandedPaths;
  const onExpandedPathsChangeRef = useRef(onExpandedPathsChange);
  onExpandedPathsChangeRef.current = onExpandedPathsChange;
  const columnPathsRef = useRef<string[]>(columnPaths);
  columnPathsRef.current = columnPaths;
  const onColumnPathsChangeRef = useRef(onColumnPathsChange);
  onColumnPathsChangeRef.current = onColumnPathsChange;
  const restoreSeqRef = useRef(0);

  // Restore saved expanded folders (List View) or sub-columns (Miller Columns) when root location, view mode, or hidden visibility changes
  useEffect(() => {
    setColumnPreview(null);
    const seq = ++restoreSeqRef.current;
    let cancelled = false;

    // 1. Miller Columns restoration
    if (viewMode === "columns" && currentPath && columnPathsRef.current.length > 0 && isTauriRuntime()) {
      const savedCols = columnPathsRef.current;
      setExpandedFolders({});

      // Synchronously hydrate any cached sub-columns on frame 0
      const initialCols: MillerColumn[] = [];
      for (let i = 0; i < savedCols.length; i++) {
        const colPath = savedCols[i];
        const cached = getCachedDirectory(colPath, showHidden);
        if (!cached) break;
        initialCols.push({
          path: cached.currentPath,
          entries: cached.entries,
          selectedPath: savedCols[i + 1] ?? null,
          loading: false,
          error: null,
        });
      }
      setSubColumns(initialCols);
      if (initialCols.length > 0) {
        requestAnimationFrame(() => {
          if (columnsScrollRef.current) {
            columnsScrollRef.current.scrollLeft = columnsScrollRef.current.scrollWidth;
          }
        });
      }

      // Silently revalidate all saved columns in parallel; truncate at first missing folder
      (async () => {
        const results = await Promise.all(
          savedCols.map(async (colPath) => {
            try {
              const listing = await invoke<DirectoryListing>("list_directory", {
                path: colPath,
                showHidden,
              });
              setCachedDirectory(colPath, showHidden, listing);
              return { path: listing.currentPath, entries: listing.entries, ok: true as const };
            } catch {
              invalidateCachedDirectory(colPath);
              return { path: colPath, entries: [] as FileEntry[], ok: false as const };
            }
          })
        );

        if (cancelled || seq !== restoreSeqRef.current) return;

        const validCols: MillerColumn[] = [];
        const validPaths: string[] = [];
        for (const r of results) {
          if (!r.ok) break;
          validPaths.push(r.path);
          validCols.push({
            path: r.path,
            entries: r.entries,
            selectedPath: null,
            loading: false,
            error: null,
          });
        }
        for (let i = 0; i < validCols.length - 1; i++) {
          validCols[i].selectedPath = validCols[i + 1].path;
        }

        let changed = validCols.length !== initialCols.length;
        if (!changed) {
          for (let i = 0; i < validCols.length; i++) {
            if (
              validCols[i].path !== initialCols[i].path ||
              validCols[i].selectedPath !== initialCols[i].selectedPath ||
              !entriesEqual(validCols[i].entries, initialCols[i].entries)
            ) {
              changed = true;
              break;
            }
          }
        }

        if (changed) {
          setSubColumns(validCols);
          requestAnimationFrame(() => {
            if (columnsScrollRef.current) {
              columnsScrollRef.current.scrollLeft = columnsScrollRef.current.scrollWidth;
            }
          });
        }
        if (validPaths.length !== savedCols.length) {
          onColumnPathsChangeRef.current(validPaths);
        }
      })();

      return () => {
        cancelled = true;
      };
    }

    setSubColumns([]);

    // 2. List View expanded folders restoration
    const savedPaths = expandedPathsRef.current;
    if (viewMode !== "list" || !currentPath || savedPaths.length === 0 || !isTauriRuntime()) {
      setExpandedFolders({});
      return;
    }

    // Synchronously hydrate any cached expanded folders on frame 0
    const initialExpanded: Record<string, ExpandedFolderState> = {};
    for (const folderPath of savedPaths) {
      const cached = getCachedDirectory(folderPath, showHidden);
      if (cached) {
        const key = normalizePathKey(folderPath);
        initialExpanded[key] = {
          path: cached.currentPath,
          entries: cached.entries,
          loading: false,
          error: null,
        };
      }
    }
    setExpandedFolders(initialExpanded);

    // Silently revalidate all saved expanded folders in the background
    (async () => {
      const results = await Promise.all(
        savedPaths.map(async (folderPath) => {
          try {
            const listing = await invoke<DirectoryListing>("list_directory", {
              path: folderPath,
              showHidden,
            });
            setCachedDirectory(folderPath, showHidden, listing);
            return {
              folderPath: listing.currentPath,
              entries: listing.entries,
              ok: true as const,
            };
          } catch {
            invalidateCachedDirectory(folderPath);
            return { folderPath, entries: [] as FileEntry[], ok: false as const };
          }
        })
      );

      if (cancelled || seq !== restoreSeqRef.current) return;

      let changed = Object.keys(initialExpanded).length !== results.filter((r) => r.ok).length;
      const restored: Record<string, ExpandedFolderState> = {};
      const validPaths: string[] = [];
      for (const r of results) {
        if (r.ok) {
          const key = normalizePathKey(r.folderPath);
          restored[key] = {
            path: r.folderPath,
            entries: r.entries,
            loading: false,
            error: null,
          };
          validPaths.push(r.folderPath);
          const prev = initialExpanded[key];
          if (!prev || !entriesEqual(prev.entries, r.entries)) {
            changed = true;
          }
        }
      }
      if (changed) {
        setExpandedFolders(restored);
      }
      if (validPaths.length !== savedPaths.length) {
        onExpandedPathsChangeRef.current(validPaths);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tabId, currentPath, viewMode, showHidden]);

  const toggleExpandFolder = async (folderPath: string) => {
    const key = normalizePathKey(folderPath);
    if (expandedFolders[key]) {
      const nextMap = { ...expandedFolders };
      delete nextMap[key];
      setExpandedFolders(nextMap);
      onExpandedPathsChange(Object.values(nextMap).map((v) => v.path));
      return;
    }

    const existingPaths = Object.values(expandedFolders).map((v) => v.path);
    const nextPaths = existingPaths.some((p) => normalizePathKey(p) === key)
      ? existingPaths
      : [...existingPaths, folderPath];
    onExpandedPathsChange(nextPaths);

    if (!isTauriRuntime()) {
      setExpandedFolders((prev) => ({
        ...prev,
        [key]: { path: folderPath, entries: [], loading: false, error: null },
      }));
      return;
    }

    const cached = getCachedDirectory(folderPath, showHidden);
    if (cached) {
      // Instant expand from cache, then silently revalidate in background
      setExpandedFolders((prev) => ({
        ...prev,
        [key]: { path: cached.currentPath, entries: cached.entries, loading: false, error: null },
      }));
      try {
        const fresh = await invoke<DirectoryListing>("list_directory", {
          path: folderPath,
          showHidden,
        });
        setCachedDirectory(folderPath, showHidden, fresh);
        if (!entriesEqual(cached.entries, fresh.entries)) {
          setExpandedFolders((prev) => {
            if (!prev[key]) return prev;
            return {
              ...prev,
              [key]: {
                path: fresh.currentPath,
                entries: fresh.entries,
                loading: false,
                error: null,
              },
            };
          });
        }
      } catch {
        invalidateCachedDirectory(folderPath);
      }
      return;
    }

    // Cache miss: delay showing the "Loading…" row so fast local folders expand in a single clean paint
    let settled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!settled) {
        setExpandedFolders((prev) => ({
          ...prev,
          [key]: { path: folderPath, entries: [], loading: true, error: null },
        }));
      }
    }, 120);

    try {
      const result = await invoke<DirectoryListing>("list_directory", {
        path: folderPath,
        showHidden,
      });
      settled = true;
      window.clearTimeout(loadingTimer);
      setCachedDirectory(folderPath, showHidden, result);
      setExpandedFolders((prev) => ({
        ...prev,
        [key]: { path: result.currentPath, entries: result.entries, loading: false, error: null },
      }));
    } catch (err) {
      settled = true;
      window.clearTimeout(loadingTimer);
      const lockedDriveRoot = parseBitlockerLockedDrive(err);
      if (lockedDriveRoot && onUnlockDrive) {
        const unlocked = await onUnlockDrive(folderPath, lockedDriveRoot);
        if (unlocked) {
          try {
            const retried = await invoke<DirectoryListing>("list_directory", {
              path: folderPath,
              showHidden,
            });
            setCachedDirectory(folderPath, showHidden, retried);
            setExpandedFolders((prev) => ({
              ...prev,
              [key]: { path: retried.currentPath, entries: retried.entries, loading: false, error: null },
            }));
            return;
          } catch (retryErr) {
            setExpandedFolders((prev) => ({
              ...prev,
              [key]: {
                path: folderPath,
                entries: [],
                loading: false,
                error: typeof retryErr === "string" ? retryErr : String(retryErr),
              },
            }));
            return;
          }
        }
        setExpandedFolders((prev) => ({
          ...prev,
          [key]: {
            path: folderPath,
            entries: [],
            loading: false,
            error: "Locked with BitLocker",
          },
        }));
        return;
      }
      setExpandedFolders((prev) => ({
        ...prev,
        [key]: {
          path: folderPath,
          entries: [],
          loading: false,
          error: typeof err === "string" ? err : String(err),
        },
      }));
    }
  };

  const flatListRows = useMemo<FlatListRow[]>(() => {
    if (viewMode !== "list") return [];
    const rows: FlatListRow[] = [];

    const walk = (items: FileEntry[], depth: number) => {
      const ordered = sortEntries(items, sortConfig);
      for (const entry of ordered) {
        rows.push({ kind: "entry", entry, depth });
        if (entry.isDir) {
          const exp = expandedFolders[normalizePathKey(entry.path)];
          if (exp) {
            if (exp.loading) {
              rows.push({
                kind: "status",
                key: `${entry.path}::__loading`,
                text: "Loading…",
                depth: depth + 1,
              });
            } else if (exp.error) {
              rows.push({
                kind: "status",
                key: `${entry.path}::__error`,
                text: exp.error,
                depth: depth + 1,
              });
            } else if (exp.entries.length > 0) {
              walk(exp.entries, depth + 1);
            }
          }
        }
      }
    };

    walk(entries, 0);
    return rows;
  }, [viewMode, entries, sortConfig, expandedFolders]);

  // Auto-select first item in Gallery view when entering or changing folder
  useEffect(() => {
    if (viewMode !== "gallery" || loading || sortedEntries.length === 0) return;
    if (!selectedPath || !sortedEntries.some((e) => e.path === selectedPath)) {
      onSelect(sortedEntries[0]);
    }
  }, [viewMode, loading, sortedEntries, selectedPath, onSelect]);

  // Left/Right arrow navigation in Gallery view
  useEffect(() => {
    if (viewMode !== "gallery" || sortedEntries.length === 0) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      const idx = sortedEntries.findIndex((item) => item.path === selectedPath);
      const currentIdx = idx === -1 ? 0 : idx;
      const nextIdx =
        e.key === "ArrowRight"
          ? Math.min(sortedEntries.length - 1, currentIdx + 1)
          : Math.max(0, currentIdx - 1);
      onSelect(sortedEntries[nextIdx]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewMode, sortedEntries, selectedPath, onSelect]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLElement>) => {
    if (e.target === e.currentTarget) {
      onSelect(null);
    }
  };

  const handleListHeaderClick = (field: SortField) => {
    if (sortConfig.field === field) {
      onChangeSort({
        ...sortConfig,
        direction: sortConfig.direction === "asc" ? "desc" : "asc",
      });
    } else {
      onChangeSort({
        ...sortConfig,
        field,
        direction: field === "dateModified" || field === "size" ? "desc" : "asc",
      });
    }
  };

  const startListColResize = (
    col: "name" | "date" | "size" | "kind",
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = listColWidths[col];
    const minWidths = { name: 140, date: 110, size: 70, kind: 100 };
    document.body.classList.add("is-resizing-col");

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = Math.max(
        minWidths[col],
        Math.min(720, startWidth + (moveEvent.clientX - startX))
      );
      setListColWidths((prev) => ({ ...prev, [col]: next }));
    };

    const onMouseUp = () => {
      document.body.classList.remove("is-resizing-col");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const autoFitListCol = (col: "name" | "date" | "size" | "kind") => {
    let maxW = 0;
    for (const row of flatListRows) {
      if (row.kind !== "entry") continue;
      if (col === "name") {
        const w = 6 + row.depth * 18 + 16 + 5 + 18 + 5 + measureTextPx(row.entry.name) + 20;
        if (w > maxW) maxW = w;
      } else if (col === "date") {
        const w = measureTextPx(formatDateModified(row.entry.modifiedMs)) + 24;
        if (w > maxW) maxW = w;
      } else if (col === "size") {
        const w = measureTextPx(formatFileSize(row.entry)) + 24;
        if (w > maxW) maxW = w;
      } else {
        const w = measureTextPx(getKindLabel(row.entry)) + 24;
        if (w > maxW) maxW = w;
      }
    }
    const minWidths = { name: 160, date: 120, size: 76, kind: 110 };
    const fitted = Math.max(minWidths[col], Math.min(640, maxW));
    setListColWidths((prev) => ({ ...prev, [col]: fitted }));
  };

  const startMillerColResize = (
    colIndex: number,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const resizeAll = e.altKey;
    const startWidth = millerWidths[colIndex] ?? defaultMillerWidth;
    document.body.classList.add("is-resizing-col");

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = Math.max(150, Math.min(540, startWidth + (moveEvent.clientX - startX)));
      if (resizeAll) {
        setDefaultMillerWidth(next);
        setMillerWidths({});
      } else {
        setMillerWidths((prev) => ({ ...prev, [colIndex]: next }));
      }
    };

    const onMouseUp = () => {
      document.body.classList.remove("is-resizing-col");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const autoFitMillerCol = (colIndex: number, fitAll: boolean) => {
    const computeFit = (col: MillerColumn) => {
      let maxW = 160;
      for (const entry of col.entries) {
        const w = 16 + 18 + 7 + measureTextPx(entry.name) + (entry.isDir ? 22 : 12) + 16;
        if (w > maxW) maxW = w;
      }
      return Math.max(160, Math.min(520, maxW));
    };

    if (fitAll) {
      const nextWidths: Record<number, number> = {};
      allMillerColumns.forEach((col, i) => {
        nextWidths[i] = computeFit(col);
      });
      setMillerWidths(nextWidths);
    } else if (allMillerColumns[colIndex]) {
      const fitted = computeFit(allMillerColumns[colIndex]);
      setMillerWidths((prev) => ({ ...prev, [colIndex]: fitted }));
    }
  };

  const handleColumnSelect = async (colIndex: number, entry: FileEntry) => {
    // Always update global selectedEntry so Toolbar Share works for any column
    onSelect(entry);
    if (colIndex > 0) {
      setSubColumns((prev) =>
        prev.map((col, i) =>
          i === colIndex - 1 ? { ...col, selectedPath: entry.path } : col
        )
      );
    }

    // Truncate any columns to the right of colIndex
    const baseSubCols = subColumns.slice(0, colIndex).map((col, idx) =>
      idx === colIndex - 1 ? { ...col, selectedPath: entry.path } : col
    );

    if (!entry.isDir) {
      setSubColumns(baseSubCols);
      onColumnPathsChange(baseSubCols.map((c) => c.path));
      setColumnPreview(entry);
      requestAnimationFrame(() => {
        if (columnsScrollRef.current) {
          columnsScrollRef.current.scrollLeft = columnsScrollRef.current.scrollWidth;
        }
      });
      return;
    }

    setColumnPreview(null);
    const reqId = ++columnReqIdRef.current;
    onColumnPathsChange([...baseSubCols.map((c) => c.path), entry.path]);

    if (!isTauriRuntime()) {
      setSubColumns([
        ...baseSubCols,
        {
          path: entry.path,
          entries: [],
          selectedPath: null,
          loading: false,
          error: null,
        },
      ]);
      return;
    }

    const scrollRight = () => {
      requestAnimationFrame(() => {
        if (columnsScrollRef.current) {
          columnsScrollRef.current.scrollLeft = columnsScrollRef.current.scrollWidth;
        }
      });
    };

    const cached = getCachedDirectory(entry.path, showHidden);
    if (cached) {
      setSubColumns([
        ...baseSubCols,
        {
          path: cached.currentPath,
          entries: cached.entries,
          selectedPath: null,
          loading: false,
          error: null,
        },
      ]);
      scrollRight();

      try {
        const fresh = await invoke<DirectoryListing>("list_directory", {
          path: entry.path,
          showHidden,
        });
        setCachedDirectory(entry.path, showHidden, fresh);
        if (reqId !== columnReqIdRef.current) return;
        if (!entriesEqual(cached.entries, fresh.entries)) {
          setSubColumns((prev) => {
            const next = prev.slice(0, colIndex);
            next.push({
              path: fresh.currentPath,
              entries: fresh.entries,
              selectedPath: null,
              loading: false,
              error: null,
            });
            return next;
          });
        }
      } catch {
        invalidateCachedDirectory(entry.path);
      }
      return;
    }

    let settled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!settled && reqId === columnReqIdRef.current) {
        setSubColumns([
          ...baseSubCols,
          {
            path: entry.path,
            entries: [],
            selectedPath: null,
            loading: true,
            error: null,
          },
        ]);
        scrollRight();
      }
    }, 120);

    try {
      const result = await invoke<DirectoryListing>("list_directory", {
        path: entry.path,
        showHidden,
      });
      settled = true;
      window.clearTimeout(loadingTimer);
      setCachedDirectory(entry.path, showHidden, result);
      if (reqId !== columnReqIdRef.current) return;
      setSubColumns((prev) => {
        const next = prev.slice(0, colIndex);
        next.push({
          path: result.currentPath,
          entries: result.entries,
          selectedPath: null,
          loading: false,
          error: null,
        });
        return next;
      });
      scrollRight();
    } catch (err) {
      settled = true;
      window.clearTimeout(loadingTimer);
      if (reqId !== columnReqIdRef.current) return;
      const lockedDriveRoot = parseBitlockerLockedDrive(err);
      if (lockedDriveRoot && onUnlockDrive) {
        const unlocked = await onUnlockDrive(entry.path, lockedDriveRoot);
        if (reqId !== columnReqIdRef.current) return;
        if (unlocked) {
          try {
            const retried = await invoke<DirectoryListing>("list_directory", {
              path: entry.path,
              showHidden,
            });
            setCachedDirectory(entry.path, showHidden, retried);
            if (reqId !== columnReqIdRef.current) return;
            setSubColumns((prev) => {
              const next = prev.slice(0, colIndex);
              next.push({
                path: retried.currentPath,
                entries: retried.entries,
                selectedPath: null,
                loading: false,
                error: null,
              });
              return next;
            });
            scrollRight();
            return;
          } catch (retryErr) {
            if (reqId !== columnReqIdRef.current) return;
            setSubColumns((prev) => {
              const next = prev.slice(0, colIndex);
              next.push({
                path: entry.path,
                entries: [],
                selectedPath: null,
                loading: false,
                error: typeof retryErr === "string" ? retryErr : String(retryErr),
              });
              return next;
            });
            scrollRight();
            return;
          }
        }
        setSubColumns((prev) => {
          const next = prev.slice(0, colIndex);
          next.push({
            path: entry.path,
            entries: [],
            selectedPath: null,
            loading: false,
            error: "Locked with BitLocker",
          });
          return next;
        });
        scrollRight();
        return;
      }
      setSubColumns((prev) => {
        const next = prev.slice(0, colIndex);
        next.push({
          path: entry.path,
          entries: [],
          selectedPath: null,
          loading: false,
          error: typeof err === "string" ? err : String(err),
        });
        return next;
      });
      scrollRight();
    }
  };

  const renderSortArrow = (field: SortField) => {
    if (sortConfig.field !== field) return null;
    return sortConfig.direction === "asc" ? (
      <ChevronUp size={12} strokeWidth={2.2} className="list-sort-icon" />
    ) : (
      <ChevronDown size={12} strokeWidth={2.2} className="list-sort-icon" />
    );
  };

  const galleryActiveItem =
    sortedEntries.find((e) => e.path === selectedPath) ?? sortedEntries[0] ?? null;

  const allMillerColumns: MillerColumn[] = [
    {
      path: currentPath,
      entries: sortedEntries,
      selectedPath: subColumns[0]?.path ?? selectedPath,
      loading: false,
      error: null,
    },
    ...subColumns.map((col) => ({
      ...col,
      entries: sortEntries(col.entries, sortConfig),
    })),
  ];

  // Reveal, highlight, and scroll the target directory into view when switching to List or Columns view
  useEffect(() => {
    if (!revealRequest || loading) return;
    if (revealRequest.seq === lastHandledRevealSeqRef.current) return;
    if (!currentPath || normalizePathKey(currentPath) !== normalizePathKey(revealRequest.anchorRoot)) {
      return;
    }

    const targetKey = normalizePathKey(revealRequest.path);

    if (viewMode === "list") {
      const matched = flatListRows.find(
        (row) => row.kind === "entry" && normalizePathKey(row.entry.path) === targetKey
      );
      if (!matched || matched.kind !== "entry") return;

      lastHandledRevealSeqRef.current = revealRequest.seq;
      onSelectRef.current(matched.entry);
      requestAnimationFrame(() => {
        const el = listRowElsRef.current.get(targetKey);
        el?.scrollIntoView({ block: "center", behavior: "auto" });
      });
      return;
    }

    if (viewMode === "columns") {
      const colIdx = subColumns.findIndex(
        (col) => !col.loading && normalizePathKey(col.path) === targetKey
      );
      if (colIdx === -1) return;

      lastHandledRevealSeqRef.current = revealRequest.seq;
      const parentEntries = colIdx === 0 ? sortedEntries : subColumns[colIdx - 1]?.entries ?? [];
      const targetEntry = parentEntries.find((e) => normalizePathKey(e.path) === targetKey);
      if (targetEntry) {
        onSelectRef.current(targetEntry);
      }

      requestAnimationFrame(() => {
        const container = columnsScrollRef.current;
        if (!container) return;
        const selectedRows = container.querySelectorAll<HTMLElement>(".miller-row.selected");
        selectedRows.forEach((rowEl) => {
          rowEl.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        });
        container.scrollLeft = container.scrollWidth;
      });
    }
  }, [revealRequest, loading, currentPath, viewMode, flatListRows, subColumns, sortedEntries]);

  const renderBody = () => {
    if (error) {
      return (
        <div className="canvas-state error-state">
          <p className="state-title">Unable to open location</p>
          <p className="state-subtitle">{error}</p>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="canvas-state">
          <div className="finder-spinner" aria-hidden="true" />
          <p className="state-subtitle">{loadingMessage || "Loading…"}</p>
        </div>
      );
    }

    if (sortedEntries.length === 0) {
      return (
        <div className="canvas-state">
          <p className="state-subtitle">{emptyMessage || "This folder is empty"}</p>
        </div>
      );
    }

    if (viewMode === "list") {
      const listGridStyle: React.CSSProperties = {
        gridTemplateColumns: `${listColWidths.name}px ${listColWidths.date}px ${listColWidths.size}px ${listColWidths.kind}px`,
      };
      return (
        <div className="list-view" onClick={handleCanvasClick}>
          <div className="list-scroll-container">
            <div className="list-header" role="row" style={listGridStyle}>
              <div className="list-col-hdr-wrap">
                <button
                  type="button"
                  className={`list-col-hdr col-name ${sortConfig.field === "name" ? "active" : ""}`}
                  onClick={() => handleListHeaderClick("name")}
                >
                  <span>Name</span>
                  {renderSortArrow("name")}
                </button>
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => startListColResize("name", e)}
                  onDoubleClick={() => autoFitListCol("name")}
                  title="Drag to resize (double-click to auto-fit)"
                  aria-hidden="true"
                />
              </div>
              <div className="list-col-hdr-wrap">
                <button
                  type="button"
                  className={`list-col-hdr col-date ${sortConfig.field === "dateModified" ? "active" : ""}`}
                  onClick={() => handleListHeaderClick("dateModified")}
                >
                  <span>Date Modified</span>
                  {renderSortArrow("dateModified")}
                </button>
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => startListColResize("date", e)}
                  onDoubleClick={() => autoFitListCol("date")}
                  title="Drag to resize (double-click to auto-fit)"
                  aria-hidden="true"
                />
              </div>
              <div className="list-col-hdr-wrap">
                <button
                  type="button"
                  className={`list-col-hdr col-size ${sortConfig.field === "size" ? "active" : ""}`}
                  onClick={() => handleListHeaderClick("size")}
                >
                  <span>Size</span>
                  {renderSortArrow("size")}
                </button>
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => startListColResize("size", e)}
                  onDoubleClick={() => autoFitListCol("size")}
                  title="Drag to resize (double-click to auto-fit)"
                  aria-hidden="true"
                />
              </div>
              <div className="list-col-hdr-wrap">
                <button
                  type="button"
                  className={`list-col-hdr col-kind ${sortConfig.field === "kind" ? "active" : ""}`}
                  onClick={() => handleListHeaderClick("kind")}
                >
                  <span>Kind</span>
                  {renderSortArrow("kind")}
                </button>
                <div
                  className="col-resize-handle"
                  onMouseDown={(e) => startListColResize("kind", e)}
                  onDoubleClick={() => autoFitListCol("kind")}
                  title="Drag to resize (double-click to auto-fit)"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="list-body" role="rowgroup" onClick={handleCanvasClick}>
              {flatListRows.map((row, idx) => {
                if (row.kind === "status") {
                  return (
                    <div
                      key={row.key}
                      role="row"
                      style={listGridStyle}
                      className={`list-row list-status-row ${idx % 2 === 1 ? "alt" : ""}`}
                    >
                      <span
                        className="list-cell col-name"
                        style={{ paddingLeft: `${8 + row.depth * 18 + 20}px` }}
                      >
                        <span className="list-status-text">{row.text}</span>
                      </span>
                      <span className="list-cell col-date" />
                      <span className="list-cell col-size" />
                      <span className="list-cell col-kind" />
                    </div>
                  );
                }

                const { entry, depth } = row;
                const entryKey = normalizePathKey(entry.path);
                const isSelected =
                  selectedPath !== null && normalizePathKey(selectedPath) === entryKey;
                const isExpanded = Boolean(expandedFolders[entryKey]);
                return (
                  <div
                    key={entry.path}
                    ref={(el) => {
                      if (el) {
                        listRowElsRef.current.set(entryKey, el);
                      } else {
                        listRowElsRef.current.delete(entryKey);
                      }
                    }}
                    role="row"
                    tabIndex={0}
                    style={listGridStyle}
                    className={`list-row ${idx % 2 === 1 ? "alt" : ""} ${isSelected ? "selected" : ""}`}
                    {...getFolderDragProps(entry)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (entry.isDir && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        onOpenFolderInNewTab?.(entry.path);
                        return;
                      }
                      onSelect(entry);
                    }}
                    onAuxClick={(e) => {
                      if (e.button === 1 && entry.isDir) {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenFolderInNewTab?.(entry.path);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect(entry);
                      onContextMenu(entry);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (entry.isDir) {
                        onOpenFolder(entry.path);
                      } else {
                        onOpenItem(entry);
                      }
                    }}
                  >
                    <span
                      className="list-cell col-name"
                      style={{ paddingLeft: `${6 + depth * 18}px` }}
                    >
                      {entry.isDir ? (
                        <button
                          type="button"
                          className={`list-disclosure-btn ${isExpanded ? "expanded" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleExpandFolder(entry.path);
                          }}
                          onDoubleClick={(e) => e.stopPropagation()}
                          aria-label={isExpanded ? `Collapse ${entry.name}` : `Expand ${entry.name}`}
                          aria-expanded={isExpanded}
                        >
                          <ChevronRight size={13} strokeWidth={2.2} />
                        </button>
                      ) : (
                        <span className="list-disclosure-spacer" aria-hidden="true" />
                      )}
                      <span className="list-icon-slot">
                        <FileIcon
                          name={entry.name}
                          isDir={entry.isDir}
                          entryKind={entry.entryKind}
                          extension={entry.extension}
                          iconDataUrl={entry.iconDataUrl}
                          isLocked={entry.isLocked}
                          size={18}
                        />
                      </span>
                      <span className="list-name-text">{entry.name}</span>
                    </span>
                    <span className="list-cell col-date">
                      {formatDateModified(entry.modifiedMs)}
                    </span>
                    <span className="list-cell col-size">
                      {formatFileSize(entry)}
                    </span>
                    <span className="list-cell col-kind">
                      {getKindLabel(entry)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === "columns") {
      return (
        <div className="columns-view" ref={columnsScrollRef}>
          {allMillerColumns.map((col, colIdx) => {
            const colWidth = millerWidths[colIdx] ?? defaultMillerWidth;
            return (
              <div
                key={`${colIdx}-${col.path}`}
                className="miller-column"
                style={{ width: `${colWidth}px`, minWidth: `${colWidth}px` }}
              >
                <div className="miller-column-scroll">
                  {col.loading ? (
                    <div className="miller-empty">
                      <div className="finder-spinner" aria-hidden="true" />
                    </div>
                  ) : col.error ? (
                    <div className="miller-empty">{col.error}</div>
                  ) : col.entries.length === 0 ? (
                    <div className="miller-empty">Empty folder</div>
                  ) : (
                    col.entries.map((entry) => {
                      const entryKey = normalizePathKey(entry.path);
                      const isSelected =
                        col.selectedPath !== null &&
                        normalizePathKey(col.selectedPath) === entryKey;
                      const isTrail =
                        colIdx < allMillerColumns.length - 1 &&
                        normalizePathKey(allMillerColumns[colIdx + 1].path) === entryKey;
                      return (
                        <button
                          key={entry.path}
                          type="button"
                          className={`miller-row ${isSelected ? "selected" : ""} ${isTrail && !isSelected ? "trail" : ""}`}
                          {...getFolderDragProps(entry)}
                          onClick={(e) => {
                            if (entry.isDir && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenFolderInNewTab?.(entry.path);
                              return;
                            }
                            void handleColumnSelect(colIdx, entry);
                          }}
                          onAuxClick={(e) => {
                            if (e.button === 1 && entry.isDir) {
                              e.preventDefault();
                              e.stopPropagation();
                              onOpenFolderInNewTab?.(entry.path);
                            }
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelect(entry);
                            if (colIdx > 0) {
                              setSubColumns((prev) =>
                                prev.map((c, i) =>
                                  i === colIdx - 1 ? { ...c, selectedPath: entry.path } : c
                                )
                              );
                            }
                            onContextMenu(entry);
                          }}
                          onDoubleClick={() => {
                            if (entry.isDir) {
                              onOpenFolder(entry.path);
                            } else {
                              onOpenItem(entry);
                            }
                          }}
                          title={entry.isLocked ? `${entry.name} (BitLocker Locked)` : entry.name}
                        >
                          <span className="miller-icon-slot">
                            <FileIcon
                              name={entry.name}
                              isDir={entry.isDir}
                              entryKind={entry.entryKind}
                              extension={entry.extension}
                              iconDataUrl={entry.iconDataUrl}
                              isLocked={entry.isLocked}
                              size={18}
                            />
                          </span>
                          <span className="miller-label">{entry.name}</span>
                          {entry.isDir && (
                            <ChevronRight size={13} strokeWidth={2} className="miller-chevron" />
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                <div
                  className="miller-resize-handle"
                  onMouseDown={(e) => startMillerColResize(colIdx, e)}
                  onDoubleClick={(e) => autoFitMillerCol(colIdx, e.altKey)}
                  title="Drag to resize (Alt-drag for all, double-click to auto-fit)"
                  aria-hidden="true"
                />
              </div>
            );
          })}

          {columnPreview && (
            <div className="miller-preview">
              <div className="preview-icon-wrap">
                <FileIcon
                  name={columnPreview.name}
                  isDir={columnPreview.isDir}
                  entryKind={columnPreview.entryKind}
                  extension={columnPreview.extension}
                  iconDataUrl={columnPreview.iconDataUrl}
                  size={104}
                />
              </div>
              <div className="preview-name">{columnPreview.name}</div>
              <div className="preview-kind">{getKindLabel(columnPreview)}</div>

              <div className="preview-meta">
                <div className="preview-meta-row">
                  <span className="meta-key">Kind</span>
                  <span className="meta-val">{getKindLabel(columnPreview)}</span>
                </div>
                <div className="preview-meta-row">
                  <span className="meta-key">Size</span>
                  <span className="meta-val">{formatFileSize(columnPreview)}</span>
                </div>
                <div className="preview-meta-row">
                  <span className="meta-key">Modified</span>
                  <span className="meta-val">{formatDateModified(columnPreview.modifiedMs)}</span>
                </div>
              </div>

              <button
                type="button"
                className="preview-open-btn"
                onClick={() => onOpenItem(columnPreview)}
              >
                Open
              </button>
            </div>
          )}
        </div>
      );
    }

    if (viewMode === "gallery") {
      return (
        <div className="gallery-view">
          <div className="gallery-stage">
            {galleryActiveItem && (
              <div
                className="gallery-hero"
                {...getFolderDragProps(galleryActiveItem)}
                onClick={(e) => {
                  if (galleryActiveItem.isDir && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenFolderInNewTab?.(galleryActiveItem.path);
                  }
                }}
                onAuxClick={(e) => {
                  if (e.button === 1 && galleryActiveItem.isDir) {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenFolderInNewTab?.(galleryActiveItem.path);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenu(galleryActiveItem);
                }}
                onDoubleClick={() => {
                  if (galleryActiveItem.isDir) {
                    onOpenFolder(galleryActiveItem.path);
                  } else {
                    onOpenItem(galleryActiveItem);
                  }
                }}
              >
                <div className="gallery-hero-icon">
                  <FileIcon
                    name={galleryActiveItem.name}
                    isDir={galleryActiveItem.isDir}
                    entryKind={galleryActiveItem.entryKind}
                    extension={galleryActiveItem.extension}
                    iconDataUrl={galleryActiveItem.iconDataUrl}
                    isLocked={galleryActiveItem.isLocked}
                    size={124}
                  />
                </div>
                <div className="gallery-hero-name">{galleryActiveItem.name}</div>
                <div className="gallery-hero-meta">
                  <span>{getKindLabel(galleryActiveItem)}</span>
                  {formatFileSize(galleryActiveItem) !== "--" && (
                    <>
                      <span className="meta-dot">•</span>
                      <span>{formatFileSize(galleryActiveItem)}</span>
                    </>
                  )}
                  {galleryActiveItem.modifiedMs && (
                    <>
                      <span className="meta-dot">•</span>
                      <span>{formatDateModified(galleryActiveItem.modifiedMs)}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="gallery-strip" role="listbox" aria-label="Items strip">
            {sortedEntries.map((entry) => {
              const isSelected = galleryActiveItem?.path === entry.path;
              return (
                <button
                  key={entry.path}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`gallery-thumb ${isSelected ? "selected" : ""}`}
                  {...getFolderDragProps(entry)}
                  onClick={(e) => {
                    if (entry.isDir && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenFolderInNewTab?.(entry.path);
                      return;
                    }
                    onSelect(entry);
                  }}
                  onAuxClick={(e) => {
                    if (e.button === 1 && entry.isDir) {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenFolderInNewTab?.(entry.path);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(entry);
                    onContextMenu(entry);
                  }}
                  onDoubleClick={() => {
                    if (entry.isDir) {
                      onOpenFolder(entry.path);
                    } else {
                      onOpenItem(entry);
                    }
                  }}
                  title={entry.isLocked ? `${entry.name} (BitLocker Locked)` : entry.name}
                >
                  <div className="gallery-thumb-box">
                    <FileIcon
                      name={entry.name}
                      isDir={entry.isDir}
                      entryKind={entry.entryKind}
                      extension={entry.extension}
                      iconDataUrl={entry.iconDataUrl}
                      isLocked={entry.isLocked}
                      size={44}
                    />
                  </div>
                  <span className="gallery-thumb-label">{entry.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    // Default: Icons View
    return (
      <div className="icon-grid" onClick={handleCanvasClick}>
        {sortedEntries.map((entry) => {
          const isSelected = selectedPath === entry.path;
          return (
            <button
              key={entry.path}
              type="button"
              className={`icon-tile ${isSelected ? "selected" : ""}`}
              {...getFolderDragProps(entry)}
              onClick={(e) => {
                e.stopPropagation();
                if (entry.isDir && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  onOpenFolderInNewTab?.(entry.path);
                  return;
                }
                onSelect(entry);
              }}
              onAuxClick={(e) => {
                if (e.button === 1 && entry.isDir) {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenFolderInNewTab?.(entry.path);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(entry);
                onContextMenu(entry);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (entry.isDir) {
                  onOpenFolder(entry.path);
                } else {
                  onOpenItem(entry);
                }
              }}
              title={entry.isLocked ? `${entry.name} (BitLocker Locked)` : entry.name}
            >
              <div className="icon-thumb">
                <FileIcon
                  name={entry.name}
                  isDir={entry.isDir}
                  entryKind={entry.entryKind}
                  extension={entry.extension}
                  iconDataUrl={entry.iconDataUrl}
                  isLocked={entry.isLocked}
                  size={62}
                />
              </div>
              <span className="icon-label">{entry.name}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const canEmptyTrash = isTrashView && !loading && !emptyingTrash && sortedEntries.length > 0;
  const isSearchView = Boolean(searchQuery && searchQuery.length > 0);

  return (
    <div className="finder-main-wrapper">
      {bitlockerNotice && (
        <div className="bitlocker-banner" role="status" aria-live="polite">
          <div className="bitlocker-banner-info">
            <Lock size={14} strokeWidth={2} className="bitlocker-banner-icon" aria-hidden="true" />
            <span className="bitlocker-banner-text">{bitlockerNotice.message}</span>
          </div>
          <div className="bitlocker-banner-actions">
            <button
              type="button"
              className="bitlocker-unlock-btn"
              onClick={() => onRetryUnlockDrive?.()}
            >
              Unlock…
            </button>
            <button
              type="button"
              className="bitlocker-dismiss-btn"
              onClick={() => onDismissBitlockerNotice?.()}
              aria-label="Dismiss BitLocker notice"
              title="Dismiss"
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      )}

      {isSearchView && (
        <div className="search-header-panel" role="region" aria-label="Search results">
          <div className="search-header-info">
            <Search size={14} strokeWidth={1.9} className="search-header-icon" aria-hidden="true" />
            <span className="search-header-query" title={`Search: "${searchQuery}"`}>
              Search: &ldquo;{searchQuery}&rdquo;
            </span>
            {searchScopeName && (
              <span className="search-header-scope">in {searchScopeName}</span>
            )}
            <span className="search-header-count">
              {loading
                ? "Searching…"
                : `${sortedEntries.length} ${sortedEntries.length === 1 ? "item" : "items"}`}
            </span>
          </div>
          <button
            type="button"
            className="trash-empty-btn"
            onClick={() => onClearSearch?.()}
            title="Clear search and return to folder"
          >
            Clear
          </button>
        </div>
      )}

      {isTrashView && (
        <div className="trash-header-panel" role="region" aria-label="Trash actions">
          <div className="trash-header-info">
            <Trash2 size={14} strokeWidth={1.85} className="trash-header-icon" aria-hidden="true" />
            <span className="trash-header-text">
              {loading
                ? "Loading Trash…"
                : sortedEntries.length === 0
                  ? "Trash is empty"
                  : `${sortedEntries.length} ${sortedEntries.length === 1 ? "item" : "items"} in Trash`}
            </span>
          </div>
          <button
            type="button"
            className="trash-empty-btn"
            disabled={!canEmptyTrash}
            onClick={() => setConfirmEmptyOpen(true)}
            title={
              sortedEntries.length === 0
                ? "Trash is already empty"
                : "Permanently erase all items in the Trash"
            }
          >
            {emptyingTrash ? "Emptying…" : "Empty"}
          </button>
        </div>
      )}

      <main
        className={`finder-canvas view-${viewMode}`}
        onClick={handleCanvasClick}
        aria-label="Folder contents"
      >
        {renderBody()}
      </main>

      {confirmEmptyOpen && (
        <div
          className="finder-modal-backdrop"
          role="presentation"
          onClick={() => setConfirmEmptyOpen(false)}
        >
          <div
            className="finder-modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="empty-trash-title"
            aria-describedby="empty-trash-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="finder-modal-icon">
              <Trash2 size={28} strokeWidth={1.6} />
            </div>
            <h2 id="empty-trash-title" className="finder-modal-title">
              Are you sure you want to permanently erase the items in the Trash?
            </h2>
            <p id="empty-trash-desc" className="finder-modal-desc">
              You can&apos;t undo this action.
            </p>
            <div className="finder-modal-actions">
              <button
                type="button"
                className="finder-modal-btn secondary"
                onClick={() => setConfirmEmptyOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="finder-modal-btn destructive"
                onClick={() => {
                  setConfirmEmptyOpen(false);
                  onEmptyTrash?.();
                }}
              >
                Empty Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Path Bar */}
      <div
        ref={pathbarRef}
        className="finder-pathbar"
        aria-label="Path bar"
        onWheel={(e) => {
          const el = pathbarRef.current;
          if (!el || el.scrollWidth <= el.clientWidth) return;
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            el.scrollLeft += e.deltaY;
          }
        }}
      >
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <React.Fragment key={crumb.path}>
              {index > 0 && (
                <ChevronRight
                  size={12}
                  strokeWidth={2}
                  className="pathbar-sep"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                className={`pathbar-crumb ${isLast ? "current" : ""}`}
                title={crumb.path}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    onOpenFolderInNewTab?.(crumb.path);
                    return;
                  }
                  if (!isLast || isSearchView) onOpenFolder(crumb.path);
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onOpenFolderInNewTab?.(crumb.path);
                  }
                }}
              >
                {renderBreadcrumbIcon(crumb, index, homePath)}
                <span>{crumb.name}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* Bottom Status Bar */}
      <footer className="finder-statusbar">
        <span>
          {loading
            ? loadingMessage || "Loading…"
            : selectedPath
              ? `1 of ${sortedEntries.length} ${sortedEntries.length === 1 ? "item" : "items"} selected`
              : `${sortedEntries.length} ${sortedEntries.length === 1 ? "item" : "items"}`}
        </span>
      </footer>
    </div>
  );
};
