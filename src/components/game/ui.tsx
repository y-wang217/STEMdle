"use client";
import type { ReactNode } from "react";

export type CellState = "correct" | "wrong" | "skipped" | "none" | "current" | "done";

/**
 * The fixed slot ladder, mirroring the bucket characters in
 * src/lib/buckets/defaults.ts. Presentation only.
 */
export const DIFFICULTY = ["Easy", "Easy", "Easy", "Medium", "Medium", "Hard", "Very hard", "Expert"] as const;
export const difficultyOf = (slot: number) => DIFFICULTY[Math.min(Math.max(slot, 1), 8) - 1];
const difficultyTone: Record<string, string> = {
  Easy: "bg-good-soft text-good",
  Medium: "bg-warm-soft text-warm",
  Hard: "bg-accent-soft text-accent",
  "Very hard": "bg-accent-soft text-accent",
  Expert: "bg-ink text-paper",
};

export function DifficultyChip({ slot, className = "" }: { slot: number; className?: string }) {
  const d = difficultyOf(slot);
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${difficultyTone[d]} ${className}`} data-testid="difficulty">
      {d}
    </span>
  );
}

const cellClass: Record<CellState, string> = {
  correct: "bg-good border-good",
  wrong: "bg-bad border-bad",
  skipped: "bg-skip border-skip",
  none: "bg-none border-none",
  current: "bg-card border-accent border-2",
  done: "bg-ink border-ink",
};

export function Cells({ cells, size = "md", label }: { cells: CellState[]; size?: "sm" | "md" | "lg"; label?: string }) {
  const dim = size === "lg" ? "h-7 w-7 rounded-md sm:h-8 sm:w-8" : size === "sm" ? "h-2.5 w-2.5 rounded-[3px]" : "h-3.5 w-3.5 rounded-[4px]";
  return (
    <div className="flex gap-1.5" role="img" aria-label={label ?? cells.join(", ")}>
      {cells.map((c, i) => (
        <span key={i} className={`${dim} border ${cellClass[c]} transition-colors`} />
      ))}
    </div>
  );
}

const barClass: Record<CellState, string> = {
  correct: "bg-good",
  wrong: "bg-bad",
  skipped: "bg-skip",
  none: "bg-none",
  current: "bg-accent ladder-current",
  done: "bg-ink",
};

/** Eight bars rising in height: the day's difficulty ramp, coloured by progress. */
const previewClass: Record<string, string> = {
  Easy: "bg-good",
  Medium: "bg-warm",
  Hard: "bg-accent",
  "Very hard": "bg-accent",
  Expert: "bg-ink",
};

export function Ladder({ cells = [], preview = false, size = "md", label }: { cells?: CellState[]; preview?: boolean; size?: "md" | "lg"; label?: string }) {
  const max = size === "lg" ? 56 : 22;
  const min = size === "lg" ? 18 : 8;
  const w = size === "lg" ? "w-6 sm:w-7" : "w-3.5";
  return (
    <div className="flex items-end gap-1.5" role="img" aria-label={label ?? cells.join(", ")} data-testid="ladder" style={{ height: max }}>
      {(preview ? DIFFICULTY.map(() => "none" as CellState) : cells).map((c, i) => (
        <span
          key={i}
          data-bar={preview ? "preview" : c}
          className={`${w} rounded-[4px] transition-colors duration-300 ${preview ? previewClass[DIFFICULTY[i]] : barClass[c]}`}
          style={{ height: Math.round(min + ((max - min) * i) / 7) }}
        />
      ))}
    </div>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <span className={`font-display font-semibold tracking-tight text-ink ${small ? "text-xl" : "text-5xl sm:text-6xl"}`}>
      Math<span className="text-accent">dle</span>
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  disabled,
  className = "",
  type = "button",
  ...rest
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "outline";
  size?: "md" | "lg";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  "data-testid"?: string;
}) {
  const styles = {
    primary: "bg-accent text-accent-ink shadow-[0_3px_0_var(--accent-deep)] hover:brightness-105 active:translate-y-[2px] active:shadow-[0_1px_0_var(--accent-deep)]",
    outline: "border border-rule bg-card text-ink hover:bg-paper-2 active:scale-[0.98]",
    ghost: "text-ink-2 hover:text-ink hover:bg-paper-2 active:scale-[0.98]",
  }[variant];
  const sizing = size === "lg" ? "min-h-14 px-6 text-lg rounded-2xl" : "min-h-11 px-5 py-2.5 rounded-xl";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition duration-150 disabled:opacity-50 disabled:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${sizing} ${styles} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

const iconPaths = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  cross: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  arrow: "M5 12h13M13 6l6 6-6 6",
  share: "M12 4v11M7.5 8.5L12 4l4.5 4.5M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5",
} as const;

export function Icon({ name, className = "h-4 w-4" }: { name: keyof typeof iconPaths; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={iconPaths[name]} />
    </svg>
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
