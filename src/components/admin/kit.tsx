"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

export async function post<T = unknown>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

/** Button that POSTs and refreshes the server-rendered page. */
export function ActionButton({
  url,
  body,
  children,
  confirm,
  className = "",
  onDone,
  testId,
}: {
  url: string;
  body?: unknown;
  children: ReactNode;
  confirm?: string;
  className?: string;
  onDone?: (data: unknown) => void;
  testId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button
        data-testid={testId}
        disabled={busy}
        className={`rounded border border-neutral-400 bg-white px-2.5 py-1 font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800 ${className}`}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setErr(null);
          try {
            const d = await post(url, body);
            onDone?.(d);
            router.refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {err && <span className="mt-1 max-w-md text-xs text-red-600">{err}</span>}
    </span>
  );
}
