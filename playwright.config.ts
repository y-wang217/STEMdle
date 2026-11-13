import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mathdle_e2e";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" }, testMatch: /player\.spec\.ts/ },
    { name: "small-mobile", use: { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, browserName: "chromium" }, testMatch: /layout\.spec\.ts/ },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 }, browserName: "chromium" }, testMatch: /admin\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: E2E_DB,
      APP_SECRET: "e2e-secret-e2e-secret-e2e-secret",
      GENERATOR_PROVIDER: "procedural",
      ANTHROPIC_API_KEY: "",
      MATHDLE_EPOCH: "2026-11-01",
      MATHDLE_DISABLE_RATE_LIMITS: "1",
      NEXT_PUBLIC_SITE_URL: "https://mathdle.example",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
