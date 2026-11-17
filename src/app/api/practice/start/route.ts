import { z } from "zod";
import { assertSameOrigin, ipKey, json, readJson, route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { todayChallenge } from "@/lib/game/challenge";
import { getOrCreatePlayer } from "@/lib/game/identity";
import { startPractice } from "@/lib/game/practice";

// slot: 1–8 for one topic, null for any topic, omitted for "where today's run ended".
const Body = z.object({ slot: z.number().int().min(1).max(8).nullable().optional() });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  await enforceRateLimit(`practice-start:${ipKey(req)}`, 30, 60);
  const body = Body.parse(await readJson(req));
  const player = await getOrCreatePlayer(ipKey(req));
  const challengeId = body.slot === undefined ? ((await todayChallenge()).challenge?.id ?? null) : null;
  return json(await startPractice(player.id, { slot: body.slot, challengeId }));
});
