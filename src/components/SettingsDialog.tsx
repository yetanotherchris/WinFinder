import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDownCircle,
  Clock,
  FileText,
  Globe,
  HardDrive,
  Home,
  LayoutGrid,
  Monitor,
  Moon,
  PanelLeft,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type {
  AppSettings,
  SidebarLocations,
  SidebarVisibilitySettings,
  ThemeMode,
} from "../types";
import {
  DEFAULT_SIDEBAR_VISIBILITY,
  hasHiddenSidebarItems,
} from "../utils/sidebarVisibility";

type SettingsTab = "general" | "sidebar";

interface SidebarOption {
  key: keyof SidebarVisibilitySettings;
  label: string;
  icon: React.ReactNode;
  available: boolean;
}

interface SettingsDialogProps {
  settings: AppSettings;
  locations: SidebarLocations | null;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

type EverythingCliStatus = "checking" | "installed" | "missing";

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  settings,
  locations,
  onChange,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const homeName = locations?.homeName || "Home";
  const [everythingStatus, setEverythingStatus] = useState<EverythingCliStatus>(
    isTauriRuntime() ? "checking" : "missing"
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      setEverythingStatus("missing");
      return;
    }

    let cancelled = false;
    invoke<boolean>("check_everything_cli_installed")
      .then((installed) => {
        if (!cancelled) {
          setEverythingStatus(installed ? "installed" : "missing");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEverythingStatus("missing");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const everythingInstalled = everythingStatus === "installed";
  const everythingEnabled =
    everythingInstalled && (settings.useEverythingCli ?? true);

  const toggleWindowsControls = () => {
    onChange({
      ...settings,
      useWindowsWindowControls: !settings.useWindowsWindowControls,
    });
  };

  const toggleEverythingCli = () => {
    if (!everythingInstalled) return;
    onChange({
      ...settings,
      useEverythingCli: !everythingEnabled,
    });
  };

  const setTheme = (theme: ThemeMode) => {
    if (settings.theme === theme) return;
    onChange({
      ...settings,
      theme,
    });
  };

  const toggleBeigeAppIcon = () => {
    onChange({
      ...settings,
      useBeigeAppIcon: !settings.useBeigeAppIcon,
    });
  };

  const toggleSidebarItem = (key: keyof SidebarVisibilitySettings) => {
    onChange({
      ...settings,
      sidebarVisibility: {
        ...settings.sidebarVisibility,
        [key]: !settings.sidebarVisibility[key],
      },
    });
  };

  const resetSidebarVisibility = () => {
    onChange({
      ...settings,
      sidebarVisibility: { ...DEFAULT_SIDEBAR_VISIBILITY },
    });
  };

  const favoriteOptions: SidebarOption[] = [
    {
      key: "recents",
      label: "Recents",
      icon: <Clock className="sidebar-icon accent-blue" size={15} strokeWidth={1.8} />,
      available: true,
    },
    {
      key: "applications",
      label: "Applications",
      icon: <LayoutGrid className="sidebar-icon accent-blue" size={15} strokeWidth={1.8} />,
      available: true,
    },
    {
      key: "desktop",
      label: "Desktop",
      icon: <Monitor className="sidebar-icon accent-blue" size={15} strokeWidth={1.8} />,
      available: !locations || Boolean(locations.desktopPath),
    },
    {
      key: "documents",
      label: "Documents",
      icon: <FileText className="sidebar-icon accent-blue" size={15} strokeWidth={1.8} />,
      available: !locations || Boolean(locations.documentsPath),
    },
    {
      key: "downloads",
      label: "Downloads",
      icon: <ArrowDownCircle className="sidebar-icon accent-blue" size={15} strokeWidth={1.8} />,
      available: !locations || Boolean(locations.downloadsPath),
    },
    {
      key: "home",
      label: homeName,
      icon: <Home className="sidebar-icon accent-blue" size={15} strokeWidth={1.8} />,
      available: true,
    },
  ];

  const locationOptions: SidebarOption[] = [
    {
      key: "drives",
      label: "Drives",
      icon: <HardDrive className="sidebar-icon muted-gray" size={15} strokeWidth={1.8} />,
      available: true,
    },
    {
      key: "network",
      label: "Network",
      icon: <Globe className="sidebar-icon muted-gray" size={15} strokeWidth={1.8} />,
      available: true,
    },
    {
      key: "trash",
      label: "Trash",
      icon: <Trash2 className="sidebar-icon muted-gray" size={15} strokeWidth={1.8} />,
      available: true,
    },
  ];

  const anyHidden = hasHiddenSidebarItems(settings.sidebarVisibility);

  const renderChecklistRow = (opt: SidebarOption) => {
    const checked = settings.sidebarVisibility[opt.key];
    return (
      <label
        key={opt.key}
        className={`settings-sidebar-item ${!opt.available ? "is-disabled" : ""}`}
      >
        <input
          type="checkbox"
          className="macos-checkbox"
          checked={opt.available ? checked : false}
          disabled={!opt.available}
          onChange={() => toggleSidebarItem(opt.key)}
        />
        <span className="settings-sidebar-item-icon" aria-hidden="true">
          {opt.icon}
        </span>
        <span className="settings-sidebar-item-label">{opt.label}</span>
        {!opt.available && (
          <span className="settings-sidebar-item-note">Unavailable</span>
        )}
      </label>
    );
  };
  return (
    <div
      className="finder-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
      >
        <div className="settings-dialog-header">
          <h2 id="settings-dialog-title" className="settings-dialog-title">
            {activeTab === "general" ? "Settings" : "Sidebar"}
          </h2>
          <button
            type="button"
            className="settings-close-btn"
            onClick={onClose}
            title="Close Settings"
            aria-label="Close Settings"
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="settings-tabs" role="tablist" aria-label="Settings sections">
          <button
            type="button"
            role="tab"
            id="settings-tab-general"
            aria-selected={activeTab === "general"}
            aria-controls="settings-panel-general"
            className={`settings-tab-btn ${activeTab === "general" ? "is-active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            <SlidersHorizontal size={16} strokeWidth={1.8} />
            <span>General</span>
          </button>
          <button
            type="button"
            role="tab"
            id="settings-tab-sidebar"
            aria-selected={activeTab === "sidebar"}
            aria-controls="settings-panel-sidebar"
            className={`settings-tab-btn ${activeTab === "sidebar" ? "is-active" : ""}`}
            onClick={() => setActiveTab("sidebar")}
          >
            <PanelLeft size={16} strokeWidth={1.8} />
            <span>Sidebar</span>
          </button>
        </div>

        {activeTab === "general" && (
          <div
            id="settings-panel-general"
            role="tabpanel"
            aria-labelledby="settings-tab-general"
            className="settings-dialog-body"
          >
            <div className="settings-section-label">Appearance</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-row-text">
                  <span id="setting-theme-label" className="settings-row-title">
                    Theme
                  </span>
                  <span id="setting-theme-desc" className="settings-row-desc">
                    Choose Light or Dark appearance for WinFinder.
                  </span>
                </div>
                <div
                  className="settings-segmented"
                  role="radiogroup"
                  aria-labelledby="setting-theme-label"
                  aria-describedby="setting-theme-desc"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={settings.theme === "light"}
                    className={`settings-segment-btn ${settings.theme === "light" ? "active" : ""}`}
                    onClick={() => setTheme("light")}
                  >
                    <Sun size={13} strokeWidth={1.85} />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={settings.theme === "dark"}
                    className={`settings-segment-btn ${settings.theme === "dark" ? "active" : ""}`}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon size={13} strokeWidth={1.85} />
                    <span>Dark</span>
                  </button>
                </div>
              </div>

              <div className="settings-row-divider" />

              <div className="settings-row">
                <div className="settings-row-text">
                  <span id="setting-beige-icon-label" className="settings-row-title">
                    Classic beige app icon
                  </span>
                  <span id="setting-beige-icon-desc" className="settings-row-desc">
                    Switch the app icon to Windows Explorer beige with a black smiling face.
                  </span>
                  <span id="setting-beige-icon-note" className="settings-row-note">
                    Restart WinFinder to apply. If pinned to the Windows taskbar, unpin and re-pin the icon for it to refresh.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(settings.useBeigeAppIcon)}
                  aria-labelledby="setting-beige-icon-label"
                  aria-describedby="setting-beige-icon-desc setting-beige-icon-note"
                  className={`macos-switch ${settings.useBeigeAppIcon ? "is-on" : ""}`}
                  onClick={toggleBeigeAppIcon}
                >
                  <span className="macos-switch-thumb" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="settings-section-label settings-section-spaced">Window</div>
            <div className="settings-group">
              <div className="settings-row">
                <div className="settings-row-text">
                  <span id="setting-win-controls-label" className="settings-row-title">
                    Use Windows window controls
                  </span>
                  <span id="setting-win-controls-desc" className="settings-row-desc">
                    Show Minimize, Maximize, and Close buttons on the top-right in Windows style and hide the macOS traffic lights.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.useWindowsWindowControls}
                  aria-labelledby="setting-win-controls-label"
                  aria-describedby="setting-win-controls-desc"
                  className={`macos-switch ${settings.useWindowsWindowControls ? "is-on" : ""}`}
                  onClick={toggleWindowsControls}
                >
                  <span className="macos-switch-thumb" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="settings-section-label">Search</div>
            <div className="settings-group">
              <div className={`settings-row ${!everythingInstalled ? "is-disabled" : ""}`}>
                <div className="settings-row-text">
                  <span id="setting-everything-cli-label" className="settings-row-title">
                    Use Everything CLI (es)
                  </span>
                  <span id="setting-everything-cli-desc" className="settings-row-desc">
                    Use the Everything Command-Line Interface for instant file and folder search.
                  </span>
                  {everythingStatus === "missing" && (
                    <span id="setting-everything-cli-hint" className="settings-row-hint">
                      Everything CLI (es) was not found in PATH. Use <code>scoop install everything-cli</code> to install.
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  disabled={!everythingInstalled}
                  aria-checked={everythingEnabled}
                  aria-labelledby="setting-everything-cli-label"
                  aria-describedby={
                    everythingStatus === "missing"
                      ? "setting-everything-cli-desc setting-everything-cli-hint"
                      : "setting-everything-cli-desc"
                  }
                  className={`macos-switch ${everythingEnabled ? "is-on" : ""}`}
                  onClick={toggleEverythingCli}
                >
                  <span className="macos-switch-thumb" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "sidebar" && (
          <div
            id="settings-panel-sidebar"
            role="tabpanel"
            aria-labelledby="settings-tab-sidebar"
            className="settings-dialog-body settings-sidebar-body"
          >
            <div className="settings-sidebar-intro-row">
              <span className="settings-sidebar-intro">
                Show these items in the sidebar:
              </span>
              {anyHidden && (
                <button
                  type="button"
                  className="settings-reset-link"
                  onClick={resetSidebarVisibility}
                >
                  Show All
                </button>
              )}
            </div>

            <div className="settings-section-label">Favorites</div>
            <div className="settings-group settings-sidebar-group">
              {favoriteOptions.map(renderChecklistRow)}
            </div>

            <div className="settings-section-label">Locations</div>
            <div className="settings-group settings-sidebar-group">
              {locationOptions.map(renderChecklistRow)}
            </div>
          </div>
        )}

        <div className="settings-dialog-footer">
          <span className="settings-storage-hint">Saved to ~/.winfinder/config.json</span>
          <button
            type="button"
            className="finder-dialog-btn finder-dialog-btn-primary settings-done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
