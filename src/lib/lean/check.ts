/** Compile theorems with Lean, with a deterministic cache keyed by (source hash, environment version). */
import { sql } from "@/lib/db";
import { LEAN_ENV_VERSION } from "./env";
import type { LeanRunner } from "./runner";
import { type BuiltFile, type TheoremResult, type TheoremSpec, buildFile, cascadeProof, parseOutput, sha256 } from "./source";

export interface CheckResult {
  built: BuiltFile;
  sourceHash: string;
  results: TheoremResult[];
  fileErrors: string[];
  timedOut: boolean;
  durationMs: number;
  cached: boolean;
  runner: string;
  isolation: string[];
  stderr: string;
}

export async function checkTheorems(
  runner: LeanRunner,
  theorems: TheoremSpec[],
  proofFor: (t: TheoremSpec) => string = (t) => t.proofs?.[0] ?? cascadeProof(),
  opts: { useCache?: boolean } = {},
): Promise<CheckResult> {
  const built = buildFile(theorems, proofFor);
  const sourceHash = sha256(built.source);
  if (opts.useCache !== false) {
    const [hit] = await sql<{ result: CheckResult }[]>`
      select result from lean_check_cache where source_hash = ${sourceHash} and env_version = ${LEAN_ENV_VERSION}`;
    if (hit) return { ...hit.result, built, cached: true };
  }
  const out = await runner.run(built.source);
  const { results, fileErrors } = parseOutput(built, theorems, out.stdout);
  if (out.timedOut) fileErrors.push(`Lean timed out after ${Math.round(out.durationMs / 1000)}s`);
  if (!out.stdout.trim() && out.exitCode !== 0) fileErrors.push(`Lean did not run (exit ${out.exitCode}): ${out.stderr.slice(-500)}`);
  const result: CheckResult = {
    built,
    sourceHash,
    results,
    fileErrors,
    timedOut: out.timedOut,
    durationMs: out.durationMs,
    cached: false,
    runner: out.runner,
    isolation: out.isolation,
    stderr: out.stderr.slice(-2000),
  };
  // Only cache genuine kernel outcomes, never infrastructure failures.
  if (!out.timedOut && out.stdout.trim()) {
    const { built: _b, ...toCache } = result;
    void _b;
    await sql`insert into lean_check_cache (source_hash, env_version, result) values (${sourceHash}, ${LEAN_ENV_VERSION}, ${sql.json(toCache as never)})
              on conflict do nothing`;
  }
  return result;
}
