import { z } from "zod";
import { json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { proposeNextVersion } from "@/lib/factory/learning";

export const maxDuration = 300;

const Body = z.object({ useAI: z.boolean().default(false) });

export const POST = adminRoute<{ slot: string }>(async (req, admin, { slot }) => {
  const body = Body.parse(await readJson(req));
  const useAI = body.useAI && Boolean(process.env.ANTHROPIC_API_KEY);
  return json(await proposeNextVersion(Number(slot), admin.id, { useAI }));
});
