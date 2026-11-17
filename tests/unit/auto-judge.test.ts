/**
 * Auto-judge core: ladder → judgment mapping, flags, budget and player override.
 * Stub solvers only; nothing here can reach the API.
 */
import { describe, expect, it } from "vitest";
import {
  Budget,
  MIN_PLAYS_FOR_OVERRIDE,
  defaultJudgeConfig,
  ladderVerdict,
  playerVerdict,
  resolveJudgeConfig,
  runLadder,
  type LadderAttempt,
} from "@/lib/factory/auto-judge-core";
import type { Solver, SolverQuestion } from "@/lib/factory/providers/types";

const Q: SolverQuestion = { statement: "What is 2 + 2?", options: ["3", "4", "5", "22"] };
const CORRECT = 1;

function attempt(rung: number, choice: number, extra: Partial<LadderAttempt> = {}): LadderAttempt {
  return { rung, label: `rung ${rung}`, choice, correct: choice === CORRECT, confidence: 0.8, concerns: [], costUsd: 0.01, ...extra };
}

/** A stub solver that answers `choice` and records that it was called. */
function stub(label: string, choice: number, calls: string[], opts: { cost?: number; worst?: number; concerns?: string[]; fail?: boolean } = {}): Solver {
  return {
    label,
    worstCaseCostUsd: () => opts.worst ?? 0.05,
    async solve() {
      calls.push(label);
      if (opts.fail) throw new Error("upstream 529");
      return { choice, confidence: 0.9, concerns: opts.concerns ?? [], costUsd: opts.cost ?? 0.01, model: label };
    },
  };
}

describe("judge config", () => {
  it("defaults to the four-rung ladder, slot 1 at the first rung and slot 8 at the top", () => {
    const c1 = defaultJudgeConfig(1);
    expect(c1.ladder.map((r) => `${r.model}:${r.effort}`)).toEqual([
      "claude-haiku-5-5:low",
      "claude-sonnet-5-5:medium",
      "claude-opus-5-5:low",
      "claude-opus-5-5:high",
    ]);
    expect(c1.target_rungs).toEqual([1, 1]);
    expect(defaultJudgeConfig(8).target_rungs).toEqual([4, 4]);
    for (let s = 1; s <= 8; s++) {
      const c = defaultJudgeConfig(s);
      expect(c.target_rungs[0]).toBeLessThanOrEqual(c.target_rungs[1]);
      expect(c.target_solve_rate[0]).toBeLessThan(c.target_solve_rate[1]);
    }
  });

  it("uses the profile's judge block when present", () => {
    const custom = { ladder: [{ provider: "anthropic" as const, model: "claude-haiku-5-5", effort: "low" as const, max_tokens: 4000 }], target_rungs: [1, 1] as [number, number], target_solve_rate: [0.5, 0.9] as [number, number] };
    expect(resolveJudgeConfig(3, { judge: custom })).toEqual(custom);
    expect(resolveJudgeConfig(3, { judge: null })).toEqual(defaultJudgeConfig(3));
  });
});

describe("ladder → judgment", () => {
  it("maps the solving rung against the slot band", () => {
    const slot1 = defaultJudgeConfig(1);
    const slot8 = defaultJudgeConfig(8);
    expect(ladderVerdict([attempt(1, CORRECT)], slot1)).toMatchObject({ kind: "judgment", judgment: "just_right", source: "ladder", solvedAtRung: 1 });
    expect(ladderVerdict([attempt(1, 0), attempt(2, CORRECT)], slot1)).toMatchObject({ kind: "judgment", judgment: "too_hard", solvedAtRung: 2 });
    expect(ladderVerdict([attempt(1, 0), attempt(2, 2), attempt(3, CORRECT)], slot8)).toMatchObject({ kind: "judgment", judgment: "too_easy" });
    expect(ladderVerdict([attempt(1, 0), attempt(2, 2), attempt(3, 3), attempt(4, CORRECT)], slot8)).toMatchObject({ kind: "judgment", judgment: "just_right" });
    expect(ladderVerdict([attempt(1, 0), attempt(2, CORRECT)], defaultJudgeConfig(5))).toMatchObject({ judgment: "just_right" });
  });

  it("flags a question no rung solves", () => {
    const v = ladderVerdict([attempt(1, 0), attempt(2, 2), attempt(3, 0), attempt(4, 3)], defaultJudgeConfig(8));
    expect(v).toMatchObject({ kind: "flag" });
    expect((v as { reason: string }).reason).toMatch(/no rung/i);
  });

  it("flags when the solving rung reports concerns, but not for lower-rung concerns", () => {
    const cfg = defaultJudgeConfig(4);
    expect(ladderVerdict([attempt(1, 0), attempt(2, CORRECT, { concerns: ["two options are equal"] })], cfg)).toMatchObject({ kind: "flag" });
    expect(ladderVerdict([attempt(1, 0, { concerns: ["unclear"] }), attempt(2, CORRECT)], cfg)).toMatchObject({ kind: "judgment", judgment: "just_right" });
  });

  it("flags when two lower rungs confidently agree on the same wrong option", () => {
    const cfg = defaultJudgeConfig(8);
    const v = ladderVerdict([attempt(1, 2, { confidence: 0.95 }), attempt(2, 2, { confidence: 0.92 }), attempt(3, 0), attempt(4, CORRECT)], cfg);
    expect(v).toMatchObject({ kind: "flag" });
    expect((v as { reason: string }).reason).toMatch(/disagree/i);
    // Same wrong option but not confident: a working trap, not a disagreement.
    expect(ladderVerdict([attempt(1, 2, { confidence: 0.6 }), attempt(2, 2, { confidence: 0.7 }), attempt(3, 0), attempt(4, CORRECT)], cfg)).toMatchObject({ kind: "judgment" });
  });
});

