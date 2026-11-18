/**
 * Difficulty calibration feedback. Judgments are append-only rows; the
 * effective judgment of a question is its most recent row ('retracted' clears it).
 * Question status is derived from (latest validation, effective judgment, math review).
 */
import { sql, type Tx } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { audit } from "@/lib/audit";

export type Judgment = "too_easy" | "just_right" | "too_hard" | "invalid";
export const JUDGMENTS: Judgment[] = ["too_easy", "just_right", "too_hard", "invalid"];

export async function effectiveJudgment(db: typeof sql | Tx, questionId: string): Promise<Judgment | null> {
  const [row] = await db<{ judgment: string }[]>`
    select judgment from question_feedback where question_id = ${questionId} order by created_at desc, id desc limit 1`;
  if (!row || row.judgment === "retracted") return null;
  return row.judgment as Judgment;
}

async function isPublished(db: typeof sql | Tx, questionId: string): Promise<boolean> {
  const [row] = await db`
    select 1 from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
    where cq.question_id = ${questionId} and d.status = 'published' limit 1`;
  return Boolean(row);
}

/** Recompute question.status from its evidence. Published/retired questions are never changed here. */
export async function recomputeStatus(db: typeof sql | Tx, questionId: string): Promise<string> {
  const [q] = await db<{ status: string; math_verified_at: string | null; current_version_id: string }[]>`
    select status, math_verified_at, current_version_id from questions where id = ${questionId} for update`;
  if (!q) throw new HttpError(404, "question not found");
  if (q.status === "retired" || (await isPublished(db, questionId))) return q.status;
  const [v] = await db<{ status: string }[]>`
    select status from question_validations where question_version_id = ${q.current_version_id} order by created_at desc limit 1`;
  const validation = v?.status ?? null;
  const judgment = await effectiveJudgment(db, questionId);
  const verified = Boolean(q.math_verified_at);
  let next: string;
  if (!validation) next = "validating";
  else if (validation === "failed") next = "validation_failed";
  else if (judgment === "invalid") next = "rejected";
  else if (judgment === null) next = validation === "passed" ? "ready" : verified ? "ready" : "needs_review";
  else if (judgment === "just_right") next = validation === "passed" || verified ? "approved" : "needs_review";
  else next = "reviewed";
  if (next !== q.status) await db`update questions set status = ${next}, updated_at = now() where id = ${questionId}`;
  return next;
}

export async function recordJudgment(args: {
  adminId: string;
  questionId: string;
  judgment: Judgment | "retracted";
  note?: string | null;
  /**
   * Record a difficulty judgment on a question that is already in a published
   * challenge (calibration from real play). Status is never changed for published
   * questions (recomputeStatus returns early); 'invalid' and 'retracted' are refused.
   */
  allowPublished?: boolean;
  /**
   * Checked inside the transaction after the question row is locked. A non-null
   * return is a reason to record nothing (e.g. an automated judge whose evidence
   * went stale because a human judged or edited the question meanwhile).
   */
  precondition?: (tx: Tx, q: { id: string; current_version_id: string; status: string; judgment: Judgment | null; latestAdminId: string | null }) => Promise<string | null>;
}): Promise<{ status: string; judgment: Judgment | null; recorded: boolean; skipped?: string }> {
  return sql.begin(async (tx) => {
    const [q] = await tx<{ id: string; current_version_id: string; generator_version_id: string | null; status: string }[]>`
      select id, current_version_id, generator_version_id, status from questions where id = ${args.questionId} for update`;
    if (!q) throw new HttpError(404, "question not found");
    if (args.precondition) {
      const [latest] = await tx<{ admin_id: string }[]>`
        select admin_id from question_feedback where question_id = ${q.id} order by created_at desc, id desc limit 1`;
      const judgment = await effectiveJudgment(tx, q.id);
      const reason = await args.precondition(tx, { ...q, judgment, latestAdminId: latest?.admin_id ?? null });
      if (reason) return { status: q.status, judgment, recorded: false, skipped: reason };
    }
    if (await isPublished(tx, q.id)) {
      const difficultyOnly = args.judgment === "too_easy" || args.judgment === "just_right" || args.judgment === "too_hard";
      if (!args.allowPublished || !difficultyOnly)
        throw new HttpError(409, "question is part of a published challenge; use invalidation instead");
    }
    const current = await effectiveJudgment(tx, q.id);
    const note = args.note?.trim() ? args.note.trim().slice(0, 2000) : null;
    const target = args.judgment === "retracted" ? null : args.judgment;
    let recorded = false;
    if (target !== current || note) {
      await tx`insert into question_feedback (question_id, question_version_id, generator_version_id, admin_id, judgment, note)
               values (${q.id}, ${q.current_version_id}, ${q.generator_version_id}, ${args.adminId}, ${args.judgment}, ${note})`;
      recorded = true;
    }
    const status = await recomputeStatus(tx, q.id);
    return { status, judgment: target, recorded };
  });
}

/** Explicit mathematical review for questions the pipeline could not verify automatically. */
export async function markMathVerified(adminId: string, questionId: string, note: string) {
  if (!note.trim()) throw new HttpError(400, "a short justification is required");
  return sql.begin(async (tx) => {
    const [q] = await tx<{ current_version_id: string }[]>`select current_version_id from questions where id = ${questionId} for update`;
    if (!q) throw new HttpError(404, "question not found");
    const [v] = await tx<{ status: string }[]>`
      select status from question_validations where question_version_id = ${q.current_version_id} order by created_at desc limit 1`;
    if (v?.status === "failed") throw new HttpError(409, "a question that failed automated validation cannot be manually approved");
    await tx`update questions set math_verified_by = ${adminId}, math_verified_at = now() where id = ${questionId}`;
    await audit(tx, adminId, "math_verify", "question", questionId, { note });
    return recomputeStatus(tx, questionId);
  });
}

export async function feedbackHistory(questionId: string) {
  return sql<{ id: string; judgment: string; note: string | null; created_at: string; email: string }[]>`
    select f.id, f.judgment, f.note, f.created_at, a.email from question_feedback f join admin_users a on a.id = f.admin_id
    where f.question_id = ${questionId} order by f.created_at desc`;
}
