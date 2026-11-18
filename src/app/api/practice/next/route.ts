import { z } from "zod";
import { HttpError, assertSameOrigin, json, readJson, route } from "@/lib/http";
import { currentPlayer } from "@/lib/game/identity";
import { enforcePracticeLimit, nextPracticeQuestion } from "@/lib/game/practice";

const Body = z.object({ sessionId: z.uuid() });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req));
  const player = await currentPlayer();
  if (!player) throw new HttpError(404, "practice session not found", "no_session");
  await enforcePracticeLimit("play", player.id);
  return json(await nextPracticeQuestion(player.id, body.sessionId));
});
