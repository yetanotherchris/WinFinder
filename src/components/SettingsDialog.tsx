import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X } from "lucide-react";
import type { AppSettings } from "../types";

interface SettingsDialogProps {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

type EverythingCliStatus = "checking" | "installed" | "missing";

const isTauriRuntime = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  settings,
  onChange,
  onClose,
}) => {
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
            Settings
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

        <div className="settings-dialog-body">
          <div className="settings-section-label">Window</div>
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
                    Everything CLI (es) was not found in PATH. Install it to enable this setting.
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

        <div className="settings-dialog-footer">
          <span className="settings-storage-hint">Saved to ~/.winfinder</span>
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
