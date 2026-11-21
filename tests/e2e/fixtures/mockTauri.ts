import type { Page } from "@playwright/test";

/**
 * Installs a deterministic mock of Tauri v2's `window.__TAURI_INTERNALS__`
 * before the page loads so WinFinder exercises its full IPC-backed navigation,
 * sorting, inline List disclosure, Miller Columns, hidden files, and Actions
 * flows inside Playwright (both on host and inside Windows Sandbox).
 */
export async function installMockTauri(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface MockEntry {
      name: string;
      path: string;
      isDir: boolean;
      entryKind: "folder" | "file" | "app" | "drive";
      extension: string | null;
      size: number;
      modifiedMs: number | null;
      iconDataUrl: string | null;
      hidden?: boolean;
    }

    const HOME = "C:\\Users\\tester";
    const NOW = 1_760_000_000_000;

    const fsTree: Record<string, MockEntry[]> = {
      [HOME]: [
        {
          name: "Desktop",
          path: `${HOME}\\Desktop`,
          isDir: true,
          entryKind: "folder",
          extension: null,
          size: 0,
          modifiedMs: NOW - 3_600_000,
          iconDataUrl: null,
        },
        {
          name: "Documents",
          path: `${HOME}\\Documents`,
          isDir: true,
          entryKind: "folder",
          extension: null,
          size: 0,
          modifiedMs: NOW - 7_200_000,
          iconDataUrl: null,
        },
        {
          name: "Downloads",
          path: `${HOME}\\Downloads`,
          isDir: true,
          entryKind: "folder",
          extension: null,
          size: 0,
          modifiedMs: NOW - 1_800_000,
          iconDataUrl: null,
        },
        {
          name: "notes.txt",
          path: `${HOME}\\notes.txt`,
          isDir: false,
          entryKind: "file",
          extension: "txt",
          size: 2048,
          modifiedMs: NOW - 900_000,
          iconDataUrl: null,
        },
        {
          name: "archive.zip",
          path: `${HOME}\\archive.zip`,
          isDir: false,
          entryKind: "file",
          extension: "zip",
          size: 524_288,
          modifiedMs: NOW - 86_400_000,
          iconDataUrl: null,
        },
        {
          name: ".winfinder-hidden",
          path: `${HOME}\\.winfinder-hidden`,
          isDir: false,
          entryKind: "file",
          extension: null,
          size: 128,
          modifiedMs: NOW - 10_000,
          iconDataUrl: null,
          hidden: true,
        },
      ],
      [`${HOME}\\Desktop`]: [
        {
          name: "Screenshot.png",
          path: `${HOME}\\Desktop\\Screenshot.png`,
          isDir: false,
          entryKind: "file",
          extension: "png",
          size: 40_960,
          modifiedMs: NOW - 1_200_000,
          iconDataUrl: null,
        },
      ],
      [`${HOME}\\Documents`]: [
        {
          name: "Projects",
          path: `${HOME}\\Documents\\Projects`,
          isDir: true,
          entryKind: "folder",
          extension: null,
          size: 0,
          modifiedMs: NOW - 4_000_000,
          iconDataUrl: null,
        },
        {
          name: "Report.pdf",
          path: `${HOME}\\Documents\\Report.pdf`,
          isDir: false,
          entryKind: "file",
          extension: "pdf",
          size: 102_400,
          modifiedMs: NOW - 5_000_000,
          iconDataUrl: null,
        },
        {
          name: "Budget.xlsx",
          path: `${HOME}\\Documents\\Budget.xlsx`,
          isDir: false,
          entryKind: "file",
          extension: "xlsx",
          size: 15_360,
          modifiedMs: NOW - 2_000_000,
          iconDataUrl: null,
        },
      ],
      [`${HOME}\\Documents\\Projects`]: [
        {
          name: "WinFinder",
          path: `${HOME}\\Documents\\Projects\\WinFinder`,
          isDir: true,
          entryKind: "folder",
          extension: null,
          size: 0,
          modifiedMs: NOW - 500_000,
          iconDataUrl: null,
        },
        {
          name: "spec.md",
          path: `${HOME}\\Documents\\Projects\\spec.md`,
          isDir: false,
          entryKind: "file",
          extension: "md",
          size: 4096,
          modifiedMs: NOW - 600_000,
          iconDataUrl: null,
        },
      ],
      [`${HOME}\\Documents\\Projects\\WinFinder`]: [
        {
          name: "README.md",
          path: `${HOME}\\Documents\\Projects\\WinFinder\\README.md`,
          isDir: false,
          entryKind: "file",
          extension: "md",
          size: 3072,
          modifiedMs: NOW - 300_000,
          iconDataUrl: null,
        },
      ],
      [`${HOME}\\Downloads`]: [
        {
          name: "installer.msi",
          path: `${HOME}\\Downloads\\installer.msi`,
          isDir: false,
          entryKind: "file",
          extension: "msi",
          size: 8_388_608,
          modifiedMs: NOW - 1_500_000,
          iconDataUrl: null,
        },
      ],
      "virtual://recents": [
        {
          name: "Report.pdf",
          path: `${HOME}\\Documents\\Report.pdf`,
          isDir: false,
          entryKind: "file",
          extension: "pdf",
          size: 102_400,
          modifiedMs: NOW - 5_000_000,
          iconDataUrl: null,
        },
      ],
      "virtual://applications": [
        {
          name: "Notepad",
          path: "C:\\Windows\\System32\\notepad.exe",
          isDir: false,
          entryKind: "app",
          extension: "exe",
          size: 204_800,
          modifiedMs: NOW - 100_000_000,
          iconDataUrl: null,
        },
      ],
      "virtual://computer": [
        {
          name: "Local Disk (C:)",
          path: "C:\\",
          isDir: true,
          entryKind: "drive",
          extension: null,
          size: 0,
          modifiedMs: null,
          iconDataUrl: null,
        },
      ],
      "virtual://network": [],
      "virtual://trash": [
        {
          name: "old-draft.txt",
          path: "C:\\$Recycle.Bin\\old-draft.txt",
          isDir: false,
          entryKind: "file",
          extension: "txt",
          size: 512,
          modifiedMs: NOW - 20_000,
          iconDataUrl: null,
        },
      ],
    };

    const calls: Array<{ cmd: string; args: unknown }> = [];
    (window as unknown as Record<string, unknown>).__TAURI_MOCK_CALLS__ = calls;

    function buildBreadcrumbs(targetPath: string) {
      if (targetPath === "virtual://recents") {
        return [{ name: "Recents", path: "virtual://recents" }];
      }
      if (targetPath === "virtual://applications") {
        return [{ name: "Applications", path: "virtual://applications" }];
      }
      if (targetPath === "virtual://computer") {
        return [{ name: "Drives", path: "virtual://computer" }];
      }
      if (targetPath === "virtual://network") {
        return [{ name: "Network", path: "virtual://network" }];
      }
      if (targetPath === "virtual://trash") {
        return [{ name: "Trash", path: "virtual://trash" }];
      }

      if (targetPath.toLowerCase().startsWith(HOME.toLowerCase())) {
        const rel = targetPath.slice(HOME.length).replace(/^\\+/, "");
        const crumbs = [{ name: "tester", path: HOME }];
        if (rel) {
          let running = HOME;
          for (const seg of rel.split("\\")) {
            running = `${running}\\${seg}`;
            crumbs.push({ name: seg, path: running });
          }
        }
        return crumbs;
      }

      const parts = targetPath.split("\\").filter(Boolean);
      return parts.map((seg, idx) => ({
        name: seg,
        path: parts.slice(0, idx + 1).join("\\"),
      }));
    }

    function nameForPath(targetPath: string): string {
      const crumbs = buildBreadcrumbs(targetPath);
      return crumbs[crumbs.length - 1]?.name ?? targetPath;
    }

    const invoke = async (cmd: string, args: Record<string, unknown> = {}) => {
      calls.push({ cmd, args });

      switch (cmd) {
        case "get_sidebar_locations":
          return {
            homePath: HOME,
            homeName: "tester",
            desktopPath: `${HOME}\\Desktop`,
            documentsPath: `${HOME}\\Documents`,
            downloadsPath: `${HOME}\\Downloads`,
          };

        case "load_app_state":
          return {
            activePanel: "home",
            panels: {},
          };

        case "save_panel_states":
        case "save_custom_favorites":
          return null;

        case "check_directory_exists": {
          const targetPath = args.path as string;
          return Boolean(fsTree[targetPath]);
        }

        case "resolve_panel_path": {
          const savedPath = args.savedPath as string | undefined;
          const rootPath = args.rootPath as string;
          if (savedPath && fsTree[savedPath]) {
            return savedPath;
          }
          return rootPath;
        }

        case "list_directory": {
          const requestedPath = (args.path as string | null) || HOME;
          const showHidden = Boolean(args.showHidden);
          const rawEntries = fsTree[requestedPath];
          if (!rawEntries) {
            throw `Directory not found: ${requestedPath}`;
          }
          const entries = rawEntries
            .filter((e) => showHidden || !e.hidden)
            .map(({ hidden: _hidden, ...rest }) => rest);

          return {
            currentPath: requestedPath,
            currentName: nameForPath(requestedPath),
            homePath: HOME,
            homeName: "tester",
            breadcrumbs: buildBreadcrumbs(requestedPath),
            entries,
            emptyMessage:
              requestedPath === "virtual://network"
                ? "No network locations available"
                : null,
          };
        }

        case "create_new_folder": {
          const parentPath = args.parentPath as string;
          const existing = fsTree[parentPath] ?? [];
          let candidate = "New Folder";
          let idx = 2;
          while (existing.some((e) => e.name.toLowerCase() === candidate.toLowerCase())) {
            candidate = `New Folder (${idx++})`;
          }
          const newPath = `${parentPath}\\${candidate}`;
          existing.push({
            name: candidate,
            path: newPath,
            isDir: true,
            entryKind: "folder",
            extension: null,
            size: 0,
            modifiedMs: Date.now(),
            iconDataUrl: null,
          });
          fsTree[parentPath] = existing;
          fsTree[newPath] = [];
          return newPath;
        }

        case "empty_trash": {
          fsTree["virtual://trash"] = [];
          return null;
        }

        case "copy_file_to_clipboard":
        case "share_with_os":
        case "open_in_terminal":
        case "reveal_in_file_manager":
        case "open_item":
          return null;

        case "show_context_menu":
          return false;

        default:
          return null;
      }
    };

    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {
      invoke,
      transformCallback: () => 0,
      convertFileSrc: (filePath: string) => filePath,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    };
  });
}
