import React from "react";
import {
  Clock,
  Folder,
  Globe,
  HardDrive,
  Home,
  LayoutGrid,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

export interface TabBarItem {
  id: string;
  title: string;
  path: string;
  isSearch: boolean;
}

interface TabBarProps {
  tabs: TabBarItem[];
  activeTabId: string;
  homePath: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}

function renderTabIcon(tab: TabBarItem, homePath: string) {
  if (tab.isSearch) {
    return <Search size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
  }
  if (tab.path === "virtual://recents") {
    return <Clock size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
  }
  if (tab.path === "virtual://applications") {
    return <LayoutGrid size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
  }
  if (tab.path === "virtual://computer" || /^[A-Za-z]:\\?$/.test(tab.path) || tab.path === "/") {
    return <HardDrive size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
  }
  if (tab.path === "virtual://network" || tab.path.startsWith("\\\\")) {
    return <Globe size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
  }
  if (tab.path === "virtual://trash") {
    return <Trash2 size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
  }
  if (homePath && tab.path.toLowerCase() === homePath.toLowerCase()) {
    return <Home size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
  }
  return <Folder size={12} strokeWidth={2} className="tab-item-icon" aria-hidden="true" />;
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs,
  activeTabId,
  homePath,
  onSelectTab,
  onCloseTab,
  onNewTab,
}) => {
  const canClose = tabs.length > 1;

  return (
    <div className="finder-tabbar" role="tablist" aria-label="Open tabs">
      <div className="finder-tabbar-tabs">
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const nextTab = tabs[index + 1];
          const showRightDivider = !isActive && nextTab && nextTab.id !== activeTabId;

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`finder-tab ${isActive ? "active" : ""} ${showRightDivider ? "has-divider" : ""}`}
              title={tab.path || tab.title}
              onClick={() => onSelectTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1 && canClose) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectTab(tab.id);
                }
              }}
            >
              {canClose && (
                <button
                  type="button"
                  className="finder-tab-close"
                  title="Close tab"
                  aria-label={`Close ${tab.title} tab`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  <X size={10} strokeWidth={2.4} />
                </button>
              )}
              <span className="finder-tab-content">
                {renderTabIcon(tab, homePath)}
                <span className="finder-tab-title">{tab.title}</span>
              </span>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="finder-tab-new-btn"
        onClick={onNewTab}
        title="New Tab (Ctrl+T)"
        aria-label="New Tab"
      >
        <Plus size={14} strokeWidth={2} />
      </button>
    </div>
  );
};
