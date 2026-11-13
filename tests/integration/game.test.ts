/**
 * Server-authoritative gameplay, composer/publication integrity, recovery and RLS.
 */
import { beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { sql } from "@/lib/db";
import { getResults, getState, sharePattern, skipQuestion, startRun, submitAnswer } from "@/lib/game/engine";
import { leaderboard } from "@/lib/game/leaderboard";
import { todayChallenge } from "@/lib/game/challenge";
import { autoCompose, approveChallenge, dailyJob, setSlotQuestion } from "@/lib/composer";
import { voidPublishedQuestion } from "@/lib/invalidation";
import { torontoDate, addDays } from "@/lib/time";
import { approvedChallenge, approvedQuestion, newPlayer, resetDb } from "../helpers";

let adminId: string;
let challengeId: string;
const today = torontoDate();

async function correctOption(slot: number) {
  const [o] = await sql<{ id: string }[]>`
    select o.id from challenge_questions cq join question_options o on o.question_version_id = cq.question_version_id
    where cq.challenge_id = ${challengeId} and cq.slot = ${slot} and o.is_correct`;
  return o.id;
}
async function wrongOption(slot: number) {
  const [o] = await sql<{ id: string }[]>`
    select o.id from challenge_questions cq join question_options o on o.question_version_id = cq.question_version_id
    where cq.challenge_id = ${challengeId} and cq.slot = ${slot} and not o.is_correct limit 1`;
  return o.id;
}

beforeAll(async () => {
  ({ adminId } = await resetDb());
});

describe("missing challenge (acceptance 16)", () => {
  it("never auto-publishes when nothing is approved; alerts instead", async () => {
    // A draft exists but is not approved.
    for (let s = 1; s <= 8; s++) await approvedQuestion(s, adminId);
    await autoCompose(today, adminId);
    const t = await todayChallenge();
    expect(t.challenge).toBeNull();
    const job = await dailyJob();
    expect(job.published).toBe(false);
    const alerts = await sql`select kind from admin_alerts where resolved_at is null`;
    expect(alerts.map((a) => a.kind)).toContain("missing_challenge");
    const [d] = await sql`select status from daily_challenges where challenge_date = ${today}`;
    expect(d.status).toBe("draft");
  });
});

describe("publication integrity (acceptance 5, 6, 17)", () => {
  it("approval is rejected by the database if any question is not approved", async () => {
    await sql`update questions set status = 'reviewed' where id = (select question_id from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id where d.challenge_date = ${today} and cq.slot = 4)`;
    await expect(approveChallenge(today, adminId)).rejects.toThrow(/slot 4/);
    await sql`update questions set status = 'approved' where status = 'reviewed'`;
  });

  it("approves, publishes on first access and locks question versions", async () => {
    challengeId = await approveChallenge(today, adminId);
    const t = await todayChallenge();
    expect(t.challenge?.id).toBe(challengeId);
    const [d] = await sql`select status from daily_challenges where id = ${challengeId}`;
    expect(d.status).toBe("published");
    const locked = await sql`select count(*)::int as n from question_versions v join challenge_questions cq on cq.question_version_id = v.id where cq.challenge_id = ${challengeId} and v.locked_at is not null`;
    expect(locked[0].n).toBe(8);
    await expect(sql`update question_versions set statement = 'changed' where id in (select question_version_id from challenge_questions where challenge_id = ${challengeId})`).rejects.toThrow(/immutable/);
    await expect(sql`update question_options set tex = '$0$' where question_version_id in (select question_version_id from challenge_questions where challenge_id = ${challengeId})`).rejects.toThrow(/immutable/);
    await expect(setSlotQuestion(today, 1, null, adminId)).rejects.toThrow(/published/);
    await expect(sql`delete from challenge_questions where challenge_id = ${challengeId}`).rejects.toThrow();
  });

  it("a future approved set is not served early", async () => {
    await approvedChallenge(addDays(today, 1), adminId);
    const t = await todayChallenge();
    expect(t.challenge?.id).toBe(challengeId);
  });
});

describe("gameplay (acceptance 7, 9, 10, 11)", () => {
  it("serves the same challenge, question order and options to every player", async () => {
    const a = await newPlayer("A");
    const b = await newPlayer("B");
    await startRun(a, challengeId);
    await startRun(b, challengeId);
    const sa = await getState(a, challengeId);
    const sb = await getState(b, challengeId);
    expect(sa.question).toEqual(sb.question);
    expect(JSON.stringify(sa.question)).not.toContain("is_correct");
  });

  it("a correct answer advances; a wrong answer ends the run; no double submissions or skipping ahead", async () => {
    const p = await newPlayer("Runner");
    await startRun(p, challengeId);
    await getState(p, challengeId);
    await expect(submitAnswer(p, challengeId, 2, await correctOption(2))).rejects.toThrow(/not the current/);
    const r1 = await submitAnswer(p, challengeId, 1, await correctOption(1));
    expect(r1.correct).toBe(true);
    expect(r1.run.currentSlot).toBe(2);
    await expect(submitAnswer(p, challengeId, 1, await correctOption(1))).rejects.toThrow(/not the current/);
    // An option from another question is rejected.
    await expect(submitAnswer(p, challengeId, 2, await correctOption(3))).rejects.toThrow(/invalid option/);
    const r2 = await submitAnswer(p, challengeId, 2, await wrongOption(2));
    expect(r2.correct).toBe(false);
    expect(r2.run.finished).toBe(true);
    expect(r2.run.score).toBe(1);
    await expect(submitAnswer(p, challengeId, 3, await correctOption(3))).rejects.toThrow(/finished/);
    // Starting again does not create a second scored attempt.
    const again = await startRun(p, challengeId);
    expect(again.status).toBe("failed");
    // Finalized runs and submissions are immutable at the database level.
    await expect(sql`update game_runs set score = 8 where player_id = ${p}`).rejects.toThrow(/finalized/);
    await expect(sql`update answer_submissions set is_correct = true`).rejects.toThrow(/append-only/);
  });

  it("solutions are hidden until the run is finished, then fully revealed", async () => {
    const p = await newPlayer("Curious");
    await startRun(p, challengeId);
    await expect(getResults(p, challengeId)).rejects.toThrow(/finish/);
    await submitAnswer(p, challengeId, 1, await wrongOption(1));
    const res = await getResults(p, challengeId);
    expect(res.questions).toHaveLength(8);
    expect(res.questions.every((q) => q.solution.length > 0 && q.options.some((o) => o.is_correct))).toBe(true);
    expect(sharePattern(res)).toBe("🟥⬛⬛⬛⬛⬛⬛⬛");
  });

  it("skip ends the scored run and allows unranked review", async () => {
    const p = await newPlayer("Skipper");
    await startRun(p, challengeId);
    await submitAnswer(p, challengeId, 1, await correctOption(1));
    await submitAnswer(p, challengeId, 2, await correctOption(2));
    const s = await skipQuestion(p, challengeId, 3);
    expect(s.run.status).toBe("skipped");
    expect(s.run.score).toBe(2);
    const res = await getResults(p, challengeId);
    expect(sharePattern(res)).toBe("🟩🟩⬜⬛⬛⬛⬛⬛");
    expect(res.questions[7].options.some((o) => o.is_correct)).toBe(true);
  });

  it("a full clear scores 8 and the leaderboard ranks by score then eligible time", async () => {
    const fast = await newPlayer("Fast");
    await startRun(fast, challengeId);
    for (let s = 1; s <= 8; s++) await submitAnswer(fast, challengeId, s, await correctOption(s));
    const slow = await newPlayer("Slow");
    await startRun(slow, challengeId);
    // Simulate a run that started 31 minutes ago (fixture only — not possible via the API).
    await sql`alter table game_runs disable trigger game_runs_guard`;
    await sql`update game_runs set started_at = now() - interval '31 minutes' where player_id = ${slow}`;
    await sql`alter table game_runs enable trigger game_runs_guard`;
    for (let s = 1; s <= 8; s++) await submitAnswer(slow, challengeId, s, await correctOption(s));
    const [r] = await sql`select speed_eligible, score from game_runs where player_id = ${slow}`;
    expect(r).toMatchObject({ speed_eligible: false, score: 8 });
    const lb = await leaderboard(challengeId, slow);
    expect(lb.top[0].nickname).toBe("Fast");
    expect(lb.top[0].elapsedMs).not.toBeNull();
    expect(lb.top[1].nickname).toBe("Slow");
    expect(lb.top[1].elapsedMs).toBeNull();
    expect(lb.you?.rank).toBe(2);
  });
});

describe("recovery (acceptance 17)", () => {
  it("voiding a published question credits eliminated runs with audited corrections", async () => {
    const victim = await newPlayer("Victim");
    await startRun(victim, challengeId);
    await submitAnswer(victim, challengeId, 1, await correctOption(1));
    await submitAnswer(victim, challengeId, 2, await correctOption(2));
    await submitAnswer(victim, challengeId, 3, await wrongOption(3));
    const r = await voidPublishedQuestion({ date: today, slot: 3, reason: "two defensible answers", adminId });
    expect(r.runsCorrected).toBeGreaterThanOrEqual(1);
    const [run] = await sql`select score, score_adjustment from game_runs where player_id = ${victim}`;
    expect(run.score + run.score_adjustment).toBe(3);
    const corr = await sql`select reason from score_corrections`;
    expect(corr.length).toBe(r.runsCorrected);
    const audit = await sql`select action from audit_log where action = 'void_published_question'`;
    expect(audit).toHaveLength(1);
    // Players still in progress get the voided slot counted as correct.
    const p = await newPlayer("Later");
    await startRun(p, challengeId);
    await submitAnswer(p, challengeId, 1, await correctOption(1));
    await submitAnswer(p, challengeId, 2, await correctOption(2));
    const res = await submitAnswer(p, challengeId, 3, await wrongOption(3));
    expect(res.correct).toBe(true);
  });
});

describe("row level security (acceptance 9, 15)", () => {
  it("public API roles cannot read answers, questions, runs or admin data", async () => {
    const su = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
    try {
      for (const role of ["anon", "authenticated"]) {
        for (const table of ["question_options", "questions", "question_versions", "game_runs", "anonymous_players", "admin_users", "admin_sessions", "daily_challenges", "question_performance"]) {
          await expect(
            su.begin(async (tx) => {
              await tx.unsafe(`set local role ${role}`);
              return tx.unsafe(`select * from ${table} limit 1`);
            }),
            `${role} on ${table}`,
          ).rejects.toThrow(/permission denied/);
        }
        await expect(
          su.begin(async (tx) => {
            await tx.unsafe(`set local role ${role}`);
            return tx.unsafe(`update game_runs set score = 8`);
          }),
        ).rejects.toThrow(/permission denied/);
      }
      const rls = await su`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity and relname <> 'schema_migrations'`;
      expect(rls).toHaveLength(0);
    } finally {
      await su.end();
    }
  });
});
