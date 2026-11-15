/**
 * Claude-assisted steps of the Lean pipeline. None of these are trusted:
 * formalizations are linted and audited, proofs are checked by Lean's kernel,
 * and the semantic audit is recorded as advisory (never a formal guarantee).
 */
import { z } from "zod";
import { DEFAULT_MODEL, structured } from "@/lib/factory/providers/anthropic";

const model = () => process.env.LEAN_AI_MODEL || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
export const aiAvailable = () => Boolean(process.env.ANTHROPIC_API_KEY);

export const AiSpec = z.object({
  eligible: z.boolean(),
  category: z.enum(["algebraic_identity", "polynomial_equation", "inequality", "number_theory", "divisibility", "finite_combinatorics", "trig_identity", "arithmetic", "other"]),
  reason: z.string(),
  answer_type: z.enum(["ℕ", "ℤ", "ℚ", "ℝ"]),
  predicate: z.string().describe("Lean 4 lambda `fun (v : T) => P v` that is true exactly for the correct answer value(s) of the question"),
  assumptions: z.array(z.object({ lean: z.string(), justification: z.string() })),
  claim: z.string().describe("Plain-English statement of what P expresses"),
  option_terms: z.array(z.string()).describe("Lean terms of type answer_type for options A, B, C, D in order"),
});
export type AiSpecT = z.infer<typeof AiSpec>;

const FORMALIZE_SYSTEM = `You formalize multiple-choice mathematics questions in Lean 4 + Mathlib for independent verification.

Rules:
- Decide eligibility first. Eligible: algebraic identities, polynomial equations, inequalities, elementary number theory, divisibility, finite combinatorial identities, selected trigonometric identities, exact arithmetic. NOT eligible: geometry/diagram questions, rounded decimals, probability with modelling choices, anything you cannot state faithfully. When in doubt, eligible = false.
- Formalize the QUESTION, not the claimed answer: write a predicate P on the answer value v that holds exactly for the correct answer(s) per the question text. Do not use or trust any answer key.
- Include every domain restriction, quantifier and condition from the question. Beware Lean's junk values: x / 0 = 0, Real.sqrt of a negative = 0, Real.log 0 = 0, natural-number subtraction truncates, ℤ/ℕ division floors. Add explicit hypotheses (e.g. x ≠ 1) whenever the question implies them, and list every such assumption with its justification from the text.
- Never weaken the problem (no extra assumptions the question does not state or imply, no easier task).
- option_terms: the four answer choices as Lean terms of answer_type, in order A–D.
- Use only Mathlib notation in terms (no tactic blocks, no 'by', no ':=', no commands, no new declarations).`;

export async function aiFormalize(input: { statement: string; options: string[] }): Promise<AiSpecT> {
  const { data } = await structured({
    model: model(),
    system: FORMALIZE_SYSTEM,
    user: `Question:\n${input.statement}\n\nOptions:\n${input.options.map((o, i) => `${"ABCD"[i]}. ${o}`).join("\n")}`,
    schema: AiSpec,
    effort: "high",
    maxTokens: 32000,
  });
  return data;
}

const Proofs = z.object({ proofs: z.array(z.object({ name: z.string(), tactics: z.string() })) });

export async function aiProve(goals: { name: string; statement: string; error: string }[]): Promise<{ name: string; tactics: string }[]> {
  if (!goals.length) return [];
  const { data } = await structured({
    model: model(),
    system: `You write Lean 4 + Mathlib tactic proofs. Return ONLY the tactic block for each theorem (no 'theorem' header, no 'by', no sorry/admit, no commands, no set_option, no new declarations). The statements are fixed and must not change.`,
    user: goals.map((g) => `theorem ${g.name} : ${g.statement}\n-- previous attempt failed with:\n-- ${g.error.replace(/\n/g, "\n-- ").slice(0, 1200)}`).join("\n\n"),
    schema: Proofs,
    effort: "high",
    maxTokens: 32000,
  });
  return data.proofs;
}

export const AiAudit = z.object({
  verdict: z.enum(["consistent", "inconsistent", "uncertain"]),
  findings: z.array(
    z.object({
      category: z.enum(["domain", "quantifier", "rounding", "omitted_case", "implicit_restriction", "weakened_claim", "wrong_quantity", "other"]),
      severity: z.enum(["high", "medium", "low"]),
      message: z.string(),
    }),
  ),
  summary: z.string(),
});
export type AiAuditT = z.infer<typeof AiAudit>;

export async function aiAudit(input: {
  statement: string;
  options: string[];
  keyLabel: string;
  claim: string;
  assumptions: string[];
  theorems: string;
  method: string;
}): Promise<AiAuditT> {
  const { data } = await structured({
    model: model(),
    system: `You audit whether Lean theorems faithfully represent a multiple-choice mathematics question. You see the question, the claimed answer, and the theorem STATEMENTS (not proofs). Check: does the main theorem prove that the claimed option answers exactly what the question asks? Are domains, quantifiers, restrictions, omitted cases and rounding preserved? Were assumptions added that the question does not state or imply? Watch for Lean junk values (x/0 = 0, sqrt of negatives = 0, truncated ℕ subtraction, floor division). Report 'inconsistent' for any high-severity mismatch, 'uncertain' if you cannot tell, otherwise 'consistent'.`,
    user: [
      `Question:\n${input.statement}`,
      `Options:\n${input.options.map((o, i) => `${"ABCD"[i]}. ${o}`).join("\n")}`,
      `Claimed correct option: ${input.keyLabel}`,
      `Formalization method: ${input.method}`,
      `Claim being proved: ${input.claim}`,
      `Assumptions introduced: ${input.assumptions.length ? input.assumptions.join("; ") : "none"}`,
      `Lean theorem statements:\n${input.theorems}`,
    ].join("\n\n"),
    schema: AiAudit,
    effort: "high",
    maxTokens: 16000,
  });
  return data;
}
