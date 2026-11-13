import { Game, type TodayInfo } from "@/components/game/Game";
import { todayChallenge } from "@/lib/game/challenge";
import { currentPlayer } from "@/lib/game/identity";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const t = await todayChallenge();
  const player = await currentPlayer();
  let run: TodayInfo["run"] = null;
  if (player && t.challenge) {
    const [r] = await sql<{ status: string; current_slot: number; score: number; score_adjustment: number }[]>`
      select status, current_slot, score, score_adjustment from game_runs where player_id = ${player.id} and challenge_id = ${t.challenge.id}`;
    if (r) run = { status: r.status, currentSlot: r.current_slot, score: r.score + r.score_adjustment, finished: r.status !== "active" };
  }
  return (
    <Game
      initial={{
        date: t.date,
        number: t.number,
        available: Boolean(t.challenge),
        player: player ? { nickname: player.nickname } : null,
        run,
      }}
    />
  );
}
