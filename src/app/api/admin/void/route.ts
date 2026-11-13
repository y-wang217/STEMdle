import { z } from "zod";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { voidPublishedQuestion } from "@/lib/invalidation";

const Body = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), slot: z.number().int().min(1).max(8), reason: z.string().min(3).max(1000) });

export const POST = adminRoute(async (req, admin) => {
  const body = Body.parse(await readJson(req));
  return json(await voidPublishedQuestion({ ...body, adminId: admin.id }));
});
