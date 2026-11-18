"use client";
import { useState } from "react";
import { Tex } from "@/components/Tex";
import { QuestionView, type OptionMark } from "./QuestionView";
import { Button, Cells, DifficultyChip, Icon, formatDuration, type CellState } from "./ui";
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

function headline(status: string, score: number) {
  if (status === "cleared" || score >= 8) return "Flawless.";
  if (score >= 6) return "Deep run.";
  if (score >= 4) return "Solid climb.";
  if (score >= 2) return "Warmed up.";
  return "Tomorrow’s yours.";
}

/** Split the server's share text into its first line and the emoji pattern line, for the preview card. */
function shareParts(text: string) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const pattern = lines.find((l) => /[🟩🟥⬛🟨⬜]/u.test(l)) ?? "";
  return { title: lines[0] ?? text, pattern, rest: lines.filter((l) => l !== lines[0] && l !== pattern) };
}

export function Results({ data }: { data: ResultsData }) {
  const [tab, setTab] = useState<"solutions" | "leaderboard">("solutions");
  const [copied, setCopied] = useState(false);
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

  const parts = shareParts(data.shareText);

  return (
    <main className="mt-6 animate-rise" data-testid="results">
      <section className="rounded-3xl border border-rule bg-card px-5 pb-5 pt-6 text-center shadow-[0_1px_0_rgba(0,0,0,0.04),0_12px_32px_-18px_rgba(26,31,43,0.25)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{verdict[data.run.status] ?? "Finished"}</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">{headline(data.run.status, data.run.score)}</p>
        <p className="tabular mt-1 font-display text-7xl font-semibold leading-none text-ink animate-count" data-testid="score">
          {data.run.score}
          <span className="text-3xl text-muted">/8</span>
        </p>
        <div className="mt-5 flex justify-center">
          <Cells cells={cells} size="lg" label={`Result pattern ${data.pattern}`} />
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-2 text-left">
          <div className="rounded-2xl bg-paper-2/70 px-3.5 py-2.5">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted">Rank today</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-ink" data-testid="rank">
              {you ? (
                <>
                  #{you.rank} <span className="text-sm font-normal text-muted">of {data.leaderboard.total}</span>
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div className="rounded-2xl bg-paper-2/70 px-3.5 py-2.5">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted">Time</dt>
            <dd className="tabular mt-0.5 text-lg font-semibold text-ink" data-testid="time">
              {formatDuration(data.run.elapsedMs)}
            </dd>
            {data.run.speedEligible === false && <dd className="text-[0.7rem] leading-tight text-muted">over 30 min — ranked on score only</dd>}
          </div>
        </dl>

        <figure className="mt-5 rounded-2xl border border-dashed border-rule bg-paper/60 px-4 py-3.5" data-testid="share-card" aria-label="Share preview">
          <figcaption className="text-xs font-semibold uppercase tracking-wider text-muted">Your share card</figcaption>
          <p className="tabular mt-1.5 font-semibold text-ink">{parts.title}</p>
          {parts.pattern && <p className="mt-1 text-xl tracking-[0.12em]">{parts.pattern}</p>}
          {parts.rest.map((l) => (
            <p key={l} className="mt-0.5 truncate text-xs text-muted">
              {l}
            </p>
          ))}
        </figure>
        <Button size="lg" className="mt-3 w-full" onClick={share} data-testid="share">
          {copied ? (
            <>
              <Icon name="check" className="h-5 w-5" /> Copied — paste it anywhere
            </>
          ) : (
            <>
              <Icon name="share" className="h-5 w-5" /> Share result
            </>
          )}
        </Button>

        <div className="mt-3 text-sm text-muted">
          {editing ? (
            <form onSubmit={saveNickname} className="flex items-center justify-center gap-2">
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="min-h-11 w-44 rounded-xl border border-rule bg-paper px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-accent"
                aria-label="Nickname"
                autoFocus
              />
              <Button type="submit" variant="outline">
                Save
              </Button>
            </form>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="inline-flex min-h-11 items-center rounded-xl px-3 underline decoration-dotted underline-offset-4 hover:text-ink-2"
              data-testid="edit-nickname"
            >
              Playing as {nickname} · edit
            </button>
          )}
          {nickError && <p className="mt-1 text-bad">{nickError}</p>}
        </div>
      </section>

      <div className="sticky top-0 z-10 -mx-1 mt-6 bg-paper/90 px-1 py-1 backdrop-blur">
        <div className="flex gap-1 rounded-2xl bg-paper-2 p-1" role="tablist">
          {(["solutions", "leaderboard"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-11 flex-1 rounded-xl text-sm font-semibold capitalize transition ${tab === t ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:text-ink"}`}
            >
              {t}
            </button>
          ))}
        </div>
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
  const statusTone = !q.yourAnswer
    ? "bg-paper-2 text-muted"
    : q.yourAnswer.skipped
      ? "bg-paper-2 text-ink-2"
      : q.yourAnswer.correct
        ? "bg-good-soft text-good"
        : "bg-bad-soft text-bad";

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
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <span className="font-display text-lg font-semibold text-ink">Question {q.slot}</span>
        <DifficultyChip slot={q.slot} />
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>{status}</span>
        {practising && <span className="w-full text-xs font-medium text-ink-2">Practice · unranked — try it before peeking</span>}
      </div>
      {q.voided && <p className="mb-2 rounded-lg bg-bad-soft px-3 py-2.5 text-sm text-ink">This question was withdrawn by the editors and counts as correct for everyone.</p>}
      {practising && !revealed ? (
        <>
          <QuestionView statement={q.statement} diagram={q.diagram} options={q.options} onPick={(id) => setPracticePick(id)} />
          <button className="mt-2 inline-flex min-h-11 items-center px-1 text-sm text-ink-2 underline underline-offset-4 hover:text-ink" onClick={() => setOpen(true)} data-testid="reveal">
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
          <div className="mt-4 rounded-2xl border-l-4 border-accent bg-paper-2/70 px-4 pb-2 pt-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Key insight</p>
            <Tex as="div" className="prose-math mt-1 text-ink">{q.key_insight}</Tex>
            <details className="mt-2" open={open || undefined}>
              <summary className="disclosure flex min-h-11 cursor-pointer items-center gap-2 text-sm font-semibold text-ink-2 hover:text-ink">Full solution &amp; why the traps tempt</summary>
              <Tex as="div" className="prose-math mt-1 leading-relaxed text-ink">{q.solution}</Tex>
              <ul className="mt-3 space-y-2 pb-2">
                {q.options
                  .filter((o) => !o.is_correct)
                  .map((o) => (
                    <li key={o.id} className="prose-math rounded-xl bg-card/70 px-3 py-2.5 text-sm text-ink-2">
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
        <thead className="bg-paper-2 text-left text-xs uppercase tracking-wider text-muted tabular">
          <tr>
            <th className="px-3 py-2.5">#</th>
            <th className="px-3 py-2.5">Player</th>
            <th className="px-3 py-2.5 text-right">Score</th>
            <th className="px-3 py-2.5 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-rule ${r.isYou ? "bg-accent/10 font-semibold" : ""}`}>
              <td className="px-3 py-2.5 text-muted">{r.rank}</td>
              <td className="px-3 py-2.5 text-ink">{r.nickname}{r.isYou && " (you)"}</td>
              <td className="px-3 py-2.5 text-right text-ink">{r.score}/8</td>
              <td className="px-3 py-2.5 text-right text-ink-2">{formatDuration(r.elapsedMs)}</td>
            </tr>
          ))}
          {you && !rows.some((r) => r.isYou) && (
            <tr className="border-t-2 border-rule bg-accent/10 font-semibold">
              <td className="px-3 py-2.5">{you.rank}</td>
              <td className="px-3 py-2.5">{you.nickname} (you)</td>
              <td className="px-3 py-2.5 text-right">{you.score}/8</td>
              <td className="px-3 py-2.5 text-right">{formatDuration(you.elapsedMs)}</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="border-t border-rule px-3 py-2.5 text-xs text-muted">
        {total} finished today. Ranked by correct answers, then time. Anonymous and casual — identities are per-browser.
      </p>
    </div>
  );
}
