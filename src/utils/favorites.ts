import type { FavoriteFolder, SidebarLocations } from "../types";

export const MAX_FAVORITES_ITEMS = 10;
export type FavoriteDropState = "none" | "accept" | "duplicate" | "full";

export function normalizePathKey(raw: string): string {
  const trimmed = raw.trim();
  const stripped = trimmed.replace(/[\\/]+$/, "");
  let canonical: string;
  if (!stripped) {
    canonical = trimmed;
  } else if (/^[A-Za-z]:$/.test(stripped)) {
    canonical = `${stripped}\\`;
  } else {
    canonical = stripped;
  }

  // Case-insensitive comparison for Windows paths
  if (/^[A-Za-z]:/.test(canonical) || canonical.includes("\\")) {
    return canonical.toLowerCase();
  }
  return canonical;
}

function normalizeForSubtreeCheck(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("virtual://")) {
    return trimmed.toLowerCase();
  }
  const slashed = trimmed.replace(/\\/g, "/");
  const stripped = slashed.replace(/\/+$/, "");
  let canonical: string;
  if (!stripped) {
    canonical = "/";
  } else if (/^[A-Za-z]:$/.test(stripped)) {
    canonical = `${stripped}/`;
  } else {
    canonical = stripped;
  }

  // Case-insensitive comparison for Windows paths
  if (/^[A-Za-z]:/.test(canonical) || raw.includes("\\")) {
    return canonical.toLowerCase();
  }
  return canonical;
}

export function isPathWithinRoot(path: string, rootPath: string): boolean {
  const normPath = normalizeForSubtreeCheck(path);
  const normRoot = normalizeForSubtreeCheck(rootPath);
  if (!normPath || !normRoot) return false;
  if (normRoot.startsWith("virtual://")) {
    return normPath === normRoot;
  }
  if (normPath === normRoot) return true;
  const prefix = normRoot.endsWith("/") ? normRoot : `${normRoot}/`;
  return normPath.startsWith(prefix);
}

export function countBuiltInFavorites(locations: SidebarLocations | null): number {
  // Always present: Recents, Applications, Home
  let count = 3;
  if (locations?.desktopPath) count += 1;
  if (locations?.documentsPath) count += 1;
  if (locations?.downloadsPath) count += 1;
  return count;
}

export function getBuiltInFavoritePaths(locations: SidebarLocations | null): string[] {
  if (!locations) return [];
  const paths: string[] = [locations.homePath];
  if (locations.desktopPath) paths.push(locations.desktopPath);
  if (locations.documentsPath) paths.push(locations.documentsPath);
  if (locations.downloadsPath) paths.push(locations.downloadsPath);
  return paths;
}

export function isPathInFavorites(
  path: string,
  locations: SidebarLocations | null,
  customFavorites: FavoriteFolder[]
): boolean {
  const key = normalizePathKey(path);
  for (const builtIn of getBuiltInFavoritePaths(locations)) {
    if (normalizePathKey(builtIn) === key) return true;
  }
  return customFavorites.some((fav) => normalizePathKey(fav.path) === key);
}
