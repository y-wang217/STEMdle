/**
 * Practice mode: unlimited, unranked questions from the approved pool.
 *
 * Server-authoritative like the daily game: the client receives a question
 * without correctness data and learns the answer (with the stored solution)
 * only after submitting one. Practice is recorded in practice_sessions /
 * practice_attempts and never touches game_runs, answer_submissions or the
 * leaderboard.
 *
 * Pool rule (no spoilers, no unvetted content): a question is servable when it
 * is approved, its current version passes question_version_publishable (the
 * same database check that gates daily approval), and it is not part of any
 * daily challenge dated today or later, whatever that challenge's status.
 */
import { sql, type Tx } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { torontoDate } from "@/lib/time";
import type { DiagramSpecT } from "@/lib/schemas/question";

export interface PracticeQuestion {
  attemptId: string;
  slot: number;
  statement: string;
  diagram: DiagramSpecT | null;
  options: { id: string; label: string; tex: string }[];
}

export interface PracticeSession {
  id: string;
  slot: number | null;
}

export interface PracticeReveal {
  correct: boolean;
  correctOptionId: string;
  solution: string;
  keyInsight: string;
  options: { id: string; label: string; tex: string; is_correct: boolean; misconception: string; rationale: string }[];
  stats: { answered: number; correct: number };
}

/** The slot where today's run ended (8 if cleared); slot 1 with no run. */
export async function defaultPracticeSlot(playerId: string | null, challengeId: string | null): Promise<number> {
  if (!playerId || !challengeId) return 1;
  const [r] = await sql<{ status: string; current_slot: number }[]>`
    select status, current_slot from game_runs where player_id = ${playerId} and challenge_id = ${challengeId}`;
  if (!r) return 1;
  if (r.status === "cleared") return 8;
  return Math.min(8, Math.max(1, r.current_slot));
}

async function publicQuestion(db: typeof sql | Tx, attemptId: string): Promise<PracticeQuestion> {
  const [q] = await db<PracticeQuestion[]>`
    select a.id as "attemptId", q.slot, v.statement, v.diagram,
      (select json_agg(json_build_object('id', o.id, 'label', o.label, 'tex', o.tex) order by o.position)
         from question_options o where o.question_version_id = v.id) as options
    from practice_attempts a
    join questions q on q.id = a.question_id
    join question_versions v on v.id = a.question_version_id
    where a.id = ${attemptId}`;
  return q;
}

/** Choose and present the next question for a locked session; null when the pool is exhausted. */
async function presentNext(tx: Tx, session: { id: string; slot: number | null }, today: string): Promise<PracticeQuestion | null> {
  const [pick] = await tx<{ question_id: string; version_id: string }[]>`
    select q.id as question_id, v.id as version_id
    from questions q join question_versions v on v.id = q.current_version_id
    where q.status = 'approved'
      and (${session.slot}::smallint is null or q.slot = ${session.slot}::smallint)
      and not exists (
        select 1 from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
        where cq.question_id = q.id and d.challenge_date >= ${today}::date)
      and not exists (
        select 1 from practice_attempts a where a.session_id = ${session.id} and a.question_id = q.id)
      and question_version_publishable(v.id) is null
    order by random()
    limit 1`;
  if (!pick) return null;
  const [a] = await tx<{ id: string }[]>`
    insert into practice_attempts (session_id, question_id, question_version_id)
    values (${session.id}, ${pick.question_id}, ${pick.version_id}) returning id`;
  return publicQuestion(tx, a.id);
}

