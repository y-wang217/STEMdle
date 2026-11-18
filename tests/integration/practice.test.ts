/**
 * Practice mode: selection rules (no spoilers, slot filter, no repeats),
 * server-authoritative answer flow, and isolation from daily scoring.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { startRun, submitAnswer, skipQuestion } from "@/lib/game/engine";
import { leaderboard } from "@/lib/game/leaderboard";
import { todayChallenge } from "@/lib/game/challenge";
import { answerPractice, defaultPracticeSlot, nextPracticeQuestion, startPractice } from "@/lib/game/practice";
import { addDays, challengeNumber, torontoDate } from "@/lib/time";
import { approvedChallenge, approvedQuestion, newPlayer, resetDb } from "../helpers";

const today = torontoDate();
let adminId: string;
let challengeId: string;
/** Approved, unscheduled questions per slot (the practice pool). */
const pool: Record<number, string[]> = {};
let pastQuestionId: string;
let draftFutureQuestionId: string;
let unvalidatedQuestionId: string;

async function scheduledIds(): Promise<Set<string>> {
  const rows = await sql<{ question_id: string }[]>`
    select cq.question_id from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
    where d.challenge_date >= ${today}`;
  return new Set(rows.map((r) => r.question_id));
}

async function correctOptionFor(attemptId: string, correct = true) {
  const [o] = await sql<{ id: string }[]>`
    select o.id from practice_attempts a join question_options o on o.question_version_id = a.question_version_id
    where a.id = ${attemptId} and o.is_correct = ${correct} limit 1`;
  return o.id;
}

async function dailyCorrect(slot: number) {
  const [o] = await sql<{ id: string }[]>`
    select o.id from challenge_questions cq join question_options o on o.question_version_id = cq.question_version_id
    where cq.challenge_id = ${challengeId} and cq.slot = ${slot} and o.is_correct`;
  return o.id;
}

beforeAll(async () => {
  ({ adminId } = await resetDb());
  // Today's set (published on first access) and tomorrow's approved set: both must never leak.
  await approvedChallenge(today, adminId);
  challengeId = (await todayChallenge()).challenge!.id;
  await approvedChallenge(addDays(today, 1), adminId);

  // A draft for the day after tomorrow that uses a slot-2 question: drafts are scheduled too.
  const draft = await approvedQuestion(2, adminId);
  draftFutureQuestionId = draft.questionId;
  const later = addDays(today, 2);
  const [d] = await sql<{ id: string }[]>`
    insert into daily_challenges (challenge_date, challenge_number) values (${later}, ${challengeNumber(later)}) returning id`;
  await sql`insert into challenge_questions (challenge_id, slot, question_id, question_version_id)
            values (${d.id}, 2, ${draft.questionId}, ${draft.versionId})`;

  // The pool: three approved questions in slot 2 and two in slot 5.
  for (const [slot, n] of [[2, 3], [5, 2]] as const) {
    pool[slot] = [];
    for (let i = 0; i < n; i++) pool[slot].push((await approvedQuestion(slot, adminId)).questionId);
  }

  // A question used in a past challenge is fair game for practice.
  const past = await approvedQuestion(2, adminId);
  pastQuestionId = past.questionId;
  const yesterday = addDays(today, -1);
  const [p] = await sql<{ id: string }[]>`
    insert into daily_challenges (challenge_date, challenge_number) values (${yesterday}, ${challengeNumber(yesterday)}) returning id`;
  await sql`insert into challenge_questions (challenge_id, slot, question_id, question_version_id)
            values (${p.id}, 2, ${past.questionId}, ${past.versionId})`;
  pool[2].push(pastQuestionId);

  // Not servable: approved status forced on a question whose validation failed.
  const bad = await approvedQuestion(2, adminId);
  unvalidatedQuestionId = bad.questionId;
  await sql`insert into question_validations (question_version_id, status, engine, checks)
            values (${bad.versionId}, 'failed', 'test', '[]'::jsonb)`;
  // Not servable: a question still awaiting calibration.
  const ready = await approvedQuestion(5, adminId);
  await sql`update questions set status = 'ready' where id = ${ready.questionId}`;
});

