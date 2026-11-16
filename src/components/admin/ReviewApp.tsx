"use client";
/**
 * Keyboard-first calibration.
 *   ↑ too hard   ↓ too easy   X invalid   Esc clear
 *   Enter / → save & advance (no judgment ⇒ "just right")   ← previous
 *   U undo last saved judgment   N focus note
 * A judgment is persisted only when advancing. Shortcuts are ignored while typing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Tex } from "@/components/Tex";
import { Diagram } from "@/components/Diagram";
import type { DiagramSpecT } from "@/lib/schemas/question";
import { post } from "./kit";
import { LeanChip, LeanDetails, type LeanView } from "./LeanPanel";

type J = "too_easy" | "just_right" | "too_hard" | "invalid";

export interface ReviewItem {
  id: string;
  slot: number;
  bucket: string;
  status: string;
  source: string;
  template_id: string | null;
  statement: string;
  solution: string;
  key_insight: string;
  diagram: DiagramSpecT | null;
  options: { id: string; label: string; tex: string; value: string; is_correct: boolean; misconception: string; rationale: string }[];
  estimated_difficulty: number | null;
  validation: string | null;
  warnings: string[];
  judgment: J | null;
  math_verified: boolean;
  lean: LeanView | null;
}

const LABEL: Record<J, string> = { too_easy: "▼ Too easy", just_right: "● Just right", too_hard: "▲ Too hard", invalid: "✕ Invalid" };
const TONE: Record<J, string> = {
  too_easy: "bg-sky-600 text-white",
  just_right: "bg-green-600 text-white",
  too_hard: "bg-orange-600 text-white",
  invalid: "bg-red-700 text-white",
};

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function ReviewApp({ items: initial, filter }: { items: ReviewItem[]; filter: { slot: number | null; batch: string | null; all: boolean } }) {
  const [items, setItems] = useState(initial);
  const [idx, setIdx] = useState(0);
  const [pending, setPending] = useState<J | null>(initial[0]?.judgment && initial[0].judgment !== "just_right" ? initial[0].judgment : null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ id: string; judgment: J; idx: number; at: string }[]>([]);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [leanOpen, setLeanOpen] = useState(false);
  const done = idx >= items.length;
  const item = items[idx];

  const goto = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(items.length, i));
      setIdx(n);
      const j = items[n]?.judgment ?? null;
      setPending(j && j !== "just_right" ? j : null);
      setNote("");
      setError(null);
    },
    [items],
  );

  const advance = useCallback(async () => {
    if (!item || saving) return;
    const judgment: J = pending ?? "just_right";
    setSaving(true);
    setError(null);
    try {
      const r = await post<{ status: string; judgment: J | null }>(`/api/admin/questions/${item.id}/feedback`, { judgment, note: note || null });
      setItems((xs) => xs.map((x, i) => (i === idx ? { ...x, judgment, status: r.status } : x)));
      setHistory((h) => [{ id: item.id, judgment, idx, at: new Date().toLocaleTimeString() }, ...h].slice(0, 100));
      const n = idx + 1;
      setIdx(n);
      const nj = items[n]?.judgment ?? null;
      setPending(nj && nj !== "just_right" ? nj : null);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [item, saving, pending, note, idx, items]);

  const undo = useCallback(async () => {
    const last = history[0];
    if (!last || saving) return;
    setSaving(true);
    try {
      const r = await post<{ status: string }>(`/api/admin/questions/${last.id}/feedback`, { judgment: "retracted" });
      setItems((xs) => xs.map((x) => (x.id === last.id ? { ...x, judgment: null, status: r.status } : x)));
      setHistory((h) => h.slice(1));
      setIdx(last.idx);
      setPending(null);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [history, saving]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          void undo();
        }
        return;
      }
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setPending("too_hard");
          break;
        case "ArrowDown":
          e.preventDefault();
          setPending("too_easy");
          break;
        case "x":
        case "X":
          setPending("invalid");
          break;
        case "Escape":
          setPending(null);
          break;
        case "Enter":
        case "ArrowRight":
          e.preventDefault();
          void advance();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goto(idx - 1);
          break;
        case "u":
        case "U":
          void undo();
          break;
        case "l":
        case "L":
          setLeanOpen((o) => !o);
          break;
        case "n":
        case "N":
          e.preventDefault();
          noteRef.current?.focus();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, goto, idx, undo]);

  const reviewedCount = items.filter((x) => x.judgment).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-neutral-600 dark:text-neutral-400">
          <span data-testid="review-position">
            {Math.min(idx + 1, items.length)} / {items.length}
          </span>
          <span>
            {reviewedCount} judged · filter: {filter.slot ? `slot ${filter.slot}` : "all slots"}
            {filter.batch ? ` · batch ${filter.batch.slice(0, 8)}` : ""}
          </span>
          <a className="underline" href={`?${new URLSearchParams({ ...(filter.slot ? { slot: String(filter.slot) } : {}), ...(filter.batch ? { batch: filter.batch } : {}), ...(filter.all ? {} : { all: "1" }) })}`}>
            {filter.all ? "only unreviewed" : "include reviewed"}
          </a>
        </div>

        {items.length === 0 && <p className="rounded border border-dashed border-neutral-400 p-6 text-center">Nothing to review. Generate a batch from a bucket page.</p>}

        {done && items.length > 0 && (
          <div className="rounded border border-green-600 p-6 text-center" data-testid="review-done">
            <p className="text-base font-semibold">Batch reviewed.</p>
            <p className="mt-1">Your judgments are being folded into a new generator version, which becomes active automatically. The next batch uses it.</p>
            <div className="mt-3 flex justify-center gap-2">
              <button className="rounded border px-3 py-1" onClick={() => goto(items.length - 1)}>
                ← Back to last
              </button>
              {filter.slot && (
                <a className="rounded border bg-neutral-900 px-3 py-1 text-white" href={`/admin/buckets/${filter.slot}`}>
                  Open bucket {filter.slot}
                </a>
              )}
            </div>
          </div>
        )}

        {item && (
          <div className="rounded-lg border border-neutral-300 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900" data-testid="review-card" data-question-id={item.id}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-neutral-900 px-1.5 py-0.5 font-semibold text-white dark:bg-white dark:text-black">
                Slot {item.slot} · {item.bucket}
              </span>
              <span>status: {item.status}</span>
              <span>validation: {item.validation ?? "—"}</span>
              <span>source: {item.source}{item.template_id ? ` (${item.template_id})` : ""}</span>
              <span>est. difficulty {item.estimated_difficulty?.toFixed(1)}</span>
              <LeanChip lean={item.lean} onClick={() => setLeanOpen((o) => !o)} />
              <a className="underline" href={`/admin/questions/${item.id}`} target="_blank">
                details
              </a>
            </div>
            {item.validation === "needs_review" && !item.math_verified && (
              <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-amber-900">Could not be verified automatically: explicit math review required before it can be published (details page).</p>
            )}
            {item.warnings.length > 0 && <p className="mb-2 text-xs text-amber-700">⚠ {item.warnings.join(" · ")}</p>}
            <Tex as="div" className="text-[17px] leading-relaxed">{item.statement}</Tex>
            {item.diagram && <Diagram spec={item.diagram} admin className="mt-3 max-w-md rounded border border-neutral-200 dark:border-neutral-700" />}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {item.options.map((o) => (
                <div key={o.id} className={`rounded border-2 px-3 py-2 ${o.is_correct ? "border-green-600 bg-green-50 dark:bg-green-950/40" : "border-neutral-200 dark:border-neutral-700"}`}>
                  <div className="flex items-center gap-2">
                    <b>{o.label}.</b> <Tex className="text-base">{o.tex}</Tex>
                    {o.is_correct && <span className="ml-auto text-xs font-semibold text-green-700">correct</span>}
                  </div>
                  {!o.is_correct && <div className="mt-1 text-xs text-neutral-500">trap: {o.misconception}</div>}
                </div>
              ))}
            </div>
            <div className="mt-3 rounded bg-neutral-50 p-3 dark:bg-neutral-950">
              <div className="text-xs font-semibold uppercase text-neutral-500">Key insight</div>
              <Tex as="div">{item.key_insight}</Tex>
              <div className="mt-2 text-xs font-semibold uppercase text-neutral-500">Solution</div>
              <Tex as="div" className="leading-relaxed">{item.solution}</Tex>
            </div>
            {leanOpen && (
              <div className="mt-3 rounded border border-neutral-200 p-3 dark:border-neutral-700">
                <LeanDetails lean={item.lean} questionId={item.id} />
              </div>
            )}
          </div>
        )}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-14 lg:self-start">
        <div className="rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-xs uppercase text-neutral-500">Judgment (saved on advance)</div>
          <div data-testid="pending-judgment" className={`mt-1 rounded px-2 py-2 text-center text-base font-semibold ${TONE[pending ?? "just_right"]}`}>
            {pending ? LABEL[pending] : `${LABEL.just_right} (default)`}
          </div>
          {item?.judgment && <div className="mt-1 text-xs text-neutral-500">saved: {LABEL[item.judgment]}</div>}
          <textarea
            ref={noteRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (N) — saved with the judgment"
            className="mt-2 h-16 w-full rounded border border-neutral-300 bg-transparent p-1 text-xs dark:border-neutral-700"
            data-testid="note"
          />
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          {/* touch controls */}
          <div className="mt-2 grid grid-cols-2 gap-1">
            <button className="rounded border px-2 py-2" onClick={() => setPending("too_easy")}>▼ Too easy</button>
            <button className="rounded border px-2 py-2" onClick={() => setPending("too_hard")}>▲ Too hard</button>
            <button className="rounded border px-2 py-2" onClick={() => setPending("invalid")}>✕ Invalid</button>
            <button className="rounded border px-2 py-2" onClick={() => setPending(null)}>Clear</button>
            <button className="rounded border px-2 py-2" onClick={() => goto(idx - 1)}>← Prev</button>
            <button className="rounded border bg-neutral-900 px-2 py-2 text-white dark:bg-white dark:text-black" disabled={saving || done} onClick={() => void advance()} data-testid="next">
              Save & next →
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-2 text-[11px] text-neutral-500">
            <dt className="font-mono">↑</dt><dd>too hard</dd>
            <dt className="font-mono">↓</dt><dd>too easy</dd>
            <dt className="font-mono">X</dt><dd>invalid / bad</dd>
            <dt className="font-mono">Esc</dt><dd>clear judgment</dd>
            <dt className="font-mono">Enter →</dt><dd>save &amp; next (default just right)</dd>
            <dt className="font-mono">←</dt><dd>previous</dd>
            <dt className="font-mono">U</dt><dd>undo last save</dd>
            <dt className="font-mono">N</dt><dd>write a note</dd>
            <dt className="font-mono">L</dt><dd>show/hide Lean verification</dd>
          </dl>
        </div>
        <div className="rounded-lg border border-neutral-300 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-xs uppercase text-neutral-500">History (this session)</div>
          <ol className="mt-1 max-h-60 space-y-0.5 overflow-auto text-xs" data-testid="history">
            {history.map((h, i) => (
              <li key={i}>
                <button className="underline" onClick={() => goto(h.idx)}>
                  #{h.idx + 1}
                </button>{" "}
                {LABEL[h.judgment]} <span className="text-neutral-400">{h.at}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
