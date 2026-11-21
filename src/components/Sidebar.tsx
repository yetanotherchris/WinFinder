import React, { useEffect, useState } from "react";
import {
  Clock,
  LayoutGrid,
  Monitor,
  FileText,
  ArrowDownCircle,
  Home,
  Folder,
  HardDrive,
  Globe,
  Trash2,
} from "lucide-react";
import type { FavoriteFolder, PanelId, SidebarLocations } from "../types";
import {
  countBuiltInFavorites,
  MAX_FAVORITES_ITEMS,
  type FavoriteDropState,
} from "../utils/favorites";

interface SidebarProps {
  locations: SidebarLocations | null;
  activePanel: PanelId;
  customFavorites: FavoriteFolder[];
  inAppDropState: FavoriteDropState;
  osDragOverFavorites: boolean;
  favoritesSectionRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  onResizeWidth: (width: number) => void;
  onSelectPanel: (panel: PanelId) => void;
  onRemoveFavorite: (path: string) => void;
  onWindowClose: () => void;
  onWindowMinimize: () => void;
  onWindowMaximize: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  locations,
  activePanel,
  customFavorites,
  inAppDropState,
  osDragOverFavorites,
  favoritesSectionRef,
  width,
  onResizeWidth,
  onSelectPanel,
  onRemoveFavorite,
  onWindowClose,
  onWindowMinimize,
  onWindowMaximize,
}) => {
  const homeName = locations?.homeName || "Home";
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fav: FavoriteFolder;
  } | null>(null);

  const builtInCount = countBuiltInFavorites(locations);
  const totalFavoritesCount = builtInCount + customFavorites.length;
  const isFavoritesFull = totalFavoritesCount >= MAX_FAVORITES_ITEMS;

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    document.body.classList.add("is-resizing-col");

    const onMouseMove = (moveEvent: MouseEvent) => {
      const next = Math.max(160, Math.min(340, startWidth + (moveEvent.clientX - startX)));
      onResizeWidth(next);
    };

    const onMouseUp = () => {
      document.body.classList.remove("is-resizing-col");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const effectiveDropState: FavoriteDropState = osDragOverFavorites
    ? isFavoritesFull
      ? "full"
      : "accept"
    : inAppDropState;

  return (
    <aside
      className="finder-sidebar"
      style={{ width: `${width}px`, minWidth: `${width}px` }}
      aria-label="Sidebar"
    >
      {/* macOS Traffic Light Window Controls + Drag Strip */}
      <div className="sidebar-window-bar" data-tauri-drag-region>
        <div className="traffic-lights" role="group" aria-label="Window controls">
          <button
            type="button"
            className="traffic-light traffic-close"
            onClick={onWindowClose}
            title="Close"
            aria-label="Close window"
          >
            <svg className="traffic-glyph-svg" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path
                d="M2 2L6 6M6 2L2 6"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="traffic-light traffic-minimize"
            onClick={onWindowMinimize}
            title="Minimize"
            aria-label="Minimize window"
          >
            <svg className="traffic-glyph-svg" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path
                d="M1.75 4H6.25"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="traffic-light traffic-maximize"
            onClick={onWindowMaximize}
            title="Maximize"
            aria-label="Maximize window"
          >
            <svg className="traffic-glyph-svg" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
              <path
                d="M4 1.75V6.25M1.75 4H6.25"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable Sidebar Sections */}
      <nav className="sidebar-scroll">
        {/* Favorites */}
        <div
          ref={favoritesSectionRef}
          className={`sidebar-section sidebar-favorites-section ${
            effectiveDropState === "accept"
              ? "favorites-drop-accept"
              : effectiveDropState === "full" || effectiveDropState === "duplicate"
                ? "favorites-drop-blocked"
                : ""
          }`}
        >
          <div className="sidebar-section-header">Favorites</div>
          <ul className="sidebar-list">
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${activePanel === "recents" ? "active" : ""}`}
                onClick={() => onSelectPanel("recents")}
                title="Recents"
              >
                <Clock className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Recents</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${activePanel === "applications" ? "active" : ""}`}
                onClick={() => onSelectPanel("applications")}
                title="Applications"
              >
                <LayoutGrid className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Applications</span>
              </button>
            </li>
            {locations?.desktopPath && (
              <li>
                <button
                  type="button"
                  className={`sidebar-item interactive ${activePanel === "desktop" ? "active" : ""}`}
                  onClick={() => onSelectPanel("desktop")}
                  title="Desktop"
                >
                  <Monitor className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                  <span className="sidebar-label">Desktop</span>
                </button>
              </li>
            )}
            {locations?.documentsPath && (
              <li>
                <button
                  type="button"
                  className={`sidebar-item interactive ${activePanel === "documents" ? "active" : ""}`}
                  onClick={() => onSelectPanel("documents")}
                  title="Documents"
                >
                  <FileText className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                  <span className="sidebar-label">Documents</span>
                </button>
              </li>
            )}
            {locations?.downloadsPath && (
              <li>
                <button
                  type="button"
                  className={`sidebar-item interactive ${activePanel === "downloads" ? "active" : ""}`}
                  onClick={() => onSelectPanel("downloads")}
                  title="Downloads"
                >
                  <ArrowDownCircle className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                  <span className="sidebar-label">Downloads</span>
                </button>
              </li>
            )}
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${activePanel === "home" ? "active" : ""}`}
                onClick={() => onSelectPanel("home")}
                title={`Home (${homeName})`}
              >
                <Home className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">{homeName}</span>
              </button>
            </li>
            {customFavorites.map((fav) => {
              const panelId: PanelId = `fav:${fav.path}`;
              return (
                <li key={fav.path}>
                  <button
                    type="button"
                    className={`sidebar-item interactive ${activePanel === panelId ? "active" : ""}`}
                    onClick={() => onSelectPanel(panelId)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({ x: e.clientX, y: e.clientY, fav });
                    }}
                    title={fav.path}
                  >
                    <Folder className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                    <span className="sidebar-label">{fav.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {effectiveDropState === "accept" && (
            <div className="favorites-drop-indicator" aria-hidden="true">
              <span className="favorites-drop-dot" />
              <span className="favorites-drop-line" />
            </div>
          )}

          {effectiveDropState === "full" && (
            <div className="favorites-drop-hint" role="status">
              Maximum {MAX_FAVORITES_ITEMS} favorites reached
            </div>
          )}

          {effectiveDropState === "duplicate" && (
            <div className="favorites-drop-hint" role="status">
              Already in Favorites
            </div>
          )}
        </div>

        {/* Locations */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">Locations</div>
          <ul className="sidebar-list">
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${activePanel === "drives" ? "active" : ""}`}
                onClick={() => onSelectPanel("drives")}
                title="Drives"
              >
                <HardDrive className="sidebar-icon muted-gray" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Drives</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${activePanel === "network" ? "active" : ""}`}
                onClick={() => onSelectPanel("network")}
                title="Network"
              >
                <Globe className="sidebar-icon muted-gray" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Network</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${activePanel === "trash" ? "active" : ""}`}
                onClick={() => onSelectPanel("trash")}
                title="Trash"
              >
                <Trash2 className="sidebar-icon muted-gray" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Trash</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Right-click context menu for custom favorites */}
      {contextMenu && (
        <div
          className="sidebar-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="sort-menu-item"
            role="menuitem"
            onClick={() => {
              onRemoveFavorite(contextMenu.fav.path);
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} strokeWidth={1.9} />
            <span>Remove from Favorites</span>
          </button>
        </div>
      )}

      {/* Right-edge resize handle */}
      <div
        className="sidebar-resize-handle"
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={() => onResizeWidth(204)}
        title="Drag to resize sidebar (double-click to reset)"
        aria-hidden="true"
      />
    </aside>
  );
};
