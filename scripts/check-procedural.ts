/**
 * Stress-test procedural templates through the full validation pipeline.
 *   npx tsx scripts/check-procedural.ts [slot] [samplesPerDifficulty]
 * Exits non-zero if any generated candidate fails validation.
 */
import { CandidateQuestion } from "@/lib/schemas/question";
import { templatesBySlot } from "@/lib/factory/procedural";
import { Rng } from "@/lib/factory/procedural/rng";
import { RetryTemplate } from "@/lib/factory/procedural/types";
import { runSympyValidator } from "@/lib/factory/validator-client";
import { katexProblems } from "@/lib/math/tex-check";

async function main() {
  const slotArg = process.argv[2] ? Number(process.argv[2]) : null;
  const n = Number(process.argv[3] ?? 6);
  const slots = slotArg ? [slotArg] : Object.keys(templatesBySlot).map(Number);
  let failures = 0;
  for (const slot of slots) {
    for (const tpl of templatesBySlot[slot]) {
      const items = [];
      let retries = 0;
      for (let i = 0; i < n * 3; i++) {
        const d = tpl.range[0] + ((tpl.range[1] - tpl.range[0]) * (i % n)) / Math.max(1, n - 1);
        for (let a = 0; a < 40; a++) {
          try {
            const c = tpl.generate(new Rng(1000 * i + a + 7), d);
            const parsed = CandidateQuestion.safeParse(c);
            if (!parsed.success) {
              console.log(`✗ ${tpl.id} schema: ${parsed.error.issues.slice(0, 3).map((x) => x.path.join(".") + " " + x.message).join("; ")}`);
              failures++;
            }
            const tex = katexProblems(c);
            if (tex.length) {
              console.log(`✗ ${tpl.id} KaTeX: ${tex.join("; ")}`);
              failures++;
            }
            items.push({ id: `${tpl.id}#${i}@${d.toFixed(1)}`, candidate: c });
            break;
          } catch (e) {
            if (e instanceof RetryTemplate) retries++;
            else throw e;
          }
        }
      }
      const { results } = await runSympyValidator(items);
      const bad = results.filter((r) => r.status !== "passed");
      const warns = results.flatMap((r) => r.checks.filter((c) => c.status === "warn").map((c) => c.name));
      console.log(
        `${bad.length ? "✗" : "✓"} slot ${slot} ${tpl.id}: ${results.length - bad.length}/${results.length} passed, ${retries} retries` +
          (warns.length ? `, warnings: ${[...new Set(warns)].join(",")}` : ""),
      );
      for (const r of bad.slice(0, 3)) {
        console.log(`   ${r.id} → ${r.status}: ${r.checks.filter((c) => c.status === "fail").map((c) => `${c.name}: ${c.detail}`).join(" | ")}`);
      }
      failures += bad.length;
    }
  }
  if (failures) {
    console.log(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nall procedural templates validated");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
