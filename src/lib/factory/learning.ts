/**
 * Learning from feedback → a new *draft* generator version.
 *
 * - Original judgments are never modified; the analysis is stored separately in
 *   generator_versions.learning_summary.
 * - Questions whose feedback is consumed are recorded in training_question_ids,
 *   so calibration can be measured on fresh questions only.
 * - Nothing is promoted automatically: an admin activates the draft, and a
 *   version can be marked calibrated only after fresh-batch evidence.
 */
import { sql } from "@/lib/db";
import { HttpError } from "@/lib/http";
import { audit } from "@/lib/audit";
import { BucketConfig, GeneratorProfile, type GeneratorProfileT } from "@/lib/buckets/defaults";
import { learnDiagramPolicy } from "./diagram-policy";
import { getProvider } from "./providers";
import type { ExampleQuestion, ProfileProposal } from "./providers/types";
import { loadExamples } from "./pipeline";

interface JudgedRow {
  id: string;
  judgment: "too_easy" | "just_right" | "too_hard" | "invalid";
  note: string | null;
  template_id: string | null;
  techniques: string[];
  created_at: string;
}

type Counts = { n: number; too_easy: number; just_right: number; too_hard: number; invalid: number };
const emptyCounts = (): Counts => ({ n: 0, too_easy: 0, just_right: 0, too_hard: 0, invalid: 0 });

/** Judged questions in a slot whose feedback has not yet been consumed by any version. */
async function unconsumedFeedback(slot: number): Promise<JudgedRow[]> {
  return sql<JudgedRow[]>`
    with consumed as (select unnest(training_question_ids) as id from generator_versions where slot = ${slot})
    select q.id, f.judgment, f.note, q.template_id, v.techniques, f.created_at
    from questions q
    join question_versions v on v.id = q.current_version_id
    join lateral (select judgment, note, created_at from question_feedback where question_id = q.id order by created_at desc, id desc limit 1) f on true
    where q.slot = ${slot} and f.judgment <> 'retracted' and q.id not in (select id from consumed)
    order by f.created_at desc`;
}

function pickDiverse(rows: JudgedRow[], n: number): string[] {
  const out: JudgedRow[] = [];
  const seenTemplates = new Set<string>();
  for (const r of rows) {
    const key = r.template_id ?? r.techniques[0] ?? r.id;
    if (seenTemplates.has(key)) continue;
    seenTemplates.add(key);
    out.push(r);
    if (out.length >= n) break;
  }
  for (const r of rows) {
    if (out.length >= n) break;
    if (!out.includes(r)) out.push(r);
  }
  return out.map((r) => r.id);
}

const mergeIds = (newer: string[], older: string[], cap: number) => [...new Set([...newer, ...older])].slice(0, cap);

