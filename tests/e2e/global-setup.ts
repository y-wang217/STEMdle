import { execFileSync } from "node:child_process";

export default function globalSetup() {
  execFileSync("npx", ["tsx", "tests/e2e/setup-db.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mathdle_e2e", APP_SECRET: "e2e-secret-e2e-secret-e2e-secret" },
  });
}
