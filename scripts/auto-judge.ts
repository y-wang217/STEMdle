/**
 * Judge one batch (or a slot's oldest unjudged questions) with the solver ladder,
 * plus player-data overrides. Judgments are recorded as the disabled
 * auto-judge@mathdle.local admin. Spends real API money, capped per run.
 *   npx tsx scripts/auto-judge.ts --batch <uuid> [--limit 10] [--cap 2]
 *   npx tsx scripts/auto-judge.ts --slot 3 [--limit 10] [--cap 2]
 */
import "dotenv/config";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const batchId = arg("batch");
  const slot = arg("slot") ? Number(arg("slot")) : undefined;
  if (!batchId && !slot) throw new Error("usage: auto-judge.ts --batch <uuid> | --slot <1-8> [--limit N] [--cap USD]");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set; the solver ladder needs it");
  const { sql } = await import("@/lib/db");
  const { autoJudge } = await import("@/lib/factory/auto-judge");
  const report = await autoJudge({
    batchId,
    slot,
    limit: arg("limit") ? Number(arg("limit")) : undefined,
    costCapUsd: arg("cap") ? Number(arg("cap")) : undefined,
  });
  for (const i of report.items)
    console.log(`${i.outcome.padEnd(8)} slot ${i.slot} ${i.questionId} ${i.judgment ?? ""} $${i.costUsd.toFixed(4)}: ${i.detail}`);
  console.log(
    `judged ${report.counts.judged}, flagged ${report.counts.flagged}, skipped ${report.counts.skipped}, unjudged ${report.counts.unjudged}; ` +
      `spent $${report.spentUsd.toFixed(4)} of $${report.costCapUsd}${report.stopped ? " (stopped: cost cap)" : ""}`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