describe("selection rules (AC2, AC4, AC5)", () => {
  it("serves only the requested slot and leaks no answers", async () => {
    const p = await newPlayer("Picker");
    const s = await startPractice(p, { slot: 5 });
    expect(s.session.slot).toBe(5);
    expect(s.question).not.toBeNull();
    expect(s.question!.slot).toBe(5);
    expect(s.question!.options).toHaveLength(4);
    const raw = JSON.stringify(s);
    for (const secret of ["is_correct", "solution", "rationale", "misconception", "key_insight"]) expect(raw).not.toContain(secret);
  });

  it("never serves today's or future scheduled questions, or unapproved/unvalidated ones; past ones are allowed", async () => {
    const scheduled = await scheduledIds();
    expect(scheduled.has(draftFutureQuestionId)).toBe(true);
    const seen = new Set<string>();
    // Drain one session per slot and one "any topic" session: together they cover the whole pool.
    for (const slot of [null, 1, 2, 3, 4, 5, 6, 7, 8]) {
      const p = await newPlayer(`S${slot}`);
      let r = await startPractice(p, { slot });
      while (r.question) {
        const [a] = await sql<{ question_id: string }[]>`select question_id from practice_attempts where id = ${r.question.attemptId}`;
        seen.add(a.question_id);
        await answerPractice(p, { sessionId: r.session.id, attemptId: r.question.attemptId, optionId: r.question.options[0].id });
        r = { session: r.session, question: (await nextPracticeQuestion(p, r.session.id)).question };
      }
    }
    for (const id of seen) expect(scheduled.has(id), `scheduled question ${id} was served`).toBe(false);
    expect(seen.has(unvalidatedQuestionId)).toBe(false);
    const allowed = new Set([...pool[2], ...pool[5]]);
    expect([...seen].sort()).toEqual([...allowed].sort());
    expect(seen.has(pastQuestionId)).toBe(true);
  });

  it("no repeats within a session; an exhausted pool returns null", async () => {
    const p = await newPlayer("Grinder");
    let r = await startPractice(p, { slot: 2 });
    const served: string[] = [];
    while (r.question) {
      served.push(r.question.statement);
      await answerPractice(p, { sessionId: r.session.id, attemptId: r.question.attemptId, optionId: r.question.options[1].id });
      r = { session: r.session, question: (await nextPracticeQuestion(p, r.session.id)).question };
    }
    expect(served).toHaveLength(pool[2].length);
    expect(new Set(served).size).toBe(served.length);
    // A new session may serve them again.
    const again = await startPractice(p, { slot: 2 });
    expect(again.question).not.toBeNull();
  });

  it("asking for the next question before answering returns the same open question", async () => {
    const p = await newPlayer("Impatient");
    const s = await startPractice(p, { slot: 2 });
    const n = await nextPracticeQuestion(p, s.session.id);
    expect(n.question?.attemptId).toBe(s.question!.attemptId);
    const [{ n: open }] = await sql<{ n: number }[]>`select count(*)::int as n from practice_attempts where session_id = ${s.session.id}`;
    expect(open).toBe(1);
  });
});

describe("answer flow (AC3, AC6)", () => {
  it("reveals the correct option and stored solution only after answering, and records the attempt", async () => {
    const p = await newPlayer("Learner");
    const s = await startPractice(p, { slot: 5 });
    const q = s.question!;
    const wrong = await correctOptionFor(q.attemptId, false);
    const res = await answerPractice(p, { sessionId: s.session.id, attemptId: q.attemptId, optionId: wrong });
    expect(res.correct).toBe(false);
    const [stored] = await sql<{ solution: string; key_insight: string; correct_id: string }[]>`
      select v.solution, v.key_insight, (select id from question_options where question_version_id = v.id and is_correct) as correct_id
      from practice_attempts a join question_versions v on v.id = a.question_version_id where a.id = ${q.attemptId}`;
    expect(res.correctOptionId).toBe(stored.correct_id);
    expect(res.solution).toBe(stored.solution);
    expect(res.keyInsight).toBe(stored.key_insight);
    expect(res.options.filter((o) => o.is_correct)).toHaveLength(1);
    expect(res.stats).toEqual({ answered: 1, correct: 0 });
    const [a] = await sql`select option_id, is_correct, answered_at, answer_ms from practice_attempts where id = ${q.attemptId}`;
    expect(a.option_id).toBe(wrong);
    expect(a.is_correct).toBe(false);
    expect(a.answered_at).not.toBeNull();
    expect(a.answer_ms).toBeGreaterThanOrEqual(0);

    const n = await nextPracticeQuestion(p, s.session.id);
    const right = await correctOptionFor(n.question!.attemptId, true);
    const res2 = await answerPractice(p, { sessionId: s.session.id, attemptId: n.question!.attemptId, optionId: right });
    expect(res2.correct).toBe(true);
    expect(res2.stats).toEqual({ answered: 2, correct: 1 });
  });

  it("rejects a second answer, a foreign option, another player's session and tampering at the database", async () => {
    const p = await newPlayer("Cheater");
    const other = await newPlayer("Other");
    const s = await startPractice(p, { slot: 2 });
    const q = s.question!;
    const [foreign] = await sql<{ id: string }[]>`
      select o.id from question_options o join practice_attempts a on true
      where a.id = ${q.attemptId} and o.question_version_id <> a.question_version_id limit 1`;
    await expect(answerPractice(p, { sessionId: s.session.id, attemptId: q.attemptId, optionId: foreign.id })).rejects.toMatchObject({ status: 400 });
    await expect(answerPractice(other, { sessionId: s.session.id, attemptId: q.attemptId, optionId: q.options[0].id })).rejects.toMatchObject({ status: 404 });
    await expect(nextPracticeQuestion(other, s.session.id)).rejects.toMatchObject({ status: 404 });
    await answerPractice(p, { sessionId: s.session.id, attemptId: q.attemptId, optionId: q.options[0].id });
    await expect(answerPractice(p, { sessionId: s.session.id, attemptId: q.attemptId, optionId: q.options[1].id })).rejects.toMatchObject({ status: 409 });
    await expect(sql`update practice_attempts set is_correct = true where id = ${q.attemptId}`).rejects.toThrow(/immutable/);
    await expect(sql`delete from practice_attempts where id = ${q.attemptId}`).rejects.toThrow();
  });

  it("practice never touches daily runs, submissions or the leaderboard", async () => {
    const p = await newPlayer("Daily");
    await startRun(p, challengeId);
    await submitAnswer(p, challengeId, 1, await dailyCorrect(1));
    const before = await sql`select (select count(*)::int from game_runs) as runs, (select count(*)::int from answer_submissions) as subs,
                                    (select score from game_runs where player_id = ${p}) as score`;
    const boardBefore = await leaderboard(challengeId, p);
    const s = await startPractice(p, { slot: 5 });
    await answerPractice(p, { sessionId: s.session.id, attemptId: s.question!.attemptId, optionId: await correctOptionFor(s.question!.attemptId) });
    const after = await sql`select (select count(*)::int from game_runs) as runs, (select count(*)::int from answer_submissions) as subs,
                                   (select score from game_runs where player_id = ${p}) as score`;
    expect(after).toEqual(before);
    expect(await leaderboard(challengeId, p)).toEqual(boardBefore);
  });
});

