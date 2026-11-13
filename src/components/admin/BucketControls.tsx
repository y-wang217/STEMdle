"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./kit";

interface BatchSummary {
  batchId: string;
  provider: string;
  devAdapter: boolean;
  generatorVersion: number;
  produced: number;
  passed: number;
  failed: number;
  needsReview: number;
  discarded: { reason: string }[];
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

  const generate = async () => {
    setBusy("generate");
    setMsg(null);
    try {
      const s = await post<BatchSummary>(`/api/admin/buckets/${slot}/generate`, { count, provider });
      setMsg(
        <span data-testid="batch-summary">
          Batch with generator v{s.generatorVersion} via {s.provider}
          {s.devAdapter ? " (development adapter)" : ""}: {s.produced} produced — {s.passed} validated, {s.needsReview} need math review, {s.failed} failed validation
          {s.discarded.length ? `, ${s.discarded.length} discarded (schema)` : ""}.{" "}
          <a className="font-semibold underline" href={`/admin/review?slot=${slot}&batch=${s.batchId}`} data-testid="review-batch-link">
            Review this batch →
          </a>
        </span>,
      );
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
      setMsg(<span data-testid="learn-result">Proposed draft generator v{r.version}. Review the summary below and activate it to use it for the next batch.</span>);
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
        <button className="rounded bg-neutral-900 px-3 py-1 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black" disabled={Boolean(busy)} onClick={generate} data-testid="generate">
          {busy === "generate" ? "Generating & validating…" : "Generate batch"}
        </button>
        <span className="mx-2 h-5 w-px bg-neutral-300" />
        <label className="flex items-center gap-1" title={hasAI ? "" : "ANTHROPIC_API_KEY not configured"}>
          <input type="checkbox" checked={useAI} disabled={!hasAI} onChange={(e) => setUseAI(e.target.checked)} /> AI analysis
        </label>
        <button className="rounded border px-3 py-1 font-medium disabled:opacity-50" disabled={Boolean(busy)} onClick={learn} data-testid="learn">
          {busy === "learn" ? "Analysing feedback…" : "Learn from feedback → draft new version"}
        </button>
        <a className="ml-auto underline" href={`/admin/review?slot=${slot}`}>
          Review queue
        </a>
      </div>
      {msg && <p className="mt-2">{msg}</p>}
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
