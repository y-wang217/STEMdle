"use client";
/**
 * The daily ritual: landing → eight questions → results.
 * No timer is shown during play; the server records timing.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { QuestionView, type OptionMark, type ViewOption } from "./QuestionView";
import { Results, type ResultsData } from "./Results";
import { Button, DifficultyChip, Icon, Ladder, Wordmark, formatDate, type CellState } from "./ui";
import type { DiagramSpecT } from "@/lib/schemas/question";

interface PublicQuestion {
  slot: number;
  statement: string;
  diagram: DiagramSpecT | null;
  options: ViewOption[];
}
interface RunInfo {
  status: string;
  currentSlot: number;
  score: number;
  finished: boolean;
}
export interface TodayInfo {
  date: string;
  number: number;
  available: boolean;
  player: { nickname: string } | null;
  run: RunInfo | null;
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `request failed (${res.status})`), { code: data.code, status: res.status });
  return data as T;
}

type Phase = "landing" | "playing" | "results" | "error";

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const RULES = [
  { k: "8", text: "questions, easy to expert" },
  { k: "1", text: "wrong answer ends the run" },
  { k: "∞", text: "no clock — take your time" },
];

export function Game({ initial }: { initial: TodayInfo }) {
  const [today] = useState(initial);
  const [phase, setPhase] = useState<Phase>(initial.run?.finished ? "results" : "landing");
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [run, setRun] = useState<RunInfo | null>(initial.run);
  const [marks, setMarks] = useState<Record<string, OptionMark>>({});
  const [busy, setBusy] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const [results, setResults] = useState<ResultsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");

  const loadResults = useCallback(async () => {
    try {
      const r = await api<ResultsData>("/api/game/results");
      setResults(r);
      setPhase("results");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, []);

  useEffect(() => {
    if (!initial.run?.finished) return;
    let live = true;
    api<ResultsData>("/api/game/results").then(
      (r) => live && setResults(r),
      (e: Error) => {
        if (!live) return;
        setError(e.message);
        setPhase("error");
      },
    );
    return () => {
      live = false;
    };
  }, [initial.run?.finished]);

  const start = async () => {
    setBusy(true);
    try {
      const s = await api<{ run: RunInfo; question: PublicQuestion | null }>("/api/game/start", {});
      setRun(s.run);
      if (s.run.finished) return void (await loadResults());
      setQuestion(s.question);
      setMarks({});
      setPhase("playing");
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (optionId: string) => {
    if (!question || busy) return;
    setBusy(true);
    setMarks({ [optionId]: "picked" });
    setFeedback("");
    try {
      const r = await api<{ correct: boolean; run: RunInfo; question: PublicQuestion | null }>("/api/game/answer", { slot: question.slot, optionId });
      setMarks({ [optionId]: r.correct ? "correct" : "wrong" });
      setFeedback(r.correct ? (r.run.finished ? "Correct — all eight!" : "Correct") : "Not quite — run over");
      setRun(r.run);
      await new Promise((res) => setTimeout(res, r.correct ? 550 : 900));
      if (r.run.finished) {
        await loadResults();
      } else {
        setQuestion(r.question);
        setMarks({});
        setFeedback("");
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "finished" || code === "wrong_slot") {
        // Out of sync (e.g. another tab): resync from the server.
        const s = await api<{ run: RunInfo | null; question: PublicQuestion | null }>("/api/game/state").catch(() => null);
        if (s?.run?.finished) return void (await loadResults());
        if (s?.question) {
          setQuestion(s.question);
          setMarks({});
        }
      } else {
        setError((e as Error).message);
        setMarks({});
      }
    } finally {
      setBusy(false);
    }
  };

  const skip = async () => {
    if (!question) return;
    setBusy(true);
    try {
      await api("/api/game/skip", { slot: question.slot });
      setConfirmSkip(false);
      await loadResults();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Ladder follows the question on screen, so it never runs ahead of the feedback.
  const slotNow = question?.slot ?? run?.currentSlot ?? 1;
  const feedbackTone = feedback.startsWith("Correct") ? "text-good" : "text-bad";
  const nowState: CellState = !feedback ? "current" : feedback.startsWith("Correct") ? "correct" : "wrong";
  const playCells: CellState[] = Array.from({ length: 8 }, (_, i) => (i + 1 < slotNow ? "done" : i + 1 === slotNow ? nowState : "none"));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="no-underline" aria-label="Mathdle home">
          <Wordmark small />
        </Link>
        <div className="text-right leading-tight">
          <div className="tabular text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-accent">No. {today.number}</div>
          <div className="text-xs text-muted">{formatDate(today.date)}</div>
        </div>
      </header>

      {phase === "landing" && (
        <main className="flex flex-1 flex-col items-center justify-center py-8 text-center">
          <div className="animate-rise">
            <Ladder preview size="lg" label="Eight questions, rising from easy to expert" />
          </div>
          <h1 className="mt-7 animate-rise">
            <Wordmark />
          </h1>
          <p className="mt-2 font-display text-base italic text-ink-2">Challenge No. {today.number} · {formatDate(today.date).split(",")[0]}</p>
          <ul className="mt-7 w-full max-w-xs space-y-2 text-left" aria-label="How it works">
            {RULES.map((r) => (
              <li key={r.k + r.text} className="flex items-center gap-3 rounded-xl border border-rule bg-card/80 px-3.5 py-2.5 text-[0.95rem] text-ink-2">
                <span className="tabular flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-paper-2 font-display text-lg font-semibold text-ink">{r.k}</span>
                {r.text}
              </li>
            ))}
          </ul>
          {today.available ? (
            <Button size="lg" className="mt-8 w-full max-w-xs" onClick={start} disabled={busy} data-testid="play">
              {run && !run.finished ? `Continue · Q${run.currentSlot}` : "Play today’s eight"}
              <Icon name="arrow" className="h-5 w-5" />
            </Button>
          ) : (
            <div className="mt-8 max-w-sm rounded-2xl border border-rule bg-card p-5 text-ink-2" data-testid="not-ready">
              <p className="font-semibold text-ink">Today&apos;s challenge isn&apos;t ready yet.</p>
              <p className="mt-1 text-sm">The editors are still checking every answer. Please come back a little later.</p>
            </div>
          )}
          {today.player && <p className="mt-5 text-sm text-muted">Playing as <span className="font-medium text-ink-2">{today.player.nickname}</span></p>}
        </main>
      )}

      {phase === "playing" && question && (
        <main className="mt-6 flex-1" data-testid="question">
          <div className="mb-5 flex items-end justify-between gap-3 border-b border-rule pb-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-xl font-semibold text-ink">Question {question.slot}</span>
                <DifficultyChip slot={question.slot} />
              </div>
              <span className="tabular mt-0.5 block text-sm font-medium text-muted" data-testid="progress">
                {question.slot} / 8
              </span>
            </div>
            <Ladder cells={playCells} label={`Question ${question.slot} of 8`} />
          </div>
          <QuestionView key={question.slot} statement={question.statement} diagram={question.diagram} options={question.options} marks={marks} disabled={busy} onPick={pick} />
          <p className={`mt-4 min-h-6 text-center text-sm font-semibold ${feedbackTone}`} aria-live="polite" data-testid="feedback">
            {feedback}
          </p>
          {error && <p className="mt-2 text-center text-sm text-bad">{error}</p>}
          <div className="mt-4 flex justify-center">
            {!confirmSkip ? (
              <Button variant="ghost" onClick={() => setConfirmSkip(true)} disabled={busy} data-testid="skip" className="text-sm">
                Skip this one
              </Button>
            ) : (
              <div className="w-full rounded-2xl border border-rule bg-card p-4 text-center animate-rise" data-testid="skip-confirm">
                <p className="text-sm text-ink-2">
                  Skipping <strong className="text-ink">ends your scored run</strong> at {run?.score ?? 0}/8. You can still see every solution and practise the rest unranked.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button variant="outline" onClick={() => setConfirmSkip(false)}>
                    Keep playing
                  </Button>
                  <Button onClick={skip} disabled={busy} data-testid="skip-confirm-button">
                    Skip &amp; end run
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      )}

      {phase === "results" && !results && (
        <p className="mt-16 text-center text-muted" aria-live="polite">
          Loading results…
        </p>
      )}
      {phase === "results" && results && <Results data={results} />}

      {phase === "error" && (
        <main className="mt-16 text-center">
          <p className="text-ink-2">{error ?? "Something went wrong."}</p>
          <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </main>
      )}

      <footer className="mt-auto pt-10 text-center text-xs leading-relaxed text-muted">
        A new Mathdle every day at midnight Eastern
        <br />
        <span className="opacity-80">made by AP Academy</span>
      </footer>
    </div>
  );
}
