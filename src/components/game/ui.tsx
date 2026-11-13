"use client";
import type { ReactNode } from "react";

export type CellState = "correct" | "wrong" | "skipped" | "none" | "current" | "done";

const cellClass: Record<CellState, string> = {
  correct: "bg-good border-good",
  wrong: "bg-bad border-bad",
  skipped: "bg-skip border-skip",
  none: "bg-none border-none",
  current: "bg-card border-accent border-2",
  done: "bg-ink border-ink",
};

export function Cells({ cells, size = "md", label }: { cells: CellState[]; size?: "sm" | "md" | "lg"; label?: string }) {
  const dim = size === "lg" ? "h-8 w-8 rounded-md" : size === "sm" ? "h-2.5 w-2.5 rounded-[3px]" : "h-3.5 w-3.5 rounded-[4px]";
  return (
    <div className="flex gap-1.5" role="img" aria-label={label ?? cells.join(", ")}>
      {cells.map((c, i) => (
        <span key={i} className={`${dim} border ${cellClass[c]} transition-colors`} />
      ))}
    </div>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`font-display font-semibold tracking-tight text-ink ${small ? "text-xl" : "text-4xl sm:text-5xl"}`}>
      Math<span className="text-accent">dle</span>
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
  type = "button",
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  "data-testid"?: string;
}) {
  const styles = {
    primary: "bg-accent text-accent-ink hover:brightness-105 shadow-[0_2px_0_rgba(0,0,0,0.15)]",
    outline: "border border-rule bg-card text-ink hover:bg-paper-2",
    ghost: "text-ink-2 hover:text-ink hover:bg-paper-2",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-semibold transition disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function formatDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export function formatDuration(ms: number | null) {
  if (ms == null) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}
