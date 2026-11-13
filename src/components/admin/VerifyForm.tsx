"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "./kit";

export function VerifyForm({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <textarea className="h-16 w-full rounded border p-1 dark:bg-neutral-950" placeholder="How did you verify it? (required)" value={note} onChange={(e) => setNote(e.target.value)} />
      {err && <p className="text-red-600">{err}</p>}
      <button
        className="mt-1 rounded bg-neutral-900 px-3 py-1 text-white dark:bg-white dark:text-black"
        onClick={async () => {
          try {
            await post(`/api/admin/questions/${questionId}/verify`, { note });
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        I have verified the mathematics
      </button>
    </div>
  );
}
