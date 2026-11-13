"use client";
import { useState } from "react";
import { Tex } from "@/components/Tex";
import { QuestionView, type OptionMark } from "./QuestionView";
import { Button, Cells, formatDuration, type CellState } from "./ui";
import type { DiagramSpecT } from "@/lib/schemas/question";

interface ResultOption {
  id: string;
  label: string;
  tex: string;
  is_correct: boolean;
  misconception: string;
  rationale: string;
}
interface ResultQuestion {
  slot: number;
  statement: string;
  diagram: DiagramSpecT | null;
  solution: string;
  key_insight: string;
  voided: boolean;
  options: ResultOption[];
  yourAnswer: { optionId: string | null; correct: boolean; skipped: boolean } | null;
}
interface LbRow {
  rank: number;
  nickname: string;
  score: number;
  elapsedMs: number | null;
  isYou: boolean;
}
export interface ResultsData {
  run: { status: string; score: number; elapsedMs: number | null; speedEligible: boolean | null };
  challenge: { number: number; date: string };
  player: { nickname: string };
  questions: ResultQuestion[];
  pattern: string;
  shareText: string;
  leaderboard: { total: number; top: LbRow[]; you: LbRow | null };
}

const verdict: Record<string, string> = {
  cleared: "Perfect run. All eight.",
  failed: "Run over.",
  skipped: "Run ended by skip.",
};

