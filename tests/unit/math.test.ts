import { describe, expect, it } from "vitest";
import { splitMath } from "@/lib/math/segments";
import { compileExpr } from "@/lib/math/expr";
import { texProblems } from "@/lib/math/tex-check";
import { exactKey, skeleton, structuralSimilarity } from "@/lib/factory/fingerprint";
import { texToHtml } from "@/components/Tex";
import { CandidateQuestion } from "@/lib/schemas/question";
import { bucket1Templates } from "@/lib/factory/procedural/bucket1";
import { allTemplates, generateProcedural } from "@/lib/factory/procedural";
import { Rng } from "@/lib/factory/procedural/rng";
import { RetryTemplate } from "@/lib/factory/procedural/types";

describe("TeX segmentation & rendering", () => {
  it("splits inline and display math and honours escaped dollars", () => {
    expect(splitMath("Cost \\$5 and $x^2$ then $$\\frac12$$.")).toEqual([
      { type: "text", value: "Cost $5 and " },
      { type: "inline", value: "x^2" },
      { type: "text", value: " then " },
      { type: "display", value: "\\frac12" },
      { type: "text", value: "." },
    ]);
  });
  it("rejects unclosed delimiters", () => {
    expect(() => splitMath("oops $x")).toThrow();
    expect(texProblems("oops $x")).toHaveLength(1);
  });
  it("flags invalid TeX", () => {
    expect(texProblems("$\\frac{1}{$")).toHaveLength(1);
    expect(texProblems("$\\sqrt{2} + \\frac{\\pi}{6}$")).toHaveLength(0);
  });
  it("escapes HTML outside math", () => {
    expect(texToHtml("<script>alert(1)</script> $x$")).not.toContain("<script>");
  });
});

describe("safe function compiler for diagrams", () => {
  it("evaluates polynomials, implicit multiplication and functions", () => {
    expect(compileExpr("x^2 - 2x + 1")(3)).toBe(4);
    expect(compileExpr("2(x+1)")(2)).toBe(6);
    expect(compileExpr("-x^2")(3)).toBe(-9);
    expect(compileExpr("sqrt(x) + abs(-3)")(4)).toBe(5);
    expect(compileExpr("sin(pi/2)")(0)).toBeCloseTo(1);
  });
  it("refuses anything that is not math", () => {
    expect(() => compileExpr("alert(1)")).toThrow();
    expect(() => compileExpr("x; process.exit()")).toThrow();
    expect(() => compileExpr("constructor")).toThrow();
  });
});

describe("duplicate fingerprints", () => {
  it("detects identical and structurally identical statements", () => {
    const a = "What is $\\frac{3}{4} + \\frac{5}{6}$?";
    const b = "What is $\\dfrac{3}{4}  + \\frac{5}{6}$?";
    const c = "What is $\\frac{1}{7} + \\frac{2}{9}$?";
    expect(exactKey(a)).toBe(exactKey(b));
    expect(skeleton(a)).toBe(skeleton(c));
    expect(structuralSimilarity(a, c)).toBe(1);
    expect(structuralSimilarity(a, "A circle has radius $5$. Find its area.")).toBeLessThan(0.2);
  });
});

describe("procedural templates (development adapter)", () => {
  it("every template yields schema-valid candidates with one correct option and derived traps", () => {
    for (const tpl of allTemplates()) {
      let made = 0;
      for (let s = 0; s < 40 && made < 5; s++) {
        try {
          const c = tpl.generate(new Rng(s + 1), (tpl.range[0] + tpl.range[1]) / 2);
          expect(CandidateQuestion.safeParse(c).success, tpl.id).toBe(true);
          expect(c.options.filter((o) => o.is_correct)).toHaveLength(1);
          for (const o of c.options.filter((o) => !o.is_correct)) {
            expect(o.misconception.length, tpl.id).toBeGreaterThan(5);
          }
          made++;
        } catch (e) {
          if (!(e instanceof RetryTemplate)) throw e;
        }
      }
      expect(made, tpl.id).toBeGreaterThan(0);
    }
  });
  it("is reproducible from a seed and respects disabled templates", () => {
    const knobs = { difficulty: 2, template_weights: { [bucket1Templates[0].id]: 0 } };
    const a = generateProcedural(1, 6, knobs, 42);
    const b = generateProcedural(1, 6, knobs, 42);
    expect(a.map((x) => x.candidate.statement)).toEqual(b.map((x) => x.candidate.statement));
    expect(a.some((x) => x.template_id === bucket1Templates[0].id)).toBe(false);
  });
});
