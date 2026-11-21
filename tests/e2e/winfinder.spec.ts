import { expect, test } from "@playwright/test";
import { installMockTauri } from "./fixtures/mockTauri";

test.describe("WinFinder E2E Test Scenarios", () => {
  test.describe("Tauri IPC-backed Finder workflows", () => {
    test.beforeEach(async ({ page }) => {
      await installMockTauri(page);
      await page.goto("/");
      await expect(page.locator(".toolbar-title")).toHaveText("tester");
    });

    test("S1 — Initial Load & Shell Layout", async ({ page }) => {
      await expect(page.locator(".finder-sidebar")).toBeVisible();
      await expect(page.locator(".finder-toolbar")).toBeVisible();
      await expect(page.locator(".finder-canvas")).toBeVisible();
      await expect(page.locator(".finder-pathbar")).toBeVisible();
      await expect(page.locator(".finder-statusbar")).toBeVisible();

      // Default view mode is Icons view
      await expect(page.getByRole("button", { name: "Icons view" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await expect(page.locator(".finder-canvas")).toHaveClass(/view-icons/);

      // Home directory entries render (5 non-hidden items)
      await expect(page.locator(".icon-tile")).toHaveCount(5);
      await expect(page.locator(".finder-statusbar")).toHaveText("5 items");
    });

    test("S2 — Sidebar Navigation & Active State", async ({ page }) => {
      const panels: Array<{ label: string; expectedTitle: string }> = [
        { label: "Recents", expectedTitle: "Recents" },
        { label: "Applications", expectedTitle: "Applications" },
        { label: "Desktop", expectedTitle: "Desktop" },
        { label: "Documents", expectedTitle: "Documents" },
        { label: "Downloads", expectedTitle: "Downloads" },
        { label: "Drives", expectedTitle: "Drives" },
        { label: "Network", expectedTitle: "Network" },
      ];

      for (const { label, expectedTitle } of panels) {
        const btn = page.locator(".finder-sidebar button.sidebar-item", {
          hasText: label,
        });
        await btn.click();
        await expect(btn).toHaveClass(/active/);
        await expect(page.locator(".toolbar-title")).toHaveText(expectedTitle);
        await expect(page.locator(".pathbar-crumb.current")).toHaveText(
          expectedTitle
        );
      }

      // Network shows its virtual empty state message
      await expect(page.locator(".canvas-state")).toContainText(
        "No network locations available"
      );
    });

    test("S3 — Folder Navigation, Breadcrumbs & Back/Forward History", async ({
      page,
    }) => {
      const backBtn = page.getByRole("button", { name: "Back" });
      const forwardBtn = page.getByRole("button", { name: "Forward" });

      await expect(backBtn).toBeDisabled();
      await expect(forwardBtn).toBeDisabled();

      // Double-click Documents -> Projects -> WinFinder
      await page.locator(".icon-tile", { hasText: "Documents" }).dblclick();
      await expect(page.locator(".toolbar-title")).toHaveText("Documents");
      await expect(page.locator(".pathbar-crumb")).toHaveCount(2);

      await page.locator(".icon-tile", { hasText: "Projects" }).dblclick();
      await expect(page.locator(".toolbar-title")).toHaveText("Projects");
      await expect(page.locator(".pathbar-crumb")).toHaveCount(3);
      await expect(backBtn).toBeEnabled();

      // Navigate back -> Documents
      await backBtn.click();
      await expect(page.locator(".toolbar-title")).toHaveText("Documents");
      await expect(forwardBtn).toBeEnabled();

      // Navigate forward -> Projects
      await forwardBtn.click();
      await expect(page.locator(".toolbar-title")).toHaveText("Projects");

      // Click root breadcrumb ("tester") to jump straight back to Home
      await page.locator(".pathbar-crumb", { hasText: "tester" }).click();
      await expect(page.locator(".toolbar-title")).toHaveText("tester");
      await expect(page.locator(".pathbar-crumb")).toHaveCount(1);
    });

    test("S4 — View Mode Switching (Icons, List, Columns, Gallery)", async ({
      page,
    }) => {
      // Switch to List view
      await page.getByRole("button", { name: "List view" }).click();
      await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await expect(page.locator(".finder-canvas")).toHaveClass(/view-list/);
      await expect(page.locator(".list-header")).toBeVisible();
      await expect(page.locator(".list-row")).toHaveCount(5);

      // Switch to Columns (Miller Columns) view
      await page.getByRole("button", { name: "Columns view" }).click();
      await expect(
        page.getByRole("button", { name: "Columns view" })
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".finder-canvas")).toHaveClass(/view-columns/);
      await expect(page.locator(".miller-column")).toHaveCount(1);

      // Clicking a folder opens a second Miller column
      await page.locator(".miller-row", { hasText: "Documents" }).click();
      await expect(page.locator(".miller-column")).toHaveCount(2);

      // Clicking a file in the second column displays the preview pane
      await page.locator(".miller-row", { hasText: "Report.pdf" }).click();
      await expect(page.locator(".miller-preview")).toBeVisible();
      await expect(page.locator(".miller-preview .preview-name")).toHaveText(
        "Report.pdf"
      );

      // Switch to Gallery view
      await page.getByRole("button", { name: "Gallery view" }).click();
      await expect(
        page.getByRole("button", { name: "Gallery view" })
      ).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator(".finder-canvas")).toHaveClass(/view-gallery/);
      await expect(page.locator(".gallery-hero")).toBeVisible();
      await expect(page.locator(".gallery-thumb")).toHaveCount(5);

      // Switch back to Icons view
      await page.getByRole("button", { name: "Icons view" }).click();
      await expect(page.locator(".finder-canvas")).toHaveClass(/view-icons/);
    });

    test("S5 — Sorting Controls & Sort Menu", async ({ page }) => {
      // Switch to List view so row order is straightforward to inspect
      await page.getByRole("button", { name: "List view" }).click();

      const getNames = () =>
        page.locator(".list-row .list-name-text").allTextContents();

      // Default: Name Asc, Folders First
      expect(await getNames()).toEqual([
        "Desktop",
        "Documents",
        "Downloads",
        "archive.zip",
        "notes.txt",
      ]);

      // Open Sort menu and switch to Descending
      await page.getByRole("button", { name: "Sort items" }).click();
      await expect(
        page.getByRole("menu", { name: "Sort options" })
      ).toBeVisible();
      await page.getByRole("menuitemradio", { name: "Descending" }).click();

      expect(await getNames()).toEqual([
        "Downloads",
        "Documents",
        "Desktop",
        "notes.txt",
        "archive.zip",
      ]);

      // Toggle off "Keep Folders on Top" and sort Ascending by Name
      await page.getByRole("button", { name: "Sort items" }).click();
      await page
        .getByRole("menuitemcheckbox", { name: "Keep Folders on Top" })
        .click();
      await page.getByRole("button", { name: "Sort items" }).click();
      await page.getByRole("menuitemradio", { name: "Ascending" }).click();

      expect(await getNames()).toEqual([
        "archive.zip",
        "Desktop",
        "Documents",
        "Downloads",
        "notes.txt",
      ]);

      // Clicking Size column header sorts by Size descending
      await page.locator(".list-col-hdr.col-size").click();
      const bySizeDesc = await getNames();
      expect(bySizeDesc[0]).toBe("archive.zip");
    });

    test("S6 — Item Selection, Status Bar & Share Menu", async ({ page }) => {
      const shareBtn = page.getByRole("button", { name: "Share" });
      await expect(shareBtn).toBeDisabled();

      // Click a file to select it
      const notesTile = page.locator(".icon-tile", { hasText: "notes.txt" });
      await notesTile.click();
      await expect(notesTile).toHaveClass(/selected/);
      await expect(page.locator(".finder-statusbar")).toHaveText(
        "1 of 5 items selected"
      );
      await expect(shareBtn).toBeEnabled();

      // Open Share menu and verify options
      await shareBtn.click();
      const shareMenu = page.getByRole("menu", { name: "Share options" });
      await expect(shareMenu).toBeVisible();
      await expect(shareMenu).toContainText("notes.txt");
      await expect(
        shareMenu.getByRole("menuitem", { name: "Copy File" })
      ).toBeVisible();
      await expect(
        shareMenu.getByRole("menuitem", { name: "Copy Path" })
      ).toBeVisible();

      // Trigger Copy File (invokes copy_file_to_clipboard)
      await shareMenu.getByRole("menuitem", { name: "Copy File" }).click();
      await expect(shareMenu).toBeHidden();

      // Click empty canvas to clear selection
      await page.locator(".finder-canvas").click({ position: { x: 20, y: 400 } });
      await expect(page.locator(".finder-statusbar")).toHaveText("5 items");
      await expect(shareBtn).toBeDisabled();
    });

    test("S7 — Actions Menu, New Folder & Show Hidden Files", async ({
      page,
    }) => {
      const actionsBtn = page.getByRole("button", { name: "More actions" });

      // Open Actions menu and verify Escape dismisses it
      await actionsBtn.click();
      const actionsMenu = page.getByRole("menu", { name: "Folder actions" });
      await expect(actionsMenu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(actionsMenu).toBeHidden();

      // Toggle "Show Hidden Files" -> reveals .winfinder-hidden
      await actionsBtn.click();
      const hiddenToggle = actionsMenu.getByRole("menuitemcheckbox", {
        name: "Show Hidden Files",
      });
      await expect(hiddenToggle).toHaveAttribute("aria-checked", "false");
      await hiddenToggle.click();

      await expect(
        page.locator(".icon-tile", { hasText: ".winfinder-hidden" })
      ).toBeVisible();
      await expect(page.locator(".finder-statusbar")).toHaveText("6 items");

      // Create "New Folder" via Actions menu
      await actionsBtn.click();
      await actionsMenu.getByRole("menuitem", { name: "New Folder" }).click();
      await expect(
        page.locator(".icon-tile", { hasText: "New Folder" })
      ).toBeVisible();
      await expect(page.locator(".finder-statusbar")).toHaveText(
        "1 of 7 items selected"
      );
    });

    test("S8 — List View Inline Disclosure & Sidebar Resize", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "List view" }).click();

      // Expand Documents inline
      const expandDocsBtn = page.getByRole("button", {
        name: "Expand Documents",
      });
      await expect(expandDocsBtn).toHaveAttribute("aria-expanded", "false");
      await expandDocsBtn.click();

      await expect(
        page.getByRole("button", { name: "Collapse Documents" })
      ).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.locator(".list-row", { hasText: "Report.pdf" })
      ).toBeVisible();

      // Collapse Documents inline
      await page.getByRole("button", { name: "Collapse Documents" }).click();
      await expect(
        page.locator(".list-row", { hasText: "Report.pdf" })
      ).toBeHidden();

      // Resize sidebar by dragging handle, then double-click to reset to 204px
      const sidebar = page.locator(".finder-sidebar");
      const initialBox = await sidebar.boundingBox();
      expect(initialBox).not.toBeNull();

      const handle = page.locator(".sidebar-resize-handle");
      const handleBox = await handle.boundingBox();
      expect(handleBox).not.toBeNull();

      await page.mouse.move(
        handleBox!.x + handleBox!.width / 2,
        handleBox!.y + handleBox!.height / 2
      );
      await page.mouse.down();
      await page.mouse.move(
        handleBox!.x + 60,
        handleBox!.y + handleBox!.height / 2
      );
      await page.mouse.up();

      const resizedBox = await sidebar.boundingBox();
      expect(resizedBox!.width).toBeGreaterThan(initialBox!.width + 20);

      await handle.dblclick();
      const resetBox = await sidebar.boundingBox();
      expect(Math.round(resetBox!.width)).toBe(204);
    });

    test("S9 — Browser Context Menu Suppression", async ({ page }) => {
      const wasPrevented = await page.evaluate(() => {
        const target = document.querySelector(".icon-tile");
        if (!target) return false;
        const event = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      });

      expect(wasPrevented).toBe(true);
    });
  });

  test.describe("Non-Tauri browser fallback", () => {
    test("S9b — Renders mock preview listing gracefully without Tauri runtime", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.locator(".toolbar-title")).toHaveText("Home");
      await expect(page.locator(".icon-tile")).toHaveCount(7);
      await expect(page.locator(".finder-statusbar")).toHaveText("7 items");
    });
  });
});
