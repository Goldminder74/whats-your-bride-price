import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const localBrowserChannel = process.platform === "win32" ? "msedge" : undefined;
const artifactRoot = process.env.WYBP_PLAYWRIGHT_OUTPUT_DIR || join(tmpdir(), "wybp-playwright-results");
const reportRoot = process.env.WYBP_PLAYWRIGHT_REPORT_DIR || join(tmpdir(), "wybp-playwright-report");

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/playwright-global-teardown.mjs",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: reportRoot }]],
  outputDir: artifactRoot,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: localBrowserChannel,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: "node tests/preview-server.mjs",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
