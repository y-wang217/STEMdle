import { z } from "zod";
import { HttpError, json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { runGenerationBatch } from "@/lib/factory/pipeline";
import { availableProviders } from "@/lib/factory/providers";

export const maxDuration = 300;

const Body = z.object({ count: z.number().int().min(1).max(20), provider: z.enum(["anthropic", "procedural"]) });

export const POST = adminRoute<{ slot: string }>(async (req, admin, { slot }) => {
  const body = Body.parse(await readJson(req));
  const p = availableProviders().find((x) => x.id === body.provider)!;
  if (!p.available) throw new HttpError(400, `${body.provider} is unavailable: ${p.reason}`);
  const summary = await runGenerationBatch({ slot: Number(slot), count: body.count, providerId: body.provider, adminId: admin.id });
  return json(summary);
});
