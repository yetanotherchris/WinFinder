export interface BreadcrumbItem {
  name: string;
  path: string;
}

export type EntryKind = "folder" | "file" | "app" | "drive";

export type ViewMode = "icons" | "list" | "columns" | "gallery";

export type SortField = "name" | "kind" | "dateModified" | "size";
export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
  foldersFirst: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  entryKind: EntryKind;
  extension: string | null;
  size: number;
  modifiedMs: number | null;
  iconDataUrl: string | null;
}

export interface DirectoryListing {
  currentPath: string;
  currentName: string;
  homePath: string;
  homeName: string;
  breadcrumbs: BreadcrumbItem[];
  entries: FileEntry[];
  emptyMessage: string | null;
}

export interface SidebarLocations {
  homePath: string;
  homeName: string;
  desktopPath: string | null;
  documentsPath: string | null;
  downloadsPath: string | null;
}

export interface FavoriteFolder {
  name: string;
  path: string;
}

export type CustomFavoritePanelId = `fav:${string}`;

export type PanelId =
  | "recents"
  | "applications"
  | "desktop"
  | "documents"
  | "downloads"
  | "home"
  | "drives"
  | "network"
  | "trash"
  | CustomFavoritePanelId;

export type TrackedPanelId =
  | "recents"
  | "desktop"
  | "documents"
  | "downloads"
  | "home";

export interface PanelState {
  viewMode: ViewMode;
  sort: SortConfig;
  lastPath: string | null;
  expandedPaths: string[];
  columnPaths: string[];
}

export interface PersistedAppState {
  activePanel: TrackedPanelId;
  panels: Partial<Record<TrackedPanelId, PanelState>>;
  customFavorites?: FavoriteFolder[];
}

export interface ResolvedGoToPath {
  directoryPath: string;
  selectFilePath: string | null;
}
