"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ACTIVITY_EVENT, ACTIVITY_REFRESH, elapsed, stageLabel, useNow, type Activity, type BatchActivity } from "./activity";

const FAST_MS = 3000;
const SLOW_MS = 20000;

function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent align-[-2px]" aria-hidden />;
}

function resultLine(b: BatchActivity) {
  if (b.status === "failed") return b.error ?? "failed";
  const s = b.summary;
  if (!s) return `${b.produced} produced`;
  return `${s.produced} produced · ${s.passed} validated · ${s.needsReview} need math review · ${s.failed} failed`;
}

/** Nav-bar indicator: running batches, Lean queue, and a toast when a batch finishes. */
export function ActivityIndicator() {
  const [a, setA] = useState<(Activity & { skewMs: number }) | null>(null);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<BatchActivity[]>([]);
  const seenRunning = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (timer.current) clearTimeout(timer.current);
      let busy = false;
      try {
        const res = await fetch("/api/admin/activity", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as Activity;
          const next = { ...data, skewMs: Date.parse(data.now) - Date.now() };
          // Batches this tab saw running that are now finished → toast.
          const finished = data.batches.filter((b) => b.status !== "running" && seenRunning.current.has(b.id));
          for (const b of finished) seenRunning.current.delete(b.id);
          for (const b of data.batches) if (b.status === "running") seenRunning.current.add(b.id);
          if (finished.length) setToasts((t) => [...finished, ...t].slice(0, 4));
          setA(next);
          window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: next }));
          busy = data.batches.some((b) => b.status === "running") || (data.lean.runner && data.lean.pending + data.lean.checking > 0);
        }
      } catch {
        /* offline: try again later */
      }
      if (timer.current) clearTimeout(timer.current);
      if (!stopped) timer.current = setTimeout(poll, document.hidden ? SLOW_MS * 3 : busy ? FAST_MS : SLOW_MS);
    };
    poll();
    window.addEventListener(ACTIVITY_REFRESH, poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener(ACTIVITY_REFRESH, poll);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  const running = a?.batches.filter((b) => b.status === "running") ?? [];
  const recent = a?.batches.filter((b) => b.status !== "running") ?? [];
  const leanBusy = a?.lean.runner ? a.lean.pending + a.lean.checking : 0;
  const now = useNow(running.length > 0) + (a?.skewMs ?? 0);

  const pill = "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-medium";
  return (
    <div className="relative flex items-center gap-2" data-testid="activity">
      {running.length > 0 && (
        <button className={`${pill} bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200`} onClick={() => setOpen((o) => !o)} data-testid="activity-running">
          <Spinner />
          {running.length === 1
            ? `Slot ${running[0].slot}: ${stageLabel(running[0])} · ${elapsed(running[0].createdAt, now)}`
            : `${running.length} batches generating`}
        </button>
      )}
      {leanBusy > 0 && (
        <button
          className={`${pill} bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200`}
          onClick={() => setOpen((o) => !o)}
          title="Formal (Lean) checks run in the background; they never block review."
          data-testid="activity-lean"
        >
          {a!.lean.checking > 0 && <Spinner />}
          Lean: {a!.lean.checking > 0 ? `checking ${a!.lean.checking}` : ""}
          {a!.lean.checking > 0 && a!.lean.pending > 0 ? " · " : ""}
          {a!.lean.pending > 0 ? `${a!.lean.pending} queued` : ""}
        </button>
      )}
      {running.length === 0 && recent.length > 0 && (
        <button className={`${pill} text-neutral-500 hover:text-black dark:hover:text-white`} onClick={() => setOpen((o) => !o)} data-testid="activity-recent">
          ✓ {recent.length} recent batch{recent.length > 1 ? "es" : ""}
        </button>
      )}

      {open && a && (
        <div className="absolute right-0 top-8 z-30 w-[22rem] rounded-lg border border-neutral-300 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Background work</span>
            <button className="text-neutral-500" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </div>
          {a.batches.length === 0 && <p className="text-neutral-500">No batches in the last 15 minutes.</p>}
          <ul className="space-y-2">
            {a.batches.map((b) => (
              <li key={b.id} className="rounded border border-neutral-200 p-2 dark:border-neutral-800">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/admin/buckets/${b.slot}`} className="font-medium underline" onClick={() => setOpen(false)}>
                    Slot {b.slot} · {b.requested} questions
                  </Link>
                  <span className={b.status === "failed" ? "text-red-600" : b.status === "running" ? "text-blue-700 dark:text-blue-300" : "text-green-700 dark:text-green-400"}>
                    {b.status === "running" && <Spinner />} {stageLabel(b)} · {elapsed(b.createdAt, b.completedAt ? Date.parse(b.completedAt) : now)}
                  </span>
                </div>
                {b.status !== "running" && <p className="mt-1 text-neutral-600 dark:text-neutral-400">{resultLine(b)}</p>}
                {b.status === "completed" && (
                  <Link href={`/admin/review?slot=${b.slot}&batch=${b.id}`} className="mt-1 inline-block font-semibold underline" onClick={() => setOpen(false)}>
                    Review this batch →
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-neutral-500">
            {a.lean.runner
              ? `Lean: ${a.lean.checking} checking, ${a.lean.pending} queued. Results appear on each question as they finish.`
              : "Lean runner not configured — formal checks are queued but not running."}
          </p>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 flex w-[22rem] flex-col gap-2">
          {toasts.map((b) => (
            <div
              key={b.id}
              className={`rounded-lg border p-3 shadow-lg ${b.status === "failed" ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950" : "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950"}`}
              data-testid="activity-toast"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{b.status === "failed" ? `Slot ${b.slot} batch failed` : `Slot ${b.slot} batch is ready`}</span>
                <button onClick={() => setToasts((t) => t.filter((x) => x.id !== b.id))} aria-label="Dismiss">
                  ✕
                </button>
              </div>
              <p className="mt-1">{resultLine(b)}</p>
              {b.status === "completed" && (
                <Link href={`/admin/review?slot=${b.slot}&batch=${b.id}`} className="mt-1 inline-block font-semibold underline" onClick={() => setToasts((t) => t.filter((x) => x.id !== b.id))}>
                  Review this batch →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
