/**
 * Lean 4 + Mathlib proof-of-concept suite. Runs the REAL Lean kernel through
 * the local isolated runner. AI steps are not exercised here (no API key in
 * tests); where the brief needs an AI formalization (case 3) the spec is
 * written by hand to simulate one.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { leanRunnerFromEnv, type LeanRunner } from "@/lib/lean/runner";
import { checkTheorems } from "@/lib/lean/check";
import { lintFragment, cascadeProof } from "@/lib/lean/source";
import { enqueueLean, latestLean, processLeanQueue, verifyQuestion, verifySpec } from "@/lib/lean/pipeline";
import type { FormalSpec } from "@/lib/lean/formalize";
import { insertQuestion, loadVersions, type StoredQuestion } from "@/lib/factory/store";
import { validateVersions } from "@/lib/factory/validate";
import { runGenerationBatch } from "@/lib/factory/pipeline";
import { approvedQuestion, resetDb } from "../helpers";
import type { CandidateQuestionT } from "@/lib/schemas/question";

const runner = leanRunnerFromEnv();
const describeLean = runner ? describe : describe.skip;
if (!runner) console.warn("Lean runner not available — set LEAN_PROJECT_DIR/LEAN_BIN_DIR to run the Lean suite");

let adminId: string;
beforeAll(async () => {
  ({ adminId } = await resetDb());
});

function candidate(statement: string, options: [string, string, boolean][], expression: string, extra: Partial<CandidateQuestionT> = {}): CandidateQuestionT {
  return {
    statement,
    options: options.map(([tex, value, ok]) => ({ tex, value, is_correct: ok, misconception: ok ? "" : "a plausible mistake", rationale: "test", derivation: null })),
    solution: "Worked solution used only for testing the Lean pipeline.",
    key_insight: "test",
    tags: ["test"],
    techniques: [],
    estimated_difficulty: 2,
    estimated_solve_seconds: 30,
    verification: { kind: "sympy", expression, checks: [], precision_dp: null, notes: "" },
    diagram: null,
    template_id: null,
    ...extra,
  };
}

async function store(c: CandidateQuestionT, slot = 1): Promise<StoredQuestion> {
  const { versionId } = await sql.begin((tx) => insertQuestion(tx, { slot, batchId: null, generatorVersionId: null, source: "manual", candidate: c, meta: {} }));
  return (await loadVersions([versionId]))[0];
}

describeLean("Lean 4 verification (real kernel)", () => {
  const r = runner as LeanRunner;

  it("case 1: a valid polynomial identity is proved by the kernel with only standard axioms", async () => {
    const res = await checkTheorems(r, [{ name: "mathdle_case1", role: "key", statement: "∀ n : ℤ, n ^ 2 - (n - 1) * (n + 1) = 1", proofs: ["intro n\nring"] }], (t) => t.proofs![0]);
    expect(res.fileErrors).toEqual([]);
    expect(res.results[0].proved).toBe(true);
    expect(res.results[0].untrustedAxioms).toEqual([]);
  });

  it("case 2: a false identity is never marked verified, and a wrong answer key is refuted", async () => {
    const res = await checkTheorems(r, [
      { name: "mathdle_false", role: "key", statement: "∀ n : ℤ, n ^ 2 - (n - 1) * (n + 1) = 2" },
      { name: "mathdle_negation", role: "refute_key", statement: "¬ ∀ n : ℤ, n ^ 2 - (n - 1) * (n + 1) = 2" },
    ]);
    expect(res.results[0].proved).toBe(false);
    expect(res.results[1].proved).toBe(true); // Lean proves the claim is false

    // Full pipeline: an arithmetic question whose stored key is wrong.
    const q = await store(
      candidate("What is $\\frac{3}{4}+\\frac{5}{6}$?", [["$\\frac{19}{12}$", "Rational(19,12)", false], ["$\\frac{4}{5}$", "Rational(4,5)", true], ["$\\frac{5}{8}$", "Rational(5,8)", false], ["$\\frac{2}{3}$", "Rational(2,3)", false]], "Rational(3,4) + Rational(5,6)"),
    );
    const out = await verifyQuestion(q, r);
    expect(out.status).toBe("proof_failed");
    expect(out.refuted).toBe(true);
    expect(out.diagnostics).toMatch(/does NOT satisfy|ALSO satisfies/);
  });

  it("case 3: a missing domain restriction (x/0 = 0 in Lean) is caught by the consistency audit", async () => {
    const q = await store(
      candidate("Find the real number $x$ such that $\\frac{x^2-1}{x-1}=0$.", [["$-1$", "-1", true], ["$1$", "1", false], ["$0$", "0", false], ["$2$", "2", false]], "-1"),
    );
    const naive: FormalSpec = {
      method: "ai",
      category: "polynomial_equation",
      answerType: "ℝ",
      predicate: "fun (x : ℝ) => (x ^ 2 - 1) / (x - 1) = 0",
      claim: "x solves (x^2-1)/(x-1) = 0",
      assumptions: [],
      optionTerms: ["(-1 : ℝ)", "(1 : ℝ)", "(0 : ℝ)", "(2 : ℝ)"],
      keyIndex: 0,
    };
    const out = await verifySpec(q, naive, { eligible: true, category: "polynomial_equation", reason: "test", method: "ai" }, r);
    // In Lean, x = 1 gives 0/0 = 0, so the naive statement "accepts" the extraneous root…
    expect(out.results!.find((x) => x.name === "mathdle_refute_b")?.proved).toBe(true);
    // …but the audit flags the formalization, so this is NOT treated as a refutation of the key.
    expect(out.status).toBe("consistency_failed");
    expect(out.refuted).toBe(false);
    expect(out.consistency_findings!.some((f) => f.category === "domain" && /x - 1/.test(f.message))).toBe(true);

    const fixed: FormalSpec = { ...naive, predicate: "fun (x : ℝ) => x - 1 ≠ 0 ∧ (x ^ 2 - 1) / (x - 1) = 0", assumptions: [{ lean: "x - 1 ≠ 0", justification: "the expression is undefined at x = 1" }] };
    const ok = await verifySpec(q, fixed, { eligible: true, category: "polynomial_equation", reason: "test", method: "ai" }, r);
    expect(ok.results!.find((x) => x.name === "mathdle_key")?.proved).toBe(true);
    expect(ok.results!.find((x) => x.name === "mathdle_excludes_b")?.proved).toBe(true); // x = 1 now excluded
    expect(ok.refuted).toBe(false);
    expect(ok.consistency_findings!.some((f) => f.category === "domain" && f.severity === "high")).toBe(false);
  });

  it("case 4: a true claim the proof search cannot close is inconclusive, not a false judgment", async () => {
    const q = await store(
      candidate("Simplify $\\sqrt{12}$.", [["$2\\sqrt{3}$", "2*sqrt(3)", true], ["$3\\sqrt{2}$", "3*sqrt(2)", false], ["$4\\sqrt{3}$", "4*sqrt(3)", false], ["$6$", "6", false]], "sqrt(12)"),
    );
    const out = await verifyQuestion(q, r);
    expect(out.refuted).toBe(false);
    expect(["inconclusive", "proof_failed"]).toContain(out.status);
    expect(out.diagnostics).toMatch(/not evidence that the answer is wrong|consistency could not be confirmed/);
  });

  it("case 5: geometry/diagram questions exit as unsupported without blocking the batch", async () => {
    const s = await runGenerationBatch({ slot: 3, count: 3, providerId: "procedural", adminId, seed: 31 });
    expect(s.produced).toBe(3);
    const ids = await sql<{ id: string; diagram: unknown }[]>`
      select v.id, v.diagram from questions q join question_versions v on v.id = q.current_version_id where q.batch_id = ${s.batchId}`;
    await processLeanQueue({ maxJobs: 10 });
    const lean = await latestLean(ids.map((x) => x.id));
    for (const { id, diagram } of ids) {
      const l = lean.get(id);
      if (!l) continue; // failed SymPy validation → not enqueued
      expect(l.status).not.toBe("pending");
      expect(l.refuted).toBe(false);
      if (diagram) expect(l.status).toBe("unsupported");
    }
  });

  it("case 6: sorry, untrusted axioms and native code are rejected", async () => {
    for (const bad of ["sorry", "admit", "axiom cheat : False", "native_decide", "#eval IO.println 1", "run_tac pure ()", "set_option maxHeartbeats 0 in rfl"])
      expect(lintFragment(bad, "tactic").length, bad).toBeGreaterThan(0);
    // Even if a shortcut slipped past the lint, the axiom check rejects it.
    const res = await checkTheorems(
      r,
      [
        { name: "mathdle_sorry", role: "key", statement: "(1 : ℤ) = 2", proofs: ["sorry"] },
        { name: "mathdle_native", role: "key", statement: "(2 : ℕ) + 2 = 4", proofs: ["native_decide"] },
      ],
      (t) => t.proofs![0],
      { useCache: false },
    );
    expect(res.results[0].proved).toBe(false);
    expect(res.results[0].axioms).toContain("sorryAx");
    expect(res.results[1].proved).toBe(false);
    expect(res.results[1].untrustedAxioms.length).toBeGreaterThan(0);
  });

  it("case 7: multiple-choice — key holds, every distractor provably fails, options distinct", async () => {
    const q = await store(
      candidate(
        "What is $7^{2026}$ modulo $10$? (i.e. its units digit)",
        [["$9$", "9", true], ["$1$", "1", false], ["$3$", "3", false], ["$7$", "7", false]],
        "Mod(Integer(7)**2026, 10)",
      ),
    );
    const out = await verifyQuestion(q, r);
    const roles = (role: string) => out.results!.filter((x) => x.role === role);
    expect(roles("key")[0].proved).toBe(true);
    expect(roles("excludes")).toHaveLength(3); // one per distractor (options are shuffled on storage)
    for (const x of [...roles("excludes"), ...roles("distinct")]) expect(x.proved, x.name).toBe(true);
    for (const x of [...roles("refute_key"), ...roles("refute_option")]) expect(x.proved, x.name).toBe(false);
    expect(out.refuted).toBe(false);
    // Without the AI audit the expression-level formalization stays unconfirmed: proofs pass, status inconclusive.
    expect(out.status).toBe("inconclusive");
    expect(out.consistency_findings!.some((f) => f.category === "modelling")).toBe(true);
    expect(out.theorem_source).toContain("7 : ℤ) ^ 2026");
  });

  it("regression: a .doit() verification expression is exported structurally, not as a vacuous 5 = 5", async () => {
    const q = await store(
      candidate(
        "Compute $\\left(1+\\frac12\\right)\\left(1+\\frac13\\right)\\cdots\\left(1+\\frac19\\right)$.",
        [["$5$", "5", true], ["$10$", "10", false], ["$\\frac{9}{2}$", "Rational(9,2)", false], ["$\\frac{11}{2}$", "Rational(11,2)", false]],
        "Product(1 + 1/k, (k, 2, 9)).doit()",
      ),
    );
    const out = await verifyQuestion(q, r);
    expect(out.theorem_source).toContain("∏ k ∈ Finset.Icc (2 : ℕ) 9");
    const roles = (role: string) => out.results!.filter((x) => x.role === role);
    expect(roles("key")[0].proved).toBe(true);
    for (const x of roles("excludes")) expect(x.proved, x.name).toBe(true);
    expect(out.refuted).toBe(false);
  });

  it("jobs are idempotent, cached, persisted per immutable version, and Lean refutation blocks publication", async () => {
    const { versionId } = await approvedQuestion(1, adminId);
    expect(await enqueueLean([versionId])).toBe(1);
    expect(await enqueueLean([versionId])).toBe(0); // one open job per version
    await processLeanQueue({ maxJobs: 1 });
    const first = (await latestLean([versionId])).get(versionId)!;
    expect(first.status).not.toBe("pending");
    expect(first.lean_version).toBe("4.35.0");
    expect(first.mathlib_version).toBe("v4.35.0");
    await expect(sql`update lean_verifications set status = 'verified' where id = ${first.id}`).rejects.toThrow(/final/);
    // A recheck creates a new history row and reuses the kernel cache.
    expect(await enqueueLean([versionId])).toBe(1);
    await processLeanQueue({ maxJobs: 1 });
    const rows = await sql`select runner from lean_verifications where question_version_id = ${versionId} order by created_at`;
    expect(rows).toHaveLength(2);
    if (first.status !== "unsupported") expect(rows[1].runner).toMatch(/cached/);

    // Publication guard: a refuted key cannot be published.
    await sql`insert into lean_verifications (question_version_id, pipeline_version, status, refuted, completed_at) values (${versionId}, 'test', 'proof_failed', true, now() + interval '1 minute')`;
    const [{ problem }] = await sql`select question_version_publishable(${versionId}) as problem`;
    expect(problem).toMatch(/Lean refuted/);
  });
});

describe("Lean pipeline without a runner", () => {
  it("leaves jobs pending (grey) instead of failing them", async () => {
    const prev = process.env.LEAN_RUNNER;
    process.env.LEAN_RUNNER = "disabled";
    try {
      const out = await processLeanQueue();
      expect(out.processed).toBe(0);
    } finally {
      process.env.LEAN_RUNNER = prev;
    }
  });
});

void cascadeProof;
void validateVersions;
