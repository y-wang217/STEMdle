/**
 * LOCAL DEMONSTRATION ONLY.
 * Fills the bank and schedules a few days so the player game can be tried
 * without hours of manual review:
 *   1. generates a procedural batch for each of the eight slots (real pipeline + SymPy),
 *   2. records "just right" for validated questions as the clearly-labelled
 *      `demo-reviewer@mathdle.local` admin with note "DEMO: automated judgment",
 *   3. composes and approves today + the next N days.
 * Demo judgments are distinguishable from genuine ones by reviewer and note;
 * never run this against production.
 *   npx tsx scripts/demo.ts [days=3]
 */
import "dotenv/config";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("demo seeding is disabled in production");
  const days = Number(process.argv[2] ?? 3);
  const { sql } = await import("@/lib/db");
  const { hashPassword, randomToken } = await import("@/lib/security/crypto");
  const { runGenerationBatch } = await import("@/lib/factory/pipeline");
  const { recordJudgment } = await import("@/lib/factory/feedback");
  const { autoCompose, approveChallenge, getChallengeByDate } = await import("@/lib/composer");
  const { torontoDate, addDays } = await import("@/lib/time");

  const [demo] = await sql<{ id: string }[]>`
    insert into admin_users (email, password_hash, disabled) values ('demo-reviewer@mathdle.local', ${hashPassword(randomToken())}, true)
    on conflict (email) do update set disabled = true returning id`;

  for (let slot = 1; slot <= 8; slot++) {
    const s = await runGenerationBatch({ slot, count: days + 3, providerId: "procedural", adminId: null });
    const ready = await sql<{ id: string }[]>`select id from questions where batch_id = ${s.batchId} and status = 'ready'`;
    for (const q of ready) await recordJudgment({ adminId: demo.id, questionId: q.id, judgment: "just_right", note: "DEMO: automated judgment for local demonstration" });
    console.log(`slot ${slot}: ${s.produced} generated, ${s.passed} validated, ${ready.length} demo-approved`);
  }
  for (let i = 0; i < days; i++) {
    const date = addDays(torontoDate(), i);
    const existing = await getChallengeByDate(date);
    if (existing && existing.status !== "draft") continue;
    const { missing } = await autoCompose(date, demo.id);
    if (missing.length) {
      console.log(`${date}: missing slots ${missing.join(",")}, left as draft`);
      continue;
    }
    await approveChallenge(date, demo.id);
    console.log(`${date}: approved (demo)`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
