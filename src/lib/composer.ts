/**
 * Daily challenge composer: assemble one approved question per slot, replace
 * individual slots, detect similar questions, approve and schedule.
 * Activation: a challenge whose date has arrived is published lazily on first
 * request and by the cron job, but only if it was approved. Nothing unapproved
 * is ever published automatically.
 */
import { sql, type Tx } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { audit, raiseAlert, resolveAlert } from "@/lib/audit";
import { addDays, challengeNumber, isValidDate, torontoDate } from "@/lib/time";
import { NEAR_DUPLICATE_THRESHOLD, structuralSimilarity } from "@/lib/factory/fingerprint";

const SIMILARITY_LOOKBACK_DAYS = 60;

export interface ChallengeSummary {
  id: string;
  challenge_date: string;
  challenge_number: number;
  status: string;
  approved_at: string | null;
  published_at: string | null;
  slots: { slot: number; question_id: string; version_id: string; statement: string; template_id: string | null; voided_at: string | null }[];
}

export async function getChallengeByDate(date: string): Promise<ChallengeSummary | null> {
  const [c] = await sql<ChallengeSummary[]>`
    select d.id, d.challenge_date::text, d.challenge_number, d.status, d.approved_at, d.published_at,
      coalesce((select json_agg(json_build_object('slot', cq.slot, 'question_id', cq.question_id, 'version_id', cq.question_version_id,
          'statement', v.statement, 'template_id', q.template_id, 'voided_at', cq.voided_at) order by cq.slot)
        from challenge_questions cq join question_versions v on v.id = cq.question_version_id join questions q on q.id = cq.question_id
        where cq.challenge_id = d.id), '[]') as slots
    from daily_challenges d where d.challenge_date = ${date} and d.status <> 'withdrawn'`;
  return c ?? null;
}

export async function listChallenges(from: string, to: string) {
  return sql<{ id: string; challenge_date: string; challenge_number: number; status: string; n: number }[]>`
    select d.id, d.challenge_date::text, d.challenge_number, d.status,
      (select count(*) from challenge_questions cq where cq.challenge_id = d.id)::int as n
    from daily_challenges d where d.challenge_date between ${from} and ${to} and d.status <> 'withdrawn'
    order by d.challenge_date`;
}

/** Statements used recently (published or scheduled) for similarity checks. */
async function recentStatements(date: string, excludeChallengeId?: string) {
  return sql<{ question_id: string; statement: string; challenge_date: string }[]>`
    select cq.question_id, v.statement, d.challenge_date::text
    from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
    join question_versions v on v.id = cq.question_version_id
    where d.status in ('approved', 'published')
      and d.challenge_date between ${addDays(date, -SIMILARITY_LOOKBACK_DAYS)} and ${addDays(date, SIMILARITY_LOOKBACK_DAYS)}
      and (${excludeChallengeId ?? null}::uuid is null or d.id <> ${excludeChallengeId ?? null}::uuid)`;
}

async function availableQuestions(slot: number) {
  // Approved and never placed in another (non-withdrawn) challenge.
  return sql<{ id: string; version_id: string; statement: string; created_at: string }[]>`
    select q.id, q.current_version_id as version_id, v.statement, q.created_at
    from questions q join question_versions v on v.id = q.current_version_id
    where q.slot = ${slot} and q.status = 'approved'
      and not exists (select 1 from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
                      where cq.question_id = q.id and d.status <> 'withdrawn')
    order by q.created_at asc`;
}

export async function bankCounts(): Promise<Record<number, number>> {
  const rows = await sql<{ slot: number; n: number }[]>`
    select q.slot, count(*)::int as n from questions q
    where q.status = 'approved' and not exists (select 1 from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
                                                 where cq.question_id = q.id and d.status <> 'withdrawn')
    group by q.slot`;
  const out: Record<number, number> = {};
  for (let s = 1; s <= 8; s++) out[s] = rows.find((r) => r.slot === s)?.n ?? 0;
  return out;
}

function pickLeastSimilar(
  pool: { id: string; version_id: string; statement: string }[],
  avoid: string[],
): { id: string; version_id: string; statement: string } | null {
  for (const q of pool) {
    if (avoid.every((s) => structuralSimilarity(q.statement, s) < NEAR_DUPLICATE_THRESHOLD)) return q;
  }
  return pool[0] ?? null; // fall back to oldest; the similarity report will flag it
}

