import { assertSameOrigin, ipKey, json, route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { requireToday } from "@/lib/game/api";
import { getOrCreatePlayer } from "@/lib/game/identity";
import { getState, startRun } from "@/lib/game/engine";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  await enforceRateLimit(`start:${ipKey(req)}`, 30, 60);
  const challenge = await requireToday();
  const player = await getOrCreatePlayer(ipKey(req));
  await startRun(player.id, challenge.id);
  const state = await getState(player.id, challenge.id);
  return json({ ...state, player: { nickname: player.nickname }, challenge: { number: challenge.number, date: challenge.date } });
});
