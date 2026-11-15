/**
 * Lean proof-execution runners. Generated Lean is untrusted code.
 *
 *  - `vercel-sandbox` (production): every check runs in a fresh Vercel Sandbox
 *    microVM restored from a snapshot containing only Lean + Mathlib. Network
 *    is `deny-all`, no environment variables or credentials are passed in, the
 *    VM is stopped after the check, and it has its own CPU/memory allotment.
 *  - `local` (development): `lake env lean` under prlimit (address space + CPU
 *    time), an empty environment, a private temp dir and — when available — a
 *    network namespace with no interfaces (`unshare --net`). This is weaker
 *    than a microVM and is meant for local development and tests only.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LEAN_CHECK_TIMEOUT_MS } from "./env";

export interface RunOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
  runner: string;
  isolation: string[];
}

export interface LeanRunner {
  id: "local" | "vercel-sandbox";
  run(source: string): Promise<RunOutput>;
}

function leanProjectDir() {
  return process.env.LEAN_PROJECT_DIR || path.join(process.cwd(), "lean");
}
function leanBinDir() {
  return process.env.LEAN_BIN_DIR || "";
}

let netIsolation: boolean | null = null;
function canUnshareNet() {
  if (netIsolation === null) {
    try {
      netIsolation = spawnSync("unshare", ["--net", "true"], { timeout: 5000 }).status === 0;
    } catch {
      netIsolation = false;
    }
  }
  return netIsolation;
}

export const localRunner: LeanRunner = {
  id: "local",
  async run(source) {
    const t0 = Date.now();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mathdle-lean-"));
    fs.chmodSync(dir, 0o700);
    const file = path.join(dir, "Check.lean");
    fs.writeFileSync(file, source, { mode: 0o600 });
    const bin = leanBinDir();
    const env = {
      PATH: [bin, "/usr/local/bin", "/usr/bin", "/bin"].filter(Boolean).join(":"),
      HOME: dir,
      TMPDIR: dir,
      LANG: "C.UTF-8",
    } as unknown as NodeJS.ProcessEnv;
    const isolation = ["empty environment (no secrets)", "private temp dir", "prlimit: 24 GiB virtual address space, 300 s CPU"];
    const inner = ["lake", "env", "lean", "--json", file];
    const cmd = ["prlimit", `--as=${24 * 1024 ** 3}`, "--cpu=300", "--"];
    if (canUnshareNet()) {
      cmd.push("unshare", "--net", "--");
      isolation.push("no network (unshare --net)");
    } else isolation.push("WARNING: network namespace unavailable");
    cmd.push(...inner);
    return new Promise((resolve) => {
      const child = spawn(cmd[0], cmd.slice(1), { cwd: leanProjectDir(), env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, LEAN_CHECK_TIMEOUT_MS);
      child.stdout.on("data", (d) => (stdout = (stdout + d).slice(-2_000_000)));
      child.stderr.on("data", (d) => (stderr = (stderr + d).slice(-200_000)));
      const done = (exitCode: number | null) => {
        clearTimeout(timer);
        fs.rmSync(dir, { recursive: true, force: true });
        resolve({ stdout, stderr, exitCode, timedOut, durationMs: Date.now() - t0, runner: "local", isolation });
      };
      child.on("error", (e) => {
        stderr += String(e);
        done(null);
      });
      child.on("close", (code) => done(code));
    });
  },
};

/** Active snapshot: the DB setting (updated by the refresh endpoint) wins over the env var. */
export async function currentSnapshotId(): Promise<string | null> {
  try {
    const { sql } = await import("@/lib/db");
    const [row] = await sql<{ value: string }[]>`select value #>> '{}' as value from app_settings where key = 'lean_sandbox_snapshot_id'`;
    if (row?.value) return row.value;
  } catch {
    /* settings table unavailable: fall back to env */
  }
  return process.env.LEAN_SANDBOX_SNAPSHOT_ID || null;
}

export const sandboxRegion = () => (process.env.LEAN_SANDBOX_REGION || "yul1") as "yul1";

export const sandboxRunner: LeanRunner = {
  id: "vercel-sandbox",
  async run(source) {
    const t0 = Date.now();
    const snapshotId = await currentSnapshotId();
    if (!snapshotId) throw new Error("no Lean sandbox snapshot configured (LEAN_SANDBOX_SNAPSHOT_ID)");
    const { Sandbox } = await import("@vercel/sandbox");
    const sandbox = await Sandbox.create({
      region: sandboxRegion(),
      source: { type: "snapshot", snapshotId },
      networkPolicy: "deny-all",
      resources: { vcpus: Number(process.env.LEAN_SANDBOX_VCPUS ?? 4) },
      timeout: LEAN_CHECK_TIMEOUT_MS + 60_000,
      persistent: false,
      env: {},
    });
    const isolation = ["Vercel Sandbox microVM", "network deny-all", "no credentials or app env", "fresh VM per check"];
    try {
      await sandbox.writeFiles([{ path: "/tmp/mathdle/Check.lean", content: source }]);
      const project = process.env.LEAN_SANDBOX_PROJECT_DIR ?? "/vercel/lean";
      const toolchain = process.env.LEAN_SANDBOX_TOOLCHAIN_DIR ?? "/vercel/lean-toolchain";
      const res = await sandbox.runCommand({
        cmd: "bash",
        args: ["-lc", `export PATH=${toolchain}/bin:$PATH; cd ${project} && timeout ${Math.floor(LEAN_CHECK_TIMEOUT_MS / 1000)} lake env lean --json /tmp/mathdle/Check.lean`],
        env: {},
      });
      const [stdout, stderr] = await Promise.all([res.stdout(), res.stderr()]);
      return { stdout, stderr, exitCode: res.exitCode, timedOut: res.exitCode === 124, durationMs: Date.now() - t0, runner: "vercel-sandbox", isolation };
    } finally {
      await sandbox.stop().catch(() => {});
    }
  },
};

export function leanRunnerFromEnv(): LeanRunner | null {
  const mode = process.env.LEAN_RUNNER ?? (process.env.LEAN_SANDBOX_SNAPSHOT_ID ? "vercel-sandbox" : "local");
  if (mode === "disabled") return null;
  if (mode === "vercel-sandbox") return sandboxRunner;
  // local: only if a Lean project with Mathlib is present
  const dir = leanProjectDir();
  if (!fs.existsSync(path.join(dir, ".lake", "packages", "mathlib"))) return null;
  return localRunner;
}
