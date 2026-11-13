import { json, route } from "@/lib/http";
import { requireToday } from "@/lib/game/api";
import { currentPlayer } from "@/lib/game/identity";
import { leaderboard } from "@/lib/game/leaderboard";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const challenge = await requireToday();
  const player = await currentPlayer();
  return json({ challenge: { number: challenge.number, date: challenge.date }, ...(await leaderboard(challenge.id, player?.id ?? null, 50)) });
});
