/**
 * Generation batch: active generator version → provider → schema check →
 * persist (immutable version 1) → validation pipeline.
 */
import { sql } from "@/lib/db";
import { CandidateQuestion } from "@/lib/schemas/question";
import { GeneratorProfile } from "@/lib/buckets/defaults";
import { HttpError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { getProvider, type ProviderId } from "./providers";
import type { ExampleQuestion } from "./providers/types";
import { insertQuestion } from "./store";
import { exactKey } from "./fingerprint";
import { enqueueLean, recentFormalFailures } from "@/lib/lean/pipeline";
import { validateVersions } from "./validate";

export interface BatchSummary {
  batchId: string;
  provider: string;
  devAdapter: boolean;
  generatorVersion: number;
  requested: number;
  produced: number;
  discarded: { reason: string }[];
  passed: number;
  failed: number;
  needsReview: number;
}

export async function loadExamples(questionIds: string[]): Promise<ExampleQuestion[]> {
  if (!questionIds.length) return [];
  const rows = await sql<(Omit<ExampleQuestion, "options"> & { options: ExampleQuestion["options"] })[]>`
    select q.id, v.statement, v.key_insight, v.techniques,
      coalesce(f.judgment, 'just_right') as judgment, f.note,
      (select json_agg(json_build_object('tex', o.tex, 'is_correct', o.is_correct) order by o.position)
         from question_options o where o.question_version_id = v.id) as options
    from questions q join question_versions v on v.id = q.current_version_id
    left join lateral (select judgment, note from question_feedback where question_id = q.id order by created_at desc limit 1) f on true
    where q.id = any(${questionIds}::uuid[])`;
  return rows.filter((r) => r.judgment !== ("retracted" as string));
}

export interface StartArgs {
  slot: number;
  count: number;
  providerId: ProviderId;
  adminId: string | null;
  seed?: number;
}

/**
 * Validate the request, apply the rate limit and create the batch row (stage
 * `queued`). Fast: the caller returns to the browser and runs executeBatch
 * afterwards (Next.js `after()`), so the admin can leave the page.
 */
export async function startGenerationBatch(args: StartArgs): Promise<{ batchId: string }> {
  if (!Number.isInteger(args.slot) || args.slot < 1 || args.slot > 8) throw new HttpError(400, "slot must be 1–8");
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 20) throw new HttpError(400, "count must be 1–20");
  if (args.adminId) {
    const perHour = Number(process.env.GENERATION_RATE_LIMIT_PER_HOUR ?? 20);
    await enforceRateLimit(`gen:${args.adminId}`, perHour, 3600);
  }
  const [bucket] = await sql<{ gv_id: string; profile: unknown }[]>`
    select g.id as gv_id, g.profile from bucket_profiles b join generator_versions g on g.id = b.active_generator_version_id
    where b.slot = ${args.slot}`;
  if (!bucket) throw new HttpError(409, `slot ${args.slot} has no active generator version`);
  const provider = getProvider(args.providerId, GeneratorProfile.parse(bucket.profile).model);
  const seed = args.seed ?? Math.floor(Math.random() * 2 ** 31);
  const [batch] = await sql<{ id: string }[]>`
    insert into generation_batches (slot, generator_version_id, provider, model, requested_count, seed, created_by, stage)
    values (${args.slot}, ${bucket.gv_id}, ${provider.id}, ${provider.model}, ${args.count}, ${seed}, ${args.adminId}, 'queued')
    returning id`;
  return { batchId: batch.id };
}

async function setStage(batchId: string, stage: string) {
  await sql`update generation_batches set stage = ${stage}, updated_at = now() where id = ${batchId} and status = 'running'`;
}

