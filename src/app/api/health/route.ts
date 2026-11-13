import { json, route } from "@/lib/http";
import { sql } from "@/lib/db";
import { runSympyValidator } from "@/lib/factory/validator-client";
import { torontoDate } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Liveness/readiness: database, validator, and whether today's set is ready. */
export const GET = route(async () => {
  const out: Record<string, unknown> = { date: torontoDate() };
  try {
    const [r] = await sql`select (select status from daily_challenges where challenge_date = ${torontoDate()}) as today`;
    out.db = "ok";
    out.todayChallenge = r.today ?? "missing";
  } catch (e) {
    out.db = `error: ${(e as Error).message}`;
  }
  try {
    const { engine } = await runSympyValidator([]);
    out.validator = engine;
  } catch (e) {
    out.validator = `error: ${(e as Error).message}`;
  }
  const ok = out.db === "ok" && !String(out.validator).startsWith("error");
  return json({ ok, ...out }, ok ? 200 : 503);
});