describe("default slot (AC1)", () => {
  it("follows where today's run ended", async () => {
    expect(await defaultPracticeSlot(null, challengeId)).toBe(1);
    const fresh = await newPlayer("Fresh");
    expect(await defaultPracticeSlot(fresh, challengeId)).toBe(1);
    expect(await defaultPracticeSlot(fresh, null)).toBe(1);

    const skipper = await newPlayer("Skipper");
    await startRun(skipper, challengeId);
    await submitAnswer(skipper, challengeId, 1, await dailyCorrect(1));
    await submitAnswer(skipper, challengeId, 2, await dailyCorrect(2));
    await skipQuestion(skipper, challengeId, 3);
    expect(await defaultPracticeSlot(skipper, challengeId)).toBe(3);

    const champ = await newPlayer("Champ");
    await startRun(champ, challengeId);
    for (let s = 1; s <= 8; s++) await submitAnswer(champ, challengeId, s, await dailyCorrect(s));
    expect(await defaultPracticeSlot(champ, challengeId)).toBe(8);
  });

  it("startPractice without a slot uses the default", async () => {
    const p = await newPlayer("Defaulted");
    await startRun(p, challengeId);
    await submitAnswer(p, challengeId, 1, await dailyCorrect(1));
    const [w] = await sql<{ id: string }[]>`
      select o.id from challenge_questions cq join question_options o on o.question_version_id = cq.question_version_id
      where cq.challenge_id = ${challengeId} and cq.slot = 2 and not o.is_correct limit 1`;
    await submitAnswer(p, challengeId, 2, w.id);
    const s = await startPractice(p, { challengeId });
    expect(s.session.slot).toBe(2);
    expect(s.question?.slot).toBe(2);
  });
});

describe("rate limits (AC7)", () => {
  it("start allows 30/min per IP key and play allows 60/min per player, then 429", async () => {
    const { PRACTICE_LIMITS, enforcePracticeLimit } = await import("@/lib/game/practice");
    expect(PRACTICE_LIMITS.start).toMatchObject({ prefix: "practice-start", limit: 30, windowSeconds: 60 });
    expect(PRACTICE_LIMITS.play).toMatchObject({ prefix: "practice", limit: 60, windowSeconds: 60 });
    // Pin the start of a fresh 60 s window so the loop cannot straddle two windows.
    const msLeft = 60_000 - (Date.now() % 60_000);
    if (msLeft < 5_000) await new Promise((r) => setTimeout(r, msLeft + 50));
    for (const [kind, n] of [["start", 30], ["play", 60]] as const) {
      const subject = `rl-${kind}-${Math.random()}`;
      for (let i = 0; i < n; i++) await enforcePracticeLimit(kind, subject);
      await expect(enforcePracticeLimit(kind, subject)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
      // Another subject has its own budget.
      await expect(enforcePracticeLimit(kind, `${subject}-other`)).resolves.toBeUndefined();
    }
  });

  it("every practice route applies its limiter before doing any work", async () => {
    const { readFileSync } = await import("node:fs");
    const expected = { start: `enforcePracticeLimit("start", ipKey(req))`, next: `enforcePracticeLimit("play", player.id)`, answer: `enforcePracticeLimit("play", player.id)` };
    for (const [name, call] of Object.entries(expected)) {
      const src = readFileSync(`src/app/api/practice/${name}/route.ts`, "utf8");
      expect(src, name).toContain(`await ${call};`);
      const work = /startPractice\(|nextPracticeQuestion\(|answerPractice\(|getOrCreatePlayer\(/.exec(src.slice(src.indexOf("export const POST")))!;
      expect(src.indexOf(call), `${name}: limiter runs before ${work[0]}`).toBeLessThan(src.indexOf("export const POST") + work.index);
    }
  });
});
