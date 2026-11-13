import type { ReactNode } from "react";

export function StatusChip({ status }: { status: string }) {
  const tone: Record<string, string> = {
    approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    ready: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    reviewed: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    needs_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    validation_failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    retired: "bg-neutral-300 text-neutral-700",
    published: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    draft: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    active: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    calibrated: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    passed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone[status] ?? "bg-neutral-200 text-neutral-700"}`}>{status.replace("_", " ")}</span>;
}

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      {(title || actions) && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          <div className="ml-auto flex flex-wrap gap-2">{actions}</div>
        </div>
      )}
      {children}
    </section>
  );
}

export const th = "border-b border-neutral-300 px-2 py-1 text-left font-semibold text-neutral-600 dark:border-neutral-700 dark:text-neutral-400";
export const td = "border-b border-neutral-200 px-2 py-1 align-top dark:border-neutral-800";
