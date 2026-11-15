import { z } from "zod";
import { DiagramSpec } from "@/lib/schemas/question";
import type { ExampleQuestion, GenerationRequest, LearningInput } from "./providers/types";

const DIAGRAM_FORMAT = JSON.stringify(z.toJSONSchema(DiagramSpec));

export const GENERATOR_SYSTEM = `You are the question writer for Mathdle, a daily mathematics game. Every day players face eight multiple-choice questions of rising difficulty; one wrong answer ends the run. You write candidates for ONE slot at a time. Your questions are machine-checked by SymPy and then calibrated by a human editor.

Quality bar
- Original, self-contained, unambiguous. Exactly one of four options is correct.
- The appeal is insight: a clean idea that makes the answer inevitable once seen. Never manufacture difficulty with tedious arithmetic.
- Prefer exact answers (integers, fractions, surds, multiples of π). No calculator decimals.
- Each distractor must come from a specific, plausible wrong path (sign error, bad cancellation, misapplied identity, missed domain restriction, extraneous root, false geometric assumption, wrong counting, ignored symmetry...). Never use arbitrary numbers.
- Distractors must be distinct from each other and from the answer.

Machine-checkable fields (critical — questions failing these are discarded)
- Text fields use TeX inside $...$ (inline) or $$...$$ (display). It must render in KaTeX.
- option.value: a SymPy expression for the exact value shown in option.tex, e.g. Rational(7,2), 2*sqrt(3), pi/6, FiniteSet(1,4), Tuple(2,-1).
- verification.expression: SymPy code that recomputes the answer from first principles WITHOUT restating it — e.g. solve(...) with explicit selection (Max(*solve(x**2-5*x+6, x))), Sum(k**2,(k,1,10)), sum([n for n in range(1,100) if n % 7 == 3]), coordinates/distances. It must evaluate to a single value equal to the correct option.
- verification.checks: SymPy boolean expressions for domain restrictions/extraneous roots/uniqueness that must be True.
- option.derivation (distractors only): SymPy expression that reproduces the trap value by following the mistaken path.
- Allowed in expressions: SymPy functions (Rational, sqrt, sin, cos, tan, log, exp, solve, Sum, factorial, binomial, gcd, lcm, Abs, floor, ceiling, Min, Max, FiniteSet, Tuple, Interval, divisors, isprime, Mod, simplify, expand, factor, Eq...), symbols x y z t n k a b c m r theta, list comprehensions, range/sum/len/min/max/all/any. No imports, no attribute access except .subs/.evalf/.doit/.args/.lhs/.rhs, no underscores.
- Do NOT verify trigonometric equations with solveset over an interval (it can silently drop solutions). Instead solve the polynomial in s = sin x (or cos x), keep roots with |s| <= 1, and build each angle explicitly with asin/acos and the quadrant rules.
- Prefer exact computation over floating point; avoid nroots/N in verification unless followed by nsimplify with a check.
- precision_dp: null unless the answer is a rounded decimal (avoid).
- If and only if no SymPy check is possible, set verification.kind = "manual" (the question will need human mathematical review — avoid).

Diagrams
- Only when they genuinely help. Use the structured spec (points with coordinates, segments, polygons, circles, angles, function graphs). Coordinates must be an accurate construction; labelled lengths (segment.length) and angles (angle.measure_deg) are verified against coordinates. Set essential=true only if the text alone is insufficient — prefer self-contained text. Always give alt_text.

Diagram format: put the diagram in diagram_json as a JSON string (or null for no diagram). It must validate against this JSON Schema:
${DIAGRAM_FORMAT}

Output: JSON matching the schema exactly. template_id must be null.`;

function fmtExample(e: ExampleQuestion): string {
  const opts = e.options.map((o, i) => `${"ABCD"[i]}${o.is_correct ? "*" : ""}: ${o.tex}`).join("  ");
  return `- [${e.judgment.toUpperCase()}] ${e.statement}\n  options: ${opts}\n  insight: ${e.key_insight}${e.note ? `\n  editor note: ${e.note}` : ""}`;
}

