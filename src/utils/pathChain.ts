import type { BreadcrumbItem } from "../types";
import { normalizePathKey } from "./favorites";

export interface ViewAnchorChain {
  anchorRoot: string;
  descendantPaths: string[];
  targetPath: string;
}

/**
 * Given the currently displayed directory (`currentPath`, `breadcrumbs`) and the
 * active sidebar panel's root path, determines whether List or Columns view should
 * re-anchor at an ancestor root and expand/open the full chain down to `currentPath`.
 *
 * Returns `null` when no re-anchoring is needed (already at root, virtual view,
 * or path outside a real panel root).
 */
export function resolveViewAnchorChain(
  currentPath: string,
  breadcrumbs: BreadcrumbItem[],
  panelRootPath: string | null
): ViewAnchorChain | null {
  if (!currentPath || currentPath.startsWith("virtual://") || breadcrumbs.length <= 1) {
    return null;
  }

  // Real panel root (built-in favorites like Documents/Home/Desktop/Downloads or custom fav:<path>)
  if (panelRootPath && !panelRootPath.startsWith("virtual://")) {
    const rootKey = normalizePathKey(panelRootPath);
    const rootIdx = breadcrumbs.findIndex(
      (crumb) => normalizePathKey(crumb.path) === rootKey
    );
    if (rootIdx >= 0 && rootIdx < breadcrumbs.length - 1) {
      return {
        anchorRoot: breadcrumbs[rootIdx].path,
        descendantPaths: breadcrumbs.slice(rootIdx + 1).map((b) => b.path),
        targetPath: breadcrumbs[breadcrumbs.length - 1].path,
      };
    }
    return null;
  }

  // Drives panel navigated into a real drive path: anchor at the drive root (breadcrumbs[0])
  if (panelRootPath === "virtual://computer") {
    return {
      anchorRoot: breadcrumbs[0].path,
      descendantPaths: breadcrumbs.slice(1).map((b) => b.path),
      targetPath: breadcrumbs[breadcrumbs.length - 1].path,
    };
  }

  return null;
}

/**
 * Builds the ordered list of descendant directory paths from `rootPath` (exclusive)
 * down to `targetPath` (inclusive). Returns `null` if `targetPath` is not a strict
 * descendant of `rootPath`.
 */
export function buildDescendantChain(
  rootPath: string,
  targetPath: string
): string[] | null {
  if (
    !rootPath ||
    !targetPath ||
    rootPath.startsWith("virtual://") ||
    targetPath.startsWith("virtual://")
  ) {
    return null;
  }

  const rootKey = normalizePathKey(rootPath);
  const targetKey = normalizePathKey(targetPath);
  if (rootKey === targetKey) {
    return null;
  }

  const sep = targetPath.includes("\\") ? "\\" : "/";
  const rootTrimmed = rootPath.replace(/[\\/]+$/, "");
  const rootPrefixKey =
    rootKey.endsWith("\\") || rootKey.endsWith("/") ? rootKey : `${rootKey}${sep}`;

  if (!targetKey.startsWith(rootPrefixKey)) {
    return null;
  }

  // Extract relative portion preserving original casing from targetPath
  const targetTrimmed = targetPath.replace(/[\\/]+$/, "");
  const rootBaseLen =
    rootPath.endsWith("\\") || rootPath.endsWith("/")
      ? rootPath.length
      : rootTrimmed.length + 1;
  const rel = targetTrimmed.slice(rootBaseLen);
  if (!rel) return null;

  const segments = rel.split(/[\\/]+/).filter(Boolean);
  if (segments.length === 0) return null;

  const chain: string[] = [];
  let running = rootPath.endsWith("\\") || rootPath.endsWith("/")
    ? rootPath
    : `${rootTrimmed}${sep}`;
  for (let i = 0; i < segments.length; i++) {
    running = i === 0 ? `${running}${segments[i]}` : `${running}${sep}${segments[i]}`;
    chain.push(running);
  }
  return chain;
}
