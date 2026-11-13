/**
 * Server-side TeX sanity checks: every math segment in a candidate must render
 * with KaTeX in strict mode. Used by the validation pipeline.
 */
import katex from "katex";
import type { CandidateQuestionT } from "@/lib/schemas/question";
import { splitMath } from "./segments";

export function texProblems(text: string): string[] {
  const problems: string[] = [];
  let segs;
  try {
    segs = splitMath(text);
  } catch (e) {
    return [(e as Error).message];
  }
  for (const s of segs) {
    if (s.type === "text") continue;
    try {
      katex.renderToString(s.value, { displayMode: s.type === "display", throwOnError: true, strict: "ignore" });
    } catch (e) {
      problems.push(`${(e as Error).message.split("\n")[0]} in "${s.value.slice(0, 60)}"`);
    }
  }
  return problems;
}

export function katexProblems(c: CandidateQuestionT): string[] {
  const fields: [string, string][] = [
    ["statement", c.statement],
    ["solution", c.solution],
    ["key_insight", c.key_insight],
    ...c.options.flatMap((o, i) => [
      [`option ${i + 1}`, o.tex] as [string, string],
      [`option ${i + 1} rationale`, o.rationale] as [string, string],
    ]),
  ];
  return fields.flatMap(([name, text]) => texProblems(text).map((p) => `${name}: ${p}`));
}
