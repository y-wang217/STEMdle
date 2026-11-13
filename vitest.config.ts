import { defineConfig } from "vitest/config";
import path from "node:path";
import "dotenv/config";

const testDb = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mathdle_test";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      DATABASE_URL: testDb,
      TEST_DATABASE_URL: testDb,
      MATHDLE_EPOCH: "2026-11-01",
      APP_SECRET: "test-secret-test-secret-test-secret",
      GENERATOR_PROVIDER: "procedural",
      ANTHROPIC_API_KEY: "",
      VALIDATOR_URL: "",
    },
  },
});
