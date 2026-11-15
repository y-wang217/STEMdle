/**
 * Asynchronous Lean verification jobs.
 *
 * Jobs are rows in lean_verifications (status `pending`). They are enqueued
 * after SymPy validation and processed out of band (after the HTTP response,
 * by the admin "process"/"retry" actions and by the daily cron). Never during
 * player gameplay. A job is claimed with SKIP LOCKED, so concurrent workers
 * never process the same job; infrastructure errors are retried up to
 * max_attempts, after which the job is finalized as `inconclusive`.
 */
import { sql } from "@/lib/db";
import { loadVersions, type StoredQuestion } from "@/lib/factory/store";
import { aiAvailable, aiProve } from "./ai";
import { type Finding, audit } from "./audit";
import { checkTheorems, type CheckResult } from "./check";
import { LEAN_AI_PROOF_ROUNDS, LEAN_ENV_VERSION, LEAN_MAX_JOBS_PER_RUN, LEAN_PIPELINE_VERSION, LEAN_VERSION, MATHLIB_VERSION } from "./env";
import { type Eligibility, type FormalSpec, formalize, theoremsFor } from "./formalize";
import { leanRunnerFromEnv, type LeanRunner } from "./runner";
import { type TheoremResult, type TheoremSpec, cascadeProof, lintFragment, sha256 } from "./source";

export type LeanStatus = "pending" | "verified" | "proof_failed" | "inconclusive" | "unsupported" | "consistency_failed";

export interface LeanSummary {
  id: string;
  question_version_id: string;
  status: LeanStatus;
  refuted: boolean;
  eligibility: { eligible: boolean; category: string; reason: string; method: string } | null;
  formalization_method: string | null;
  claim: string | null;
  assumptions: { lean: string; justification: string }[];
  theorem_source: string | null;
  proof_source: string | null;
  results: TheoremResult[] | null;
  diagnostics: string | null;
  consistency_status: string | null;
  consistency_method: string | null;
  consistency_findings: { source: string; category: string; severity: string; message: string }[];
  lean_version: string | null;
  mathlib_version: string | null;
  runner: string | null;
  duration_ms: number | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Queue verification for question versions (idempotent: one open job per version). */
export async function enqueueLean(versionIds: string[], requestedBy: string | null = null): Promise<number> {
  let n = 0;
  for (const id of versionIds) {
    const rows = await sql`
      insert into lean_verifications (question_version_id, pipeline_version, requested_by)
      values (${id}, ${LEAN_PIPELINE_VERSION}, ${requestedBy})
      on conflict (question_version_id, pipeline_version) where status = 'pending' do nothing
      returning id`;
    n += rows.length;
  }
  return n;
}

export async function latestLean(versionIds: string[]): Promise<Map<string, LeanSummary>> {
  if (!versionIds.length) return new Map();
  const rows = await sql<LeanSummary[]>`
    select distinct on (question_version_id) * from lean_verifications
    where question_version_id = any(${versionIds}::uuid[])
    order by question_version_id, created_at desc`;
  return new Map(rows.map((r) => [r.question_version_id, r]));
}

async function claim(): Promise<{ id: string; question_version_id: string; attempts: number; max_attempts: number } | null> {
  const [row] = await sql<{ id: string; question_version_id: string; attempts: number; max_attempts: number }[]>`
    update lean_verifications set locked_at = now(), attempts = attempts + 1
    where id = (
      select id from lean_verifications
      where status = 'pending' and attempts < max_attempts
        and (locked_at is null or locked_at < now() - interval '10 minutes')
      order by created_at limit 1 for update skip locked)
    returning id, question_version_id, attempts, max_attempts`;
  return row ?? null;
}

async function finalize(id: string, data: Record<string, unknown>) {
  const cols = {
    status: data.status,
    refuted: data.refuted ?? false,
    eligibility: data.eligibility ? sql.json(data.eligibility as never) : null,
    formalization_method: data.formalization_method ?? null,
    claim: data.claim ?? null,
    assumptions: sql.json((data.assumptions ?? []) as never),
    spec: data.spec ? sql.json(data.spec as never) : null,
    theorem_source: data.theorem_source ?? null,
    proof_source: data.proof_source ?? null,
    theorem_hash: data.theorem_hash ?? null,
    results: data.results ? sql.json(data.results as never) : null,
    axioms: data.axioms ? sql.json(data.axioms as never) : null,
    diagnostics: data.diagnostics ? String(data.diagnostics).slice(0, 20000) : null,
    consistency_status: data.consistency_status ?? null,
    consistency_method: data.consistency_method ?? null,
    consistency_findings: sql.json((data.consistency_findings ?? []) as never),
    lean_version: LEAN_VERSION,
    mathlib_version: MATHLIB_VERSION,
    env_version: LEAN_ENV_VERSION,
    runner: data.runner ?? null,
    duration_ms: data.duration_ms ?? null,
    last_error: data.last_error ?? null,
  };
  await sql`update lean_verifications set ${sql(cols as never)}, locked_at = null, completed_at = now() where id = ${id} and status = 'pending'`;
}

function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ level: "info", component: "lean", event, ...fields, at: new Date().toISOString() }));
}

