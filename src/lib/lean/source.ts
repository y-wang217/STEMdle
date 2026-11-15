/**
 * Building and reading Lean check files.
 *
 * Generated Lean is untrusted. Defence in depth:
 *  1. AI-supplied fragments (predicates, terms, tactic blocks) pass a lint that
 *     forbids anything that runs code at elaboration time, declares axioms or
 *     escapes the theorem being checked.
 *  2. WE write every `theorem … :` header, so a proof can never change the
 *     statement it proves.
 *  3. After compiling, `#print axioms` must show only the standard axioms; a
 *     `sorry` (sorryAx) or any new axiom fails the theorem.
 *  4. The file is compiled in an isolated runner (see runner.ts).
 */
import { createHash } from "node:crypto";
import { ALLOWED_AXIOMS } from "./env";

export type TheoremRole = "key" | "excludes" | "distinct" | "refute_key" | "refute_option" | "unique";

export interface TheoremSpec {
  name: string; // mathdle_[a-z0-9_]+
  role: TheoremRole;
  option?: string; // A–D for excludes / refute_option
  statement: string; // Lean proposition
  /** Candidate proof bodies (tactic blocks). The default cascade is used when empty. */
  proofs?: string[];
}

export interface TheoremResult {
  name: string;
  role: TheoremRole;
  option?: string;
  proved: boolean;
  axioms: string[] | null;
  untrustedAxioms: string[];
  errors: string[];
}

/** Tactic cascade tried on every goal before any AI proof attempt. */
export const CASCADE = [
  "(norm_num; done)",
  "(intros; ring)",
  "(intros; norm_num; done)",
  "(intro h; have h2 := congrArg (fun x => x ^ 2) h; norm_num [mul_pow, div_pow, Real.sq_sqrt, Real.sqrt_nonneg] at h2)",
  "(rw [Real.sqrt_eq_iff_mul_self_eq_of_pos (by norm_num)]; norm_num)",
  "(simp; done)",
  "(norm_num [Finset.sum_Icc_succ_top, Finset.prod_Icc_succ_top])",
  "(simp [Finset.sum_Icc_succ_top, Finset.prod_Icc_succ_top]; norm_num)",
  "(ring_nf; done)",
  "(field_simp; ring_nf; done)",
  "(norm_num [abs_of_nonneg, abs_of_nonpos, Int.floor_eq_iff, Int.ceil_eq_iff]; done)",
  "(positivity)",
  "(omega)",
  "(intro h; have h0 := h 0; norm_num at h0)",
  "(intro h; have h1 := h 1; norm_num at h1)",
  "(nlinarith)",
  "(intros; nlinarith)",
  "(decide)",
];

export function cascadeProof(): string {
  // Every alternative must close the goal (`done`), otherwise `first` would
  // accept a tactic that merely made progress (e.g. `ring` falling back to ring_nf).
  return ["try beta_reduce", "first", ...CASCADE.map((t) => `  | (${t}; done)`)].join("\n");
}

