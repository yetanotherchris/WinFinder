import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LayoutGrid,
  List,
  Columns3,
  GalleryHorizontalEnd,
  ArrowUpDown,
  Share,
  CircleEllipsis,
  Search,
  X,
  Check,
  Copy,
  Link,
  FolderOpen,
  FolderPlus,
  FolderInput,
  Terminal,
  RefreshCw,
  Share2,
  Settings,
  Plus,
} from "lucide-react";
import type { FileEntry, SortConfig, SortField, ViewMode } from "../types";

interface ToolbarProps {
  title: string;
  currentPath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  viewMode: ViewMode;
  sortConfig: SortConfig;
  showHidden: boolean;
  selectedEntry: FileEntry | null;
  useWindowsWindowControls: boolean;
  isWindowMaximized: boolean;
  onBack: () => void;
  onForward: () => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onChangeSort: (next: SortConfig) => void;
  onShareWithOs: (entry: FileEntry) => void;
  onCopyFile: (entry: FileEntry) => void;
  onCopyPath: (entry: FileEntry) => void;
  onNewTab: () => void;
  onOpenInNewTab: (path: string) => void;
  tabBarVisible: boolean;
  canToggleTabBar: boolean;
  onToggleTabBar: () => void;
  onNewFolder: () => void;
  onGoToPath: () => void;
  onToggleShowHidden: () => void;
  onOpenInTerminal: () => void;
  onCopyCurrentPath: () => void;
  onShowInExplorer: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onWindowClose: () => void;
  onWindowMinimize: () => void;
  onWindowMaximize: () => void;
  searchOpen: boolean;
  searchQuery: string;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenSearch: () => void;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: () => void;
  onCloseSearch: () => void;
}

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "kind", label: "Kind" },
  { field: "dateModified", label: "Date Modified" },
  { field: "size", label: "Size" },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  title,
  currentPath,
  canGoBack,
  canGoForward,
  viewMode,
  sortConfig,
  showHidden,
  selectedEntry,
  useWindowsWindowControls,
  isWindowMaximized,
  onBack,
  onForward,
  onChangeViewMode,
  onChangeSort,
  onShareWithOs,
  onCopyFile,
  onCopyPath,
  onNewTab,
  onOpenInNewTab,
  tabBarVisible,
  canToggleTabBar,
  onToggleTabBar,
  onNewFolder,
  onGoToPath,
  onToggleShowHidden,
  onOpenInTerminal,
  onCopyCurrentPath,
  onShowInExplorer,
  onRefresh,
  onOpenSettings,
  onWindowClose,
  onWindowMinimize,
  onWindowMaximize,
  searchOpen,
  searchQuery,
  searchInputRef,
  onOpenSearch,
  onSearchQueryChange,
  onSearchSubmit,
  onCloseSearch,
}) => {
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sortMenuOpen && !shareMenuOpen && !actionsMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (sortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
      if (shareMenuOpen && shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false);
      }
      if (actionsMenuOpen && actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSortMenuOpen(false);
        setShareMenuOpen(false);
        setActionsMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortMenuOpen, shareMenuOpen, actionsMenuOpen]);

  // Close share menu if selection disappears
  useEffect(() => {
    if (!selectedEntry) {
      setShareMenuOpen(false);
    }
  }, [selectedEntry]);

  const isRealDirectory = Boolean(currentPath && !currentPath.startsWith("virtual://"));
  const isRealFsItem = Boolean(
    selectedEntry &&
      selectedEntry.entryKind !== "app" &&
      !selectedEntry.path.startsWith("virtual://")
  );
  const canShareFile = Boolean(selectedEntry && selectedEntry.entryKind === "file");

  const handleSelectField = (field: SortField) => {
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
    setSortMenuOpen(false);
  };

  return (
    <header
      className={`finder-toolbar ${useWindowsWindowControls ? "has-win-controls" : ""}`}
      data-tauri-drag-region
    >
      {/* Left: Back/Forward + Folder Title */}
      <div className="toolbar-left" data-tauri-drag-region>
        <div className="nav-buttons">
          <button
            type="button"
            className="toolbar-btn nav-btn"
            onClick={onBack}
            disabled={!canGoBack}
            title="Back"
            aria-label="Back"
          >
            <ChevronLeft size={19} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className="toolbar-btn nav-btn"
            onClick={onForward}
            disabled={!canGoForward}
            title="Forward"
            aria-label="Forward"
          >
            <ChevronRight size={19} strokeWidth={1.8} />
          </button>
        </div>
        <h1 className="toolbar-title" data-tauri-drag-region title={title}>
          {title}
        </h1>
      </div>

      {/* Right: View Switcher, Sort Menu & Filler Controls */}
      <div className="toolbar-right">
        {/* Segmented View Switcher */}
        <div className="segmented-control" role="group" aria-label="View mode">
          <button
            type="button"
            className={`segment-btn ${viewMode === "icons" ? "active" : ""}`}
            onClick={() => onChangeViewMode("icons")}
            title="Icons view"
            aria-label="Icons view"
            aria-pressed={viewMode === "icons"}
          >
            <LayoutGrid size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={`segment-btn ${viewMode === "list" ? "active" : ""}`}
            onClick={() => onChangeViewMode("list")}
            title="List view"
            aria-label="List view"
            aria-pressed={viewMode === "list"}
          >
            <List size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={`segment-btn ${viewMode === "columns" ? "active" : ""}`}
            onClick={() => onChangeViewMode("columns")}
            title="Columns view"
            aria-label="Columns view"
            aria-pressed={viewMode === "columns"}
          >
            <Columns3 size={15} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={`segment-btn ${viewMode === "gallery" ? "active" : ""}`}
            onClick={() => onChangeViewMode("gallery")}
            title="Gallery view"
            aria-label="Gallery view"
            aria-pressed={viewMode === "gallery"}
          >
            <GalleryHorizontalEnd size={15} strokeWidth={1.8} />
          </button>
        </div>

        <div className="toolbar-spacer" />

        {/* Sort Menu */}
        <div className="sort-menu-wrapper" ref={sortMenuRef}>
          <button
            type="button"
            className={`toolbar-btn toolbar-btn-chevron ${sortMenuOpen ? "open" : ""}`}
            onClick={() => {
              setShareMenuOpen(false);
              setActionsMenuOpen(false);
              setSortMenuOpen((prev) => !prev);
            }}
            title="Sort items"
            aria-label="Sort items"
            aria-expanded={sortMenuOpen}
            aria-haspopup="menu"
          >
            <ArrowUpDown size={15} strokeWidth={1.75} />
            <ChevronDown size={11} strokeWidth={2} className="tiny-chevron" />
          </button>

          {sortMenuOpen && (
            <div className="sort-popover" role="menu" aria-label="Sort options">
              <div className="sort-menu-label">Sort By</div>
              {SORT_FIELDS.map((item) => {
                const active = sortConfig.field === item.field;
                return (
                  <button
                    key={item.field}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`sort-menu-item ${active ? "active" : ""}`}
                    onClick={() => handleSelectField(item.field)}
                  >
                    <span className="sort-check-slot">
                      {active && <Check size={13} strokeWidth={2.4} />}
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="sort-menu-sep" />
              <div className="sort-menu-label">Order</div>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={sortConfig.direction === "asc"}
                className={`sort-menu-item ${sortConfig.direction === "asc" ? "active" : ""}`}
                onClick={() => {
                  onChangeSort({ ...sortConfig, direction: "asc" });
                  setSortMenuOpen(false);
                }}
              >
                <span className="sort-check-slot">
                  {sortConfig.direction === "asc" && <Check size={13} strokeWidth={2.4} />}
                </span>
                <span>Ascending</span>
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={sortConfig.direction === "desc"}
                className={`sort-menu-item ${sortConfig.direction === "desc" ? "active" : ""}`}
                onClick={() => {
                  onChangeSort({ ...sortConfig, direction: "desc" });
                  setSortMenuOpen(false);
                }}
              >
                <span className="sort-check-slot">
                  {sortConfig.direction === "desc" && <Check size={13} strokeWidth={2.4} />}
                </span>
                <span>Descending</span>
              </button>

              <div className="sort-menu-sep" />
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={sortConfig.foldersFirst}
                className="sort-menu-item"
                onClick={() => {
                  onChangeSort({ ...sortConfig, foldersFirst: !sortConfig.foldersFirst });
                  setSortMenuOpen(false);
                }}
              >
                <span className="sort-check-slot">
                  {sortConfig.foldersFirst && <Check size={13} strokeWidth={2.4} />}
                </span>
                <span>Keep Folders on Top</span>
              </button>
            </div>
          )}
        </div>

        {/* Share Popover Menu */}
        <div className="sort-menu-wrapper" ref={shareMenuRef}>
          <button
            type="button"
            className={`toolbar-btn ${shareMenuOpen ? "open" : ""}`}
            disabled={!isRealFsItem}
            onClick={() => {
              setSortMenuOpen(false);
              setActionsMenuOpen(false);
              setShareMenuOpen((prev) => !prev);
            }}
            title={isRealFsItem ? "Share selected item" : "Select a file or folder to share"}
            aria-label="Share"
            aria-expanded={shareMenuOpen}
            aria-haspopup="menu"
          >
            <Share size={15} strokeWidth={1.75} />
          </button>

          {shareMenuOpen && selectedEntry && isRealFsItem && (
            <div className="sort-popover share-popover" role="menu" aria-label="Share options">
              <div className="sort-menu-label share-item-header" title={selectedEntry.name}>
                {selectedEntry.name}
              </div>

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                disabled={!canShareFile}
                onClick={() => {
                  setShareMenuOpen(false);
                  onShareWithOs(selectedEntry);
                }}
              >
                <span className="sort-check-slot">
                  <Share2 size={13} strokeWidth={2} />
                </span>
                <span>Share with Windows…</span>
              </button>

              <div className="sort-menu-sep" />

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                disabled={selectedEntry.entryKind === "drive"}
                onClick={() => {
                  setShareMenuOpen(false);
                  onCopyFile(selectedEntry);
                }}
              >
                <span className="sort-check-slot">
                  <Copy size={13} strokeWidth={2} />
                </span>
                <span>{selectedEntry.isDir ? "Copy Folder" : "Copy File"}</span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                onClick={() => {
                  setShareMenuOpen(false);
                  onCopyPath(selectedEntry);
                }}
              >
                <span className="sort-check-slot">
                  <Link size={13} strokeWidth={2} />
                </span>
                <span>Copy Path</span>
              </button>
            </div>
          )}
        </div>

        {/* Action / More Popover Menu */}
        <div className="sort-menu-wrapper" ref={actionsMenuRef}>
          <button
            type="button"
            className={`toolbar-btn toolbar-btn-chevron ${actionsMenuOpen ? "open" : ""}`}
            onClick={() => {
              setSortMenuOpen(false);
              setShareMenuOpen(false);
              setActionsMenuOpen((prev) => !prev);
            }}
            title="Actions"
            aria-label="More actions"
            aria-expanded={actionsMenuOpen}
            aria-haspopup="menu"
          >
            <CircleEllipsis size={16} strokeWidth={1.75} />
            <ChevronDown size={11} strokeWidth={2} className="tiny-chevron" />
          </button>

          {actionsMenuOpen && (
            <div className="sort-popover share-popover" role="menu" aria-label="Folder actions">
              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                onClick={() => {
                  setActionsMenuOpen(false);
                  onNewTab();
                }}
              >
                <span className="sort-check-slot">
                  <Plus size={13} strokeWidth={2.2} />
                </span>
                <span className="menu-item-label">New Tab</span>
                <span className="menu-item-shortcut">
                  {typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
                    ? "⌘T"
                    : "Ctrl+T"}
                </span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                disabled={!selectedEntry?.isDir && !currentPath}
                onClick={() => {
                  setActionsMenuOpen(false);
                  if (selectedEntry?.isDir) {
                    onOpenInNewTab(selectedEntry.path);
                  } else if (currentPath) {
                    onOpenInNewTab(currentPath);
                  }
                }}
              >
                <span className="sort-check-slot">
                  <FolderOpen size={13} strokeWidth={2} />
                </span>
                <span className="menu-item-label">
                  {selectedEntry?.isDir ? "Open in New Tab" : "Duplicate Tab"}
                </span>
              </button>

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={tabBarVisible}
                disabled={!canToggleTabBar}
                className="sort-menu-item"
                onClick={() => {
                  setActionsMenuOpen(false);
                  onToggleTabBar();
                }}
              >
                <span className="sort-check-slot">
                  {tabBarVisible && <Check size={13} strokeWidth={2.4} />}
                </span>
                <span>Show Tab Bar</span>
              </button>

              <div className="sort-menu-sep" />

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                disabled={!isRealDirectory}
                onClick={() => {
                  setActionsMenuOpen(false);
                  onNewFolder();
                }}
              >
                <span className="sort-check-slot">
                  <FolderPlus size={13} strokeWidth={2} />
                </span>
                <span>New Folder</span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                onClick={() => {
                  setActionsMenuOpen(false);
                  onGoToPath();
                }}
              >
                <span className="sort-check-slot">
                  <FolderInput size={13} strokeWidth={2} />
                </span>
                <span className="menu-item-label">Go to Path…</span>
                <span className="menu-item-shortcut">
                  {typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
                    ? "⇧⌘G"
                    : "Ctrl+Shift+G"}
                </span>
              </button>

              <div className="sort-menu-sep" />

              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={showHidden}
                className="sort-menu-item"
                onClick={() => {
                  setActionsMenuOpen(false);
                  onToggleShowHidden();
                }}
              >
                <span className="sort-check-slot">
                  {showHidden && <Check size={13} strokeWidth={2.4} />}
                </span>
                <span>Show Hidden Files</span>
              </button>

              <div className="sort-menu-sep" />

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                disabled={!isRealDirectory && !isRealFsItem}
                onClick={() => {
                  setActionsMenuOpen(false);
                  onOpenInTerminal();
                }}
              >
                <span className="sort-check-slot">
                  <Terminal size={13} strokeWidth={2} />
                </span>
                <span>Open in Terminal</span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                disabled={!isRealDirectory}
                onClick={() => {
                  setActionsMenuOpen(false);
                  onCopyCurrentPath();
                }}
              >
                <span className="sort-check-slot">
                  <Link size={13} strokeWidth={2} />
                </span>
                <span>Copy Current Folder Path</span>
              </button>

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                disabled={!isRealDirectory}
                onClick={() => {
                  setActionsMenuOpen(false);
                  onShowInExplorer();
                }}
              >
                <span className="sort-check-slot">
                  <FolderOpen size={13} strokeWidth={2} />
                </span>
                <span>Show in File Explorer</span>
              </button>

              <div className="sort-menu-sep" />

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                onClick={() => {
                  setActionsMenuOpen(false);
                  onRefresh();
                }}
              >
                <span className="sort-check-slot">
                  <RefreshCw size={13} strokeWidth={2} />
                </span>
                <span>Refresh</span>
              </button>

              <div className="sort-menu-sep" />

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                onClick={() => {
                  setActionsMenuOpen(false);
                  onOpenSettings();
                }}
              >
                <span className="sort-check-slot">
                  <Settings size={13} strokeWidth={2} />
                </span>
                <span>Settings…</span>
                <span className="sort-menu-shortcut">
                  {typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)
                    ? "⌘,"
                    : "Ctrl+,"}
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="toolbar-spacer-sm" />

        {/* Search */}
        {searchOpen ? (
          <div className="toolbar-search-box" role="search">
            <Search size={13} strokeWidth={2} className="toolbar-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              className="toolbar-search-input"
              value={searchQuery}
              placeholder="Search"
              aria-label="Search files and folders"
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onCloseSearch();
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  onSearchSubmit();
                }
              }}
              onBlur={() => {
                if (!searchQuery.trim()) {
                  onCloseSearch();
                }
              }}
            />
            <button
              type="button"
              className="toolbar-search-clear"
              title="Clear search"
              aria-label="Clear search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onCloseSearch}
            >
              <X size={11} strokeWidth={2.4} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="toolbar-btn"
            onClick={() => {
              setSortMenuOpen(false);
              setShareMenuOpen(false);
              setActionsMenuOpen(false);
              onOpenSearch();
            }}
            title="Search (Ctrl+F)"
            aria-label="Search"
          >
            <Search size={15} strokeWidth={1.85} />
          </button>
        )}
      </div>

      {useWindowsWindowControls && (
        <div className="win-window-controls" role="group" aria-label="Window controls">
          <button
            type="button"
            className="win-caption-btn win-caption-minimize"
            onClick={onWindowMinimize}
            title="Minimize"
            aria-label="Minimize window"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 5H9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            type="button"
            className="win-caption-btn win-caption-maximize"
            onClick={onWindowMaximize}
            title={isWindowMaximized ? "Restore" : "Maximize"}
            aria-label={isWindowMaximized ? "Restore window" : "Maximize window"}
          >
            {isWindowMaximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M2.5 3.5H7.5V8.5H2.5V3.5ZM3.5 3.5V2H8.5V7H7.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect
                  x="1.5"
                  y="1.5"
                  width="7"
                  height="7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="win-caption-btn win-caption-close"
            onClick={onWindowClose}
            title="Close"
            aria-label="Close window"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path
                d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                stroke="currentColor"
                strokeWidth="1.05"
              />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
};