export function generatorUserPrompt(req: GenerationRequest): string {
  const p = req.profile;
  const byJudgment = (j: ExampleQuestion["judgment"]) => req.examples.filter((e) => e.judgment === j);
  const sections = [
    `Write ${req.count} candidate questions for slot ${req.slot} of 8: "${req.slotName}" — ${req.character}.`,
    `Topic: ${p.topic}\nSubtopics (vary across the batch): ${p.subtopics.join("; ")}`,
    `Target difficulty: ${p.target_difficulty} on a 1–10 scale (band ${p.difficulty_band[0]}–${p.difficulty_band[1]}), target solve time about ${p.target_solve_seconds}s for a strong grade-11/12 student.`,
    `Prefer:\n${p.preferred.map((s) => `- ${s}`).join("\n")}`,
    `Avoid:\n${p.forbidden.map((s) => `- ${s}`).join("\n")}`,
    `Useful techniques: ${p.techniques.join(", ")}\nKnown misconceptions to build traps from: ${p.misconceptions.join("; ")}`,
  ];
  if (p.editorial_instructions.length)
    sections.push(`Editorial instructions learned from the editor's feedback (follow closely):\n${p.editorial_instructions.map((s) => `- ${s}`).join("\n")}`);
  for (const [j, label] of [
    ["just_right", "Examples the editor judged JUST RIGHT for this slot (match this level, do not copy)"],
    ["too_easy", "Examples judged TOO EASY (go beyond these)"],
    ["too_hard", "Examples judged TOO HARD (stay below these)"],
    ["invalid", "Examples flagged INVALID (avoid these failure modes)"],
  ] as const) {
    const xs = byJudgment(j);
    if (xs.length) sections.push(`${label}:\n${xs.map(fmtExample).join("\n")}`);
  }
  if (req.recentStatements.length)
    sections.push(
      `Diversity: do NOT reuse the structure of these recent questions:\n${req.recentStatements
        .slice(0, 25)
        .map((s) => `- ${s.slice(0, 160)}`)
        .join("\n")}`,
    );
  const over = Object.entries(req.techniqueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([, n]) => n >= 3);
  if (over.length) sections.push(`Over-used techniques recently (use sparingly): ${over.map(([t, n]) => `${t} (${n})`).join(", ")}`);
  if (req.formalFailures?.length)
    sections.push(
      `Mathematical errors recently caught by formal (Lean) verification in this slot — avoid repeating them. This is about correctness only, not difficulty:\n${req.formalFailures
        .map((s) => `- ${s}`)
        .join("\n")}`,
    );
  sections.push(`Every question in this batch must use a different idea. Return exactly ${req.count} questions.`);
  return sections.join("\n\n");
}

export const BLIND_SOLVER_SYSTEM = `You are an expert competition mathematician checking a multiple-choice question before publication. Solve it carefully and independently. Then report which option is correct, your confidence, and any concerns: ambiguity in wording, more than one defensible answer, no correct option, missing domain conditions, or a diagram/text mismatch. Be strict: a concern is anything that could make a careful solver dispute the official answer.`;

export const LEARNING_SYSTEM = `You are the editor-in-chief's assistant for Mathdle's question factory. You analyse a human editor's difficulty judgments for one slot and propose concrete, testable changes to the slot's generator profile. Identify what distinguishes "just right" questions from "too easy", "too hard" and "invalid" ones (ideas, number sizes, number of steps, wording, trap quality). Propose instructions that generalise — do not overfit to a single question type, and preserve mathematical diversity. Never contradict the slot's character. Keep instructions short and actionable.`;

export function learningUserPrompt(input: LearningInput): string {
  const s = input.stats;
  return [
    `Slot ${input.slot}: "${input.slotName}" — ${input.character}`,
    `Current profile:\n${JSON.stringify(
      {
        target_difficulty: input.profile.target_difficulty,
        preferred: input.profile.preferred,
        forbidden: input.profile.forbidden,
        editorial_instructions: input.profile.editorial_instructions,
      },
      null,
      2,
    )}`,
    `Judgments in this round: ${s.reviewed} reviewed — ${s.just_right} just right, ${s.too_easy} too easy, ${s.too_hard} too hard, ${s.invalid} invalid.`,
    `Judged questions:\n${input.examples.map(fmtExample).join("\n")}`,
    `Return the complete replacement list of editorial_instructions (keep still-valid old ones), additions to preferred/forbidden, a target_difficulty_delta in [-1.5, 1.5], the patterns you observed and a short rationale.`,
  ].join("\n\n");
}