export async function proposeNextVersion(slot: number, adminId: string, opts: { useAI: boolean }) {
  const [bucket] = await sql<{ name: string; character: string; config: unknown; gv_id: string; version: number; profile: unknown }[]>`
    select b.name, b.character, b.config, g.id as gv_id, g.version, g.profile
    from bucket_profiles b join generator_versions g on g.id = b.active_generator_version_id where b.slot = ${slot}`;
  if (!bucket) throw new HttpError(404, "bucket not found");
  const profile = GeneratorProfile.parse(bucket.profile);
  const config = BucketConfig.parse(bucket.config);
  const rows = await unconsumedFeedback(slot);
  if (rows.length < 3) throw new HttpError(409, `need at least 3 new judgments to learn from (have ${rows.length})`);

  // --- statistics -----------------------------------------------------------
  const total = emptyCounts();
  const perTemplate: Record<string, Counts> = {};
  for (const r of rows) {
    total.n++;
    total[r.judgment]++;
    const t = r.template_id ?? "(ai)";
    perTemplate[t] ??= emptyCounts();
    perTemplate[t].n++;
    perTemplate[t][r.judgment]++;
  }
  const valid = Math.max(1, total.n - total.invalid);
  const easyRate = total.too_easy / valid;
  const hardRate = total.too_hard / valid;
  const [lo, hi] = config.difficulty_band;
  const delta = Math.max(-1, Math.min(1, (easyRate - hardRate) * (hi - lo) * 0.8));

  // --- deterministic profile update ----------------------------------------------
  const next: GeneratorProfileT = structuredClone(profile);
  next.target_difficulty = round1(clamp(profile.target_difficulty + delta, lo, hi));
  next.procedural.difficulty = round1(clamp(profile.procedural.difficulty + delta, lo, hi));
  const templateChanges: string[] = [];
  for (const [tpl, c] of Object.entries(perTemplate)) {
    if (tpl === "(ai)") continue;
    const old = profile.procedural.template_weights[tpl] ?? 1;
    const invalidRate = c.invalid / c.n;
    const jrRate = c.just_right / Math.max(1, c.n - c.invalid);
    let w = old * (0.4 + 1.2 * jrRate) * (1 - invalidRate);
    if (c.n >= 2 && invalidRate >= 0.5) w = 0;
    else w = Math.max(0.1, Math.min(3, w));
    w = round2(w);
    next.procedural.template_weights[tpl] = w;
    if (w !== old) templateChanges.push(`${tpl}: weight ${old} → ${w} (${c.just_right}/${c.n} just right, ${c.too_easy} easy, ${c.too_hard} hard, ${c.invalid} invalid)`);
  }

  // Curated examples for retrieval in future prompts (accumulating, newest first).
  const by = (j: JudgedRow["judgment"]) => rows.filter((r) => r.judgment === j);
  next.examples = {
    ideal: mergeIds(pickDiverse(by("just_right"), 6), profile.examples.ideal, 8),
    too_easy: mergeIds(pickDiverse(by("too_easy"), 4), profile.examples.too_easy, 6),
    too_hard: mergeIds(pickDiverse(by("too_hard"), 4), profile.examples.too_hard, 6),
  };

  const patterns: string[] = [];
  if (delta > 0.05) patterns.push(`${pct(easyRate)} of valid questions were judged too easy vs ${pct(hardRate)} too hard → raise difficulty by ${round1(delta)}.`);
  else if (delta < -0.05) patterns.push(`${pct(hardRate)} of valid questions were judged too hard vs ${pct(easyRate)} too easy → lower difficulty by ${round1(-delta)}.`);
  else patterns.push(`Difficulty is balanced (${pct(easyRate)} too easy, ${pct(hardRate)} too hard).`);
  if (total.invalid) patterns.push(`${total.invalid} question(s) flagged invalid.`);

  // Diagram requests in editor notes ("needs a diagram") raise the slot's diagram policy.
  const diagramChange = learnDiagramPolicy(profile.diagrams, rows.map((r) => r.note));
  if (diagramChange) {
    next.diagrams = diagramChange.to;
    patterns.push(`${diagramChange.mentions} editor note(s) asked for diagrams → diagram policy ${profile.diagrams} → ${diagramChange.to}.`);
  }

  const notes = rows.filter((r) => r.note).map((r) => `(${r.judgment.replace("_", " ")}) ${r.note}`);
  const newInstructions = notes.map((n) => `Editor note: ${n}`);
  next.editorial_instructions = [...new Set([...profile.editorial_instructions, ...newInstructions])].slice(-30);

  // --- optional AI analysis ---------------------------------------------------------
  let ai: ProfileProposal | null = null;
  let aiError: string | null = null;
  if (opts.useAI) {
    try {
      const provider = getProvider("anthropic", profile.model);
      const examples: ExampleQuestion[] = await loadExamples(rows.slice(0, 40).map((r) => r.id));
      ai = await provider.proposeProfile!({
        slot,
        slotName: bucket.name,
        character: bucket.character,
        profile,
        stats: { reviewed: total.n, too_easy: total.too_easy, just_right: total.just_right, too_hard: total.too_hard, invalid: total.invalid },
        examples,
      });
      next.editorial_instructions = [...new Set([...ai.editorial_instructions, ...newInstructions])].slice(-30);
      next.preferred = [...new Set([...profile.preferred, ...ai.preferred_add])];
      next.forbidden = [...new Set([...profile.forbidden, ...ai.forbidden_add])];
      next.target_difficulty = round1(clamp(profile.target_difficulty + ai.target_difficulty_delta, lo, hi));
      patterns.push(...ai.patterns);
    } catch (e) {
      aiError = (e as Error).message;
    }
  }

  const [{ max }] = await sql<{ max: number }[]>`select coalesce(max(version), 0) as max from generator_versions where slot = ${slot}`;
  const summary = {
    based_on_version: bucket.version,
    stats: total,
    per_template: perTemplate,
    template_changes: templateChanges,
    difficulty_change: { from: profile.target_difficulty, to: next.target_difficulty, procedural_from: profile.procedural.difficulty, procedural_to: next.procedural.difficulty },
    diagram_change: diagramChange ? { from: profile.diagrams, to: diagramChange.to } : null,
    patterns,
    new_instructions: next.editorial_instructions.filter((i) => !profile.editorial_instructions.includes(i)),
    ai_used: Boolean(ai),
    ai_rationale: ai?.rationale ?? null,
    ai_error: aiError,
  };
  const [gv] = await sql<{ id: string; version: number }[]>`
    insert into generator_versions (slot, version, parent_id, status, profile, training_question_ids, learning_summary, created_by)
    values (${slot}, ${max + 1}, ${bucket.gv_id}, 'draft', ${sql.json(GeneratorProfile.parse(next) as never)},
            ${rows.map((r) => r.id)}::uuid[], ${sql.json(summary as never)}, ${adminId})
    returning id, version`;
  await audit(sql, adminId, "propose_generator_version", "generator_version", gv.id, { slot, version: gv.version, judgments: total.n });
  return { id: gv.id, version: gv.version, summary };
}

