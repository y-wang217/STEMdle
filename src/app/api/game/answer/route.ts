import { z } from "zod";
import { HttpError, assertSameOrigin, json, readJson, route } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { requireToday } from "@/lib/game/api";
import { currentPlayer } from "@/lib/game/identity";
import { getState, submitAnswer } from "@/lib/game/engine";

const Body = z.object({ slot: z.number().int().min(1).max(8), optionId: z.uuid() });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req));
  const challenge = await requireToday();
  const player = await currentPlayer();
  if (!player) throw new HttpError(409, "no run in progress", "no_run");
  await enforceRateLimit(`answer:${player.id}`, 40, 60);
  const result = await submitAnswer(player.id, challenge.id, body.slot, body.optionId);
  const next = result.run.finished ? null : (await getState(player.id, challenge.id)).question;
  return json({ ...result, question: next });
});
