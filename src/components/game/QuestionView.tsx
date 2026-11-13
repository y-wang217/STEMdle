"use client";
import { Tex } from "@/components/Tex";
import { Diagram } from "@/components/Diagram";
import type { DiagramSpecT } from "@/lib/schemas/question";

export interface ViewOption {
  id: string;
  label: string;
  tex: string;
}

export type OptionMark = "correct" | "wrong" | "dim" | "picked" | null;

export function QuestionView({
  statement,
  diagram,
  options,
  marks = {},
  disabled,
  onPick,
}: {
  statement: string;
  diagram: DiagramSpecT | null;
  options: ViewOption[];
  marks?: Record<string, OptionMark>;
  disabled?: boolean;
  onPick?: (id: string) => void;
}) {
  return (
    <div className="animate-rise">
      <Tex as="div" className="prose-math text-[1.12rem] leading-relaxed text-ink sm:text-xl" >{statement}</Tex>
      {diagram && <Diagram spec={diagram} className="mt-4 rounded-2xl border border-rule bg-card/70 p-2" />}
      <div className="mt-5 grid gap-3 sm:grid-cols-2" role="group" aria-label="Answer choices">
        {options.map((o) => {
          const m = marks[o.id] ?? null;
          const tone =
            m === "correct"
              ? "border-good bg-good-soft animate-pop"
              : m === "wrong"
                ? "border-bad bg-bad-soft animate-pop"
                : m === "picked"
                  ? "border-accent bg-card"
                  : m === "dim"
                    ? "border-rule bg-card opacity-55"
                    : "border-rule bg-card hover:border-ink-2 active:scale-[0.99]";
          return (
            <button
              key={o.id}
              type="button"
              data-testid={`option-${o.label}`}
              disabled={disabled}
              onClick={() => onPick?.(o.id)}
              className={`group flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${tone} disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
            >
              <span
                className={`flex h-8 w-8 flex-none items-center justify-center rounded-full border text-sm font-bold ${
                  m === "correct" ? "border-good bg-good text-white" : m === "wrong" ? "border-bad bg-bad text-white" : "border-rule text-ink-2"
                }`}
                aria-hidden
              >
                {o.label}
              </span>
              <Tex className="text-lg text-ink">{o.tex}</Tex>
            </button>
          );
        })}
      </div>
    </div>
  );
}
