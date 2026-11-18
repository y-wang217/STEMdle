"use client";
/**
 * Practice mode: unlimited, unranked questions by topic (slot). The server
 * picks each question and reveals the answer and solution only after a pick.
 */
import Link from "next/link";
import { useState } from "react";
import { Tex } from "@/components/Tex";
import { QuestionView, type OptionMark } from "@/components/game/QuestionView";
import { Button, Wordmark } from "@/components/game/ui";
import type { DiagramSpecT } from "@/lib/schemas/question";

interface Topic {
  slot: number;
  name: string;
  category: string;
}
interface PracticeQuestion {
  attemptId: string;
  slot: number;
  statement: string;
  diagram: DiagramSpecT | null;
  options: { id: string; label: string; tex: string }[];
}
interface Reveal {
  correct: boolean;
  correctOptionId: string;
  solution: string;
  keyInsight: string;
  options: { id: string; label: string; tex: string; is_correct: boolean; misconception: string; rationale: string }[];
  stats: { answered: number; correct: number };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? `request failed (${res.status})`), { code: data.code, status: res.status });
  return data as T;
}

const ANY = "any";

export function Practice({ topics, defaultSlot }: { topics: Topic[]; defaultSlot: number }) {
  const [choice, setChoice] = useState<string>(String(defaultSlot));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<PracticeQuestion | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [stats, setStats] = useState({ answered: 0, correct: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topicName = (slot: number) => topics.find((t) => t.slot === slot)?.name ?? `Slot ${slot}`;
  const chosenLabel = choice === ANY ? "any topic" : topicName(Number(choice));

  const show = (q: PracticeQuestion | null) => {
    setQuestion(q);
    setExhausted(!q);
    setPicked(null);
    setReveal(null);
    window.scrollTo({ top: 0 });
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    run(async () => {
      const r = await post<{ session: { id: string }; question: PracticeQuestion | null }>("/api/practice/start", {
        slot: choice === ANY ? null : Number(choice),
      });
      setSessionId(r.session.id);
      setStats({ answered: 0, correct: 0 });
      show(r.question);
    });

  const pick = (optionId: string) => {
    if (!question || !sessionId || reveal || busy) return;
    setPicked(optionId);
    return run(async () => {
      const r = await post<Reveal>("/api/practice/answer", { sessionId, attemptId: question.attemptId, optionId });
      setReveal(r);
      setStats(r.stats);
      // The verdict sits below the options on a phone: bring it into view.
      requestAnimationFrame(() => document.querySelector("[data-testid=practice-verdict]")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }).then(() => undefined);
  };

  const next = () =>
    run(async () => {
      const r = await post<{ question: PracticeQuestion | null }>("/api/practice/next", { sessionId });
      show(r.question);
    });

  const changeTopic = () => {
    setSessionId(null);
    setQuestion(null);
    setExhausted(false);
    setReveal(null);
  };

  const marks: Record<string, OptionMark> = {};
  if (question && reveal) {
    for (const o of question.options) marks[o.id] = o.id === reveal.correctOptionId ? "correct" : o.id === picked ? "wrong" : "dim";
  } else if (picked) {
    marks[picked] = "picked";
  }
  const correctLabel = reveal?.options.find((o) => o.is_correct)?.label;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-5 sm:px-6" data-testid="practice">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="no-underline" aria-label="Mathdle home">
          <Wordmark small />
        </Link>
        <span className="rounded-full bg-paper-2 px-3 py-1 text-xs font-medium text-ink-2">Practice · unranked</span>
      </header>

      {!sessionId && (
        <main className="flex flex-1 flex-col items-center justify-center py-10 text-center animate-rise">
          <h1 className="font-display text-3xl font-semibold text-ink">Practice</h1>
          <p className="mt-3 max-w-sm text-ink-2">
            Unlimited questions from the checked question bank, with full solutions. Nothing here counts toward today&apos;s score.
          </p>
          <label className="mt-8 w-full max-w-xs text-left text-sm font-semibold text-ink-2" htmlFor="practice-topic">
            Topic
          </label>
          <select
            id="practice-topic"
            data-testid="topic"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="mt-1 min-h-11 w-full max-w-xs rounded-xl border border-rule bg-card px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            {topics.map((t) => (
              <option key={t.slot} value={String(t.slot)}>
                {t.slot}. {t.name}
              </option>
            ))}
            <option value={ANY}>Any topic</option>
          </select>
          <Button className="mt-6 w-full max-w-xs py-4 text-lg" onClick={start} disabled={busy} data-testid="practice-start">
            Start practising
          </Button>
          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
          <Link href="/" className="mt-6 text-sm text-ink-2 underline underline-offset-4">
            Back to today&apos;s challenge
          </Link>
        </main>
      )}

      {sessionId && (
        <div className="mt-5 flex items-center justify-between gap-3 text-sm">
          <button type="button" onClick={changeTopic} className="min-h-11 truncate text-left text-ink-2 underline underline-offset-4" data-testid="change-topic">
            {chosenLabel} · change
          </button>
          <span className="flex-none font-medium text-muted" data-testid="practice-stats">
            {stats.correct} / {stats.answered} correct
          </span>
        </div>
      )}

      {sessionId && question && (
        <main className="mt-4 flex-1" data-testid="practice-question">
          <QuestionView key={question.attemptId} statement={question.statement} diagram={question.diagram} options={question.options} marks={marks} disabled={busy || Boolean(reveal)} onPick={pick} />
          {error && <p className="mt-4 text-sm text-bad">{error}</p>}
          {reveal && (
            <section className="mt-5 animate-rise" data-testid="practice-reveal">
              <p className={`font-semibold ${reveal.correct ? "text-good" : "text-bad"}`} data-testid="practice-verdict">
                {reveal.correct ? "Correct!" : `Not quite — the answer is ${correctLabel}.`}
              </p>
              <div className="mt-3 rounded-xl bg-paper-2/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">Key insight</p>
                <Tex as="div" className="prose-math mt-1 text-ink">{reveal.keyInsight}</Tex>
                <details className="mt-3" open={!reveal.correct || undefined}>
                  <summary className="cursor-pointer text-sm font-semibold text-ink-2">Full solution &amp; why the traps tempt</summary>
                  <div data-testid="practice-solution">
                    <Tex as="div" className="prose-math mt-2 leading-relaxed text-ink">{reveal.solution}</Tex>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {reveal.options
                      .filter((o) => !o.is_correct)
                      .map((o) => (
                        <li key={o.id} className="text-sm text-ink-2">
                          <span className="font-semibold text-ink">
                            {o.label}. <Tex>{o.tex}</Tex>
                          </span>{" "}
                          — {o.misconception}. <Tex>{o.rationale}</Tex>
                        </li>
                      ))}
                  </ul>
                </details>
              </div>
              <Button className="mt-5 w-full py-3" onClick={next} disabled={busy} data-testid="practice-next">
                Next question
              </Button>
            </section>
          )}
        </main>
      )}

      {sessionId && exhausted && (
        <main className="mt-10 flex-1 text-center animate-rise" data-testid="practice-exhausted">
          <p className="font-semibold text-ink">You&apos;ve worked through every available question in {chosenLabel}.</p>
          <p className="mt-1 text-sm text-ink-2">New questions are added as the editors approve them. Try another topic meanwhile.</p>
          <Button className="mt-6" variant="outline" onClick={changeTopic} data-testid="practice-change">
            Choose another topic
          </Button>
        </main>
      )}

      <footer className="mt-auto pt-10 text-center text-xs text-muted">
        Practice is unranked · <span className="opacity-80">made by AP Academy</span>
      </footer>
    </div>
  );
}
