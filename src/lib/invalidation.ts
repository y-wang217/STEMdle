/**
 * Recovery for an incorrect *published* question (published versions are
 * immutable, so we never edit them):
 *  1. The challenge question is marked voided (reason, admin, time).
 *  2. The question is retired from the bank.
 *  3. Every finished run that was eliminated by a wrong answer on that slot
 *     receives an audited +1 score correction. Runs still in progress get the
 *     slot counted as correct when they answer it.
 * Every step is written to audit_log / score_corrections.
 */
import { sql } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { audit } from "@/lib/audit";

export async function voidPublishedQuestion(args: { date: string; slot: number; reason: string; adminId: string }) {
  if (!args.reason.trim()) throw new HttpError(400, "a reason is required");
  return sql.begin(async (tx) => {
    const [cq] = await tx<{ id: string; question_id: string; challenge_id: string; voided_at: string | null }[]>`
      select cq.id, cq.question_id, cq.challenge_id, cq.voided_at from challenge_questions cq
      join daily_challenges d on d.id = cq.challenge_id
      where d.challenge_date = ${args.date} and d.status = 'published' and cq.slot = ${args.slot} for update of cq`;
    if (!cq) throw new HttpError(404, "no published question for that date and slot");
    if (cq.voided_at) throw new HttpError(409, "already voided");
    await tx`update challenge_questions set voided_at = now(), voided_reason = ${args.reason}, voided_by = ${args.adminId} where id = ${cq.id}`;
    await tx`update questions set status = 'retired', updated_at = now() where id = ${cq.question_id}`;
    const affected = await tx<{ run_id: string }[]>`
      select s.run_id from answer_submissions s join game_runs r on r.id = s.run_id
      where s.challenge_question_id = ${cq.id} and not s.is_correct and not s.skipped and r.status = 'failed'`;
    await tx`select set_config('mathdle.score_correction', 'on', true)`;
    for (const a of affected) {
      await tx`update game_runs set score_adjustment = score_adjustment + 1 where id = ${a.run_id}`;
      await tx`insert into score_corrections (run_id, challenge_question_id, delta, reason, admin_id)
               values (${a.run_id}, ${cq.id}, 1, ${`voided slot ${args.slot}: ${args.reason}`}, ${args.adminId})`;
    }
    await audit(tx, args.adminId, "void_published_question", "challenge_question", cq.id, {
      date: args.date,
      slot: args.slot,
      reason: args.reason,
      runs_corrected: affected.length,
    });
    return { voided: cq.id, runsCorrected: affected.length };
  });
}

export async function correctRunScore(args: { runId: string; delta: number; reason: string; adminId: string }) {
  if (!args.reason.trim()) throw new HttpError(400, "a reason is required");
  if (!Number.isInteger(args.delta) || args.delta === 0 || Math.abs(args.delta) > 8) throw new HttpError(400, "invalid delta");
  return sql.begin(async (tx) => {
    const [r] = await tx<{ status: string; score: number; score_adjustment: number }[]>`select status, score, score_adjustment from game_runs where id = ${args.runId} for update`;
    if (!r) throw new HttpError(404, "run not found");
    if (r.status === "active") throw new HttpError(409, "run is still active");
    const total = r.score + r.score_adjustment + args.delta;
    if (total < 0 || total > 8) throw new HttpError(400, "corrected score must stay within 0–8");
    await tx`select set_config('mathdle.score_correction', 'on', true)`;
    await tx`update game_runs set score_adjustment = score_adjustment + ${args.delta} where id = ${args.runId}`;
    await tx`insert into score_corrections (run_id, delta, reason, admin_id) values (${args.runId}, ${args.delta}, ${args.reason}, ${args.adminId})`;
    await audit(tx, args.adminId, "correct_score", "game_run", args.runId, { delta: args.delta, reason: args.reason });
  });
}
