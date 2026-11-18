/**
 * Automated difficulty judge: pure logic (no database, no network).
 *
 *   ladder: blind solves cheapest first → lowest solving rung → compare with the
 *           slot's rung band → too easy / just right / too hard, or a math-review flag
 *   players: once a question has MIN_PLAYS_FOR_OVERRIDE answers, the real solve
 *           rate replaces the ladder estimate
 *
 * Database side (identity, recording, flagging): ./auto-judge.ts.
 */
import { JudgeConfig, type JudgeConfigT } from "@/lib/buckets/defaults";
import type { Solver, SolverQuestion } from "./providers/types";

/** Answered (non-skipped) attempts before player data overrides the model ladder. */
export const MIN_PLAYS_FOR_OVERRIDE = 30;

/** A rung below the solver that both chose the same wrong option with at least this confidence → flag. */
export const CONFIDENT_DISAGREEMENT = 0.9;

export type DifficultyJudgment = "too_easy" | "just_right" | "too_hard";

export interface LadderAttempt {
  rung: number; // 1-based
  label: string;
  choice: number;
  correct: boolean;
  confidence: number;
  concerns: string[];
  costUsd: number;
}

export type Verdict =
  | { kind: "judgment"; judgment: DifficultyJudgment; source: "ladder" | "players"; detail: string; solvedAtRung?: number }
  | { kind: "flag"; reason: string };

