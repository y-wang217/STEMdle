/**
 * Eligibility + formalization.
 *
 * Two formalization methods:
 *  - `expression` (deterministic, no AI): the question's own SymPy
 *    verification expression and its four option values are exported to Lean
 *    terms without evaluation. Lean then proves `E = key` and `E ≠ d` for each
 *    distractor. This kernel-checks the arithmetic/algebra; whether `E` is what
 *    the question asks is left to the consistency audit.
 *  - `ai` (Claude): formalizes the QUESTION as a predicate P on the answer,
 *    without being shown the answer key; options are instantiated into P.
 */
import type { StoredQuestion } from "@/lib/factory/store";
import { aiAvailable, aiFormalize } from "./ai";
import { exportToLean } from "./export-client";
import { type TheoremSpec, lintFragment } from "./source";

export interface FormalSpec {
  method: "expression" | "ai";
  category: string;
  answerType: "ℕ" | "ℤ" | "ℚ" | "ℝ";
  predicate: string; // fun (v : T) => …
  claim: string;
  assumptions: { lean: string; justification: string }[];
  optionTerms: string[]; // A–D (stored option order)
  keyIndex: number;
  expressionTerm?: string;
}

export interface Eligibility {
  eligible: boolean;
  category: string;
  reason: string;
  method: "deterministic" | "ai";
}

const LABELS = ["A", "B", "C", "D"];

/** Hard exclusions that never go to Lean in this pipeline version. */
export function deterministicExclusion(q: StoredQuestion): string | null {
  if (q.diagram) return "geometry/diagram question (not supported by the current Lean pipeline)";
  if (q.tags.some((t) => /geometr/i.test(t))) return "geometry question (not supported by the current Lean pipeline)";
  if (q.verification?.precision_dp != null) return "rounded decimal answer (rounding is not formalized)";
  return null;
}

function categorize(expr: string): string {
  if (/%/.test(expr)) return "number_theory";
  if (/Real\.(sin|cos|tan)/.test(expr)) return "trig_identity";
  if (/Real\.sqrt|\^/.test(expr)) return "algebraic_identity";
  return "arithmetic";
}

export async function formalize(q: StoredQuestion): Promise<{ eligibility: Eligibility; spec: FormalSpec | null; problems: string[] }> {
  const keyIndex = q.options.findIndex((o) => o.is_correct);
  const excluded = deterministicExclusion(q);
  if (excluded) return { eligibility: { eligible: false, category: "unsupported", reason: excluded, method: "deterministic" }, spec: null, problems: [] };

  // 1) Deterministic expression path.
  if (q.verification?.kind === "sympy" && q.verification.expression) {
    const [ex] = await exportToLean([{ id: q.version_id, expression: q.verification.expression, options: q.options.map((o) => o.value) }]);
    if (ex?.ok && ex.expression && ex.options && ex.type) {
      const category = categorize(ex.expression);
      return {
        eligibility: { eligible: true, category, reason: "verification expression and options exported to closed Lean terms", method: "deterministic" },
        spec: {
          method: "expression",
          category,
          answerType: ex.type,
          predicate: `fun (v : ${ex.type}) => v = ${ex.expression}`,
          claim: `The question's verification expression evaluates to option ${LABELS[keyIndex]} and to none of the other options.`,
          assumptions: [],
          optionTerms: ex.options,
          keyIndex,
          expressionTerm: ex.expression,
        },
        problems: [],
      };
    }
  }

  // 2) AI formalization of the question itself.
  if (!aiAvailable())
    return {
      eligibility: { eligible: false, category: "unsupported", reason: "no deterministic formalization, and the AI formalizer is not configured", method: "deterministic" },
      spec: null,
      problems: [],
    };
  const ai = await aiFormalize({ statement: q.statement, options: q.options.map((o) => o.tex) });
  if (!ai.eligible) return { eligibility: { eligible: false, category: ai.category, reason: ai.reason, method: "ai" }, spec: null, problems: [] };
  const problems = [
    ...lintFragment(ai.predicate, "term").map((p) => `predicate: ${p}`),
    ...ai.option_terms.flatMap((t, i) => lintFragment(t, "term").map((p) => `option ${LABELS[i]}: ${p}`)),
    ...ai.assumptions.flatMap((a) => lintFragment(a.lean, "term").map((p) => `assumption: ${p}`)),
  ];
  if (!/^\s*fun\s*\(?\s*[a-zA-Z_]\w*\s*:/.test(ai.predicate)) problems.push("predicate must be a lambda `fun (v : T) => …`");
  if (ai.option_terms.length !== 4) problems.push("expected four option terms");

  // Prefer option terms exported deterministically from the stored option values.
  let optionTerms = ai.option_terms;
  const [opt] = await exportToLean([{ id: q.version_id, expression: q.options[0].value || "0", options: q.options.map((o) => o.value) }]).catch(() => []);
  if (opt?.ok && opt.options && opt.type === ai.answer_type) optionTerms = opt.options;

  return {
    eligibility: { eligible: true, category: ai.category, reason: ai.reason, method: "ai" },
    spec: {
      method: "ai",
      category: ai.category,
      answerType: ai.answer_type,
      predicate: ai.predicate,
      claim: ai.claim,
      assumptions: ai.assumptions,
      optionTerms,
      keyIndex,
    },
    problems,
  };
}

/** The theorems checked for a multiple-choice question (statements only; we write every header). */
export function theoremsFor(spec: FormalSpec): TheoremSpec[] {
  const K = spec.optionTerms[spec.keyIndex];
  const P = `(${spec.predicate})`;
  const holds = (term: string) => (spec.method === "expression" ? `${spec.expressionTerm} = ${term}` : `${P} ${term}`);
  const fails = (term: string) => (spec.method === "expression" ? `${spec.expressionTerm} ≠ ${term}` : `¬ ${P} ${term}`);
  const out: TheoremSpec[] = [{ name: "mathdle_key", role: "key", statement: holds(K) }];
  spec.optionTerms.forEach((t, i) => {
    if (i === spec.keyIndex) return;
    out.push({ name: `mathdle_excludes_${LABELS[i].toLowerCase()}`, role: "excludes", option: LABELS[i], statement: fails(t) });
  });
  const pairs: string[] = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push(`(${spec.optionTerms[i]} : ${spec.answerType}) ≠ ${spec.optionTerms[j]}`);
  out.push({ name: "mathdle_distinct", role: "distinct", statement: pairs.join(" ∧ ") });
  // Refutation attempts: if Lean proves any of these, the answer key is demonstrably wrong.
  out.push({ name: "mathdle_refute_key", role: "refute_key", statement: fails(K) });
  spec.optionTerms.forEach((t, i) => {
    if (i === spec.keyIndex) return;
    out.push({ name: `mathdle_refute_${LABELS[i].toLowerCase()}`, role: "refute_option", option: LABELS[i], statement: holds(t) });
  });
  if (spec.method === "ai") out.push({ name: "mathdle_unique", role: "unique", statement: `∀ v : ${spec.answerType}, ${P} v → v = ${K}` });
  return out;
}
