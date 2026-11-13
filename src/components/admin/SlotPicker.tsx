"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./kit";

export function SlotPicker({ date, slot, options, hasCurrent }: { date: string; slot: number; options: { id: string; statement: string }[]; hasCurrent: boolean }) {
  const router = useRouter();
  const [choice, setChoice] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const run = async (questionId: string | null) => {
    setErr(null);
    try {
      await post(`/api/admin/composer/${date}`, { action: "replace", slot, questionId });
      setChoice("");
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-1">
      <button className="rounded border px-2 py-0.5" onClick={() => run(null)} data-testid={`replace-${slot}`}>
        {hasCurrent ? "Replace (auto)" : "Fill (auto)"}
      </button>
      <select className="max-w-xs rounded border px-1 py-0.5 dark:bg-neutral-800" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">choose specific… ({options.length})</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.statement.replace(/\$/g, "").slice(0, 80)}
          </option>
        ))}
      </select>
      {choice && (
        <button className="rounded border bg-neutral-900 px-2 py-0.5 text-white" onClick={() => run(choice)}>
          Use
        </button>
      )}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </span>
  );
}
