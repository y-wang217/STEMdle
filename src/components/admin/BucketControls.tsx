"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { post } from "./kit";
import { STAGES, elapsed, requestActivityRefresh, stageLabel, useActivity, useNow, type BatchActivity } from "./activity";

/** Live progress for this slot's newest batch (running, or finished in the last 15 minutes). */
function BatchProgress({ batch, skewMs }: { batch: BatchActivity; skewMs: number }) {
  const running = batch.status === "running";
  const now = useNow(running) + skewMs;
  const idx = batch.status === "failed" ? -1 : STAGES.findIndex((x) => x.key === batch.stage);
  const s = batch.summary;
  return (
    <div className="mt-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800" data-testid="batch-progress" data-status={batch.status}>
      <div className="flex flex-wrap items-center gap-1">
        {STAGES.map((st, i) => {
          const done = batch.status === "completed" || i < idx;
          const current = running && i === idx;
          return (
            <span key={st.key} className="flex items-center gap-1">
              <span
                className={`rounded-full px-2 py-0.5 text-[12px] ${
                  done ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" : current ? "bg-blue-100 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800"
                }`}
              >
                {done ? "✓ " : current ? "● " : ""}
                {st.label}
              </span>
              {i < STAGES.length - 1 && <span className="text-neutral-400">→</span>}
            </span>
          );
        })}
        <span className="ml-auto tabular-nums text-neutral-500">{elapsed(batch.createdAt, batch.completedAt ? Date.parse(batch.completedAt) : now)}</span>
      </div>
      {running && (
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          {stageLabel(batch)}… a batch of {batch.requested} usually takes 1–3 minutes. You can leave this page — progress stays in the top bar and you&apos;ll get a notice when it&apos;s ready.
        </p>
      )}
      {batch.status === "failed" && <p className="mt-2 text-red-600">Batch failed: {batch.error}</p>}
      {batch.status === "completed" && s && (
        <p className="mt-2" data-testid="batch-summary">
          Batch with generator v{s.generatorVersion} via {s.provider}
          {s.devAdapter ? " (development adapter)" : ""}: {s.produced} produced — {s.passed} validated, {s.needsReview} need math review, {s.failed} failed validation
          {s.discarded.length ? `, ${s.discarded.length} discarded (schema)` : ""}. Lean checks continue in the background.{" "}
          <a className="font-semibold underline" href={`/admin/review?slot=${batch.slot}&batch=${batch.id}`} data-testid="review-batch-link">
            Review this batch →
          </a>
        </p>
      )}
    </div>
  );
}

export function BucketControls({
  slot,
  providers,
  defaultProvider,
  hasAI,
}: {
  slot: number;
  providers: { id: string; available: boolean; devAdapter: boolean; reason?: string }[];
  defaultProvider: string;
  hasAI: boolean;
}) {
  const router = useRouter();
  const [count, setCount] = useState(8);
  const [provider, setProvider] = useState(defaultProvider);
  const [useAI, setUseAI] = useState(hasAI);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<React.ReactNode>(null);

  const activity = useActivity();
  const [startedId, setStartedId] = useState<string | null>(null);
  const batch = activity?.batches.find((b) => b.id === startedId) ?? activity?.batches.find((b) => b.slot === slot) ?? null;
  const generating = busy === "generate" || batch?.status === "running";

  // Refresh the server-rendered tables when a batch for this slot finishes.
  const lastStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (lastStatus.current === "running" && batch && batch.status !== "running") router.refresh();
    lastStatus.current = batch?.status;
  }, [batch, router]);

  const generate = async () => {
    setBusy("generate");
    setMsg(null);
    try {
      const r = await post<{ batchId: string }>(`/api/admin/buckets/${slot}/generate`, { count, provider });
      setStartedId(r.batchId);
      requestActivityRefresh();
      router.refresh();
    } catch (e) {
      setMsg(<span className="text-red-600">{(e as Error).message}</span>);
    } finally {
      setBusy(null);
    }
  };

  const learn = async () => {
    setBusy("learn");
    setMsg(null);
    try {
      const r = await post<{ version: number }>(`/api/admin/buckets/${slot}/learn`, { useAI });
      setMsg(<span data-testid="learn-result">Proposed draft generator v{r.version}. Review the summary below and activate it to use it for the next batch. (Finished reviews upgrade the generator automatically; this button is for learning early.)</span>);
      router.refresh();
    } catch (e) {
      setMsg(<span className="text-red-600">{(e as Error).message}</span>);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-2">
        <label>
          Count{" "}
          <input type="number" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-16 rounded border px-1 py-0.5 dark:bg-neutral-800" data-testid="gen-count" />
        </label>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded border px-1 py-0.5 dark:bg-neutral-800" data-testid="gen-provider">
          {providers.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.available}>
              {p.id}
              {p.devAdapter ? " (dev adapter)" : ""}
              {!p.available ? ` — ${p.reason}` : ""}
            </option>
          ))}
        </select>
        <button className="rounded bg-neutral-900 px-3 py-1 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black" disabled={Boolean(busy) || generating} onClick={generate} data-testid="generate">
          {busy === "generate" ? "Starting…" : batch?.status === "running" ? "Batch in progress…" : "Generate batch"}
        </button>
        <span className="mx-2 h-5 w-px bg-neutral-300" />
        <label className="flex items-center gap-1" title={hasAI ? "" : "ANTHROPIC_API_KEY not configured"}>
          <input type="checkbox" checked={useAI} disabled={!hasAI} onChange={(e) => setUseAI(e.target.checked)} /> AI analysis
        </label>
        <button className="rounded border px-3 py-1 font-medium disabled:opacity-50" disabled={Boolean(busy)} onClick={learn} data-testid="learn">
          {busy === "learn" ? "Analysing feedback…" : "Learn now → draft new version"}
        </button>
        <a className="ml-auto underline" href={`/admin/review?slot=${slot}`}>
          Review queue
        </a>
      </div>
      {msg && <p className="mt-2">{msg}</p>}
      {batch && activity && <BatchProgress batch={batch} skewMs={activity.skewMs} />}
    </div>
  );
}

export function ProfileEditor({ slot, profile }: { slot: number; profile: unknown }) {
  const router = useRouter();
  const [text, setText] = useState(JSON.stringify(profile, null, 2));
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  if (!editing)
    return (
      <div>
        <pre className="max-h-96 overflow-auto rounded bg-neutral-50 p-2 text-[11px] dark:bg-neutral-950">{text}</pre>
        <button className="mt-2 rounded border px-2 py-1" onClick={() => setEditing(true)}>
          Edit (creates a new draft version)
        </button>
      </div>
    );
  return (
    <div>
      <textarea className="h-96 w-full rounded border p-2 font-mono text-[11px] dark:bg-neutral-950" value={text} onChange={(e) => setText(e.target.value)} />
      <input className="mt-2 w-full rounded border px-2 py-1 dark:bg-neutral-800" placeholder="Reason for this change" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <p className="text-red-600">{err}</p>}
      <div className="mt-2 flex gap-2">
        <button
          className="rounded bg-neutral-900 px-3 py-1 text-white dark:bg-white dark:text-black"
          onClick={async () => {
            try {
              await post(`/api/admin/buckets/${slot}/profile`, { profile: JSON.parse(text), reason });
              setEditing(false);
              router.refresh();
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Save as draft version
        </button>
        <button className="rounded border px-3 py-1" onClick={() => setEditing(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
