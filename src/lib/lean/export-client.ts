/** SymPy -> Lean term export via the Python validator (local CLI or the deployed validator service). */
import { spawn } from "node:child_process";
import path from "node:path";

export interface ExportResult {
  id: string;
  ok: boolean;
  type?: "ℤ" | "ℚ" | "ℝ";
  expression?: string;
  options?: string[];
  reason?: string;
}

export async function exportToLean(items: { id: string; expression: string; options: string[] }[]): Promise<ExportResult[]> {
  const payload = JSON.stringify({ items });
  if (process.env.VALIDATOR_URL) {
    const res = await fetch(`${process.env.VALIDATOR_URL.replace(/\/$/, "")}/lean_export`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.VALIDATOR_TOKEN ?? ""}` },
      body: payload,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`lean_export returned ${res.status}`);
    return (await res.json()).results;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON_BIN ?? "python3", [path.join(process.cwd(), "validator", "cli.py"), "lean-export"], {
      cwd: path.join(process.cwd(), "validator"),
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`lean export failed: ${err.slice(-500)}`));
      try {
        resolve(JSON.parse(out).results);
      } catch {
        reject(new Error("lean export produced invalid JSON"));
      }
    });
    child.stdin.end(payload);
  });
}
