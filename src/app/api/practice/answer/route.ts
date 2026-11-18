import { z } from "zod";
import { HttpError, assertSameOrigin, json, readJson, route } from "@/lib/http";
import { currentPlayer } from "@/lib/game/identity";
import { answerPractice, enforcePracticeLimit } from "@/lib/game/practice";

const Body = z.object({ sessionId: z.uuid(), attemptId: z.uuid(), optionId: z.uuid() });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req));
  const player = await currentPlayer();
  if (!player) throw new HttpError(404, "practice question not found", "no_attempt");
  await enforcePracticeLimit("play", player.id);
  return json(await answerPractice(player.id, body));
});
