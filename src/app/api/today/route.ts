import { json, route } from "@/lib/http";
import { todayChallenge } from "@/lib/game/challenge";
import { currentPlayer } from "@/lib/game/identity";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const t = await todayChallenge();
  const player = await currentPlayer();
  let run = null;
  if (player && t.challenge) {
    const [r] = await sql<{ status: string; current_slot: number; score: number; score_adjustment: number }[]>`
      select status, current_slot, score, score_adjustment from game_runs where player_id = ${player.id} and challenge_id = ${t.challenge.id}`;
    if (r) run = { status: r.status, currentSlot: r.current_slot, score: r.score + r.score_adjustment, finished: r.status !== "active" };
  }
  return json({
    date: t.date,
    number: t.number,
    available: Boolean(t.challenge),
    nextReset: t.nextReset,
    player: player ? { nickname: player.nickname } : null,
    run,
  });
});
