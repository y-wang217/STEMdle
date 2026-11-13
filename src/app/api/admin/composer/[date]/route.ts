import { z } from "zod";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { approveChallenge, autoCompose, revertToDraft, setSlotQuestion } from "@/lib/composer";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("auto"), keep: z.array(z.number().int().min(1).max(8)).default([]) }),
  z.object({ action: z.literal("replace"), slot: z.number().int().min(1).max(8), questionId: z.uuid().nullable() }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("unapprove") }),
]);

export const POST = adminRoute<{ date: string }>(async (req, admin, { date }) => {
  const body = Body.parse(await readJson(req));
  switch (body.action) {
    case "auto":
      return json(await autoCompose(date, admin.id, body.keep));
    case "replace":
      return json(await setSlotQuestion(date, body.slot, body.questionId, admin.id));
    case "approve":
      return json({ id: await approveChallenge(date, admin.id) });
    case "unapprove":
      await revertToDraft(date, admin.id);
      return json({ ok: true });
  }
});
