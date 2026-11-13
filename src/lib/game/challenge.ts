import { activateDate } from "@/lib/composer";
import { raiseAlert } from "@/lib/audit";
import { challengeNumber, nextReset, torontoDate } from "@/lib/time";

export interface TodayChallenge {
  id: string;
  date: string;
  number: number;
}

/**
 * Today's challenge for every player (same id → same questions, same order).
 * Publishes an *approved* set on first access after midnight Toronto; if none
 * is approved, returns null and alerts — it never falls back to unvetted content.
 */
export async function todayChallenge(now = new Date()): Promise<{ challenge: TodayChallenge | null; date: string; number: number; nextReset: string }> {
  const date = torontoDate(now);
  const c = await activateDate(date);
  if (!c) {
    await raiseAlert("missing_challenge", `No approved challenge for ${date}. Players see a 'not ready' screen.`, { date }, `missing:${date}`);
  }
  return {
    challenge: c ? { id: c.id, date, number: c.number } : null,
    date,
    number: challengeNumber(date),
    nextReset: nextReset(now).toISOString(),
  };
}
