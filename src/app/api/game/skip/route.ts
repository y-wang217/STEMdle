import { z } from "zod";
import { HttpError, assertSameOrigin, json, readJson, route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { requireToday } from "@/lib/game/api";
import { currentPlayer } from "@/lib/game/identity";
import { skipQuestion } from "@/lib/game/engine";

const Body = z.object({ slot: z.number().int().min(1).max(8) });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req));
  const challenge = await requireToday();
  const player = await currentPlayer();
  if (!player) throw new HttpError(409, "no run in progress", "no_run");
  await enforceRateLimit(`answer:${player.id}`, 40, 60);
  return json(await skipQuestion(player.id, challenge.id, body.slot));
});
