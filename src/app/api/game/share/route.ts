import { assertSameOrigin, json, route } from "@/lib/http";
import { sql } from "@/lib/db";
import { requireToday } from "@/lib/game/api";
import { currentPlayer } from "@/lib/game/identity";
import { track } from "@/lib/game/analytics";
import { enforceRateLimit } from "@/lib/ratelimit";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const challenge = await requireToday();
  const player = await currentPlayer();
  if (player) {
    await enforceRateLimit(`share:${player.id}`, 20, 3600);
    await sql`update game_runs set shared_at = coalesce(shared_at, now())
              where player_id = ${player.id} and challenge_id = ${challenge.id} and status <> 'active'`;
    await track("share", { playerId: player.id, challengeId: challenge.id });
  }
  return json({ ok: true });
});
