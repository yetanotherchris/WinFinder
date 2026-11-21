import React from "react";
import {
  Clock,
  LayoutGrid,
  Monitor,
  FileText,
  ArrowDownCircle,
  Home,
  HardDrive,
  Globe,
} from "lucide-react";
import type { SidebarLocations } from "../types";

interface SidebarProps {
  locations: SidebarLocations | null;
  currentPath: string;
  width: number;
  onResizeWidth: (width: number) => void;
  onNavigate: (targetPath: string) => void;
  onWindowClose: () => void;
  onWindowMinimize: () => void;
  onWindowMaximize: () => void;
}

function pathsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();
}

export const Sidebar: React.FC<SidebarProps> = ({
  locations,
  currentPath,
  width,
  onResizeWidth,
  onNavigate,
  onWindowClose,
  onWindowMinimize,
  onWindowMaximize,
}) => {
  const homeName = locations?.homeName || "Home";

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
        <div className="sidebar-section">
          <div className="sidebar-section-header">Favorites</div>
          <ul className="sidebar-list">
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${currentPath === "virtual://recents" ? "active" : ""}`}
                onClick={() => onNavigate("virtual://recents")}
                title="Recents"
              >
                <Clock className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Recents</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${currentPath === "virtual://applications" ? "active" : ""}`}
                onClick={() => onNavigate("virtual://applications")}
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
                  className={`sidebar-item interactive ${pathsEqual(currentPath, locations.desktopPath) ? "active" : ""}`}
                  onClick={() => onNavigate(locations.desktopPath!)}
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
                  className={`sidebar-item interactive ${pathsEqual(currentPath, locations.documentsPath) ? "active" : ""}`}
                  onClick={() => onNavigate(locations.documentsPath!)}
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
                  className={`sidebar-item interactive ${pathsEqual(currentPath, locations.downloadsPath) ? "active" : ""}`}
                  onClick={() => onNavigate(locations.downloadsPath!)}
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
                className={`sidebar-item interactive ${pathsEqual(currentPath, locations?.homePath) ? "active" : ""}`}
                onClick={() => onNavigate(locations?.homePath ?? "")}
                title={`Home (${homeName})`}
              >
                <Home className="sidebar-icon accent-blue" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">{homeName}</span>
              </button>
            </li>
          </ul>
        </div>

        {/* Locations */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">Locations</div>
          <ul className="sidebar-list">
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${currentPath === "virtual://computer" ? "active" : ""}`}
                onClick={() => onNavigate("virtual://computer")}
                title="Drives"
              >
                <HardDrive className="sidebar-icon muted-gray" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Drives</span>
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`sidebar-item interactive ${currentPath === "virtual://network" ? "active" : ""}`}
                onClick={() => onNavigate("virtual://network")}
                title="Network"
              >
                <Globe className="sidebar-icon muted-gray" size={16} strokeWidth={1.8} />
                <span className="sidebar-label">Network</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

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
