/**
 * Formalization consistency audit: does the theorem prove what the question asks?
 * Deterministic checks catch Lean "junk value" traps and structural problems.
 * The optional AI semantic audit is advisory and recorded as such — it is not
 * a formal guarantee.
 */
import type { StoredQuestion } from "@/lib/factory/store";
import { type AiAuditT, aiAudit, aiAvailable } from "./ai";
import type { FormalSpec } from "./formalize";

export interface Finding {
  source: "deterministic" | "ai";
  category: string;
  severity: "high" | "medium" | "low";
  message: string;
}

export type ConsistencyStatus = "consistent" | "inconsistent" | "uncertain" | "not_run";

const norm = (s: string) => s.replace(/\s+/g, "").replace(/^\((.*)\)$/, "$1");

function boundVars(text: string): string[] {
  const vars = new Set<string>();
  for (const m of text.matchAll(/(?:fun|∀|∃|λ)\s*\(?\s*([a-zA-Z_][\w']*(?:\s+[a-zA-Z_][\w']*)*)\s*[:,]/g))
    for (const v of m[1].split(/\s+/)) vars.add(v);
  return [...vars];
}

function denominators(text: string): string[] {
  const out: string[] = [];
  const re = /\/\s*/g;
  let m;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    if (text[i] === "(") {
      let depth = 0;
      const start = i;
      for (; i < text.length; i++) {
        if (text[i] === "(") depth++;
        else if (text[i] === ")" && --depth === 0) break;
      }
      out.push(text.slice(start, i + 1));
    } else {
      const id = /^[a-zA-Z_][\w'.]*/.exec(text.slice(i));
      if (id) out.push(id[0]);
    }
  }
  return out;
}

export function deterministicAudit(q: StoredQuestion, spec: FormalSpec, statements: string): Finding[] {
  const f: Finding[] = [];
  const add = (category: string, severity: Finding["severity"], message: string) => f.push({ source: "deterministic", category, severity, message });
  const text = `${spec.predicate}\n${spec.assumptions.map((a) => a.lean).join("\n")}`;
  const vars = boundVars(text);
  const hasVar = (s: string) => vars.some((v) => new RegExp(`(^|[^\\w'])${v.replace(/'/g, "\\'")}([^\\w']|$)`).test(s));
  const guarded = (expr: string) => {
    const e = norm(expr);
    const t = text.replace(/\s+/g, "");
    return [`${e}≠0`, `(${e})≠0`, `0<${e}`, `0<(${e})`, `${e}>0`, `(${e})>0`, `0≠${e}`].some((g) => t.includes(g));
  };

  for (const d of denominators(text))
    if (hasVar(d) && !guarded(d))
      add("domain", "high", `Division by \`${d}\`, which can be zero, without a hypothesis that it is nonzero. Lean defines a / 0 = 0, so a value that makes the denominator zero could wrongly satisfy the formal statement.`);
  for (const m of text.matchAll(/Real\.sqrt\s*(\([^()]*(?:\([^()]*\)[^()]*)*\)|[a-zA-Z_][\w']*)/g))
    if (hasVar(m[1]) && !text.replace(/\s+/g, "").includes(`0≤${norm(m[1])}`))
      add("domain", "medium", `Real.sqrt ${m[1]} without a hypothesis that the radicand is non-negative (Lean returns 0 for negative inputs).`);
  for (const m of text.matchAll(/Real\.log\s*(\([^()]*\)|[a-zA-Z_][\w']*)/g))
    if (hasVar(m[1]) && !guarded(m[1])) add("domain", "medium", `Real.log ${m[1]} without a positivity hypothesis (Lean's log is defined on all reals).`);
  if ((spec.answerType === "ℕ" || /: ℕ/.test(text)) && /[^-]-[^>-]/.test(text))
    add("domain", "medium", "Subtraction on ℕ truncates at 0 in Lean; check the question's arithmetic never goes negative.");
  if ((spec.answerType === "ℤ" || spec.answerType === "ℕ") && /\//.test(spec.predicate))
    add("wrong_quantity", "high", "Division in ℤ/ℕ floors in Lean, which differs from exact division in the question.");
  if (q.verification?.precision_dp != null) add("rounding", "high", "The answer is rounded but the formal statement uses exact values.");
  for (const a of spec.assumptions)
    if (!a.justification.trim()) add("implicit_restriction", "medium", `Assumption \`${a.lean}\` has no justification from the question text.`);
  if (spec.method === "expression")
    add(
      "modelling",
      "low",
      "Expression-level formalization: Lean checks the arithmetic of the question's verification expression; that this expression is what the question asks is not formally verified.",
    );
  if (!statements.includes("mathdle_key")) add("other", "high", "Main theorem missing.");
  return f;
}

export async function audit(
  q: StoredQuestion,
  spec: FormalSpec,
  statements: string,
): Promise<{ status: ConsistencyStatus; method: string; findings: Finding[]; ai: AiAuditT | null; aiError: string | null }> {
  const findings = deterministicAudit(q, spec, statements);
  let ai: AiAuditT | null = null;
  let aiError: string | null = null;
  if (aiAvailable()) {
    try {
      ai = await aiAudit({
        statement: q.statement,
        options: q.options.map((o) => o.tex),
        keyLabel: q.options.find((o) => o.is_correct)!.label,
        claim: spec.claim,
        assumptions: spec.assumptions.map((a) => `${a.lean} (${a.justification})`),
        theorems: statements,
        method:
          spec.method === "expression"
            ? `deterministic export of the question's SymPy verification expression (${q.verification.expression}); confirm this expression is exactly what the question asks`
            : "AI formalization of the question text",
      });
      for (const x of ai.findings) findings.push({ source: "ai", ...x });
    } catch (e) {
      aiError = (e as Error).message;
    }
  }
  let status: ConsistencyStatus;
  if (findings.some((x) => x.severity === "high") || ai?.verdict === "inconsistent") status = "inconsistent";
  else if (ai?.verdict === "consistent" && !findings.some((x) => x.severity === "medium")) status = "consistent";
  else status = "uncertain"; // no AI audit, AI unsure, or unresolved medium findings
  return { status, method: ai ? "deterministic+ai" : "deterministic", findings, ai, aiError };
}
