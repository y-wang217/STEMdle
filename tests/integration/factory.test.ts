/**
 * Question factory loop on a real Postgres + the real SymPy validator:
 * generate → validate → review → persist feedback → learn → generate improved batch.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { runGenerationBatch } from "@/lib/factory/pipeline";
import { effectiveJudgment, recordJudgment, markMathVerified } from "@/lib/factory/feedback";
import { activateVersion, autoLearn, batchFullyReviewed, proposeNextVersion } from "@/lib/factory/learning";
import { calibrationVerdict, markCalibrated, versionMetrics } from "@/lib/factory/metrics";
import { insertQuestion } from "@/lib/factory/store";
import { validateVersions } from "@/lib/factory/validate";
import { resetDb, sampleCandidate } from "../helpers";

let adminId: string;
beforeAll(async () => {
  ({ adminId } = await resetDb());
});

const questionsOf = (batchId: string) =>
  sql<{ id: string; status: string; generator_version_id: string; template_id: string }[]>`
    select id, status, generator_version_id, template_id from questions where batch_id = ${batchId} order by created_at`;

describe("Bucket 1 factory loop", () => {
  let batch1: string;

  it("generates and validates a batch (acceptance 4: exactly one validated correct option)", async () => {
    const s = await runGenerationBatch({ slot: 1, count: 10, providerId: "procedural", adminId, seed: 1234 });
    batch1 = s.batchId;
    expect(s.produced).toBe(10);
    expect(s.passed).toBe(10);
    const qs = await questionsOf(batch1);
    expect(qs.every((q) => q.status === "ready")).toBe(true);
    for (const q of qs) {
      const [v] = await sql<{ status: string; checks: { name: string; status: string }[] }[]>`
        select v.status, v.checks from question_validations v join questions q on q.current_version_id = v.question_version_id where q.id = ${q.id}`;
      expect(v.status).toBe("passed");
      expect(v.checks.find((c) => c.name === "exactly_one_correct")?.status).toBe("pass");
      expect(v.checks.find((c) => c.name === "independent_verification")?.status).toBe("pass");
      const [{ n }] = await sql<{ n: number }[]>`
        select count(*)::int as n from question_options o join questions q on q.current_version_id = o.question_version_id where q.id = ${q.id} and o.is_correct`;
      expect(n).toBe(1);
    }
  });

  it("records judgments immutably; 'just right' approves; retract undoes (acceptance 1 & 3)", async () => {
    const qs = await questionsOf(batch1);
    // Nothing is recorded until an explicit advance.
    expect(await effectiveJudgment(sql, qs[0].id)).toBeNull();
    const judgments = ["too_easy", "too_easy", "too_easy", "too_easy", "just_right", "just_right", "too_easy", "invalid", "just_right", "too_easy"] as const;
    for (let i = 0; i < qs.length; i++) await recordJudgment({ adminId, questionId: qs[i].id, judgment: judgments[i], note: i === 0 ? "far too quick" : null });
    const after = await questionsOf(batch1);
    expect(after[4].status).toBe("approved");
    expect(after[0].status).toBe("reviewed");
    expect(after[7].status).toBe("rejected");

    // Re-submitting the same judgment (e.g. navigating back and advancing) is a no-op.
    const before = await sql`select count(*) from question_feedback`;
    await recordJudgment({ adminId, questionId: qs[4].id, judgment: "just_right" });
    expect((await sql`select count(*) from question_feedback`)[0].count).toBe(before[0].count);

    // Undo
    await recordJudgment({ adminId, questionId: qs[9].id, judgment: "retracted" });
    expect(await effectiveJudgment(sql, qs[9].id)).toBeNull();
    expect((await questionsOf(batch1))[9].status).toBe("ready");
    await recordJudgment({ adminId, questionId: qs[9].id, judgment: "too_easy" });

    // Original rows can never be modified.
    await expect(sql`update question_feedback set judgment = 'just_right'`).rejects.toThrow(/append-only/);
    await expect(sql`delete from question_feedback`).rejects.toThrow(/append-only/);
  });

  it("feedback persists across sessions (fresh connection)", async () => {
    const postgres = (await import("postgres")).default;
    const other = postgres(process.env.DATABASE_URL!, { max: 1 });
    const rows = await other`select judgment, note from question_feedback where note is not null`;
    await other.end();
    expect(rows[0]).toMatchObject({ judgment: "too_easy", note: "far too quick" });
  });

  it("learns a draft v2 that raises difficulty, records training ids and needs activation", async () => {
    const r = await proposeNextVersion(1, adminId, { useAI: false });
    expect(r.version).toBe(2);
    const [gv] = await sql<{ status: string; profile: { procedural: { difficulty: number; template_weights: Record<string, number> }; target_difficulty: number; editorial_instructions: string[]; examples: { ideal: string[] } }; training_question_ids: string[] }[]>`
      select status, profile, training_question_ids from generator_versions where id = ${r.id}`;
    expect(gv.status).toBe("draft");
    expect(gv.profile.procedural.difficulty).toBeGreaterThan(2);
    expect(gv.training_question_ids).toHaveLength(10);
    expect(gv.profile.examples.ideal.length).toBeGreaterThan(0);
    expect(gv.profile.editorial_instructions.join(" ")).toContain("far too quick");
    // The template judged invalid is disabled.
    const invalidTpl = (await questionsOf((await sql`select batch_id from questions where status = 'rejected'`)[0].batch_id))
      .find((q) => q.status === "rejected")!.template_id;
    expect(gv.profile.procedural.template_weights[invalidTpl]).toBeLessThan(1);
    // Not used until activated.
    const [b] = await sql`select g.version from bucket_profiles b join generator_versions g on g.id = b.active_generator_version_id where b.slot = 1`;
    expect(b.version).toBe(1);
    await activateVersion(r.id, adminId);
    const [b2] = await sql`select g.version from bucket_profiles b join generator_versions g on g.id = b.active_generator_version_id where b.slot = 1`;
    expect(b2.version).toBe(2);
  });

  it("next batch uses v2 with harder requested difficulty", async () => {
    const s = await runGenerationBatch({ slot: 1, count: 8, providerId: "procedural", adminId, seed: 99 });
    expect(s.generatorVersion).toBe(2);
    const meta = await sql<{ d: number }[]>`
      select (v.generation_meta->>'requested_difficulty')::float as d from questions q join question_versions v on v.id = q.current_version_id where q.batch_id = ${s.batchId}`;
    const avg = meta.reduce((a, m) => a + m.d, 0) / meta.length;
    expect(avg).toBeGreaterThan(2.3);
  });

  it("calibration requires fresh-batch evidence (not self-evaluation)", async () => {
    const [v2] = await sql<{ id: string }[]>`select id from generator_versions where slot = 1 and version = 2`;
    const verdict = await calibrationVerdict(v2.id);
    expect(verdict.eligible).toBe(false);
    await expect(markCalibrated(v2.id, adminId)).rejects.toThrow(/not eligible/);
    // Review 10 fresh v2 questions as just right → eligible.
    await runGenerationBatch({ slot: 1, count: 4, providerId: "procedural", adminId, seed: 7 });
    const fresh = await sql<{ id: string }[]>`select id from questions where generator_version_id = ${v2.id} and status = 'ready'`;
    for (const q of fresh.slice(0, 10)) await recordJudgment({ adminId, questionId: q.id, judgment: "just_right" });
    const metrics = (await versionMetrics(1)).find((m) => m.id === v2.id)!;
    expect(metrics.fresh_reviewed).toBeGreaterThanOrEqual(10);
    expect((await calibrationVerdict(v2.id)).eligible).toBe(true);
    await markCalibrated(v2.id, adminId);
  });
});

describe("validation blocks bad questions (acceptance 5)", () => {
  it("a question whose key is wrong fails validation and cannot be approved", async () => {
    const c = sampleCandidate(3);
    const wrongIdx = c.options.findIndex((o) => !o.is_correct);
    c.options = c.options.map((o, i) => ({ ...o, is_correct: i === wrongIdx, derivation: i === wrongIdx ? null : (o.derivation ?? "1") }));
    c.statement += " (variant)";
    const { questionId, versionId } = await sql.begin((tx) => insertQuestion(tx, { slot: 2, batchId: null, generatorVersionId: null, source: "manual", candidate: c, meta: {} }));
    const [out] = await validateVersions([versionId]);
    expect(out.status).toBe("failed");
    await recordJudgment({ adminId, questionId, judgment: "just_right" });
    const [q] = await sql`select status from questions where id = ${questionId}`;
    expect(q.status).toBe("validation_failed");
    await expect(markMathVerified(adminId, questionId, "looks fine")).rejects.toThrow(/cannot be manually approved/);
  });

  it("a manual-verification question needs explicit math review before approval", async () => {
    const c = sampleCandidate(5);
    c.statement += " (manual)";
    c.verification = { ...c.verification, kind: "manual", expression: "" };
    const { questionId, versionId } = await sql.begin((tx) => insertQuestion(tx, { slot: 2, batchId: null, generatorVersionId: null, source: "manual", candidate: c, meta: {} }));
    const [out] = await validateVersions([versionId]);
    expect(out.status).toBe("needs_review");
    await recordJudgment({ adminId, questionId, judgment: "just_right" });
    expect((await sql`select status from questions where id = ${questionId}`)[0].status).toBe("needs_review");
    await markMathVerified(adminId, questionId, "checked by hand");
    expect((await sql`select status from questions where id = ${questionId}`)[0].status).toBe("approved");
  });

  it("exact duplicates fail validation", async () => {
    const c = sampleCandidate(11);
    const a = await sql.begin((tx) => insertQuestion(tx, { slot: 3, batchId: null, generatorVersionId: null, source: "manual", candidate: c, meta: {} }));
    await validateVersions([a.versionId]);
    const b = await sql.begin((tx) => insertQuestion(tx, { slot: 3, batchId: null, generatorVersionId: null, source: "manual", candidate: c, meta: {} }));
    const [out] = await validateVersions([b.versionId]);
    expect(out.status).toBe("failed");
    expect(out.checks.find((x) => x.name === "duplicate")?.status).toBe("fail");
  });
});

describe("automatic upgrade after a finished review", () => {
  it("learns and activates once the batch is fully judged, picking up diagram requests", async () => {
    const active = async () =>
      (await sql<{ id: string; version: number; profile: { diagrams?: string; target_difficulty: number }; learning_summary: { auto_activated?: boolean } | null }[]>`
        select g.id, g.version, g.profile, g.learning_summary from bucket_profiles b join generator_versions g on g.id = b.active_generator_version_id where b.slot = 2`)[0];
    const before = await active();
    const s = await runGenerationBatch({ slot: 2, count: 6, providerId: "procedural", adminId, seed: 77 });
    const qs = await questionsOf(s.batchId);
    expect(qs.length).toBeGreaterThanOrEqual(6);

    // Below the threshold / batch not finished: nothing happens.
    await recordJudgment({ adminId, questionId: qs[0].id, judgment: "too_hard", note: "needs a diagram" });
    expect((await batchFullyReviewed(qs[0].id))?.done).toBe(false);
    expect(await autoLearn(2, adminId)).toBeNull();
    expect((await active()).id).toBe(before.id);

    for (const q of qs.slice(1)) await recordJudgment({ adminId, questionId: q.id, judgment: "too_hard", note: q === qs[1] ? "these all must have a diagram" : null });
    expect((await batchFullyReviewed(qs[0].id))?.done).toBe(true);

    const r = await autoLearn(2, adminId);
    expect(r).not.toBeNull();
    const after = await active();
    expect(after.id).toBe(r!.id);
    expect(after.version).toBe(before.version + 1);
    expect(after.profile.diagrams).toBe("required");
    expect(after.profile.target_difficulty).toBeLessThan(before.profile.target_difficulty);
    expect(after.learning_summary?.auto_activated).toBe(true);

    // The judgments are consumed: a second call is a no-op.
    expect(await autoLearn(2, adminId)).toBeNull();
  });

  it("respects auto_learn.enabled = false in the bucket config", async () => {
    await sql`update bucket_profiles set config = config || '{"auto_learn":{"enabled":false,"min_judgments":3}}'::jsonb where slot = 4`;
    const s = await runGenerationBatch({ slot: 4, count: 3, providerId: "procedural", adminId, seed: 5 });
    for (const q of await questionsOf(s.batchId)) await recordJudgment({ adminId, questionId: q.id, judgment: "too_easy" });
    expect(await autoLearn(4, adminId)).toBeNull();
  });
});
