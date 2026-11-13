"use client";
/** Admin preview of the exact player experience (local only, nothing recorded). */
import { useState } from "react";
import { QuestionView, type OptionMark, type ViewOption } from "@/components/game/QuestionView";
import { Cells, Wordmark, type CellState } from "@/components/game/ui";
import type { DiagramSpecT } from "@/lib/schemas/question";

interface Q {
  slot: number;
  statement: string;
  diagram: DiagramSpecT | null;
  options: ViewOption[];
  correctId: string;
}

export function PreviewPlayer({ number, date, questions }: { number: number; date: string; questions: Q[] }) {
  const [i, setI] = useState(0);
  const [marks, setMarks] = useState<Record<string, OptionMark>>({});
  const q = questions[i];
  const cells: CellState[] = Array.from({ length: 8 }, (_, k) => (k < i ? "done" : k === i ? "current" : "none"));
  return (
    <div className="-m-4 min-h-screen bg-[var(--paper)] p-4" style={{ color: "var(--ink)" }}>
      <div className="mx-auto max-w-[420px] rounded-[28px] border-8 border-neutral-800 bg-[var(--paper)] p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <Wordmark small />
          <span className="text-xs text-[var(--muted)]">
            No. {number} · {date} · PREVIEW
          </span>
        </div>
        {q ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <Cells cells={cells} />
              <span className="text-sm text-[var(--muted)]">{q.slot} / 8</span>
            </div>
            <QuestionView
              key={q.slot}
              statement={q.statement}
              diagram={q.diagram}
              options={q.options}
              marks={marks}
              onPick={(id) => setMarks({ [id]: id === q.correctId ? "correct" : "wrong", ...(id !== q.correctId ? { [q.correctId]: "correct" } : {}) })}
            />
            <div className="mt-4 flex justify-between text-sm">
              <button className="underline" disabled={i === 0} onClick={() => (setI(i - 1), setMarks({}))}>
                ← prev
              </button>
              <button className="underline" onClick={() => (setI(i + 1), setMarks({}))}>
                next →
              </button>
            </div>
          </>
        ) : (
          <p className="py-10 text-center">End of preview.</p>
        )}
      </div>
    </div>
  );
}