/** Decide the verdict from kernel results and the audit. Exported for tests. */
export function verdict(results: TheoremResult[], consistency: string | null, aiProofsRejected: boolean) {
  const by = (role: string) => results.filter((r) => r.role === role);
  const refutedBy = [...by("refute_key"), ...by("refute_option")].filter((r) => r.proved);
  const keyProved = by("key").every((r) => r.proved);
  const excluded = by("excludes").every((r) => r.proved);
  const distinct = by("distinct").every((r) => r.proved);
  // A flagged formalization proves nothing about the question — in either direction.
  if (consistency === "inconsistent")
    return {
      status: "consistency_failed" as LeanStatus,
      refuted: false,
      note: refutedBy.length
        ? "the formal statement does not faithfully represent the question, so Lean's refutation of it is NOT evidence against the answer key"
        : "the formal statement does not faithfully represent the question",
    };
  if (refutedBy.length) {
    const why = refutedBy.map((r) => (r.role === "refute_key" ? "Lean proved the claimed answer does NOT satisfy the question" : `Lean proved option ${r.option} ALSO satisfies the question`));
    return { status: "proof_failed" as LeanStatus, refuted: true, note: why.join("; ") };
  }
  if (keyProved && excluded && distinct) {
    if (consistency === "consistent") return { status: "verified" as LeanStatus, refuted: false, note: "all proofs passed; consistency audit passed" };
    return { status: "inconclusive" as LeanStatus, refuted: false, note: "proofs passed; consistency could not be confirmed (needs AI audit or review)" };
  }
  const missing = [!keyProved && "the answer key", !excluded && "excluding every distractor", !distinct && "option distinctness"].filter(Boolean).join(", ");
  if (aiProofsRejected) return { status: "proof_failed" as LeanStatus, refuted: false, note: `Lean rejected the submitted proofs for ${missing}. This is not evidence that the answer is wrong.` };
  return { status: "inconclusive" as LeanStatus, refuted: false, note: `proof search did not establish ${missing}. This is not evidence that the answer is wrong.` };
}

export interface VerifyOutput {
  status: LeanStatus;
  refuted?: boolean;
  eligibility?: Eligibility;
  formalization_method?: string;
  claim?: string;
  assumptions?: FormalSpec["assumptions"];
  spec?: FormalSpec;
  theorem_source?: string;
  proof_source?: string;
  theorem_hash?: string;
  results?: TheoremResult[];
  axioms?: Record<string, string[] | null>;
  diagnostics?: string;
  consistency_status?: string;
  consistency_method?: string | null;
  consistency_findings?: Finding[];
  runner?: string;
  duration_ms?: number;
}

export async function verifyQuestion(q: StoredQuestion, runner: LeanRunner): Promise<VerifyOutput> {
  const t0 = Date.now();
  const { eligibility, spec, problems } = await formalize(q);
  if (!eligibility.eligible || !spec) return { status: "unsupported" as LeanStatus, eligibility, diagnostics: eligibility.reason, duration_ms: Date.now() - t0 };
  if (problems.length)
    return {
      eligibility, formalization_method: spec.method, claim: spec.claim, assumptions: spec.assumptions, spec,
      status: "inconclusive" as LeanStatus, diagnostics: `formalization rejected by lint: ${problems.join("; ")}`, duration_ms: Date.now() - t0,
    };
  return verifySpec(q, spec, eligibility, runner, t0);
}