async function ensureDraft(tx: Tx, date: string, adminId: string): Promise<string> {
  const [existing] = await tx<{ id: string; status: string }[]>`
    select id, status from daily_challenges where challenge_date = ${date} for update`;
  if (existing) {
    if (existing.status === "published") throw new HttpError(409, "this date's challenge is already published");
    if (existing.status === "approved") throw new HttpError(409, "revert the approved challenge to draft before editing");
    if (existing.status === "withdrawn") {
      // A withdrawn, never-published challenge can be recomposed.
      await tx`delete from challenge_questions where challenge_id = ${existing.id}`;
      await tx`update daily_challenges set status = 'draft', approved_at = null, approved_by = null where id = ${existing.id}`;
    }
    return existing.id;
  }
  const [c] = await tx<{ id: string }[]>`
    insert into daily_challenges (challenge_date, challenge_number, status, created_by)
    values (${date}, ${challengeNumber(date)}, 'draft', ${adminId}) returning id`;
  return c.id;
}

function assertComposableDate(date: string) {
  if (!isValidDate(date)) throw new HttpError(400, "invalid date");
  if (date < torontoDate()) throw new HttpError(409, "cannot compose a challenge for a past date");
  if (challengeNumber(date) < 1) throw new HttpError(400, "date is before the Mathdle epoch");
}

/** Auto-assemble (or re-assemble) a draft for `date`. Keeps slots listed in `keep`. */
export async function autoCompose(date: string, adminId: string, keep: number[] = []) {
  assertComposableDate(date);
  return sql.begin(async (tx) => {
    const id = await ensureDraft(tx, date, adminId);
    const current = await tx<{ slot: number; statement: string }[]>`
      select cq.slot, v.statement from challenge_questions cq join question_versions v on v.id = cq.question_version_id
      where cq.challenge_id = ${id}`;
    const avoid = [...(await recentStatements(date, id)).map((r) => r.statement), ...current.filter((c) => keep.includes(c.slot)).map((c) => c.statement)];
    const missing: number[] = [];
    for (let slot = 1; slot <= 8; slot++) {
      if (keep.includes(slot) && current.some((c) => c.slot === slot)) continue;
      const pool = await availableQuestions(slot);
      const pick = pickLeastSimilar(pool, avoid);
      await tx`delete from challenge_questions where challenge_id = ${id} and slot = ${slot}`;
      if (!pick) {
        missing.push(slot);
        continue;
      }
      await tx`insert into challenge_questions (challenge_id, slot, question_id, question_version_id) values (${id}, ${slot}, ${pick.id}, ${pick.version_id})`;
      avoid.push(pick.statement);
    }
    await audit(tx, adminId, "compose_challenge", "daily_challenge", id, { date, missing });
    return { id, missing };
  });
}

export async function setSlotQuestion(date: string, slot: number, questionId: string | null, adminId: string) {
  assertComposableDate(date);
  if (!Number.isInteger(slot) || slot < 1 || slot > 8) throw new HttpError(400, "invalid slot");
  return sql.begin(async (tx) => {
    const id = await ensureDraft(tx, date, adminId);
    let pick: { id: string; version_id: string } | null = null;
    if (questionId) {
      const [q] = await tx<{ id: string; version_id: string; slot: number; status: string }[]>`
        select id, current_version_id as version_id, slot, status from questions where id = ${questionId}`;
      if (!q) throw new HttpError(404, "question not found");
      if (q.slot !== slot) throw new HttpError(400, `question belongs to slot ${q.slot}`);
      if (q.status !== "approved") throw new HttpError(409, "only approved questions can be scheduled");
      const [used] = await tx`select 1 from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
                              where cq.question_id = ${questionId} and d.status <> 'withdrawn' and d.id <> ${id}`;
      if (used) throw new HttpError(409, "question already used in another challenge");
      pick = q;
    } else {
      const [cur] = await tx<{ question_id: string }[]>`select question_id from challenge_questions where challenge_id = ${id} and slot = ${slot}`;
      const others = await tx<{ statement: string }[]>`
        select v.statement from challenge_questions cq join question_versions v on v.id = cq.question_version_id
        where cq.challenge_id = ${id} and cq.slot <> ${slot}`;
      const avoid = [...(await recentStatements(date, id)).map((r) => r.statement), ...others.map((o) => o.statement)];
      const pool = (await availableQuestions(slot)).filter((q) => q.id !== cur?.question_id);
      pick = pickLeastSimilar(pool, avoid);
      if (!pick) throw new HttpError(409, `no other approved questions available for slot ${slot}`);
    }
    await tx`delete from challenge_questions where challenge_id = ${id} and slot = ${slot}`;
    await tx`insert into challenge_questions (challenge_id, slot, question_id, question_version_id) values (${id}, ${slot}, ${pick.id}, ${pick.version_id})`;
    await audit(tx, adminId, "replace_slot", "daily_challenge", id, { date, slot, question_id: pick.id });
    return { id, questionId: pick.id };
  });
}