describe("runLadder", () => {
  it("runs cheapest first and stops at the first solving rung", async () => {
    const calls: string[] = [];
    const solvers = [stub("haiku", 0, calls), stub("sonnet", CORRECT, calls), stub("opus-low", CORRECT, calls), stub("opus-high", CORRECT, calls)];
    const r = await runLadder(Q, CORRECT, solvers, new Budget(1));
    expect(calls).toEqual(["haiku", "sonnet"]);
    expect(r.attempts.map((a) => a.rung)).toEqual([1, 2]);
    expect(r.attempts[1].correct).toBe(true);
    expect(r.stopped).toBeUndefined();
  });

  it("stops a question on a solver error without a verdict-worthy ladder", async () => {
    const calls: string[] = [];
    const r = await runLadder(Q, CORRECT, [stub("haiku", 0, calls), stub("sonnet", 0, calls, { fail: true }), stub("opus", CORRECT, calls)], new Budget(1));
    expect(calls).toEqual(["haiku", "sonnet"]);
    expect(r.error).toMatch(/529/);
  });

  it("budget refuses a call that would exceed the cap", async () => {
    const budget = new Budget(0.12);
    const calls: string[] = [];
    const solvers = [stub("a", 0, calls, { worst: 0.05, cost: 0.04 }), stub("b", 0, calls, { worst: 0.05, cost: 0.04 }), stub("c", CORRECT, calls, { worst: 0.05, cost: 0.04 })];
    const r = await runLadder(Q, CORRECT, solvers, budget);
    // a: reserve .05 (ok) → spent .04; b: .04 + .05 = .09 ok → spent .08; c: .08 + .05 = .13 > .12 refused.
    expect(calls).toEqual(["a", "b"]);
    expect(r.stopped).toBe("cost_cap");
    expect(budget.spentUsd).toBeCloseTo(0.08);
    expect(budget.spentUsd).toBeLessThanOrEqual(0.12);
  });

  it("Budget never lets reservations exceed the cap", () => {
    const b = new Budget(1);
    expect(b.tryReserve(0.6)).toBe(true);
    expect(b.tryReserve(0.5)).toBe(false);
    b.settle(0.6, 0.2);
    expect(b.spentUsd).toBeCloseTo(0.2);
    expect(b.tryReserve(0.8)).toBe(true);
  });
});

describe("player override", () => {
  it(`ignores player data below ${MIN_PLAYS_FOR_OVERRIDE} answers`, () => {
    expect(playerVerdict({ answered: MIN_PLAYS_FOR_OVERRIDE - 1, correct: MIN_PLAYS_FOR_OVERRIDE - 1 }, defaultJudgeConfig(1))).toBeNull();
  });

  it("player data overrides the ladder at the threshold", () => {
    const cfg = defaultJudgeConfig(1); // target solve rate [0.75, 0.97]
    const n = MIN_PLAYS_FOR_OVERRIDE;
    expect(playerVerdict({ answered: n, correct: n }, cfg)).toMatchObject({ kind: "judgment", judgment: "too_easy", source: "players" });
    expect(playerVerdict({ answered: n, correct: Math.round(n * 0.85) }, cfg)).toMatchObject({ judgment: "just_right" });
    expect(playerVerdict({ answered: n, correct: Math.round(n * 0.3) }, cfg)).toMatchObject({ judgment: "too_hard" });
    const hard = defaultJudgeConfig(8);
    expect(playerVerdict({ answered: 100, correct: 25 }, hard)).toMatchObject({ judgment: "just_right" });
  });
});
