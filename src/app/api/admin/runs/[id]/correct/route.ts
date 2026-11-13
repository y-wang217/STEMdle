import { z } from "zod";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { correctRunScore } from "@/lib/invalidation";

const Body = z.object({ delta: z.number().int(), reason: z.string().min(3).max(1000) });

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const body = Body.parse(await readJson(req));
  await correctRunScore({ runId: id, delta: body.delta, reason: body.reason, adminId: admin.id });
  return json({ ok: true });
});
