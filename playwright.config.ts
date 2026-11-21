import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.WINFINDER_TEST_PORT || 4173);
const BASE_URL = process.env.WINFINDER_BASE_URL || `http://127.0.0.1:${PORT}`;
const OUTPUT_DIR = process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : undefined,
  reporter: [
    ["list"],
    ["json", { outputFile: `${OUTPUT_DIR}/results.json` }],
  ],
  outputDir: `${OUTPUT_DIR}/artifacts`,
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1200, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.WINFINDER_BASE_URL
    ? undefined
    : {
        command:
          process.env.WINFINDER_SERVE_DIST === "1"
            ? `node ./scripts/serve-dist.mjs ${PORT}`
            : `node ./node_modules/vite/bin/vite.js --port ${PORT} --host 127.0.0.1 --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
