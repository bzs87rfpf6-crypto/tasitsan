import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the bulk-upload navigation flow.
 *
 * Set these env vars before running:
 *   E2E_BASE_URL   – defaults to https://tasitsan.com.tr
 *   E2E_EMAIL      – test account email with seller access
 *   E2E_PASSWORD   – test account password
 *
 * Run with:
 *   bunx playwright install chromium   # one-time
 *   bunx playwright test
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://tasitsan.com.tr",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"] },
    },
  ],
});
