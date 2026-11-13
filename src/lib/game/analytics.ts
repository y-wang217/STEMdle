/**
 * First-party, anonymized product analytics. Only the random public player id
 * is recorded — no IPs, user agents or personal data.
 */
import { sql, type Tx } from "@/lib/db";

export type EventName =
  | "challenge_started"
  | "question_reached"
  | "answer"
  | "skip"
  | "results_viewed"
  | "share"
  | "practice_answer";

export async function track(
  event: EventName,
  args: { playerId?: string | null; challengeId?: string | null; slot?: number | null; props?: Record<string, unknown> },
  db: typeof sql | Tx = sql,
) {
  try {
    await db`insert into analytics_events (event, player_id, challenge_id, slot, props)
             values (${event}, ${args.playerId ?? null}, ${args.challengeId ?? null}, ${args.slot ?? null}, ${sql.json((args.props ?? {}) as never)})`;
  } catch (e) {
    if (db !== sql) throw e; // inside a transaction, surface the error
    console.error("[mathdle] analytics failed", e);
  }
}

export async function dailyAnalytics(challengeId: string) {
  const [summary] = await sql<
    {
      players: number;
      started: number;
      finished: number;
      cleared: number;
      skipped: number;
      shares: number;
      returning_players: number;
      median_elapsed_ms: number | null;
    }[]
  >`
    select
      (select count(distinct player_id) from analytics_events where challenge_id = ${challengeId})::int as players,
      (select count(*) from game_runs where challenge_id = ${challengeId})::int as started,
      (select count(*) from game_runs where challenge_id = ${challengeId} and status <> 'active')::int as finished,
      (select count(*) from game_runs where challenge_id = ${challengeId} and status = 'cleared')::int as cleared,
      (select count(*) from game_runs where challenge_id = ${challengeId} and status = 'skipped')::int as skipped,
      (select count(*) from analytics_events where challenge_id = ${challengeId} and event = 'share')::int as shares,
      (select count(*) from game_runs r where r.challenge_id = ${challengeId}
         and exists (select 1 from game_runs r2 where r2.player_id = r.player_id and r2.challenge_id <> r.challenge_id
                     and r2.started_at < r.started_at))::int as returning_players,
      (select percentile_cont(0.5) within group (order by elapsed_ms) from game_runs
         where challenge_id = ${challengeId} and status = 'cleared')::float as median_elapsed_ms`;
  const perSlot = await sql<
    { slot: number; reached: number; answered: number; correct: number; solve_rate: number | null; median_answer_ms: number | null; option_counts: Record<string, number> }[]
  >`
    select slot, reached::int, answered::int, correct::int, solve_rate::float, median_answer_ms::float, option_counts
    from question_performance where challenge_id = ${challengeId} order by slot`;
  return { summary, perSlot };
}
