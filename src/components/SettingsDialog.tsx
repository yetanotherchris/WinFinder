import React from "react";
import { X } from "lucide-react";
import type { AppSettings } from "../types";

interface SettingsDialogProps {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  settings,
  onChange,
  onClose,
}) => {
  const toggleWindowsControls = () => {
    onChange({
      ...settings,
      useWindowsWindowControls: !settings.useWindowsWindowControls,
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
        </div>

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
