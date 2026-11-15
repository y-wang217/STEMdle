import { json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { processLeanQueue } from "@/lib/lean/pipeline";

export const maxDuration = 300;

/** Process pending Lean jobs now (bounded). */
export const POST = adminRoute(async () => json(await processLeanQueue({ deadlineMs: 240_000 })));
