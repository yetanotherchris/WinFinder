import type { DirectoryListing, FileEntry } from "../types";

const directoryCache = new Map<string, DirectoryListing>();

function makeCacheKey(path: string, showHidden: boolean): string {
  return `${path.replace(/[\\/]+$/, "").toLowerCase()}::${showHidden ? "1" : "0"}`;
}

export function getCachedDirectory(
  path: string,
  showHidden: boolean
): DirectoryListing | undefined {
  return directoryCache.get(makeCacheKey(path, showHidden));
}

export function setCachedDirectory(
  path: string,
  showHidden: boolean,
  listing: DirectoryListing
): void {
  if (path) {
    directoryCache.set(makeCacheKey(path, showHidden), listing);
  }
  if (listing.currentPath) {
    directoryCache.set(makeCacheKey(listing.currentPath, showHidden), listing);
  }
}

export function invalidateCachedDirectory(path: string): void {
  const norm = path.replace(/[\\/]+$/, "").toLowerCase();
  directoryCache.delete(`${norm}::0`);
  directoryCache.delete(`${norm}::1`);
}

export function entriesEqual(a: FileEntry[], b: FileEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ea = a[i];
    const eb = b[i];
    if (
      ea.path !== eb.path ||
      ea.name !== eb.name ||
      ea.size !== eb.size ||
      ea.modifiedMs !== eb.modifiedMs ||
      ea.isDir !== eb.isDir ||
      Boolean(ea.isLocked) !== Boolean(eb.isLocked)
    ) {
      return false;
    }
  }
  return true;
}

export function listingsEqual(a: DirectoryListing, b: DirectoryListing): boolean {
  if (
    a.currentPath !== b.currentPath ||
    a.currentName !== b.currentName ||
    a.emptyMessage !== b.emptyMessage
  ) {
    return false;
  }
  return entriesEqual(a.entries, b.entries);
}
