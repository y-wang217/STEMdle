import { z } from "zod";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { createEditedVersion } from "@/lib/factory/learning";

const Body = z.object({ profile: z.unknown(), reason: z.string().min(1).max(500) });

export const POST = adminRoute<{ slot: string }>(async (req, admin, { slot }) => {
  const body = Body.parse(await readJson(req, 200_000));
  return json(await createEditedVersion(Number(slot), admin.id, body.profile, body.reason));
});
