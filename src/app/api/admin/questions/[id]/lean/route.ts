import { after } from "next/server";
import { HttpError, json } from "@/lib/http";
import { adminRoute } from "@/lib/admin/route";
import { sql } from "@/lib/db";
import { audit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/ratelimit";
import { enqueueLean, processLeanQueue } from "@/lib/lean/pipeline";

export const maxDuration = 300;

/** Retry Lean verification for the question's current version (new history row). */
export const POST = adminRoute<{ id: string }>(async (_req, admin, { id }) => {
  await enforceRateLimit(`lean-retry:${admin.id}`, 30, 3600);
  const [q] = await sql<{ current_version_id: string }[]>`select current_version_id from questions where id = ${id}`;
  if (!q) throw new HttpError(404, "question not found");
  const queued = await enqueueLean([q.current_version_id], admin.id);
  await audit(sql, admin.id, "lean_retry", "question", id, { queued });
  after(() => processLeanQueue({ maxJobs: 2 }).catch((e) => console.error("[mathdle] lean queue", e)));
  return json({ queued: queued > 0, message: queued ? "Lean verification queued" : "a Lean job is already pending for this version" });
});
