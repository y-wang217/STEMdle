/**
 * Daily challenge calendar. A "challenge date" is the calendar date in
 * America/Toronto; it rolls over at local midnight and follows DST.
 */
export const TZ = "America/Toronto";

const dateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** YYYY-MM-DD in Toronto for the given instant. */
export function torontoDate(at: Date = new Date()): string {
  return dateFmt.format(at);
}

function torontoParts(at: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute };
}

export function parseDate(date: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`invalid date ${date}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function isValidDate(date: string): boolean {
  try {
    const { y, m, d } = parseDate(date);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  } catch {
    return false;
  }
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const A = parseDate(a);
  const B = parseDate(b);
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86_400_000);
}

export function epoch(): string {
  return process.env.MATHDLE_EPOCH || "2026-11-01";
}

/** Challenge #1 is the epoch date. */
export function challengeNumber(date: string): number {
  return daysBetween(epoch(), date) + 1;
}

/** The UTC instant at which the given Toronto date begins (handles EST/EDT). */
export function torontoMidnight(date: string): Date {
  const { y, m, d } = parseDate(date);
  // Toronto is UTC-5 (EST) or UTC-4 (EDT); midnight is 04:00 or 05:00 UTC.
  for (const h of [4, 5, 3, 6]) {
    const cand = new Date(Date.UTC(y, m - 1, d, h, 0, 0));
    const p = torontoParts(cand);
    if (p.y === y && p.m === m && p.d === d && p.h === 0 && p.min === 0) return cand;
  }
  throw new Error(`could not resolve Toronto midnight for ${date}`);
}

/** Instant of the next daily reset after `at`. */
export function nextReset(at: Date = new Date()): Date {
  return torontoMidnight(addDays(torontoDate(at), 1));
}