const FORBIDDEN: [RegExp, string][] = [
  [/\bsorry\b/, "sorry"],
  [/\badmit\b/, "admit"],
  [/\baxiom\b/, "axiom declaration"],
  [/\bunsafe\b/, "unsafe code"],
  [/\bimplemented_by\b|\bextern\b/, "implementation override"],
  [/#[a-z_]+/, "command (#eval, #exit, #print …)"],
  [/\brun_cmd\b|\brun_tac\b|\brun_elab\b|\brun_meta\b/, "meta-program execution"],
  [/\belab\b|\bmacro\b|\bmacro_rules\b|\bsyntax\b|\bnotation\b|\binfix[lr]?\b|\bprefix\b|\bpostfix\b/, "syntax extension"],
  [/\binitialize\b|\bbuiltin_initialize\b/, "initializer"],
  [/\bimport\b/, "import"],
  [/\bset_option\b/, "set_option"],
  [/\bnative_decide\b|\bofReduceBool\b|\bLean\.|\bIO\b|\bSystem\b|\bunsafeCast\b/, "native code / meta API"],
  [/\b(theorem|lemma|def|abbrev|instance|structure|class|inductive|opaque|example|namespace|section|end|open|attribute|variable|universe|noncomputable|private|protected|deriving|mutual)\b/, "declaration or scope command"],
  [/@\[/, "attribute"],
  [/`\(|`\[/, "syntax quotation"],
  [/\/-|-\//, "block comment"],
];

/** Returns problems for an AI-supplied fragment (statement part, term or tactic block). */
export function lintFragment(text: string, kind: "term" | "tactic"): string[] {
  const problems: string[] = [];
  if (text.length > 6000) problems.push("fragment too long");
  for (const [re, label] of FORBIDDEN) if (re.test(text)) problems.push(`forbidden: ${label}`);
  if (kind === "term" && /:=|\n/.test(text)) problems.push("a term may not contain ':=' or newlines");
  if (/[^\S\n]*\bby\b/.test(text) && kind === "term") problems.push("tactic blocks are not allowed inside statements");
  return problems;
}

export function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

export interface BuiltFile {
  source: string;
  statements: string; // theorem headers only (what is claimed), for storage/audit
  ranges: { name: string; start: number; end: number }[];
}

export function buildFile(theorems: TheoremSpec[], proofFor: (t: TheoremSpec) => string): BuiltFile {
  const lines: string[] = ["import Mathlib", ""];
  const ranges: BuiltFile["ranges"] = [];
  const statements: string[] = [];
  for (const t of theorems) {
    if (!/^mathdle_[a-z0-9_]+$/.test(t.name)) throw new Error(`bad theorem name ${t.name}`);
    const start = lines.length + 1;
    statements.push(`theorem ${t.name} : ${t.statement}`);
    lines.push(`set_option maxHeartbeats 400000 in`);
    // Exact arithmetic on contest-sized powers (e.g. 7^2026 mod 10); bounded by heartbeats.
    lines.push(`set_option exponentiation.threshold 4096 in`);
    lines.push(`theorem ${t.name} :`);
    lines.push(`    ${t.statement} := by`);
    for (const l of proofFor(t).split("\n")) lines.push(`  ${l}`);
    ranges.push({ name: t.name, start, end: lines.length });
    lines.push("");
  }
  for (const t of theorems) lines.push(`#print axioms ${t.name}`);
  return { source: lines.join("\n") + "\n", statements: statements.join("\n"), ranges };
}

interface LeanMessage {
  severity: "error" | "warning" | "information";
  data: string;
  pos?: { line: number; column: number };
}

/** Parse `lean --json` output into per-theorem results. */
export function parseOutput(built: BuiltFile, theorems: TheoremSpec[], stdout: string): { results: TheoremResult[]; fileErrors: string[] } {
  const msgs: LeanMessage[] = [];
  for (const line of stdout.split("\n")) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      msgs.push(JSON.parse(s));
    } catch {
      /* ignore non-JSON lines */
    }
  }
  const fileErrors: string[] = [];
  const results: TheoremResult[] = theorems.map((t) => ({ name: t.name, role: t.role, option: t.option, proved: false, axioms: null, untrustedAxioms: [], errors: [] }));
  const byName = new Map(results.map((r) => [r.name, r]));
  for (const m of msgs) {
    const ax = /^'(mathdle_[a-z0-9_]+)' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)/.exec(m.data);
    if (ax && m.severity === "information") {
      const r = byName.get(ax[1]);
      if (r) r.axioms = ax[2] ? ax[2].split(",").map((s) => s.trim()).filter(Boolean) : [];
      continue;
    }
    if (m.severity !== "error") continue;
    const line = m.pos?.line ?? 0;
    const range = built.ranges.find((r) => line >= r.start && line <= r.end);
    if (range) byName.get(range.name)!.errors.push(m.data.slice(0, 800));
    else fileErrors.push(m.data.slice(0, 800));
  }
  for (const r of results) {
    r.untrustedAxioms = (r.axioms ?? []).filter((a) => !ALLOWED_AXIOMS.has(a));
    r.proved = r.errors.length === 0 && r.axioms !== null && r.untrustedAxioms.length === 0 && fileErrors.length === 0;
  }
  return { results, fileErrors };
}
