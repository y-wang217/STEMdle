"use client";
import { Tex } from "@/components/Tex";
import { Diagram } from "@/components/Diagram";
import type { DiagramSpecT } from "@/lib/schemas/question";
import { Icon } from "./ui";

export interface ViewOption {
  id: string;
  label: string;
  tex: string;
}

export type OptionMark = "correct" | "wrong" | "dim" | "picked" | null;

const tone: Record<string, string> = {
  correct: "border-good bg-good-soft animate-pop",
  wrong: "border-bad bg-bad-soft animate-shake",
  picked: "border-accent bg-card animate-pending",
  dim: "border-rule bg-card opacity-55",
  idle: "border-rule bg-card enabled:hover:border-ink-2 enabled:active:scale-[0.985] enabled:active:bg-paper-2",
};

const badge: Record<string, string> = {
  correct: "border-good bg-good text-white",
  wrong: "border-bad bg-bad text-white",
  picked: "border-accent bg-accent text-accent-ink",
  dim: "border-rule text-muted",
  idle: "border-rule bg-paper-2/60 text-ink-2 group-enabled:group-hover:border-ink-2",
};

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
      <Tex as="div" className="prose-math text-[1.15rem] leading-[1.6] text-ink sm:text-xl">
        {statement}
      </Tex>
      {diagram && <Diagram spec={diagram} className="mt-4 overflow-hidden rounded-2xl border border-rule bg-card/80 p-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]" />}
      <div className="mt-5 grid gap-2.5 sm:grid-cols-2 sm:gap-3" role="group" aria-label="Answer choices">
        {options.map((o) => {
          const state = marks[o.id] ?? "idle";
          return (
            <button
              key={o.id}
              type="button"
              data-testid={`option-${o.label}`}
              data-state={state}
              aria-pressed={state === "picked" || state === "correct" || state === "wrong" ? true : undefined}
              disabled={disabled}
              onClick={() => onPick?.(o.id)}
              className={`group flex min-h-16 w-full min-w-0 items-center gap-3.5 rounded-2xl border-2 px-3.5 py-3 text-left transition duration-150 ${tone[state]} disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
            >
              <span
                className={`flex h-9 w-9 flex-none items-center justify-center rounded-full border text-sm font-bold transition-colors ${badge[state]}`}
                aria-hidden
              >
                {state === "correct" ? <Icon name="check" /> : state === "wrong" ? <Icon name="cross" /> : o.label}
              </span>
              <span className="sr-only">{o.label}.</span>
              <Tex className="math-scroll flex-1 py-1 text-lg text-ink">{o.tex}</Tex>
              {(state === "correct" || state === "wrong") && <span className="sr-only">{state === "correct" ? " (correct)" : " (wrong)"}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
