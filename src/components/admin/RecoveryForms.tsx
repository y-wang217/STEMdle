"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./kit";

export function VoidForm({ date }: { date: string }) {
  const router = useRouter();
  const [slot, setSlot] = useState(1);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} className="rounded border px-1 dark:bg-neutral-800">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
          <option key={s} value={s}>
            slot {s}
          </option>
        ))}
      </select>
      <input className="w-96 rounded border px-2 py-0.5 dark:bg-neutral-800" placeholder="Reason (shown in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        className="rounded bg-red-700 px-3 py-1 text-white"
        onClick={async () => {
          if (!window.confirm(`Void slot ${slot} of ${date}? This cannot be undone.`)) return;
          try {
            const r = await post<{ runsCorrected: number }>("/api/admin/void", { date, slot, reason });
            setMsg(`Voided. ${r.runsCorrected} run(s) corrected.`);
            router.refresh();
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Void question
      </button>
      {msg && <span>{msg}</span>}
    </div>
  );
}

export function CorrectionForm() {
  const [runId, setRunId] = useState("");
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className="w-80 rounded border px-2 py-0.5 font-mono dark:bg-neutral-800" placeholder="Run id" value={runId} onChange={(e) => setRunId(e.target.value)} />
      <input type="number" className="w-16 rounded border px-1 dark:bg-neutral-800" value={delta} onChange={(e) => setDelta(Number(e.target.value))} />
      <input className="w-80 rounded border px-2 py-0.5 dark:bg-neutral-800" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        className="rounded border px-3 py-1"
        onClick={async () => {
          try {
            await post(`/api/admin/runs/${runId}/correct`, { delta, reason });
            setMsg("Correction recorded.");
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}
      >
        Apply correction
      </button>
      {msg && <span>{msg}</span>}
    </div>
  );
}
