/**
 * Validation pipeline. Independent checks:
 *  1. Schema + structure (zod, 4 options, exactly one marked correct)
 *  2. KaTeX renders every TeX segment (strict)
 *  3. SymPy: independent recomputation, exactly-one-correct, equivalence,
 *     distinctness, TeX↔value, precision, domain checks, trap derivations, diagram geometry
 *  4. Duplicates: exact duplicate (fail) / structural near-duplicate (warn)
 *  5. Optional reasoning check: an AI blind-solve without the answer key
 * Result is stored immutably in question_validations; question status follows.
 */
import { sql } from "@/lib/db";
import { CandidateQuestion } from "@/lib/schemas/question";
import { katexProblems } from "@/lib/math/tex-check";
import { runSympyValidator, type ValidationCheck } from "./validator-client";
import { loadVersions, toCandidate, type StoredQuestion } from "./store";
import { NEAR_DUPLICATE_THRESHOLD, exactKey, structuralSimilarity } from "./fingerprint";
import type { GeneratorProvider } from "./providers/types";
import { recomputeStatus } from "./feedback";

export type ValidationStatus = "passed" | "failed" | "needs_review";

export interface ValidationOutcome {
  versionId: string;
  questionId: string;
  status: ValidationStatus;
  checks: ValidationCheck[];
}

function structuralChecks(q: StoredQuestion): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const parsed = CandidateQuestion.safeParse(toCandidate(q));
  if (!parsed.success)
    checks.push({
      name: "schema",
      status: "fail",
      detail: parsed.error.issues
        .slice(0, 4)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  else checks.push({ name: "schema", status: "pass", detail: "matches candidate schema" });
  const correct = q.options.filter((o) => o.is_correct).length;
  if (q.options.length !== 4 || correct !== 1)
    checks.push({ name: "structure", status: "fail", detail: `${q.options.length} options, ${correct} marked correct` });
  if (q.statement.trim().length < 10) checks.push({ name: "structure", status: "fail", detail: "statement too short" });
  if (q.solution.trim().length < 20) checks.push({ name: "structure", status: "fail", detail: "solution missing or too short" });
  const tex = katexProblems(toCandidate(q));
  checks.push(
    tex.length
      ? { name: "katex", status: "fail", detail: tex.slice(0, 3).join("; ") }
      : { name: "katex", status: "pass", detail: "all TeX renders" },
  );
  return checks;
}

async function duplicateChecks(q: StoredQuestion): Promise<ValidationCheck[]> {
  const others = await sql<{ id: string; statement: string; status: string; options: string[] }[]>`
    select q.id, v.statement, q.status,
      (select array_agg(o.tex) from question_options o where o.question_version_id = v.id) as options
    from questions q join question_versions v on v.id = q.current_version_id
    where q.slot = ${q.slot} and q.id <> ${q.id} and q.status not in ('validation_failed', 'rejected', 'validating')
    order by q.created_at desc limit 2000`;
  const key = exactKey(q.statement, q.options.map((o) => o.tex));
  const exact = others.find((o) => exactKey(o.statement, o.options ?? []) === key);
  if (exact) return [{ name: "duplicate", status: "fail", detail: `identical to question ${exact.id}` }];
  let best = { id: "", sim: 0 };
  for (const o of others) {
    const s = structuralSimilarity(q.statement, o.statement);
    if (s > best.sim) best = { id: o.id, sim: s };
  }
  if (best.sim >= NEAR_DUPLICATE_THRESHOLD)
    return [{ name: "near_duplicate", status: "warn", detail: `same structure as question ${best.id} (similarity ${best.sim.toFixed(2)})` }];
  return [{ name: "duplicate", status: "pass", detail: `no duplicate among ${others.length} questions in this slot` }];
}

async function reasoningCheck(q: StoredQuestion, provider: GeneratorProvider): Promise<ValidationCheck[]> {
  if (!provider.blindSolve || process.env.VALIDATION_BLIND_SOLVE === "0") {
    return [{ name: "independent_reasoning", status: "skip", detail: "no AI solver configured (development adapter)" }];
  }
  try {
    const r = await provider.blindSolve({ statement: q.statement, options: q.options.map((o) => o.tex) });
    const correctIdx = q.options.findIndex((o) => o.is_correct);
    const out: ValidationCheck[] = [];
    if (r.choice !== correctIdx)
      out.push({ name: "independent_reasoning", status: "warn", detail: `blind solver chose ${"ABCD"[r.choice]} (confidence ${r.confidence}); key is ${"ABCD"[correctIdx]}` });
    else out.push({ name: "independent_reasoning", status: "pass", detail: `blind solver agrees (confidence ${r.confidence})` });
    if (r.concerns.length) out.push({ name: "ambiguity", status: "warn", detail: r.concerns.join(" | ").slice(0, 600) });
    return out;
  } catch (e) {
    return [{ name: "independent_reasoning", status: "warn", detail: `blind solve failed: ${(e as Error).message}` }];
  }
}

export async function validateVersions(versionIds: string[], provider?: GeneratorProvider): Promise<ValidationOutcome[]> {
  const qs = await loadVersions(versionIds);
  if (!qs.length) return [];
  let py: Awaited<ReturnType<typeof runSympyValidator>> | null = null;
  let pyError: string | null = null;
  try {
    py = await runSympyValidator(qs.map((q) => ({ id: q.version_id, candidate: toCandidate(q) })));
  } catch (e) {
    pyError = (e as Error).message;
  }
  // Phase 1: deterministic checks.
  const staged = [];
  for (const q of qs) {
    const checks: ValidationCheck[] = [...structuralChecks(q)];
    const pr = py?.results.find((r) => r.id === q.version_id);
    if (pr) checks.push(...pr.checks);
    else checks.push({ name: "sympy", status: "fail", detail: `validator unavailable: ${pyError ?? "no result"}` });
    checks.push(...(await duplicateChecks(q)));
    staged.push({ q, pr, checks });
  }
  // Phase 2: AI reasoning checks, a few at a time (only for questions still in contention).
  if (provider) {
    const queue = staged.filter((s) => !s.checks.some((c) => c.status === "fail"));
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) s.checks.push(...(await reasoningCheck(s.q, provider)));
    });
    await Promise.all(workers);
  }
  // Phase 3: persist immutable reports and derive statuses.
  const outcomes: ValidationOutcome[] = [];
  for (const { q, pr, checks } of staged) {
    let status: ValidationStatus;
    if (checks.some((c) => c.status === "fail")) status = "failed";
    else if (
      pr?.status === "needs_review" ||
      checks.some((c) => (c.name === "independent_reasoning" || c.name === "ambiguity") && c.status === "warn")
    )
      status = "needs_review";
    else status = "passed";

    await sql.begin(async (tx) => {
      await tx`insert into question_validations (question_version_id, status, engine, checks, computed)
               values (${q.version_id}, ${status}, ${py?.engine ?? "unavailable"}, ${tx.json(checks as never)}, ${tx.json((pr?.computed ?? {}) as never)})`;
      await recomputeStatus(tx, q.id);
    });
    outcomes.push({ versionId: q.version_id, questionId: q.id, status, checks });
  }
  return outcomes;
}

export async function latestValidation(versionId: string) {
  const [row] = await sql<{ status: ValidationStatus; checks: ValidationCheck[]; created_at: string; engine: string }[]>`
    select status, checks, created_at, engine from question_validations where question_version_id = ${versionId}
    order by created_at desc limit 1`;
  return row ?? null;
}
