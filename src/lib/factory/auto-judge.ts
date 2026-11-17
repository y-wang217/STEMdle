/**
 * Automated difficulty judge (database side). Writes the same judgments a human
 * editor would, through recordJudgment, as the disabled `auto-judge@mathdle.local`
 * admin with an "AUTO-JUDGE [...]" note, so they stay distinguishable.
 *
 * - Player data first: a question with MIN_PLAYS_FOR_OVERRIDE answers is judged by
 *   its real solve rate (replacing a ladder judgment, never a human one). Free.
 * - Then the model ladder for `ready` questions (validated, not yet judged), under
 *   a per-run cost cap. Doubtful math is flagged for review (an appended
 *   needs_review validation row), never judged or approved.
 * Pure logic: ./auto-judge-core.ts. Design: docs/designs/auto-judge.md.
 */
import { sql } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { GeneratorProfile, type JudgeConfigT, type SolverRungT } from "@/lib/buckets/defaults";
import { hashPassword, randomToken } from "@/lib/security/crypto";
import { recomputeStatus, recordJudgment } from "./feedback";
import { Budget, MIN_PLAYS_FOR_OVERRIDE, ladderVerdict, playerVerdict, resolveJudgeConfig, runLadder, type LadderAttempt, type Verdict } from "./auto-judge-core";
import { defaultSolverFactory } from "./providers/solvers";
import type { Solver } from "./providers/types";

export const AUTO_JUDGE_EMAIL = "auto-judge@mathdle.local";
export const NOTE_PREFIX = { ladder: "AUTO-JUDGE [ladder]", players: "AUTO-JUDGE [players]" } as const;
export const DEFAULT_COST_CAP_USD = 2;
export const MAX_LIMIT = 50;
const CONCURRENCY = 3;

export type SolverFactory = (rung: SolverRungT, index: number) => Solver;

export interface AutoJudgeArgs {
  slot?: number | null;
  batchId?: string | null;
  /** Maximum questions sent up the ladder in this run (player overrides are free and not counted). */
  limit?: number;
  costCapUsd?: number;
  /** Injected in tests; defaults to real solvers (Anthropic, or registered external ones). */
  solverFactory?: SolverFactory;
  /** Admin who started the run (audited). Null for scripts. */
  triggeredBy?: string | null;
}

export interface AutoJudgeItem {
  questionId: string;
  slot: number;
  outcome: "judged" | "flagged" | "skipped" | "unjudged";
  judgment?: string;
  source?: "ladder" | "players";
  detail: string;
  costUsd: number;
}

export interface AutoJudgeReport {
  judgeAdminId: string;
  costCapUsd: number;
  spentUsd: number;
  stopped: "cost_cap" | null;
  items: AutoJudgeItem[];
  counts: Record<AutoJudgeItem["outcome"], number>;
}

