import { z } from "zod";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { markMathVerified } from "@/lib/factory/feedback";

const Body = z.object({ note: z.string().min(1).max(2000) });

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const body = Body.parse(await readJson(req));
  return json({ status: await markMathVerified(admin.id, id, body.note) });
});
