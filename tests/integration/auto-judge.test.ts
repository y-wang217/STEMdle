/**
 * Auto-judge end to end on the real Postgres + SymPy validator, with stubbed
 * solvers (no test may call the real API).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { runGenerationBatch } from "@/lib/factory/pipeline";
import { AUTO_JUDGE_EMAIL, autoJudge, type SolverFactory } from "@/lib/factory/auto-judge";
import { MIN_PLAYS_FOR_OVERRIDE } from "@/lib/factory/auto-judge-core";
import type { Solver } from "@/lib/factory/providers/types";
import { recordJudgment } from "@/lib/factory/feedback";
import { approvedQuestion, newPlayer, resetDb } from "../helpers";

let adminId: string;
beforeAll(async () => {
  ({ adminId } = await resetDb());
});

type Plan = { solveAt: number; concerns?: boolean }; // solveAt 0 = no rung solves

/** Correct option index per statement, read from the database (the stub never sees it from the judge). */
async function answerKey(batchId: string) {
  const rows = await sql<{ id: string; statement: string; correct: number }[]>`
    select q.id, v.statement,
      (select o.position from question_options o where o.question_version_id = v.id and o.is_correct) as correct
    from questions q join question_versions v on v.id = q.current_version_id
    where q.batch_id = ${batchId} order by q.created_at, q.id`;
  const positions = await sql<{ statement: string; positions: number[] }[]>`
    select v.statement, array_agg(o.position order by o.position) as positions
    from questions q join question_versions v on v.id = q.current_version_id join question_options o on o.question_version_id = v.id
    where q.batch_id = ${batchId} group by v.statement`;
  // Convert the stored position into an index into the position-ordered option list the solver receives.
  return rows.map((r) => ({ ...r, correct: positions.find((p) => p.statement === r.statement)!.positions.indexOf(r.correct) }));
}

function scriptedFactory(key: { statement: string; correct: number }[], plans: Map<string, Plan>, calls: string[], cost = 0.01): SolverFactory {
  return (rung, index): Solver => ({
    label: `${rung.model}:${rung.effort}`,
    worstCaseCostUsd: () => cost,
    async solve(q) {
      calls.push(`${index + 1}:${q.statement.slice(0, 20)}`);
      const k = key.find((x) => x.statement === q.statement)!;
      const plan = plans.get(q.statement) ?? { solveAt: 1 };
      const solved = plan.solveAt > 0 && index + 1 >= plan.solveAt;
      return {
        choice: solved ? k.correct : (k.correct + 1) % 4,
        confidence: 0.7,
        concerns: solved && plan.concerns ? ["two options look equivalent"] : [],
        costUsd: cost,
        model: rung.model,
      };
    },
  });
}

const statuses = async (batchId: string) =>
  sql<{ id: string; status: string }[]>`select id, status from questions where batch_id = ${batchId} order by created_at, id`;