/** The disabled admin identity that owns automated judgments (cannot sign in). */
export async function ensureAutoJudgeAdmin(): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into admin_users (email, password_hash, disabled) values (${AUTO_JUDGE_EMAIL}, ${hashPassword(randomToken())}, true)
    on conflict (email) do update set disabled = true returning id`;
  return row.id;
}

async function judgeConfigs(slots: number[]): Promise<Map<number, JudgeConfigT>> {
  const rows = await sql<{ slot: number; profile: unknown }[]>`
    select b.slot, g.profile from bucket_profiles b join generator_versions g on g.id = b.active_generator_version_id
    where b.slot = any(${slots}::int[])`;
  const out = new Map<number, JudgeConfigT>();
  for (const s of slots) {
    const r = rows.find((x) => x.slot === s);
    out.set(s, resolveJudgeConfig(s, r ? GeneratorProfile.parse(r.profile) : {}));
  }
  return out;
}

interface PlayerCandidate {
  id: string;
  slot: number;
  answered: number;
  correct: number;
  judgment: string | null;
  note: string | null;
}

/** Questions with enough plays whose effective judgment is absent or automated (never human). */
async function playerCandidates(judgeId: string, slot: number | null, batchId: string | null): Promise<PlayerCandidate[]> {
  return sql<PlayerCandidate[]>`
    with perf as (
      select p.question_id, sum(p.answered)::int as answered, sum(p.correct)::int as correct
      from question_performance p join daily_challenges d on d.id = p.challenge_id
      where d.status = 'published'
      group by p.question_id having sum(p.answered) >= ${MIN_PLAYS_FOR_OVERRIDE})
    select q.id, q.slot, perf.answered, perf.correct, f.judgment, f.note
    from perf join questions q on q.id = perf.question_id
    left join lateral (select judgment, note, admin_id from question_feedback where question_id = q.id order by created_at desc, id desc limit 1) f on true
    where q.status <> 'retired'
      and (${slot}::int is null or q.slot = ${slot}::int)
      and (${batchId}::uuid is null or q.batch_id = ${batchId}::uuid)
      and (f.admin_id is null or f.admin_id = ${judgeId})
    order by q.slot, q.created_at`;
}

interface LadderCandidate {
  id: string;
  slot: number;
  statement: string;
  options: { tex: string; is_correct: boolean }[];
}

/** Validated, unjudged questions the judge has not already flagged at this version. */
async function ladderCandidates(slot: number | null, batchId: string | null, limit: number): Promise<LadderCandidate[]> {
  if (limit <= 0) return [];
  return sql<LadderCandidate[]>`
    select q.id, q.slot, v.statement,
      (select json_agg(json_build_object('tex', o.tex, 'is_correct', o.is_correct) order by o.position)
         from question_options o where o.question_version_id = v.id) as options
    from questions q join question_versions v on v.id = q.current_version_id
    where q.status = 'ready'
      and (${slot}::int is null or q.slot = ${slot}::int)
      and (${batchId}::uuid is null or q.batch_id = ${batchId}::uuid)
      and not exists (select 1 from question_validations qv where qv.question_version_id = v.id and qv.engine = 'auto-judge')
    order by q.created_at, q.id
    limit ${limit}`;
}

/** Append a needs_review validation for the current version so a human checks the math. */
async function flagForReview(judgeId: string, questionId: string, reason: string, attempts: LadderAttempt[]) {
  await sql.begin(async (tx) => {
    const [q] = await tx<{ current_version_id: string }[]>`select current_version_id from questions where id = ${questionId} for update`;
    const [prev] = await tx<{ checks: unknown[]; computed: unknown }[]>`
      select checks, computed from question_validations where question_version_id = ${q.current_version_id}
      order by created_at desc limit 1`;
    const checks = [...(prev?.checks ?? []), { name: "auto_judge", status: "warn", detail: `flagged for math review: ${reason}`.slice(0, 1000) }];
    await tx`insert into question_validations (question_version_id, status, engine, checks, computed)
             values (${q.current_version_id}, 'needs_review', 'auto-judge', ${tx.json(checks as never)}, ${tx.json((prev?.computed ?? {}) as never)})`;
    await recomputeStatus(tx, questionId);
    await audit(tx, judgeId, "auto_judge_flag", "question", questionId, { reason, attempts } as never);
  });
}

async function record(judgeId: string, questionId: string, v: Extract<Verdict, { kind: "judgment" }>, allowPublished: boolean) {
  const note = `${NOTE_PREFIX[v.source]} automated judgment: ${v.detail}`;
  await recordJudgment({ adminId: judgeId, questionId, judgment: v.judgment, note, allowPublished });
}

export async function autoJudge(args: AutoJudgeArgs): Promise<AutoJudgeReport> {
  const slot = args.slot ?? null;
  const batchId = args.batchId ?? null;
  if (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > 8)) throw new HttpError(400, "slot must be 1–8");
  const limit = Math.max(0, Math.min(MAX_LIMIT, Math.floor(args.limit ?? 10)));
  const capUsd = args.costCapUsd ?? Number(process.env.AUTO_JUDGE_COST_CAP_USD ?? DEFAULT_COST_CAP_USD);
  if (!(capUsd >= 0)) throw new HttpError(400, "cost cap must be a non-negative number");
  const factory = args.solverFactory ?? defaultSolverFactory;
  const judgeId = await ensureAutoJudgeAdmin();
  const budget = new Budget(capUsd);
  const items: AutoJudgeItem[] = [];

  const players = await playerCandidates(judgeId, slot, batchId);
  const ladder = await ladderCandidates(slot, batchId, limit);
  const configs = await judgeConfigs([...new Set([...players.map((p) => p.slot), ...ladder.map((q) => q.slot)])]);

  // 1. Real play beats the ladder. A repeat of the same player-based judgment is not re-recorded.
  for (const p of players) {
    const v = playerVerdict(p, configs.get(p.slot)!);
    if (!v || v.kind !== "judgment") continue;
    if (p.judgment === v.judgment && p.note?.startsWith(NOTE_PREFIX.players)) continue;
    await record(judgeId, p.id, v, true);
    items.push({ questionId: p.id, slot: p.slot, outcome: "judged", judgment: v.judgment, source: "players", detail: v.detail, costUsd: 0 });
  }

  // 2. Model ladder, a few questions at a time, under the shared budget.
  const solversBySlot = new Map<number, Solver[]>();
  const solversFor = (s: number) => {
    if (!solversBySlot.has(s)) solversBySlot.set(s, configs.get(s)!.ladder.map((rung, i) => factory(rung, i)));
    return solversBySlot.get(s)!;
  };
  let stopped: AutoJudgeReport["stopped"] = null;
  const queue = [...ladder];
  const worker = async () => {
    for (let q = queue.shift(); q && !stopped; q = queue.shift()) {
      const correct = q.options.findIndex((o) => o.is_correct);
      let solvers: Solver[];
      try {
        solvers = solversFor(q.slot);
      } catch (e) {
        items.push({ questionId: q.id, slot: q.slot, outcome: "skipped", detail: `solver unavailable: ${(e as Error).message}`, costUsd: 0 });
        continue;
      }
      const run = await runLadder({ statement: q.statement, options: q.options.map((o) => o.tex) }, correct, solvers, budget);
      const cost = run.attempts.reduce((a, b) => a + b.costUsd, 0);
      if (run.stopped) {
        stopped = run.stopped;
        items.push({ questionId: q.id, slot: q.slot, outcome: "unjudged", detail: "per-run cost cap reached", costUsd: cost });
        break;
      }
      if (run.error) {
        items.push({ questionId: q.id, slot: q.slot, outcome: "skipped", detail: `solver error, left for the next run: ${run.error}`, costUsd: cost });
        continue;
      }
      const v = ladderVerdict(run.attempts, configs.get(q.slot)!);
      if (v.kind === "flag") {
        await flagForReview(judgeId, q.id, v.reason, run.attempts);
        items.push({ questionId: q.id, slot: q.slot, outcome: "flagged", detail: v.reason, costUsd: cost });
      } else {
        await record(judgeId, q.id, v, false);
        await audit(sql, judgeId, "auto_judge", "question", q.id, { judgment: v.judgment, attempts: run.attempts } as never);
        items.push({ questionId: q.id, slot: q.slot, outcome: "judged", judgment: v.judgment, source: "ladder", detail: v.detail, costUsd: cost });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

  const counts = { judged: 0, flagged: 0, skipped: 0, unjudged: 0 };
  for (const i of items) counts[i.outcome]++;
  const report: AutoJudgeReport = { judgeAdminId: judgeId, costCapUsd: capUsd, spentUsd: round4(budget.spentUsd), stopped, items, counts };
  if (args.triggeredBy)
    await audit(sql, args.triggeredBy, "auto_judge_run", "auto_judge_run", null, { slot, batchId, ...counts, spentUsd: report.spentUsd, costCapUsd: capUsd, stopped });
  return report;
}

function round4(x: number) {
  return Math.round(x * 10000) / 10000;
}
