import { sql } from "@/lib/db";
import { seedBuckets } from "../scripts/seed";
import { hashPassword } from "@/lib/security/crypto";
import { insertQuestion } from "@/lib/factory/store";
import { validateVersions } from "@/lib/factory/validate";
import { recordJudgment } from "@/lib/factory/feedback";
import { bucket1Templates } from "@/lib/factory/procedural/bucket1";
import { Rng } from "@/lib/factory/procedural/rng";
import type { CandidateQuestionT } from "@/lib/schemas/question";

/** Wipe all data (TRUNCATE bypasses the append-only row triggers) and re-seed buckets + one admin. */
export async function resetDb(): Promise<{ adminId: string }> {
  const tables = await sql<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations'`;
  await sql.unsafe(`truncate ${tables.map((t) => `"${t.tablename}"`).join(", ")} restart identity cascade`);
  await seedBuckets(process.env.DATABASE_URL!, true);
  const [a] = await sql<{ id: string }[]>`insert into admin_users (email, password_hash) values ('t@test', ${hashPassword("test-password-123")}) returning id`;
  return { adminId: a.id };
}

let counter = 0;
/** A genuine, validator-passing question (from a Bucket 1 template) placed in any slot. */
export function sampleCandidate(seed?: number): CandidateQuestionT {
  const s = seed ?? ++counter * 7919;
  const tpl = bucket1Templates[s % bucket1Templates.length];
  for (let i = 0; i < 50; i++) {
    try {
      return tpl.generate(new Rng(s + i), 2.5);
    } catch {
      /* retry */
    }
  }
  throw new Error("could not generate sample");
}

/** Create a question in `slot`, run the real validation pipeline, and approve it via a 'just right' judgment. */
export async function approvedQuestion(slot: number, adminId: string) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = sampleCandidate();
    const { questionId, versionId } = await sql.begin((tx) =>
      insertQuestion(tx, { slot, batchId: null, generatorVersionId: null, source: "seed", candidate, meta: { test: true } }),
    );
    const [v] = await validateVersions([versionId]);
    if (v.status !== "passed") {
      if (v.checks.some((c) => c.name === "duplicate" && c.status === "fail")) continue; // random repeat; draw again
      throw new Error(`fixture failed validation: ${JSON.stringify(v.checks.filter((c) => c.status === "fail"))}`);
    }
    await recordJudgment({ adminId, questionId, judgment: "just_right" });
    return { questionId, versionId };
  }
  throw new Error("could not create a unique fixture question");
}

/** Eight approved questions → approved challenge for `date`. */
export async function approvedChallenge(date: string, adminId: string) {
  const { autoCompose, approveChallenge } = await import("@/lib/composer");
  for (let slot = 1; slot <= 8; slot++) await approvedQuestion(slot, adminId);
  await autoCompose(date, adminId);
  return approveChallenge(date, adminId);
}

export async function newPlayer(name = "Tester") {
  const [p] = await sql<{ id: string }[]>`insert into anonymous_players (token_hash, nickname) values (${`h-${Math.random()}`}, ${name}) returning id`;
  return p.id;
}
