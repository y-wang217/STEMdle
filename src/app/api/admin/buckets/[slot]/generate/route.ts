import { z } from "zod";
import { HttpError, json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { executeBatch, startGenerationBatch } from "@/lib/factory/pipeline";
import { availableProviders } from "@/lib/factory/providers";
import { after } from "next/server";
import { processLeanQueue } from "@/lib/lean/pipeline";

// The response returns immediately; this is the budget for the background work.
export const maxDuration = 300;

const Body = z.object({ count: z.number().int().min(1).max(20), provider: z.enum(["anthropic", "procedural"]) });

export const POST = adminRoute<{ slot: string }>(async (req, admin, { slot }) => {
  const body = Body.parse(await readJson(req));
  const p = availableProviders().find((x) => x.id === body.provider)!;
  if (!p.available) throw new HttpError(400, `${body.provider} is unavailable: ${p.reason}`);
  const { batchId } = await startGenerationBatch({ slot: Number(slot), count: body.count, providerId: body.provider, adminId: admin.id });
  // Generation, validation and Lean continue after the browser gets its answer,
  // so the admin can leave the page. Progress is read from /api/admin/activity.
  after(async () => {
    const started = Date.now();
    await executeBatch(batchId).catch((e) => console.error("[mathdle] batch", batchId, (e as Error).message));
    const left = 280_000 - (Date.now() - started);
    if (left > 30_000) await processLeanQueue({ deadlineMs: left - 20_000 }).catch((e) => console.error("[mathdle] lean queue", e));
  });
  return json({ batchId }, 202);
});
