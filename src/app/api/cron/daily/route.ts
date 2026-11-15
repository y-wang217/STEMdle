/**
 * Scheduled activation + reserve check. Configure Vercel Cron (vercel.json)
 * at 04:05 and 05:05 UTC so it runs just after midnight Toronto in both EDT
 * and EST. Requires `Authorization: Bearer $CRON_SECRET`.
 */
import { HttpError, json, route } from "@/lib/http";
import { safeEqual } from "@/lib/security/crypto";
import { dailyJob } from "@/lib/composer";
import { processLeanQueue } from "@/lib/lean/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = route(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) throw new HttpError(401, "unauthorized");
  const daily = await dailyJob();
  const lean = await processLeanQueue({ deadlineMs: 200_000 }).catch((e) => ({ error: (e as Error).message }));
  return json({ ...daily, lean });
});
