import { HttpError, json, route } from "@/lib/http";
import { requireToday } from "@/lib/game/api";
import { currentPlayer } from "@/lib/game/identity";
import { getState } from "@/lib/game/engine";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const challenge = await requireToday();
  const player = await currentPlayer();
  if (!player) throw new HttpError(409, "no run in progress", "no_run");
  return json(await getState(player.id, challenge.id));
});