export async function similarityReport(challengeId: string) {
  const items = await sql<{ slot: number; question_id: string; statement: string; date: string }[]>`
    select cq.slot, cq.question_id, v.statement, d.challenge_date::text as date from challenge_questions cq
    join question_versions v on v.id = cq.question_version_id join daily_challenges d on d.id = cq.challenge_id
    where cq.challenge_id = ${challengeId} order by cq.slot`;
  if (!items.length) return [];
  const recent = await recentStatements(items[0].date, challengeId);
  const warnings: { slot: number; message: string; similarity: number }[] = [];
  for (const a of items) {
    for (const b of items)
      if (b.slot > a.slot) {
        const s = structuralSimilarity(a.statement, b.statement);
        if (s >= 0.5) warnings.push({ slot: a.slot, similarity: s, message: `similar to slot ${b.slot} in the same set` });
      }
    for (const r of recent) {
      if (r.question_id === a.question_id) continue;
      const s = structuralSimilarity(a.statement, r.statement);
      if (s >= NEAR_DUPLICATE_THRESHOLD) warnings.push({ slot: a.slot, similarity: s, message: `same structure as a question scheduled for ${r.challenge_date}` });
    }
  }
  return warnings;
}

export async function approveChallenge(date: string, adminId: string) {
  if (date < torontoDate()) throw new HttpError(409, "cannot approve a challenge for a past date");
  return sql.begin(async (tx) => {
    const [c] = await tx<{ id: string; status: string }[]>`select id, status from daily_challenges where challenge_date = ${date} for update`;
    if (!c) throw new HttpError(404, "no challenge for that date");
    if (c.status !== "draft") throw new HttpError(409, `challenge is ${c.status}`);
    try {
      // The database trigger re-verifies all eight questions are approved and validated.
      await tx`update daily_challenges set status = 'approved', approved_by = ${adminId}, approved_at = now() where id = ${c.id}`;
    } catch (e) {
      throw new HttpError(409, `cannot approve: ${(e as Error).message}`);
    }
    await audit(tx, adminId, "approve_challenge", "daily_challenge", c.id, { date });
    return c.id;
  });
}

export async function revertToDraft(date: string, adminId: string) {
  return sql.begin(async (tx) => {
    const [c] = await tx<{ id: string; status: string }[]>`select id, status from daily_challenges where challenge_date = ${date} for update`;
    if (!c) throw new HttpError(404, "no challenge for that date");
    if (c.status !== "approved") throw new HttpError(409, `challenge is ${c.status}`);
    await tx`update daily_challenges set status = 'draft', approved_by = null, approved_at = null where id = ${c.id}`;
    await audit(tx, adminId, "unapprove_challenge", "daily_challenge", c.id, { date });
  });
}

/**
 * Publish the challenge for `date` if (and only if) it is approved.
 * Idempotent; safe to call on every request and from cron.
 */
export async function activateDate(date: string): Promise<{ id: string; number: number } | null> {
  const [c] = await sql<{ id: string; challenge_number: number; status: string }[]>`
    select id, challenge_number, status from daily_challenges where challenge_date = ${date} and status in ('approved', 'published')`;
  if (!c) return null;
  if (c.status === "approved") {
    await sql.begin(async (tx) => {
      const [locked] = await tx<{ status: string }[]>`select status from daily_challenges where id = ${c.id} for update`;
      if (locked.status === "approved") {
        await tx`update daily_challenges set status = 'published' where id = ${c.id}`;
        await audit(tx, null, "publish_challenge", "daily_challenge", c.id, { date, by: "scheduler" });
      }
    });
  }
  return { id: c.id, number: c.challenge_number };
}

export async function reserveStatus() {
  const today = torontoDate();
  const target = Number(process.env.RESERVE_TARGET_DAYS ?? 7);
  const rows = await listChallenges(today, addDays(today, Math.max(target, 14)));
  let consecutive = 0;
  for (let i = 0; ; i++) {
    const d = addDays(today, i);
    const r = rows.find((x) => x.challenge_date === d);
    if (!r || !["approved", "published"].includes(r.status)) break;
    consecutive++;
  }
  return { today, target, consecutiveReadyDays: consecutive, upcoming: rows, bank: await bankCounts() };
}

/** Scheduled job: publish today's approved set; alert on gaps. Never publishes unapproved content. */
export async function dailyJob() {
  const today = torontoDate();
  const published = await activateDate(today);
  if (!published) {
    await raiseAlert("missing_challenge", `No approved challenge for ${today}. Players see a 'not ready' screen.`, { date: today }, `missing:${today}`);
  } else {
    await resolveAlert(`missing:${today}`);
  }
  const reserve = await reserveStatus();
  if (reserve.consecutiveReadyDays < reserve.target) {
    await raiseAlert(
      "low_reserve",
      `Only ${reserve.consecutiveReadyDays} consecutive day(s) of approved challenges are ready (target ${reserve.target}).`,
      { reserve: reserve.consecutiveReadyDays },
      `low_reserve:${today}`,
    );
  }
  return { today, published: Boolean(published), reserve: reserve.consecutiveReadyDays, target: reserve.target };
}