describe("auto-judge (stubbed solvers)", () => {
  let batchId: string;

  it("judges a procedural batch end to end", async () => {
    const s = await runGenerationBatch({ slot: 1, count: 6, providerId: "procedural", adminId, seed: 4242 });
    batchId = s.batchId;
    expect(s.passed).toBe(6);
    const key = await answerKey(batchId);
    // Slot 1's band is rung 1 only.
    const plans: Plan[] = [{ solveAt: 1 }, { solveAt: 1 }, { solveAt: 2 }, { solveAt: 3 }, { solveAt: 0 }, { solveAt: 1, concerns: true }];
    const planMap = new Map(key.map((k, i) => [k.statement, plans[i]]));
    const calls: string[] = [];

    const report = await autoJudge({ batchId, solverFactory: scriptedFactory(key, planMap, calls), costCapUsd: 1, triggeredBy: adminId });
    expect(report.stopped).toBeNull();
    expect(report.counts).toMatchObject({ judged: 4, flagged: 2 });
    // Cheapest first, stopping at the solving rung: 1 + 1 + 2 + 3 + 4 + 1 calls.
    expect(calls.length).toBe(12);
    expect(report.spentUsd).toBeCloseTo(0.12);

    const after = await statuses(batchId);
    const byId = new Map(after.map((q) => [q.id, q.status]));
    expect(key.map((k) => byId.get(k.id))).toEqual(["approved", "approved", "reviewed", "reviewed", "needs_review", "needs_review"]);

    // Judgments are recorded by the disabled auto-judge identity with an automated note.
    const fb = await sql<{ question_id: string; judgment: string; note: string; email: string; disabled: boolean }[]>`
      select f.question_id, f.judgment, f.note, a.email, a.disabled from question_feedback f join admin_users a on a.id = f.admin_id
      where f.question_id = any(${key.map((k) => k.id)}::uuid[])`;
    expect(fb).toHaveLength(4);
    for (const f of fb) {
      expect(f.email).toBe(AUTO_JUDGE_EMAIL);
      expect(f.disabled).toBe(true);
      expect(f.note).toMatch(/^AUTO-JUDGE \[ladder\]/);
    }
    expect(fb.map((f) => f.judgment).sort()).toEqual(["just_right", "just_right", "too_hard", "too_hard"]);

    // Flagged questions carry an auto-judge validation row and no judgment.
    for (const k of key.slice(4)) {
      expect(fb.find((f) => f.question_id === k.id)).toBeUndefined();
      const [v] = await sql<{ status: string; engine: string; checks: { name: string; status: string }[] }[]>`
        select qv.status, qv.engine, qv.checks from question_validations qv join questions q on q.current_version_id = qv.question_version_id
        where q.id = ${k.id} order by qv.created_at desc limit 1`;
      expect(v).toMatchObject({ status: "needs_review", engine: "auto-judge" });
      expect(v.checks.find((c) => c.name === "auto_judge")?.status).toBe("warn");
      // The original SymPy checks are carried forward.
      expect(v.checks.find((c) => c.name === "exactly_one_correct")?.status).toBe("pass");
    }

    // The human-triggered run is audited.
    const [a] = await sql`select details from audit_log where action = 'auto_judge_run' and admin_id = ${adminId}`;
    expect(a.details).toMatchObject({ judged: 4, flagged: 2 });
  });

  it("is idempotent: a second run judges nothing and calls no solver", async () => {
    const calls: string[] = [];
    const report = await autoJudge({ batchId, solverFactory: scriptedFactory([], new Map(), calls), costCapUsd: 1 });
    expect(report.items).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("never overwrites a judgment a human makes while the ladder is running", async () => {
    const s = await runGenerationBatch({ slot: 1, count: 2, providerId: "procedural", adminId, seed: 9191 });
    const key = await answerKey(s.batchId);
    const [a, b] = key;
    // a would be judged 'just right'; b would be flagged (no rung solves it).
    const plans = new Map<string, Plan>([[a.statement, { solveAt: 1 }], [b.statement, { solveAt: 0 }]]);
    const human = new Map([[a.id, "invalid" as const], [b.id, "too_hard" as const]]);
    const inner = scriptedFactory(key, plans, []);
    const judgedMidRun = new Set<string>();
    // The editor judges each question while its first solver call is in flight.
    const factory: SolverFactory = (rung, index) => {
      const solver = inner(rung, index);
      return {
        ...solver,
        async solve(q) {
          const k = key.find((x) => x.statement === q.statement)!;
          if (!judgedMidRun.has(k.id)) {
            judgedMidRun.add(k.id);
            await recordJudgment({ adminId, questionId: k.id, judgment: human.get(k.id)! });
          }
          return solver.solve(q);
        },
      };
    };
    const report = await autoJudge({ batchId: s.batchId, solverFactory: factory, costCapUsd: 1 });
    expect(report.counts).toMatchObject({ judged: 0, flagged: 0, skipped: 2 });
    for (const i of report.items) expect(i.detail).toMatch(/judged .* during the run/);

    const latest = async (id: string) =>
      (await sql<{ judgment: string; email: string }[]>`
        select f.judgment, a.email from question_feedback f join admin_users a on a.id = f.admin_id
        where f.question_id = ${id} order by f.created_at desc, f.id desc limit 1`)[0];
    expect(await latest(a.id)).toEqual({ judgment: "invalid", email: "t@test" });
    expect(await latest(b.id)).toEqual({ judgment: "too_hard", email: "t@test" });
    const st = new Map((await statuses(s.batchId)).map((q) => [q.id, q.status]));
    expect(st.get(a.id)).toBe("rejected");
    expect(st.get(b.id)).toBe("reviewed");
    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from question_validations qv join questions q on q.current_version_id = qv.question_version_id
      where q.id = ${b.id} and qv.engine = 'auto-judge'`;
    expect(n).toBe(0);
  });

  it("stops at the cost cap and leaves unjudged questions ready", async () => {
    const s = await runGenerationBatch({ slot: 1, count: 3, providerId: "procedural", adminId, seed: 777 });
    const key = await answerKey(s.batchId);
    const calls: string[] = [];
    // Each call costs 0.10; a cap of 0.25 allows exactly two.
    const report = await autoJudge({ batchId: s.batchId, solverFactory: scriptedFactory(key, new Map(), calls, 0.1), costCapUsd: 0.25 });
    expect(report.stopped).toBe("cost_cap");
    expect(calls).toHaveLength(2);
    expect(report.spentUsd).toBeLessThanOrEqual(0.25);
    const st = await statuses(s.batchId);
    expect(st.filter((q) => q.status === "approved")).toHaveLength(2);
    expect(st.filter((q) => q.status === "ready")).toHaveLength(1);
  });

  it("stops at the run deadline and still writes the audit row", async () => {
    // One slot-1 question is still ready after the cost-cap test.
    const calls: string[] = [];
    const report = await autoJudge({ slot: 1, solverFactory: scriptedFactory([], new Map(), calls), costCapUsd: 1, deadlineMs: 0, triggeredBy: adminId });
    expect(report.stopped).toBe("deadline");
    expect(calls).toHaveLength(0);
    expect(report.counts.unjudged).toBe(1);
    const [a] = await sql<{ details: Record<string, unknown> }[]>`
      select details from audit_log where action = 'auto_judge_run' order by created_at desc limit 1`;
    expect(a.details).toMatchObject({ stopped: "deadline", unjudged: 1, spentUsd: 0, error: null });
  });

  it("player solve rate overrides a ladder judgment once there are enough plays", async () => {
    const { autoCompose, approveChallenge, activateDate } = await import("@/lib/composer");
    const { torontoDate } = await import("@/lib/time");
    const { startRun, submitAnswer } = await import("@/lib/game/engine");
    const today = torontoDate();
    for (let slot = 2; slot <= 8; slot++) await approvedQuestion(slot, adminId);
    await autoCompose(today, adminId);
    await approveChallenge(today, adminId);
    const published = await activateDate(today);
    const [cq] = await sql<{ question_id: string; option_id: string }[]>`
      select cq.question_id, o.id as option_id from challenge_questions cq
      join question_options o on o.question_version_id = cq.question_version_id and o.is_correct
      where cq.challenge_id = ${published!.id} and cq.slot = 1`;
    // Slot 1 was filled from auto-judged questions.
    const [before] = await sql<{ note: string }[]>`select note from question_feedback where question_id = ${cq.question_id} order by created_at desc limit 1`;
    expect(before.note).toMatch(/^AUTO-JUDGE \[ladder\]/);

    const plays = async (n: number) => {
      for (let i = 0; i < n; i++) {
        const p = await newPlayer(`P${Math.random()}`);
        await startRun(p, published!.id);
        await submitAnswer(p, published!.id, 1, cq.option_id);
      }
    };
    const neverCalled: SolverFactory = (rung) => ({
      label: rung.model,
      worstCaseCostUsd: () => 0.01,
      solve: async () => {
        throw new Error("solver must not be called for a question with enough plays");
      },
    });

    // Below the threshold: the ladder judgment stands.
    await plays(MIN_PLAYS_FOR_OVERRIDE - 1);
    let report = await autoJudge({ slot: 1, solverFactory: neverCalled, costCapUsd: 1 });
    expect(report.items.find((i) => i.questionId === cq.question_id)).toBeUndefined();

    // At the threshold: every player solved it → too easy for slot 1's [0.75, 0.97] band.
    await plays(1);
    report = await autoJudge({ slot: 1, solverFactory: neverCalled, costCapUsd: 1 });
    const item = report.items.find((i) => i.questionId === cq.question_id);
    expect(item).toMatchObject({ outcome: "judged", judgment: "too_easy", source: "players" });
    const [after] = await sql<{ judgment: string; note: string; email: string }[]>`
      select f.judgment, f.note, a.email from question_feedback f join admin_users a on a.id = f.admin_id
      where f.question_id = ${cq.question_id} order by f.created_at desc limit 1`;
    expect(after).toMatchObject({ judgment: "too_easy", email: AUTO_JUDGE_EMAIL });
    expect(after.note).toMatch(/^AUTO-JUDGE \[players\]/);
    // Published question status is untouched.
    const [{ status }] = await sql<{ status: string }[]>`select status from questions where id = ${cq.question_id}`;
    expect(status).toBe("approved");

    // allowPublished only admits difficulty judgments; invalidation keeps its own path.
    for (const judgment of ["invalid", "retracted"] as const)
      await expect(recordJudgment({ adminId, questionId: cq.question_id, judgment, allowPublished: true })).rejects.toMatchObject({ status: 409 });
    await expect(recordJudgment({ adminId, questionId: cq.question_id, judgment: "too_easy" })).rejects.toMatchObject({ status: 409 });

    // Running again with the same data records nothing new.
    report = await autoJudge({ slot: 1, solverFactory: neverCalled, costCapUsd: 1 });
    expect(report.items.find((i) => i.questionId === cq.question_id)).toBeUndefined();
  });

  it("never overrides a human judgment with player data", async () => {
    // Slot 2 of today's challenge was approved by a human ('just right' via the helper).
    const { torontoDate } = await import("@/lib/time");
    const { startRun, submitAnswer } = await import("@/lib/game/engine");
    const [c] = await sql<{ id: string }[]>`select id from daily_challenges where challenge_date = ${torontoDate()}`;
    const opts = await sql<{ slot: number; question_id: string; option_id: string }[]>`
      select cq.slot, cq.question_id, o.id as option_id from challenge_questions cq
      join question_options o on o.question_version_id = cq.question_version_id and o.is_correct
      where cq.challenge_id = ${c.id} and cq.slot in (1, 2) order by cq.slot`;
    for (let i = 0; i < MIN_PLAYS_FOR_OVERRIDE; i++) {
      const p = await newPlayer(`H${Math.random()}`);
      await startRun(p, c.id);
      await submitAnswer(p, c.id, 1, opts[0].option_id);
      await submitAnswer(p, c.id, 2, opts[1].option_id);
    }
    const report = await autoJudge({ slot: 2, solverFactory: () => { throw new Error("unused"); }, costCapUsd: 1 });
    expect(report.items.find((i) => i.questionId === opts[1].question_id)).toBeUndefined();
    const [f] = await sql<{ email: string }[]>`
      select a.email from question_feedback f join admin_users a on a.id = f.admin_id
      where f.question_id = ${opts[1].question_id} order by f.created_at desc limit 1`;
    expect(f.email).toBe("t@test");
  });
});