export function Results({ data }: { data: ResultsData }) {
  const [tab, setTab] = useState<"solutions" | "leaderboard">("solutions");
  const [copied, setCopied] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [nickname, setNickname] = useState(data.player.nickname);
  const [editing, setEditing] = useState(false);
  const [nickError, setNickError] = useState<string | null>(null);

  const cells: CellState[] = data.questions.map((q) =>
    !q.yourAnswer ? "none" : q.yourAnswer.skipped ? "skipped" : q.yourAnswer.correct ? "correct" : "wrong",
  );

  const share = async () => {
    void fetch("/api/game/share", { method: "POST" });
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        await navigator.share({ text: data.shareText });
        return;
      }
    } catch {
      /* fall back to clipboard */
    }
    try {
      await navigator.clipboard.writeText(data.shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy your result:", data.shareText);
    }
  };

  const saveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/player/nickname", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname }) });
    const body = await res.json();
    if (!res.ok) return setNickError(body.error ?? "could not save");
    setNickname(body.nickname);
    setNickError(null);
    setEditing(false);
  };

  const you = data.leaderboard.you;

  return (
    <main className="mt-6 animate-rise" data-testid="results">
      <section className="rounded-3xl border border-rule bg-card p-6 text-center shadow-[0_1px_0_rgba(0,0,0,0.04)]">
        <p className="text-sm font-medium uppercase tracking-wider text-muted">{verdict[data.run.status] ?? "Finished"}</p>
        <p className="mt-2 font-display text-6xl font-semibold text-ink" data-testid="score">
          {data.run.score}
          <span className="text-3xl text-muted">/8</span>
        </p>
        <div className="mt-4 flex justify-center">
          <Cells cells={cells} size="lg" label={`Result pattern ${data.pattern}`} />
        </div>
        {you && (
          <p className="mt-4 text-ink-2" data-testid="rank">
            Ranked <strong className="text-ink">#{you.rank}</strong> of {data.leaderboard.total} today
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={share} data-testid="share">
            {copied ? "Copied!" : "Share result"}
          </Button>
          <Button variant="outline" onClick={() => setShowStats((s) => !s)}>
            {showStats ? "Hide stats" : "Stats"}
          </Button>
        </div>
        {showStats && (
          <dl className="mx-auto mt-4 grid max-w-xs grid-cols-2 gap-y-1 text-left text-sm" data-testid="stats">
            <dt className="text-muted">Completion time</dt>
            <dd className="text-right text-ink">{formatDuration(data.run.elapsedMs)}</dd>
            <dt className="text-muted">Speed ranking</dt>
            <dd className="text-right text-ink">{data.run.speedEligible ? "eligible" : "over 30 min — score only"}</dd>
          </dl>
        )}
        <div className="mt-4 text-sm text-muted">
          {editing ? (
            <form onSubmit={saveNickname} className="flex items-center justify-center gap-2">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="w-44 rounded-lg border border-rule bg-paper px-2 py-1 text-ink"
                aria-label="Nickname"
                autoFocus
              />
              <button className="font-semibold text-accent" type="submit">
                Save
              </button>
            </form>
          ) : (
            <button onClick={() => setEditing(true)} className="underline decoration-dotted underline-offset-4">
              Playing as {nickname} · edit
            </button>
          )}
          {nickError && <p className="mt-1 text-bad">{nickError}</p>}
        </div>
      </section>

      <div className="mt-6 flex gap-1 rounded-xl bg-paper-2 p-1" role="tablist">
        {(["solutions", "leaderboard"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition ${tab === t ? "bg-card text-ink shadow-sm" : "text-ink-2"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "solutions" ? (
        <div className="mt-4 space-y-4">
          {data.questions.map((q) => (
            <SolutionCard key={q.slot} q={q} />
          ))}
        </div>
      ) : (
        <Leaderboard rows={data.leaderboard.top} you={you} total={data.leaderboard.total} />
      )}
    </main>
  );
}

function SolutionCard({ q }: { q: ResultQuestion }) {
  const reached = Boolean(q.yourAnswer);
  const [open, setOpen] = useState(false);
  const [practicePick, setPracticePick] = useState<string | null>(null);
  const correct = q.options.find((o) => o.is_correct)!;

  const status = !q.yourAnswer ? "Not reached" : q.yourAnswer.skipped ? "Skipped" : q.yourAnswer.correct ? "Correct" : "Missed";
  const statusTone = !q.yourAnswer ? "text-muted" : q.yourAnswer.skipped ? "text-skip" : q.yourAnswer.correct ? "text-good" : "text-bad";

  // Practice mode for questions the player didn't answer: unranked, local only.
  const practising = !reached || q.yourAnswer?.skipped;
  const revealed = !practising || practicePick !== null || open;
  const marks: Record<string, OptionMark> = {};
  if (revealed) {
    for (const o of q.options) {
      if (o.is_correct) marks[o.id] = "correct";
      else if (o.id === q.yourAnswer?.optionId || o.id === practicePick) marks[o.id] = "wrong";
      else marks[o.id] = "dim";
    }
  }

  return (
    <article className="rounded-2xl border border-rule bg-card p-4 sm:p-5" data-testid={`solution-${q.slot}`}>
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-display text-base font-semibold text-ink">Question {q.slot}</span>
        <span className={`font-semibold ${statusTone}`}>
          {status}
          {practising && <span className="ml-2 rounded-full bg-paper-2 px-2 py-0.5 text-xs font-medium text-ink-2">Practice · unranked</span>}
        </span>
      </div>
      {q.voided && <p className="mb-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-ink">This question was withdrawn by the editors and counts as correct for everyone.</p>}
      {practising && !revealed ? (
        <>
          <QuestionView statement={q.statement} diagram={q.diagram} options={q.options} onPick={(id) => setPracticePick(id)} />
          <button className="mt-3 text-sm text-ink-2 underline underline-offset-4" onClick={() => setOpen(true)}>
            Just show me the answer
          </button>
        </>
      ) : (
        <>
          <QuestionView statement={q.statement} diagram={q.diagram} options={q.options} marks={marks} disabled />
          {practicePick && (
            <p className={`mt-3 text-sm font-semibold ${practicePick === correct.id ? "text-good" : "text-bad"}`}>
              Practice: {practicePick === correct.id ? "correct!" : `not quite — the answer is ${correct.label}.`}
            </p>
          )}
          <div className="mt-4 rounded-xl bg-paper-2/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Key insight</p>
            <Tex as="div" className="prose-math mt-1 text-ink">{q.key_insight}</Tex>
            <details className="mt-3" open={open || undefined}>
              <summary className="cursor-pointer text-sm font-semibold text-ink-2">Full solution &amp; why the traps tempt</summary>
              <Tex as="div" className="prose-math mt-2 leading-relaxed text-ink">{q.solution}</Tex>
              <ul className="mt-3 space-y-2">
                {q.options
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
        </>
      )}
    </article>
  );
}

function Leaderboard({ rows, you, total }: { rows: LbRow[]; you: LbRow | null; total: number }) {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-rule bg-card" data-testid="leaderboard">
      <table className="w-full text-sm">
        <thead className="bg-paper-2 text-left text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2 text-right">Score</th>
            <th className="px-3 py-2 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-rule ${r.isYou ? "bg-accent/10 font-semibold" : ""}`}>
              <td className="px-3 py-2 text-muted">{r.rank}</td>
              <td className="px-3 py-2 text-ink">{r.nickname}{r.isYou && " (you)"}</td>
              <td className="px-3 py-2 text-right text-ink">{r.score}/8</td>
              <td className="px-3 py-2 text-right text-ink-2">{formatDuration(r.elapsedMs)}</td>
            </tr>
          ))}
          {you && !rows.some((r) => r.isYou) && (
            <tr className="border-t-2 border-rule bg-accent/10 font-semibold">
              <td className="px-3 py-2">{you.rank}</td>
              <td className="px-3 py-2">{you.nickname} (you)</td>
              <td className="px-3 py-2 text-right">{you.score}/8</td>
              <td className="px-3 py-2 text-right">{formatDuration(you.elapsedMs)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t border-rule px-3 py-2 text-xs text-muted">
        {total} finished today. Ranked by correct answers, then time. Anonymous and casual — identities are per-browser.
      </p>
    </div>
  );
}
