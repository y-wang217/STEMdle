/**
 * E2E fixture: fresh database with today's approved challenge (includes a
 * geometry diagram and a function graph) and a reviewable batch for slot 1.
 * Run via playwright globalSetup: `tsx tests/e2e/setup-db.ts`.
 */
import { migrate } from "../../scripts/migrate";
import { seedBuckets } from "../../scripts/seed";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (!/e2e|test/.test(url)) throw new Error("refusing to reset a non-test database");
  await migrate(url, { reset: true, quiet: true });
  await seedBuckets(url, true);
  const { sql } = await import("@/lib/db");
  const { hashPassword } = await import("@/lib/security/crypto");
  const { insertQuestion } = await import("@/lib/factory/store");
  const { validateVersions } = await import("@/lib/factory/validate");
  const { recordJudgment } = await import("@/lib/factory/feedback");
  const { autoCompose, approveChallenge } = await import("@/lib/composer");
  const { runGenerationBatch } = await import("@/lib/factory/pipeline");
  const { torontoDate } = await import("@/lib/time");
  const { bucket1Templates } = await import("@/lib/factory/procedural/bucket1");
  const { Rng } = await import("@/lib/factory/procedural/rng");

  const [admin] = await sql<{ id: string }[]>`
    insert into admin_users (email, password_hash) values ('e2e@mathdle.test', ${hashPassword("e2e-password-123")}) returning id`;

  const diagramQ = {
    statement: "In right triangle $ABC$ with the right angle at $A$, $AB = 4$ and $AC = 3$. What is $BC$?",
    options: [
      { tex: "$5$", value: "5", is_correct: true, misconception: "", rationale: "Pythagoras: $3^2 + 4^2 = 25$.", derivation: null },
      { tex: "$7$", value: "7", is_correct: false, misconception: "Added the legs", rationale: "Lengths do not add across a corner.", derivation: "3 + 4" },
      { tex: "$\\sqrt{7}$", value: "sqrt(7)", is_correct: false, misconception: "Subtracted the squares", rationale: "Used $4^2 - 3^2$.", derivation: "sqrt(4**2 - 3**2)" },
      { tex: "$25$", value: "25", is_correct: false, misconception: "Forgot the square root", rationale: "Stopped at $BC^2$.", derivation: "3**2 + 4**2" },
    ],
    solution: "By the Pythagorean theorem, $BC^2 = AB^2 + AC^2 = 16 + 9 = 25$, so $BC = 5$.",
    key_insight: "The hypotenuse is opposite the right angle.",
    tags: ["geometry"],
    techniques: ["Pythagoras"],
    estimated_difficulty: 3,
    estimated_solve_seconds: 30,
    verification: { kind: "sympy" as const, expression: "sqrt(3**2 + 4**2)", checks: [], precision_dp: null, notes: "" },
    diagram: {
      type: "geometry" as const,
      x_min: -1, x_max: 5.5, y_min: -1, y_max: 4,
      axes: false, grid: false, to_scale: true, essential: false,
      alt_text: "Right triangle ABC with the right angle at A; AB = 4 along the bottom, AC = 3 up the left side.",
      elements: [
        { kind: "point" as const, id: "A", x: 0, y: 0, label: null, show: true },
        { kind: "point" as const, id: "B", x: 4, y: 0, label: null, show: true },
        { kind: "point" as const, id: "C", x: 0, y: 3, label: null, show: true },
        { kind: "polygon" as const, vertices: ["A", "B", "C"], shaded: true },
        { kind: "segment" as const, from: "A", to: "B", label: "4", length: 4, dashed: false, ticks: 0, arrows: 0 },
        { kind: "segment" as const, from: "C", to: "A", label: "3", length: 3, dashed: false, ticks: 0, arrows: 0 },
        { kind: "angle" as const, a: "B", vertex: "A", b: "C", label: null, right: true, measure_deg: 90 },
      ],
    },
    template_id: null,
  };
  const graphQ = {
    statement: "The parabola shown is $y = x^2 - 4x + 3$. What is the $y$-coordinate of its vertex?",
    options: [
      { tex: "$-1$", value: "-1", is_correct: true, misconception: "", rationale: "$y = (x-2)^2 - 1$.", derivation: null },
      { tex: "$3$", value: "3", is_correct: false, misconception: "Gave the y-intercept", rationale: "The y-intercept is not the vertex.", derivation: "3" },
      { tex: "$2$", value: "2", is_correct: false, misconception: "Gave the x-coordinate of the vertex", rationale: "Answered the wrong coordinate.", derivation: "4/2" },
      { tex: "$7$", value: "7", is_correct: false, misconception: "Sign error completing the square", rationale: "Used $(x-2)^2 + 4 + 3$.", derivation: "4 + 3" },
    ],
    solution: "Complete the square: $x^2 - 4x + 3 = (x-2)^2 - 1$, so the vertex is $(2, -1)$.",
    key_insight: "Completing the square exposes the vertex.",
    tags: ["graphs"],
    techniques: ["completing the square"],
    estimated_difficulty: 4.5,
    estimated_solve_seconds: 60,
    verification: { kind: "sympy" as const, expression: "(x**2 - 4*x + 3).subs(x, 2)", checks: ["diff(x**2 - 4*x + 3, x).subs(x, 2) == 0"], precision_dp: null, notes: "" },
    diagram: {
      type: "graph" as const,
      x_min: -1, x_max: 5, y_min: -2, y_max: 6,
      axes: true, grid: true, to_scale: true, essential: false,
      alt_text: "Upward parabola crossing the x-axis at 1 and 3.",
      elements: [{ kind: "function" as const, expr: "x^2 - 4x + 3", x_min: -0.5, x_max: 4.5, label: null }],
    },
    template_id: null,
  };

  const fixtures: Record<number, object> = { 3: diagramQ, 4: graphQ };
  let seed = 100;
  for (let slot = 1; slot <= 8; slot++) {
    for (;;) {
      let candidate = fixtures[slot] as never;
      if (!candidate) {
        const tpl = bucket1Templates[(slot + seed) % bucket1Templates.length];
        try {
          candidate = tpl.generate(new Rng(seed++), 2) as never;
        } catch {
          continue;
        }
      }
      const { questionId, versionId } = await sql.begin((tx) => insertQuestion(tx, { slot, batchId: null, generatorVersionId: null, source: "seed", candidate, meta: { e2e: true } }));
      const [v] = await validateVersions([versionId]);
      if (v.status !== "passed") {
        if (fixtures[slot]) throw new Error(`fixture slot ${slot} failed: ${JSON.stringify(v.checks.filter((c) => c.status === "fail"))}`);
        continue;
      }
      await recordJudgment({ adminId: admin.id, questionId, judgment: "just_right" });
      break;
    }
  }
  const today = torontoDate();
  await autoCompose(today, admin.id);
  await approveChallenge(today, admin.id);
  await runGenerationBatch({ slot: 1, count: 6, providerId: "procedural", adminId: admin.id, seed: 2026 });
  await sql.end();
  console.log("e2e database ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
