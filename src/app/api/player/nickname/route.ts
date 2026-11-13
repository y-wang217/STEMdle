import { z } from "zod";
import { assertSameOrigin, ipKey, json, readJson, route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { getOrCreatePlayer, setNickname } from "@/lib/game/identity";

const Body = z.object({ nickname: z.string().max(60) });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req));
  const player = await getOrCreatePlayer(ipKey(req));
  await enforceRateLimit(`nick:${player.id}`, 10, 3600);
  return json({ nickname: await setNickname(player.id, body.nickname) });
});
