import React, { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar } from "./components/Sidebar";
import { Toolbar } from "./components/Toolbar";
import { MainView } from "./components/MainView";
import type {
  DirectoryListing,
  FileEntry,
  SidebarLocations,
  SortConfig,
  ViewMode,
} from "./types";

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
  const parts = targetPath.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || targetPath;
}

export const App: React.FC = () => {
  const [locations, setLocations] = useState<SidebarLocations | null>(null);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [selectedEntry, setSelectedEntry] = useState<FileEntry | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(204);
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: "name",
    direction: "asc",
    foldersFirst: true,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const fetchDirectory = useCallback(async (targetPath?: string): Promise<DirectoryListing | null> => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setSelectedEntry(null);
    setPendingPath(targetPath ?? "");

    if (!isTauriRuntime()) {
      setListing(MOCK_PREVIEW_LISTING);
      setPendingPath(null);
      setLoading(false);
      return MOCK_PREVIEW_LISTING;
    }

    try {
      const result = await invoke<DirectoryListing>("list_directory", {
        path: targetPath ?? null,
      });
      if (reqId !== requestIdRef.current) {
        return null;
      }
      setListing(result);
      setPendingPath(null);
      setLoading(false);
      return result;
    } catch (err) {
      if (reqId !== requestIdRef.current) {
        return null;
      }
      setError(typeof err === "string" ? err : String(err));
      setPendingPath(null);
      setLoading(false);
      return null;
    }
  }, []);

  // Initial load: resolve sidebar locations & open ~/
  useEffect(() => {
    let active = true;
    (async () => {
      if (isTauriRuntime()) {
        try {
          const locs = await invoke<SidebarLocations>("get_sidebar_locations");
          if (active) setLocations(locs);
        } catch {
          // Fallback to listing homeInfo
        }
      } else {
        setLocations(MOCK_LOCATIONS);
      }

      const data = await fetchDirectory();
      if (active && data) {
        setHistory([data.currentPath]);
        setHistoryIndex(0);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchDirectory]);

  const activePath = pendingPath ?? listing?.currentPath ?? "";

  const navigateTo = useCallback(
    async (path: string) => {
      if (activePath === path && !error) return;
      const data = await fetchDirectory(path);
      if (data) {
        setHistory((prev) => {
          const next = prev.slice(0, historyIndex + 1);
          next.push(data.currentPath);
          return next;
        });
        setHistoryIndex((idx) => idx + 1);
      }
    },
    [activePath, error, fetchDirectory, historyIndex]
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
        if (invoked && listing && !listing.currentPath.startsWith("virtual://")) {
          void fetchDirectory(listing.currentPath);
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

  const handleRevealInExplorer = useCallback(async (entry: FileEntry) => {
    if (!isTauriRuntime()) return;
    try {
      await invoke("reveal_in_file_manager", { path: entry.path });
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    }
  }, []);

  const handleBack = useCallback(async () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const target = history[nextIndex];
    const data = await fetchDirectory(target);
    if (data) {
      setHistoryIndex(nextIndex);
    }
  }, [fetchDirectory, history, historyIndex]);

  const handleForward = useCallback(async () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    const target = history[nextIndex];
    const data = await fetchDirectory(target);
    if (data) {
      setHistoryIndex(nextIndex);
    }
  }, [fetchDirectory, history, historyIndex]);

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
        currentPath={activePath}
        width={sidebarWidth}
        onResizeWidth={setSidebarWidth}
        onNavigate={(target) => void navigateTo(target)}
        onWindowClose={handleWindowClose}
        onWindowMinimize={handleWindowMinimize}
        onWindowMaximize={handleWindowMaximize}
      />

      <div className="finder-content-column">
        <Toolbar
          title={displayTitle}
          canGoBack={historyIndex > 0}
          canGoForward={historyIndex < history.length - 1}
          viewMode={viewMode}
          sortConfig={sortConfig}
          selectedEntry={selectedEntry}
          onBack={() => void handleBack()}
          onForward={() => void handleForward()}
          onChangeViewMode={setViewMode}
          onChangeSort={setSortConfig}
          onShareWithOs={(entry) => void handleShareWithOs(entry)}
          onCopyFile={(entry) => void handleCopyFile(entry)}
          onCopyPath={(entry) => void handleCopyPath(entry)}
          onRevealInExplorer={(entry) => void handleRevealInExplorer(entry)}
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
          loading={loading}
          loadingMessage={loadingMessage}
          error={error}
          emptyMessage={listing?.emptyMessage ?? null}
          onSelect={setSelectedEntry}
          onOpenFolder={(p) => void navigateTo(p)}
          onOpenItem={(entry) => void handleOpenItem(entry)}
          onContextMenu={(entry) => void handleContextMenu(entry)}
          onChangeSort={setSortConfig}
        />
      </div>
    </div>
  );
};

export default App;
