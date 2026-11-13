import { HttpError } from "@/lib/http";
import { todayChallenge, type TodayChallenge } from "./challenge";

export async function requireToday(): Promise<TodayChallenge> {
  const t = await todayChallenge();
  if (!t.challenge) throw new HttpError(404, "today's challenge isn't ready yet", "not_ready");
  return t.challenge;
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://mathdle.app").replace(/\/$/, "");
}

export function shareText(number: number, score: number, pattern: string, status: string) {
  const tag = status === "cleared" ? " 🏆" : "";
  return `Mathdle #${number} · ${score}/8${tag}\n${pattern}\n${siteUrl()}`;
}
