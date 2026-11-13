/**
 * Server-authoritative game state machine.
 *
 *   (none) --start--> active(slot 1)
 *   active(k) --correct--> active(k+1) | cleared (k = 8)
 *   active(k) --wrong----> failed
 *   active(k) --skip-----> skipped
 *
 * The client only ever receives the current question without correctness
 * data. Each slot accepts exactly one scored submission (unique constraint).
 * Timing comes from database clocks; clients cannot supply or alter it.
 */
import { sql, type Tx } from "@/lib/db";
import { HttpError } from "@/lib/http";
import type { DiagramSpecT } from "@/lib/schemas/question";
import { track } from "./analytics";

export const SPEED_LIMIT_MS = 30 * 60 * 1000;

export interface Run {
  id: string;
  status: "active" | "failed" | "skipped" | "cleared";
  current_slot: number;
  score: number;
  score_adjustment: number;
  started_at: string;
  finished_at: string | null;
  elapsed_ms: number | null;
  speed_eligible: boolean | null;
}

export interface PublicQuestion {
  slot: number;
  statement: string;
  diagram: DiagramSpecT | null;
  options: { id: string; label: string; tex: string }[];
}

async function getRun(db: typeof sql | Tx, playerId: string, challengeId: string, lock = false): Promise<Run | null> {
  const rows = lock
    ? await db<Run[]>`select * from game_runs where player_id = ${playerId} and challenge_id = ${challengeId} for update`
    : await db<Run[]>`select * from game_runs where player_id = ${playerId} and challenge_id = ${challengeId}`;
  return rows[0] ?? null;
}

async function questionForSlot(db: typeof sql | Tx, challengeId: string, slot: number): Promise<PublicQuestion & { cq_id: string; version_id: string }> {
  const [q] = await db<(PublicQuestion & { cq_id: string; version_id: string })[]>`
    select cq.slot, cq.id as cq_id, v.id as version_id, v.statement, v.diagram,
      (select json_agg(json_build_object('id', o.id, 'label', o.label, 'tex', o.tex) order by o.position)
         from question_options o where o.question_version_id = v.id) as options
    from challenge_questions cq join question_versions v on v.id = cq.question_version_id
    where cq.challenge_id = ${challengeId} and cq.slot = ${slot}`;
  if (!q) throw new HttpError(500, "challenge is incomplete");
  return q;
}

export async function startRun(playerId: string, challengeId: string): Promise<Run> {
  const inserted = await sql<Run[]>`
    insert into game_runs (player_id, challenge_id) values (${playerId}, ${challengeId})
    on conflict (player_id, challenge_id) do nothing returning *`;
  if (inserted.length) await track("challenge_started", { playerId, challengeId });
  return inserted[0] ?? (await getRun(sql, playerId, challengeId))!;
}

export async function getState(playerId: string, challengeId: string) {
  const run = await getRun(sql, playerId, challengeId);
  if (!run) return { run: null, question: null };
  if (run.status !== "active") return { run: publicRun(run), question: null };
  const q = await questionForSlot(sql, challengeId, run.current_slot);
  const presented = await sql`insert into run_presentations (run_id, slot) values (${run.id}, ${run.current_slot})
                              on conflict do nothing returning slot`;
  if (presented.length) await track("question_reached", { playerId, challengeId, slot: run.current_slot });
  return {
    run: publicRun(run),
    question: { slot: q.slot, statement: q.statement, diagram: q.diagram, options: q.options } satisfies PublicQuestion,
  };
}

function publicRun(r: Run) {
  return {
    status: r.status,
    currentSlot: r.current_slot,
    score: r.score + r.score_adjustment,
    finished: r.status !== "active",
  };
}

async function finalize(tx: Tx, runId: string, status: Run["status"], score: number) {
  const [r] = await tx<Run[]>`
    update game_runs set status = ${status}, score = ${score},
      finished_at = clock_timestamp(),
      elapsed_ms = (extract(epoch from (clock_timestamp() - started_at)) * 1000)::int,
      speed_eligible = (clock_timestamp() - started_at) <= make_interval(secs => ${SPEED_LIMIT_MS / 1000})
    where id = ${runId} returning *`;
  return r;
}

