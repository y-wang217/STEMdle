import { z } from "zod";
import { after } from "next/server";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { recordJudgment } from "@/lib/factory/feedback";
import { autoLearn, batchFullyReviewed } from "@/lib/factory/learning";

// Budget for the background auto-learn (it may call the model).
export const maxDuration = 120;

const Body = z.object({
  judgment: z.enum(["too_easy", "just_right", "too_hard", "invalid", "retracted"]),
  note: z.string().max(2000).nullish(),
});

export const POST = adminRoute<{ id: string }>(async (req, admin, { id }) => {
  const body = Body.parse(await readJson(req));
  const result = await recordJudgment({ adminId: admin.id, questionId: id, judgment: body.judgment, note: body.note ?? null });
  // Finishing a batch's review upgrades the slot's generator automatically.
  after(async () => {
    const b = await batchFullyReviewed(id);
    if (b?.done) await autoLearn(b.slot, admin.id).catch((e) => console.error("[mathdle] auto-learn", b.slot, (e as Error).message));
  });
  return json(result);
});
