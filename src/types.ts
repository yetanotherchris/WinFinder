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
