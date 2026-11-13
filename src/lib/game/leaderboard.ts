/**
 * Daily ranking: more correct answers first; among equal scores, faster
 * speed-eligible completion times first; runs over 30 minutes keep their score
 * but rank after timed runs with the same score.
 */
import { sql } from "@/lib/db";

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  score: number;
  elapsedMs: number | null;
  isYou: boolean;
}

export async function leaderboard(challengeId: string, playerId: string | null, limit = 50) {
  const rows = await sql<{ rank: number; nickname: string; score: number; elapsed_ms: number | null; player_id: string; total: number }[]>`
    with ranked as (
      select r.player_id, p.nickname, (r.score + r.score_adjustment) as score,
        case when r.speed_eligible then r.elapsed_ms end as elapsed_ms,
        rank() over (order by (r.score + r.score_adjustment) desc, case when r.speed_eligible then r.elapsed_ms end asc nulls last)::int as rank,
        count(*) over ()::int as total
      from game_runs r join anonymous_players p on p.id = r.player_id
      where r.challenge_id = ${challengeId} and r.status <> 'active'
    )
    select * from ranked where rank <= ${limit} or player_id = ${playerId ?? null}::uuid
    order by rank, nickname limit ${limit + 1}`;
  const map = (r: (typeof rows)[number]): LeaderboardRow => ({
    rank: r.rank,
    nickname: r.nickname,
    score: r.score,
    elapsedMs: r.elapsed_ms,
    isYou: r.player_id === playerId,
  });
  return {
    total: rows[0]?.total ?? 0,
    top: rows.filter((r) => r.rank <= limit).slice(0, limit).map(map),
    you: rows.find((r) => r.player_id === playerId) ? map(rows.find((r) => r.player_id === playerId)!) : null,
  };
}