export async function submitAnswer(playerId: string, challengeId: string, slot: number, optionId: string) {
  return sql.begin(async (tx) => {
    const run = await getRun(tx, playerId, challengeId, true);
    if (!run) throw new HttpError(409, "no run in progress", "no_run");
    if (run.status !== "active") throw new HttpError(409, "this run is already finished", "finished");
    if (slot !== run.current_slot) throw new HttpError(409, "that question is not the current one", "wrong_slot");
    const q = await questionForSlot(tx, challengeId, slot);
    const [opt] = await tx<{ id: string; is_correct: boolean }[]>`
      select id, is_correct from question_options where id = ${optionId} and question_version_id = ${q.version_id}`;
    if (!opt) throw new HttpError(400, "invalid option", "bad_option");
    const [voided] = await tx<{ voided_at: string | null }[]>`select voided_at from challenge_questions where id = ${q.cq_id}`;
    // A question voided by an administrator counts as correct for everyone.
    const correct = opt.is_correct || Boolean(voided?.voided_at);
    await tx`
      insert into answer_submissions (run_id, slot, challenge_question_id, question_version_id, option_id, is_correct, answer_ms)
      values (${run.id}, ${slot}, ${q.cq_id}, ${q.version_id}, ${opt.id}, ${correct},
        (select (extract(epoch from (clock_timestamp() - presented_at)) * 1000)::int from run_presentations where run_id = ${run.id} and slot = ${slot}))`;
    let updated: Run;
    if (correct && slot < 8) {
      [updated] = await tx<Run[]>`update game_runs set score = score + 1, current_slot = current_slot + 1 where id = ${run.id} returning *`;
    } else if (correct) {
      updated = await finalize(tx, run.id, "cleared", run.score + 1);
    } else {
      updated = await finalize(tx, run.id, "failed", run.score);
    }
    await track("answer", { playerId, challengeId, slot, props: { correct } }, tx);
    return { correct, run: publicRun(updated) };
  });
}

export async function skipQuestion(playerId: string, challengeId: string, slot: number) {
  return sql.begin(async (tx) => {
    const run = await getRun(tx, playerId, challengeId, true);
    if (!run) throw new HttpError(409, "no run in progress", "no_run");
    if (run.status !== "active") throw new HttpError(409, "this run is already finished", "finished");
    if (slot !== run.current_slot) throw new HttpError(409, "that question is not the current one", "wrong_slot");
    const q = await questionForSlot(tx, challengeId, slot);
    await tx`insert into answer_submissions (run_id, slot, challenge_question_id, question_version_id, option_id, is_correct, skipped, answer_ms)
             values (${run.id}, ${slot}, ${q.cq_id}, ${q.version_id}, null, false, true,
               (select (extract(epoch from (clock_timestamp() - presented_at)) * 1000)::int from run_presentations where run_id = ${run.id} and slot = ${slot}))`;
    const updated = await finalize(tx, run.id, "skipped", run.score);
    await track("skip", { playerId, challengeId, slot }, tx);
    return { run: publicRun(updated) };
  });
}

export interface ResultQuestion {
  slot: number;
  statement: string;
  diagram: DiagramSpecT | null;
  solution: string;
  key_insight: string;
  voided: boolean;
  options: { id: string; label: string; tex: string; is_correct: boolean; misconception: string; rationale: string }[];
  yourAnswer: { optionId: string | null; correct: boolean; skipped: boolean } | null;
}

/** Full solutions — only after the player's scored run is finished. */
export async function getResults(playerId: string, challengeId: string) {
  const run = await getRun(sql, playerId, challengeId);
  if (!run) throw new HttpError(403, "play today's challenge to see the solutions", "no_run");
  if (run.status === "active") throw new HttpError(403, "finish your run to see the solutions", "active");
  const questions = await sql<ResultQuestion[]>`
    select cq.slot, v.statement, v.diagram, v.solution, v.key_insight, (cq.voided_at is not null) as voided,
      (select json_agg(json_build_object('id', o.id, 'label', o.label, 'tex', o.tex, 'is_correct', o.is_correct,
          'misconception', o.misconception, 'rationale', o.rationale) order by o.position)
         from question_options o where o.question_version_id = v.id) as options,
      (select json_build_object('optionId', s.option_id, 'correct', s.is_correct, 'skipped', s.skipped)
         from answer_submissions s where s.run_id = ${run.id} and s.slot = cq.slot) as "yourAnswer"
    from challenge_questions cq join question_versions v on v.id = cq.question_version_id
    where cq.challenge_id = ${challengeId} order by cq.slot`;
  await track("results_viewed", { playerId, challengeId });
  return {
    run: {
      ...publicRun(run),
      elapsedMs: run.elapsed_ms,
      speedEligible: run.speed_eligible,
    },
    questions,
  };
}

export function sharePattern(results: { questions: ResultQuestion[] }): string {
  return results.questions
    .map((q) => (!q.yourAnswer ? "⬛" : q.yourAnswer.skipped ? "⬜" : q.yourAnswer.correct ? "🟩" : "🟥"))
    .join("");
}