/** The session's open question, or a newly chosen one. */
export async function nextPracticeQuestion(playerId: string, sessionId: string, today = torontoDate()): Promise<{ question: PracticeQuestion | null }> {
  return sql.begin(async (tx) => {
    const [s] = await tx<{ id: string; slot: number | null }[]>`
      select id, slot from practice_sessions where id = ${sessionId} and player_id = ${playerId} for update`;
    if (!s) throw new HttpError(404, "practice session not found", "no_session");
    await tx`update practice_sessions set last_active_at = clock_timestamp() where id = ${s.id}`;
    const [open] = await tx<{ id: string }[]>`select id from practice_attempts where session_id = ${s.id} and answered_at is null`;
    if (open) return { question: await publicQuestion(tx, open.id) };
    return { question: await presentNext(tx, s, today) };
  });
}

/**
 * Start a session. `slot: null` means any topic; an omitted slot defaults to
 * where the player's run on `challengeId` ended.
 */
export async function startPractice(
  playerId: string,
  opts: { slot?: number | null; challengeId?: string | null; today?: string },
): Promise<{ session: PracticeSession; question: PracticeQuestion | null }> {
  const slot = opts.slot === undefined ? await defaultPracticeSlot(playerId, opts.challengeId ?? null) : opts.slot;
  if (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > 8)) throw new HttpError(400, "invalid slot");
  const [s] = await sql<PracticeSession[]>`
    insert into practice_sessions (player_id, slot) values (${playerId}, ${slot}) returning id, slot`;
  const { question } = await nextPracticeQuestion(playerId, s.id, opts.today);
  return { session: { id: s.id, slot: s.slot }, question };
}

/** Record an answer and reveal the correct option and stored solution. */
export async function answerPractice(
  playerId: string,
  args: { sessionId: string; attemptId: string; optionId: string },
): Promise<PracticeReveal> {
  return sql.begin(async (tx) => {
    const [a] = await tx<{ id: string; question_version_id: string; answered_at: string | null }[]>`
      select a.id, a.question_version_id, a.answered_at
      from practice_attempts a join practice_sessions s on s.id = a.session_id
      where a.id = ${args.attemptId} and a.session_id = ${args.sessionId} and s.player_id = ${playerId}
      for update of a`;
    if (!a) throw new HttpError(404, "practice question not found", "no_attempt");
    if (a.answered_at) throw new HttpError(409, "you already answered this question", "answered");
    const [opt] = await tx<{ id: string; is_correct: boolean }[]>`
      select id, is_correct from question_options where id = ${args.optionId} and question_version_id = ${a.question_version_id}`;
    if (!opt) throw new HttpError(400, "invalid option", "bad_option");
    await tx`
      update practice_attempts set option_id = ${opt.id}, is_correct = ${opt.is_correct}, answered_at = clock_timestamp(),
        answer_ms = (extract(epoch from (clock_timestamp() - presented_at)) * 1000)::int
      where id = ${a.id}`;
    await tx`update practice_sessions set last_active_at = clock_timestamp() where id = ${args.sessionId}`;
    const [v] = await tx<{ solution: string; key_insight: string; options: PracticeReveal["options"] }[]>`
      select v.solution, v.key_insight,
        (select json_agg(json_build_object('id', o.id, 'label', o.label, 'tex', o.tex, 'is_correct', o.is_correct,
            'misconception', o.misconception, 'rationale', o.rationale) order by o.position)
           from question_options o where o.question_version_id = v.id) as options
      from question_versions v where v.id = ${a.question_version_id}`;
    const [stats] = await tx<{ answered: number; correct: number }[]>`
      select count(*)::int as answered, (count(*) filter (where is_correct))::int as correct
      from practice_attempts where session_id = ${args.sessionId} and answered_at is not null`;
    return {
      correct: opt.is_correct,
      correctOptionId: v.options.find((o) => o.is_correct)!.id,
      solution: v.solution,
      keyInsight: v.key_insight,
      options: v.options,
      stats,
    };
  });
}

/** Slot names for the topic picker. */
export async function practiceTopics(): Promise<{ slot: number; name: string; category: string }[]> {
  return sql<{ slot: number; name: string; category: string }[]>`select slot, name, category from bucket_profiles order by slot`;
}
