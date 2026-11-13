/**
 * Fixed-window rate limiter stored in Postgres so limits hold across
 * serverless instances. Best-effort abuse control, not a security boundary.
 */
import { sql } from "@/lib/db";
import { HttpError } from "@/lib/http";

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const [row] = await sql<{ count: number }[]>`
    insert into rate_limits (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;
  if (Math.random() < 0.01) {
    await sql`delete from rate_limits where window_start < now() - interval '1 day'`;
  }
  return row.count <= limit;
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  if (process.env.MATHDLE_DISABLE_RATE_LIMITS === "1") return;
  if (!(await rateLimit(key, limit, windowSeconds))) throw new HttpError(429, "too many requests, slow down", "rate_limited");
}
