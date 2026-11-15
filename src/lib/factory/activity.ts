import { sql } from "@/lib/db";
import { failStaleBatches } from "./pipeline";
import { leanRunnerFromEnv } from "@/lib/lean/runner";
import type { BatchSummary } from "./pipeline";

export interface BatchActivity {
  id: string;
  slot: number;
  status: "running" | "completed" | "failed";
  stage: "queued" | "generating" | "validating" | "done" | "failed";
  provider: string;
  requested: number;
  produced: number;
  error: string | null;
  summary: BatchSummary | null;
  createdAt: string;
  completedAt: string | null;
}

export interface Activity {
  now: string;
  batches: BatchActivity[];
  lean: { pending: number; checking: number; runner: boolean };
}

/** Running batches, batches that finished in the last 15 minutes, and the Lean queue. */
export async function getActivity(): Promise<Activity> {
  await failStaleBatches();
  // Lean jobs whose last allowed attempt died without finishing would otherwise stay pending forever.
  await sql`update lean_verifications set status = 'inconclusive', locked_at = null, completed_at = now(),
              diagnostics = 'verification worker stopped before finishing (all attempts used)'
            where status = 'pending' and attempts >= max_attempts and (locked_at is null or locked_at < now() - interval '10 minutes')`;
  const [batches, [lean]] = await Promise.all([
    sql<BatchActivity[]>`
      select id, slot, status, stage, provider, requested_count as requested, produced_count as produced, error, summary,
             created_at as "createdAt", completed_at as "completedAt"
      from generation_batches
      where status = 'running' or completed_at > now() - interval '15 minutes'
      order by created_at desc limit 20`,
    sql<{ pending: number; checking: number }[]>`
      select count(*) filter (where locked_at is null or locked_at < now() - interval '10 minutes')::int as pending,
             count(*) filter (where locked_at >= now() - interval '10 minutes')::int as checking
      from lean_verifications where status = 'pending' and attempts < max_attempts`,
  ]);
  return {
    now: new Date().toISOString(),
    batches: batches.map((b) => ({ ...b, createdAt: new Date(b.createdAt).toISOString(), completedAt: b.completedAt ? new Date(b.completedAt).toISOString() : null })),
    lean: { ...lean, runner: Boolean(leanRunnerFromEnv()) },
  };
}
