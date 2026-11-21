import type { SidebarVisibilitySettings } from "../types";

export const DEFAULT_SIDEBAR_VISIBILITY: SidebarVisibilitySettings = {
  recents: true,
  applications: true,
  desktop: true,
  documents: true,
  downloads: true,
  home: true,
  drives: true,
  network: true,
  trash: true,
};

export function normalizeSidebarVisibility(
  raw?: Partial<SidebarVisibilitySettings> | null
): SidebarVisibilitySettings {
  return {
    recents: raw?.recents ?? true,
    applications: raw?.applications ?? true,
    desktop: raw?.desktop ?? true,
    documents: raw?.documents ?? true,
    downloads: raw?.downloads ?? true,
    home: raw?.home ?? true,
    drives: raw?.drives ?? true,
    network: raw?.network ?? true,
    trash: raw?.trash ?? true,
  };
}

export function hasHiddenSidebarItems(
  visibility: SidebarVisibilitySettings
): boolean {
  return Object.values(visibility).some((visible) => !visible);
}