/** Run a queued batch to completion: generate → persist → validate → enqueue Lean. */
export async function executeBatch(batchId: string): Promise<BatchSummary> {
  const [b] = await sql<{ slot: number; requested_count: number; provider: ProviderId; seed: string | number; created_by: string | null; generator_version_id: string; status: string }[]>`
    select slot, requested_count, provider, seed, created_by, generator_version_id, status from generation_batches where id = ${batchId}`;
  if (!b) throw new HttpError(404, "batch not found");
  if (b.status !== "running") throw new HttpError(409, `batch is ${b.status}`);
  const [bucket] = await sql<{ name: string; character: string; gv_version: number; profile: unknown }[]>`
    select bp.name, bp.character, g.version as gv_version, g.profile
    from generator_versions g join bucket_profiles bp on bp.slot = g.slot where g.id = ${b.generator_version_id}`;
  const args = { slot: b.slot, count: b.requested_count, adminId: b.created_by };
  const profile = GeneratorProfile.parse(bucket.profile);
  const provider = getProvider(b.provider, profile.model);
  const seed = Number(b.seed);
  const batch = { id: batchId };
  const gvId = b.generator_version_id;

  try {
    await setStage(batchId, "generating");
    const examples = await loadExamples([...profile.examples.ideal, ...profile.examples.too_easy, ...profile.examples.too_hard]);
    const recent = await sql<{ statement: string; techniques: string[] }[]>`
      select v.statement, v.techniques from questions q join question_versions v on v.id = q.current_version_id
      where q.slot = ${args.slot} and q.status not in ('validation_failed', 'rejected')
      order by q.created_at desc limit 40`;
    const techniqueCounts: Record<string, number> = {};
    for (const r of recent) for (const t of r.techniques) techniqueCounts[t] = (techniqueCounts[t] ?? 0) + 1;

    const { items, usage } = await provider.generate({
      slot: args.slot,
      slotName: bucket.name,
      character: bucket.character,
      profile,
      // The development adapter over-generates so exact repeats can be dropped below.
      count: provider.devAdapter ? args.count * 2 + 2 : args.count,
      seed,
      examples,
      recentStatements: recent.map((r) => r.statement),
      techniqueCounts,
      formalFailures: await recentFormalFailures(args.slot).catch(() => []),
    });

    await setStage(batchId, "validating");
    const discarded: { reason: string }[] = [];
    const versionIds: string[] = [];
    const existing = await sql<{ statement: string; options: string[] }[]>`
      select v.statement, (select array_agg(o.tex) from question_options o where o.question_version_id = v.id) as options
      from questions q join question_versions v on v.id = q.current_version_id where q.slot = ${args.slot}`;
    const seen = new Set(existing.map((e) => exactKey(e.statement, e.options ?? [])));
    for (const item of items) {
      if (versionIds.length >= args.count) break;
      const parsed = CandidateQuestion.safeParse(item.candidate);
      if (!parsed.success) {
        discarded.push({ reason: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        continue;
      }
      const key = exactKey(parsed.data.statement, parsed.data.options.map((o) => o.tex));
      if (seen.has(key)) {
        if (!provider.devAdapter) discarded.push({ reason: "exact duplicate of an existing question" });
        continue;
      }
      seen.add(key);
      const ids = await sql.begin((tx) =>
        insertQuestion(tx, {
          slot: args.slot,
          batchId: batch.id,
          generatorVersionId: gvId,
          source: provider.id === "anthropic" ? "ai" : "procedural",
          candidate: parsed.data,
          meta: { ...item.meta, provider: provider.id, model: provider.model, generator_version: bucket.gv_version, batch_id: batch.id, seed },
        }),
      );
      versionIds.push(ids.versionId);
    }

    const outcomes = await validateVersions(versionIds, provider);
    // Formal verification runs asynchronously; it never blocks or fails the batch.
    await enqueueLean(outcomes.filter((o) => o.status !== "failed").map((o) => o.versionId)).catch((e) =>
      console.error("[mathdle] could not enqueue Lean jobs", e),
    );
    const summary: BatchSummary = {
      batchId: batch.id,
      provider: provider.id,
      devAdapter: provider.devAdapter,
      generatorVersion: bucket.gv_version,
      requested: args.count,
      produced: versionIds.length,
      discarded,
      passed: outcomes.filter((o) => o.status === "passed").length,
      failed: outcomes.filter((o) => o.status === "failed").length,
      needsReview: outcomes.filter((o) => o.status === "needs_review").length,
    };
    await sql`update generation_batches set status = 'completed', stage = 'done', produced_count = ${versionIds.length},
              usage = ${sql.json({ ...(usage ?? {}), discarded } as never)}, summary = ${sql.json(summary as never)},
              completed_at = now(), updated_at = now() where id = ${batch.id}`;
    if (args.adminId)
      await audit(sql, args.adminId, "generate_batch", "generation_batch", batch.id, { slot: args.slot, provider: provider.id, produced: versionIds.length });
    return summary;
  } catch (e) {
    await sql`update generation_batches set status = 'failed', stage = 'failed', error = ${(e as Error).message.slice(0, 2000)},
              completed_at = now(), updated_at = now() where id = ${batch.id}`;
    throw e instanceof HttpError ? e : new HttpError(502, `generation failed: ${(e as Error).message}`);
  }
}

/** Synchronous convenience (scripts and tests): start and run to completion. */
export async function runGenerationBatch(args: StartArgs): Promise<BatchSummary> {
  const { batchId } = await startGenerationBatch(args);
  return executeBatch(batchId);
}

/** Batches the server stopped working on (e.g. function time limit) are marked failed instead of spinning forever. */
export async function failStaleBatches() {
  await sql`update generation_batches set status = 'failed', stage = 'failed',
              error = 'stopped responding (server time limit reached) — try a smaller batch',
              completed_at = now(), updated_at = now()
            where status = 'running' and updated_at < now() - interval '6 minutes'`;
}