/**
 * Automatic upgrade: when a slot has enough new judgments, learn from them and
 * activate the result immediately, so the next batch uses it without a manual
 * "learn → activate" round trip. Safe to call often: it is a no-op below the
 * threshold, when disabled in the bucket config, or while another run holds the
 * slot's lock. Returns the activated version, or null.
 */
export async function autoLearn(slot: number, adminId: string): Promise<{ id: string; version: number } | null> {
  const [b] = await sql<{ config: unknown }[]>`select config from bucket_profiles where slot = ${slot}`;
  if (!b) return null;
  const cfg = BucketConfig.parse(b.config).auto_learn;
  if (!cfg.enabled) return null;
  if ((await unconsumedFeedback(slot)).length < cfg.min_judgments) return null;
  return sql.begin(async (tx) => {
    const [{ locked }] = await tx<{ locked: boolean }[]>`select pg_try_advisory_xact_lock(hashtext('mathdle:auto_learn'), ${slot}) as locked`;
    if (!locked) return null;
    // Re-check under the lock: a concurrent run may have just consumed these judgments.
    if ((await unconsumedFeedback(slot)).length < cfg.min_judgments) return null;
    const proposed = await proposeNextVersion(slot, adminId, { useAI: Boolean(process.env.ANTHROPIC_API_KEY) });
    await sql`update generator_versions set learning_summary = learning_summary || ${sql.json({ auto_activated: true } as never)} where id = ${proposed.id}`;
    await activateVersion(proposed.id, adminId);
    console.log(`[mathdle] auto-learn: slot ${slot} → v${proposed.version}`);
    return { id: proposed.id, version: proposed.version };
  });
}

/** True once every question of the batch that passed validation has a judgment. */
export async function batchFullyReviewed(questionId: string): Promise<{ slot: number; done: boolean } | null> {
  const [r] = await sql<{ slot: number; pending: number }[]>`
    select q0.slot, (select count(*)::int from questions q
       where q.batch_id = q0.batch_id and q.status not in ('validation_failed', 'validating')
         and not exists (select 1 from question_feedback f where f.question_id = q.id and f.judgment <> 'retracted')) as pending
    from questions q0 where q0.id = ${questionId}`;
  return r ? { slot: r.slot, done: r.pending === 0 } : null;
}

export async function activateVersion(versionId: string, adminId: string) {
  return sql.begin(async (tx) => {
    const [gv] = await tx<{ slot: number; status: string; version: number }[]>`select slot, status, version from generator_versions where id = ${versionId} for update`;
    if (!gv) throw new HttpError(404, "version not found");
    if (gv.status === "retired") throw new HttpError(409, "retired versions cannot be reactivated; propose a new version");
    const [b] = await tx<{ active: string | null }[]>`select active_generator_version_id as active from bucket_profiles where slot = ${gv.slot} for update`;
    if (b.active && b.active !== versionId)
      await tx`update generator_versions set status = case when status = 'calibrated' then 'calibrated' else 'retired' end where id = ${b.active}`;
    if (gv.status === "draft") await tx`update generator_versions set status = 'active', activated_at = now() where id = ${versionId}`;
    await tx`update bucket_profiles set active_generator_version_id = ${versionId}, updated_at = now() where slot = ${gv.slot}`;
    await audit(tx, adminId, "activate_generator_version", "generator_version", versionId, { slot: gv.slot, version: gv.version });
  });
}

/** Manual edit of the active profile → new draft version (never edits a version in place). */
export async function createEditedVersion(slot: number, adminId: string, profile: unknown, reason: string) {
  const parsed = GeneratorProfile.parse(profile);
  const [b] = await sql<{ gv_id: string }[]>`select active_generator_version_id as gv_id from bucket_profiles where slot = ${slot}`;
  if (!b) throw new HttpError(404, "bucket not found");
  const [{ max }] = await sql<{ max: number }[]>`select coalesce(max(version), 0) as max from generator_versions where slot = ${slot}`;
  const [gv] = await sql<{ id: string; version: number }[]>`
    insert into generator_versions (slot, version, parent_id, status, profile, learning_summary, created_by)
    values (${slot}, ${max + 1}, ${b.gv_id}, 'draft', ${sql.json(parsed as never)}, ${sql.json({ manual_edit: true, reason } as never)}, ${adminId})
    returning id, version`;
  await audit(sql, adminId, "edit_generator_profile", "generator_version", gv.id, { slot, reason });
  return gv;
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
function round1(x: number) {
  return Math.round(x * 10) / 10;
}
function round2(x: number) {
  return Math.round(x * 100) / 100;
}
function pct(x: number) {
  return `${Math.round(x * 100)}%`;
}
