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
  Check,
  Copy,
  Link,
  FolderOpen,
  Share2,
} from "lucide-react";
import type { FileEntry, SortConfig, SortField, ViewMode } from "../types";

interface ToolbarProps {
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  viewMode: ViewMode;
  sortConfig: SortConfig;
  selectedEntry: FileEntry | null;
  onBack: () => void;
  onForward: () => void;
  onChangeViewMode: (mode: ViewMode) => void;
  onChangeSort: (next: SortConfig) => void;
  onShareWithOs: (entry: FileEntry) => void;
  onCopyFile: (entry: FileEntry) => void;
  onCopyPath: (entry: FileEntry) => void;
  onRevealInExplorer: (entry: FileEntry) => void;
}

const SORT_FIELDS: { field: SortField; label: string }[] = [
  { field: "name", label: "Name" },
  { field: "kind", label: "Kind" },
  { field: "dateModified", label: "Date Modified" },
  { field: "size", label: "Size" },
];

export const Toolbar: React.FC<ToolbarProps> = ({
  title,
  canGoBack,
  canGoForward,
  viewMode,
  sortConfig,
  selectedEntry,
  onBack,
  onForward,
  onChangeViewMode,
  onChangeSort,
  onShareWithOs,
  onCopyFile,
  onCopyPath,
  onRevealInExplorer,
}) => {
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const shareMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!sortMenuOpen && !shareMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (sortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
      if (shareMenuOpen && shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) {
        setShareMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSortMenuOpen(false);
        setShareMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortMenuOpen, shareMenuOpen]);

  // Close share menu if selection disappears
  useEffect(() => {
    if (!selectedEntry) {
      setShareMenuOpen(false);
    }
  }, [selectedEntry]);

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
    <header className="finder-toolbar" data-tauri-drag-region>
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
            onClick={() => setSortMenuOpen((prev) => !prev)}
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

              <div className="sort-menu-sep" />

              <button
                type="button"
                role="menuitem"
                className="sort-menu-item"
                onClick={() => {
                  setShareMenuOpen(false);
                  onRevealInExplorer(selectedEntry);
                }}
              >
                <span className="sort-check-slot">
                  <FolderOpen size={13} strokeWidth={2} />
                </span>
                <span>Show in File Explorer</span>
              </button>
            </div>
          )}
        </div>

        {/* Action / More */}
        <button
          type="button"
          className="toolbar-btn toolbar-btn-chevron filler-btn"
          title="Actions (prototype filler)"
          aria-label="More actions"
        >
          <CircleEllipsis size={16} strokeWidth={1.75} />
          <ChevronDown size={11} strokeWidth={2} className="tiny-chevron" />
        </button>

        <div className="toolbar-spacer-sm" />

        {/* Search */}
        <button
          type="button"
          className="toolbar-btn filler-btn"
          title="Search (prototype filler)"
          aria-label="Search"
        >
          <Search size={15} strokeWidth={1.85} />
        </button>
      </div>
    </header>
  );
};
