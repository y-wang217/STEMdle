import { HttpError, json, route } from "@/lib/http";
import { requireToday, shareText } from "@/lib/game/api";
import { currentPlayer } from "@/lib/game/identity";
import { getResults, sharePattern } from "@/lib/game/engine";
import { leaderboard } from "@/lib/game/leaderboard";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const challenge = await requireToday();
  const player = await currentPlayer();
  if (!player) throw new HttpError(403, "play today's challenge to see the solutions", "no_run");
  const results = await getResults(player.id, challenge.id);
  const board = await leaderboard(challenge.id, player.id, 50);
  const pattern = sharePattern(results);
  return json({
    ...results,
    challenge: { number: challenge.number, date: challenge.date },
    player: { nickname: player.nickname },
    pattern,
    shareText: shareText(challenge.number, results.run.score, pattern, results.run.status),
    leaderboard: board,
  });
});
