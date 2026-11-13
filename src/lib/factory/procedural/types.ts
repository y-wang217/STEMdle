import type { CandidateQuestionT } from "@/lib/schemas/question";
import type { Rng } from "./rng";

/**
 * A procedural template produces a complete, self-verifying CandidateQuestion.
 * `difficulty` is on the global 1–10 scale; each template maps it to number
 * sizes / extra steps. Templates must:
 *  - derive every distractor from a named misconception (with a SymPy `derivation`),
 *  - give a SymPy `verification.expression` that recomputes the answer independently,
 *  - throw `RetryTemplate` if a random draw produces colliding options.
 */
export interface ProceduralTemplate {
  id: string;
  slot: number;
  title: string;
  techniques: string[];
  /** Difficulty range (global 1–10 scale) the template can reasonably cover. */
  range: [number, number];
  generate(rng: Rng, difficulty: number): CandidateQuestionT;
}

export class RetryTemplate extends Error {}

export type Opt = {
  tex: string;
  value: string;
  misconception?: string;
  rationale: string;
  derivation?: string | null;
};

/** Build the four options: first entry is correct, the rest are distractors. */
export function options(correct: Opt, ...distractors: Opt[]): CandidateQuestionT["options"] {
  if (distractors.length !== 3) throw new Error("need exactly three distractors");
  const all = [correct, ...distractors];
  const seen = new Set<string>();
  for (const o of all) {
    const key = o.tex.replace(/\s+/g, "");
    if (seen.has(key)) throw new RetryTemplate(`duplicate option ${o.tex}`);
    seen.add(key);
  }
  return all.map((o, i) => ({
    tex: o.tex,
    value: o.value,
    is_correct: i === 0,
    misconception: i === 0 ? "" : (o.misconception ?? ""),
    rationale: o.rationale,
    derivation: i === 0 ? null : (o.derivation ?? null),
  }));
}

/** Reject draws whose numeric option values collide (cheap pre-check; SymPy re-checks exactly). */
export function assertDistinctNumbers(...xs: number[]): void {
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++)
      if (!Number.isFinite(xs[i]) || Math.abs(xs[i] - xs[j]) < 1e-9 * Math.max(1, Math.abs(xs[i])))
        throw new RetryTemplate(`colliding values ${xs[i]} ${xs[j]}`);
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}
/** TeX for a rational p/q in lowest terms (integer if q divides p). */
export function fracTex(p: number, q: number): string {
  if (q < 0) [p, q] = [-p, -q];
  const g = gcd(p, q) || 1;
  p /= g;
  q /= g;
  if (q === 1) return `$${p}$`;
  return p < 0 ? `$-\\frac{${-p}}{${q}}$` : `$\\frac{${p}}{${q}}$`;
}
export function ratValue(p: number, q: number): string {
  return `Rational(${p},${q})`;
}
export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
/** Map difficulty within [lo, hi] to t in [0,1]. */
export const level = (difficulty: number, lo: number, hi: number) => clamp((difficulty - lo) / (hi - lo || 1), 0, 1);

/** Standard verification block. */
export function sympyVerification(expression: string, checks: string[] = [], notes = "") {
  return { kind: "sympy" as const, expression, checks, precision_dp: null, notes };
}
