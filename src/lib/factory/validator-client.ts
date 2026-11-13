/**
 * Bridge to the Python/SymPy validator.
 *  - If VALIDATOR_URL is set, POST to the HTTP service (validator/server.py).
 *  - Otherwise spawn `python3 validator/cli.py` locally (dev / self-hosted).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import type { CandidateQuestionT } from "@/lib/schemas/question";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";
export interface ValidationCheck {
  name: string;
  status: CheckStatus;
  detail: string;
}
export interface PyResult {
  id: string;
  status: "passed" | "failed" | "needs_review";
  checks: ValidationCheck[];
  computed: Record<string, unknown>;
}

const TIMEOUT_MS = Number(process.env.VALIDATOR_TIMEOUT_MS ?? 120_000);

export async function runSympyValidator(items: { id: string; candidate: CandidateQuestionT }[]): Promise<{ results: PyResult[]; engine: string }> {
  const payload = JSON.stringify({ questions: items });
  if (process.env.VALIDATOR_URL) {
    const res = await fetch(`${process.env.VALIDATOR_URL.replace(/\/$/, "")}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VALIDATOR_TOKEN ?? ""}` },
      body: payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`validator service returned ${res.status}`);
    return res.json();
  }
  const py = process.env.PYTHON_BIN ?? "python3";
  const cli = path.join(process.cwd(), "validator", "cli.py");
  return new Promise((resolve, reject) => {
    const child = spawn(py, [cli], { cwd: path.join(process.cwd(), "validator"), stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("validator timed out"));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`validator exited ${code}: ${err.slice(-2000)}`));
      try {
        resolve(JSON.parse(out));
      } catch {
        reject(new Error(`validator produced invalid JSON: ${out.slice(0, 500)}`));
      }
    });
    child.stdin.end(payload);
  });
}
