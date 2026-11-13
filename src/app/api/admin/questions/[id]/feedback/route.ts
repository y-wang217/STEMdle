import { z } from "zod";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { recordJudgment } from "@/lib/factory/feedback";

const Body = z.object({
  judgment: z.enum(["too_easy", "just_right", "too_hard", "invalid", "retracted"]),
  note: z.string().max(2000).nullish(),
});

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const body = Body.parse(await readJson(req));
  return json(await recordJudgment({ adminId: admin.id, questionId: id, judgment: body.judgment, note: body.note ?? null }));
});
