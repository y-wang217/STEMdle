"use client";
import { useEffect, useState } from "react";
import type { Activity, BatchActivity } from "@/lib/factory/activity";

export type { Activity, BatchActivity };

/** The nav indicator polls and broadcasts; other components listen instead of polling themselves. */
export const ACTIVITY_EVENT = "mathdle:activity";
export const ACTIVITY_REFRESH = "mathdle:activity-refresh";

export function requestActivityRefresh() {
  window.dispatchEvent(new Event(ACTIVITY_REFRESH));
}

export function useActivity(): (Activity & { skewMs: number }) | null {
  const [a, setA] = useState<(Activity & { skewMs: number }) | null>(null);
  useEffect(() => {
    const on = (e: Event) => setA((e as CustomEvent).detail);
    window.addEventListener(ACTIVITY_EVENT, on);
    requestActivityRefresh();
    return () => window.removeEventListener(ACTIVITY_EVENT, on);
  }, []);
  return a;
}

export const STAGES = [
  { key: "queued", label: "Starting" },
  { key: "generating", label: "Writing questions" },
  { key: "validating", label: "Checking the math" },
  { key: "done", label: "Ready for review" },
] as const;

export function stageLabel(b: BatchActivity) {
  if (b.status === "failed") return "Failed";
  return STAGES.find((s) => s.key === b.stage)?.label ?? b.stage;
}

export function elapsed(fromIso: string, toMs: number) {
  const s = Math.max(0, Math.round((toMs - Date.parse(fromIso)) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Current time (ms), re-read every second while `active`, for live elapsed timers. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active]);
  return now;
}
