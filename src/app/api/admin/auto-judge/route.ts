import { z } from "zod";
import { after } from "next/server";
import { HttpError, json, readJson } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { enforceRateLimit } from "@/lib/ratelimit";
import { DEFAULT_COST_CAP_USD, autoJudge } from "@/lib/factory/auto-judge";

// The response returns immediately, but after() still runs inside this limit
// (node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md, "Duration").
export const maxDuration = 300;

/**
 * No new solver call starts after RUN_DEADLINE_MS. Calls still running at
 * RUN_HARD_DEADLINE_MS are aborted (the HTTP request is cancelled), leaving
 * 30 s before maxDuration to write results and the `auto_judge_run` audit row.
 * Questions not finished stay `ready` for the next run.
 */
const RUN_DEADLINE_MS = 150_000;
const RUN_HARD_DEADLINE_MS = maxDuration * 1000 - 30_000;

/** Highest per-run cost cap an admin can request from the browser. */
const MAX_COST_CAP_USD = 20;

const Body = z
  .object({
    batchId: z.string().uuid().optional(),
    slot: z.number().int().min(1).max(8).optional(),
    limit: z.number().int().min(1).max(12).default(6),
    costCapUsd: z.number().positive().max(MAX_COST_CAP_USD).optional(),
  })
  .refine((b) => b.batchId || b.slot, { message: "give a batchId or a slot" });

/**
 * Judge one batch (or the oldest unjudged questions of a slot) with the model
 * ladder. Runs after the response under a deadline; the result (including a
 * partial or failed run) is written to the audit log as `auto_judge_run`, and judgments appear in the review UI as AUTO-JUDGE notes.
 */
export const POST = adminRoute(async (req, admin) => {
  const body = Body.parse(await readJson(req));
  if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(400, "auto-judge needs ANTHROPIC_API_KEY for its solver ladder");
  await enforceRateLimit(`auto-judge:${admin.id}`, Number(process.env.AUTO_JUDGE_RATE_LIMIT_PER_HOUR ?? 6), 3600);
  const costCapUsd = Math.min(MAX_COST_CAP_USD, body.costCapUsd ?? Number(process.env.AUTO_JUDGE_COST_CAP_USD ?? DEFAULT_COST_CAP_USD));
  after(async () => {
    // autoJudge writes its `auto_judge_run` audit row in a finally block, so a failed run is recorded too.
    await autoJudge({ batchId: body.batchId, slot: body.slot, limit: body.limit, costCapUsd, triggeredBy: admin.id, deadlineMs: RUN_DEADLINE_MS, hardDeadlineMs: RUN_HARD_DEADLINE_MS }).catch((e) =>
      console.error("[mathdle] auto-judge", (e as Error).message),
    );
  });
  return json({ started: true, batchId: body.batchId ?? null, slot: body.slot ?? null, limit: body.limit, costCapUsd }, 202);
});