/** Prove/refute the theorems for a formal spec, audit consistency, and decide the status. */
export async function verifySpec(q: StoredQuestion, spec: FormalSpec, eligibility: Eligibility, runner: LeanRunner, t0 = Date.now()): Promise<VerifyOutput> {
  const base = { eligibility, formalization_method: spec.method, claim: spec.claim, assumptions: spec.assumptions, spec };

  const theorems = theoremsFor(spec);
  let check: CheckResult = await checkTheorems(runner, theorems);
  if (check.fileErrors.length && !check.results.some((r) => r.proved))
    throw new Error(`Lean run failed: ${check.fileErrors.join(" | ").slice(0, 1000)}`); // infrastructure problem → retry

  // AI proof repair for goals the cascade could not close (never for refutation attempts).
  let aiProofsRejected = false;
  const aiProofs = new Map<string, string>();
  for (let round = 0; round < LEAN_AI_PROOF_ROUNDS && aiAvailable(); round++) {
    const open = check.results.filter((r) => !r.proved && ["key", "excludes", "distinct", "unique"].includes(r.role));
    if (!open.length) break;
    const proposals = await aiProve(open.map((r) => ({ name: r.name, statement: theorems.find((t) => t.name === r.name)!.statement, error: r.errors[0] ?? "cascade failed" })));
    let any = false;
    for (const p of proposals) {
      if (!open.some((o) => o.name === p.name) || lintFragment(p.tactics, "tactic").length) continue;
      aiProofs.set(p.name, p.tactics);
      any = true;
    }
    if (!any) break;
    const proofFor = (t: TheoremSpec) => aiProofs.get(t.name) ?? cascadeProof();
    const next = await checkTheorems(runner, theorems, proofFor);
    // Keep the best result per theorem across rounds.
    check = { ...next, results: next.results.map((r, i) => (r.proved ? r : check.results[i].proved ? check.results[i] : r)) };
    aiProofsRejected = check.results.some((r) => aiProofs.has(r.name) && !r.proved);
  }

  // Audit whenever Lean established something (a proof or a refutation) that the verdict would rely on.
  const decisive = check.results.some((r) => r.proved && ["key", "refute_key", "refute_option"].includes(r.role));
  const aud = decisive ? await audit(q, spec, check.built.statements) : null;
  const v = verdict(check.results, aud?.status ?? null, aiProofsRejected);
  const diag = [
    v.note,
    ...check.results.filter((r) => !r.proved && r.errors.length && !r.role.startsWith("refute")).map((r) => `${r.name}: ${r.errors[0].slice(0, 300)}`),
    ...check.fileErrors,
    aud?.aiError ? `AI audit unavailable: ${aud.aiError}` : "",
  ].filter(Boolean);
  return {
    ...base,
    status: v.status,
    refuted: v.refuted,
    theorem_source: check.built.statements,
    proof_source: check.built.source,
    theorem_hash: sha256(check.built.statements),
    results: check.results,
    axioms: Object.fromEntries(check.results.map((r) => [r.name, r.axioms])),
    diagnostics: diag.join("\n"),
    consistency_status: aud?.status ?? "not_run",
    consistency_method: aud?.method ?? null,
    consistency_findings: aud?.findings ?? [],
    runner: check.runner + (check.cached ? " (cached)" : ""),
    duration_ms: Date.now() - t0,
  };
}

/** Process pending jobs (bounded). Safe to call concurrently and repeatedly. */
export async function processLeanQueue(opts: { maxJobs?: number; deadlineMs?: number } = {}) {
  const runner = leanRunnerFromEnv();
  if (!runner) return { processed: 0, reason: "no Lean runner configured" };
  const deadline = Date.now() + (opts.deadlineMs ?? 240_000);
  let processed = 0;
  while (processed < (opts.maxJobs ?? LEAN_MAX_JOBS_PER_RUN) && Date.now() < deadline) {
    const job = await claim();
    if (!job) break;
    processed++;
    const t0 = Date.now();
    try {
      const [q] = await loadVersions([job.question_version_id]);
      if (!q) throw new Error("question version not found");
      const out = await verifyQuestion(q, runner);
      await finalize(job.id, out as unknown as Record<string, unknown>);
      log("verified", { job: job.id, version: job.question_version_id, status: out.status, ms: Date.now() - t0 });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 2000);
      log("error", { job: job.id, attempt: job.attempts, error: msg });
      if (job.attempts >= job.max_attempts)
        await finalize(job.id, { status: "inconclusive", diagnostics: `verification could not complete after ${job.attempts} attempts: ${msg}`, last_error: msg });
      else await sql`update lean_verifications set locked_at = null, last_error = ${msg} where id = ${job.id} and status = 'pending'`;
    }
  }
  return { processed, runner: runner.id };
}

/** Formal-verification failure categories in a slot, for the generator (separate from difficulty feedback). */
export async function recentFormalFailures(slot: number): Promise<string[]> {
  const rows = await sql<{ status: string; refuted: boolean; diagnostics: string | null; findings: { severity: string; category: string; message: string }[] }[]>`
    select lv.status, lv.refuted, lv.diagnostics, lv.consistency_findings as findings
    from lean_verifications lv join question_versions v on v.id = lv.question_version_id join questions q on q.id = v.question_id
    where q.slot = ${slot} and (lv.refuted or lv.status = 'consistency_failed')
    order by lv.completed_at desc limit 8`;
  return rows.map((r) =>
    r.refuted
      ? `Answer key refuted by Lean: ${(r.diagnostics ?? "").split("\n")[0]}`
      : `Formalization mismatch: ${r.findings
          .filter((f) => f.severity === "high")
          .map((f) => `${f.category} — ${f.message}`)
          .join("; ")
          .slice(0, 300)}`,
  );
}