const DEFAULT_LADDER: JudgeConfigT["ladder"] = [
  { provider: "anthropic", model: "claude-haiku-5-5", effort: "low", max_tokens: 16000 },
  { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium", max_tokens: 16000 },
  { provider: "anthropic", model: "claude-opus-5-5", effort: "low", max_tokens: 16000 },
  { provider: "anthropic", model: "claude-opus-5-5", effort: "high", max_tokens: 32000 },
];

/** Slot → expected lowest solving rung (slot 1 falls to the first rung, slot 8 only to the top). */
const DEFAULT_RUNGS: Record<number, [number, number]> = {
  1: [1, 1],
  2: [1, 2],
  3: [1, 2],
  4: [2, 2],
  5: [2, 3],
  6: [3, 3],
  7: [3, 4],
  8: [4, 4],
};

/** Slot → target player solve rate (answered questions). */
const DEFAULT_SOLVE_RATE: Record<number, [number, number]> = {
  1: [0.75, 0.97],
  2: [0.65, 0.92],
  3: [0.6, 0.9],
  4: [0.5, 0.85],
  5: [0.4, 0.75],
  6: [0.3, 0.65],
  7: [0.2, 0.55],
  8: [0.1, 0.45],
};

export function defaultJudgeConfig(slot: number): JudgeConfigT {
  if (!DEFAULT_RUNGS[slot]) throw new Error(`no default judge config for slot ${slot}`);
  return {
    ladder: DEFAULT_LADDER.map((r) => ({ ...r })),
    target_rungs: [...DEFAULT_RUNGS[slot]] as [number, number],
    target_solve_rate: [...DEFAULT_SOLVE_RATE[slot]] as [number, number],
  };
}

/** The slot profile's `judge` block when set, otherwise the per-slot default. */
export function resolveJudgeConfig(slot: number, profile: { judge?: JudgeConfigT | null }): JudgeConfigT {
  return profile.judge ? JudgeConfig.parse(profile.judge) : defaultJudgeConfig(slot);
}

function bandJudgment(value: number, [lo, hi]: [number, number], higherMeansEasier: boolean): DifficultyJudgment {
  if (value < lo) return higherMeansEasier ? "too_hard" : "too_easy";
  if (value > hi) return higherMeansEasier ? "too_easy" : "too_hard";
  return "just_right";
}

const fmtRung = (a: LadderAttempt) => `${a.rung} (${a.label})`;

/** Map a finished ladder to a judgment, or a math-review flag. Never approves doubtful math. */
export function ladderVerdict(attempts: LadderAttempt[], cfg: JudgeConfigT): Verdict {
  const solved = attempts.find((a) => a.correct);
  const tried = attempts.map((a) => `${a.label}→${"ABCD"[a.choice] ?? "?"}`).join(", ");
  if (!solved) return { kind: "flag", reason: `no rung solved it (${tried}); the answer key may be wrong` };
  if (solved.concerns.length)
    return { kind: "flag", reason: `solver at rung ${fmtRung(solved)} raised concerns: ${solved.concerns.join(" | ").slice(0, 600)}` };
  const below = attempts.filter((a) => a.rung < solved.rung && !a.correct && a.confidence >= CONFIDENT_DISAGREEMENT);
  const tally = new Map<number, number>();
  for (const a of below) tally.set(a.choice, (tally.get(a.choice) ?? 0) + 1);
  const agreed = [...tally.entries()].find(([, n]) => n >= 2);
  if (agreed)
    return { kind: "flag", reason: `${agreed[1]} solvers confidently disagree with the key, all choosing ${"ABCD"[agreed[0]]} (${tried})` };
  const judgment = bandJudgment(solved.rung, cfg.target_rungs, false);
  const [lo, hi] = cfg.target_rungs;
  return {
    kind: "judgment",
    judgment,
    source: "ladder",
    solvedAtRung: solved.rung,
    detail: `solved at rung ${fmtRung(solved)} of ${cfg.ladder.length}; target rungs ${lo}–${hi}; ladder: ${tried}`,
  };
}

/** Player solve rate → judgment, or null below MIN_PLAYS_FOR_OVERRIDE answers. */
export function playerVerdict(stats: { answered: number; correct: number }, cfg: JudgeConfigT): Verdict | null {
  if (stats.answered < MIN_PLAYS_FOR_OVERRIDE) return null;
  const rate = stats.correct / stats.answered;
  const [lo, hi] = cfg.target_solve_rate;
  return {
    kind: "judgment",
    judgment: bandJudgment(rate, cfg.target_solve_rate, true),
    source: "players",
    detail: `player solve rate ${Math.round(rate * 100)}% (${stats.correct}/${stats.answered}); target ${Math.round(lo * 100)}–${Math.round(hi * 100)}%`,
  };
}

/**
 * Per-run spending cap. A call is made only after its worst-case cost is
 * reserved, so spend can never exceed the cap.
 */
export class Budget {
  spentUsd = 0;
  private reservedUsd = 0;
  constructor(readonly capUsd: number) {}
  tryReserve(usd: number): boolean {
    if (this.spentUsd + this.reservedUsd + usd > this.capUsd + 1e-9) return false;
    this.reservedUsd += usd;
    return true;
  }
  settle(reservedUsd: number, actualUsd: number) {
    this.reservedUsd = Math.max(0, this.reservedUsd - reservedUsd);
    this.spentUsd += actualUsd;
  }
  release(reservedUsd: number) {
    this.reservedUsd = Math.max(0, this.reservedUsd - reservedUsd);
  }
}

export interface LadderRun {
  attempts: LadderAttempt[];
  /** Set when the budget refused the next call or the run's deadline passed; the question must stay unjudged. */
  stopped?: "cost_cap" | "deadline";
  /** Set when a solver call failed; the question must stay unjudged. */
  error?: string;
}

/** Solve blind, cheapest rung first, stopping at the first rung that picks the validated answer. */
export async function runLadder(
  q: SolverQuestion,
  correctIndex: number,
  solvers: Solver[],
  budget: Budget,
  opts: {
    /** Epoch ms after which no new rung starts. */
    deadline?: number;
    /** Epoch ms at which an in-flight call is aborted (must leave room to write results before the platform kills the function). */
    hardDeadline?: number;
  } = {},
): Promise<LadderRun> {
  const attempts: LadderAttempt[] = [];
  for (let i = 0; i < solvers.length; i++) {
    const solver = solvers[i];
    // No new rung once the run's time budget is spent (a rung can take minutes).
    if (opts.deadline !== undefined && Date.now() >= opts.deadline) return { attempts, stopped: "deadline" };
    const worst = solver.worstCaseCostUsd(q);
    if (!budget.tryReserve(worst)) return { attempts, stopped: "cost_cap" };
    let r: Awaited<ReturnType<Solver["solve"]>>;
    try {
      r = await solveWithin(solver, q, opts.hardDeadline);
    } catch (e) {
      // A failed or aborted call may still have been billed; count the reservation as spent.
      budget.settle(worst, worst);
      if (e instanceof HardDeadline) return { attempts, stopped: "deadline" };
      return { attempts, error: `${solver.label}: ${(e as Error).message}` };
    }
    budget.settle(worst, r.costUsd);
    attempts.push({
      rung: i + 1,
      label: solver.label,
      choice: r.choice,
      correct: r.choice === correctIndex,
      confidence: r.confidence,
      concerns: r.concerns,
      costUsd: r.costUsd,
    });
    if (r.choice === correctIndex) break;
  }
  return { attempts };
}

class HardDeadline extends Error {
  constructor() {
    super("run hard deadline reached; call aborted");
  }
}

/**
 * Run one solve, aborting it at `hardDeadline`. The abort is passed to the solver
 * (which cancels the HTTP request) and the wait is also cut off here, so a solver
 * that ignores the signal cannot hold the run past the deadline.
 */
async function solveWithin(solver: Solver, q: SolverQuestion, hardDeadline?: number) {
  if (hardDeadline === undefined) return solver.solve(q);
  const remaining = hardDeadline - Date.now();
  if (remaining <= 0) throw new HardDeadline();
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort();
      reject(new HardDeadline());
    }, remaining);
  });
  try {
    return await Promise.race([solver.solve(q, ac.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}
