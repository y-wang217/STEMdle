/**
 * Solvers for the auto-judge ladder. Anthropic models are implemented; a
 * non-Anthropic model plugs in through registerExternalSolver (not implemented
 * yet, so a ladder naming provider "external" fails fast).
 */
import type { SolverRungT } from "@/lib/buckets/defaults";
import { BLIND_SOLVER_SYSTEM } from "../prompts";
import { blindSolveOn, blindSolveUserPrompt } from "./anthropic";
import type { Solver, SolverQuestion } from "./types";

/** List prices, USD per million tokens (input, output). A model without a price cannot be capped, so it is refused. */
export const SOLVER_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

/** Conservative token estimate for the prompt (≈3 characters per token, plus framing). */
export function estimateInputTokens(q: SolverQuestion): number {
  return Math.ceil((BLIND_SOLVER_SYSTEM.length + blindSolveUserPrompt(q).length) / 3) + 500;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = SOLVER_PRICES[model];
  if (!p) throw new Error(`no price for solver model ${model}; add it to SOLVER_PRICES`);
  return (inputTokens * p.input + outputTokens * p.output) / 1e6;
}

const num = (x: unknown) => (typeof x === "number" ? x : 0);

export function anthropicSolver(rung: SolverRungT): Solver {
  if (!SOLVER_PRICES[rung.model]) throw new Error(`no price for solver model ${rung.model}; add it to SOLVER_PRICES`);
  return {
    label: `${rung.model}:${rung.effort}`,
    worstCaseCostUsd: (q) => costUsd(rung.model, estimateInputTokens(q), rung.max_tokens),
    async solve(q) {
      const r = await blindSolveOn(rung.model, rung.effort, rung.max_tokens, q);
      const input = num(r.usage.input_tokens) + num(r.usage.cache_creation_input_tokens) + num(r.usage.cache_read_input_tokens);
      return { choice: r.choice, confidence: r.confidence, concerns: r.concerns, model: r.model, costUsd: costUsd(rung.model, input, num(r.usage.output_tokens)) };
    },
  };
}

type ExternalFactory = (rung: SolverRungT) => Solver;
const external = new Map<string, ExternalFactory>();

/** Register a non-Anthropic solver for ladder rungs with provider "external" and this model id. */
export function registerExternalSolver(model: string, factory: ExternalFactory) {
  external.set(model, factory);
}

export function defaultSolverFactory(rung: SolverRungT): Solver {
  if (rung.provider === "anthropic") return anthropicSolver(rung);
  const f = external.get(rung.model);
  if (!f) throw new Error(`no external solver registered for model ${rung.model}`);
  return f(rung);
}
