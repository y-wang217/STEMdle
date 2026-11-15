import type { LeanView } from "@/components/admin/LeanPanel";
import { latestLean, type LeanSummary } from "./pipeline";

export function toLeanView(l: LeanSummary | undefined): LeanView | null {
  if (!l) return null;
  return {
    status: l.status,
    refuted: l.refuted,
    method: l.formalization_method,
    eligibilityReason: l.eligibility?.reason ?? null,
    claim: l.claim,
    assumptions: l.assumptions ?? [],
    theorems: l.theorem_source,
    results: (l.results ?? []).map((r) => ({ name: r.name, role: r.role, option: r.option, proved: r.proved, untrustedAxioms: r.untrustedAxioms ?? [] })),
    diagnostics: l.diagnostics,
    consistency: l.consistency_status,
    consistencyMethod: l.consistency_method,
    findings: l.consistency_findings ?? [],
    runner: l.runner,
    durationMs: l.duration_ms,
    leanVersion: l.lean_version,
    mathlibVersion: l.mathlib_version,
    completedAt: l.completed_at,
    lastError: l.last_error,
  };
}

export async function leanViews(versionIds: string[]): Promise<Map<string, LeanView | null>> {
  const m = await latestLean(versionIds);
  return new Map(versionIds.map((id) => [id, toLeanView(m.get(id))]));
}
