"use client";
/** Compact Lean verification indicator + expandable details. Read-only except for Retry. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "./kit";

export interface LeanView {
  status: string;
  refuted: boolean;
  method: string | null;
  eligibilityReason: string | null;
  claim: string | null;
  assumptions: { lean: string; justification: string }[];
  theorems: string | null;
  results: { name: string; role: string; option?: string; proved: boolean; untrustedAxioms: string[] }[];
  diagnostics: string | null;
  consistency: string | null;
  consistencyMethod: string | null;
  findings: { source: string; category: string; severity: string; message: string }[];
  runner: string | null;
  durationMs: number | null;
  leanVersion: string | null;
  mathlibVersion: string | null;
  completedAt: string | null;
  lastError: string | null;
}

const TONE: Record<string, { cls: string; label: string }> = {
  verified: { cls: "bg-green-600 text-white", label: "Lean: verified" },
  unsupported: { cls: "bg-amber-400 text-amber-950", label: "Lean: unsupported" },
  inconclusive: { cls: "bg-amber-400 text-amber-950", label: "Lean: inconclusive" },
  proof_failed: { cls: "bg-red-600 text-white", label: "Lean: proof failed" },
  consistency_failed: { cls: "bg-red-600 text-white", label: "Lean: consistency failed" },
  pending: { cls: "bg-neutral-400 text-white", label: "Lean: pending" },
};

export function LeanChip({ lean, onClick }: { lean: LeanView | null; onClick?: () => void }) {
  const t = TONE[lean?.status ?? "pending"] ?? TONE.pending;
  return (
    <button type="button" onClick={onClick} className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${t.cls}`} data-testid="lean-chip" title="Formal verification (Lean 4 + Mathlib)">
      {lean ? t.label : "Lean: not queued"}
      {lean?.refuted && " · key refuted"}
    </button>
  );
}

const ROLE: Record<string, string> = {
  key: "answer key satisfies the question",
  excludes: "distractor fails",
  distinct: "options pairwise distinct",
  refute_key: "refutation: key fails",
  refute_option: "refutation: distractor also works",
  unique: "uniqueness",
};

export function LeanDetails({ lean, questionId }: { lean: LeanView | null; questionId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const retry = async () => {
    try {
      const r = await post<{ message: string }>(`/api/admin/questions/${questionId}/lean`);
      setMsg(r.message);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <div className="space-y-2 text-xs" data-testid="lean-details">
      <div className="flex flex-wrap items-center gap-2">
        <LeanChip lean={lean} />
        {lean?.consistency && (
          <span>
            consistency: <b>{lean.consistency}</b> {lean.consistencyMethod && `(${lean.consistencyMethod})`}
          </span>
        )}
        {lean?.method && <span>formalization: {lean.method}</span>}
        {lean?.runner && (
          <span className="text-neutral-500">
            {lean.runner} · Lean {lean.leanVersion} · Mathlib {lean.mathlibVersion} · {lean.durationMs ? `${(lean.durationMs / 1000).toFixed(1)}s` : ""}
          </span>
        )}
        <button className="ml-auto rounded border px-2 py-0.5" onClick={retry} data-testid="lean-retry">
          Retry Lean verification
        </button>
      </div>
      {msg && <p className="text-neutral-500">{msg}</p>}
      {!lean && <p>Not queued yet. Retry to verify this version.</p>}
      {lean?.status === "pending" && <p>Queued{lean.lastError ? ` — last attempt: ${lean.lastError}` : ""}. Verification runs in the background.</p>}
      {lean?.status === "unsupported" && <p>Not eligible: {lean.eligibilityReason}. SymPy validation and your review still apply.</p>}
      {lean?.claim && (
        <p>
          <b>Claim:</b> {lean.claim}
        </p>
      )}
      {lean?.assumptions?.length ? (
        <p>
          <b>Assumptions added:</b> {lean.assumptions.map((a) => `${a.lean} (${a.justification})`).join("; ")}
        </p>
      ) : null}
      {lean?.results?.length ? (
        <ul className="grid gap-x-4 sm:grid-cols-2">
          {lean.results.map((r) => (
            <li key={r.name} className={r.role.startsWith("refute") ? (r.proved ? "font-semibold text-red-600" : "text-neutral-500") : r.proved ? "text-green-700" : "text-amber-700"}>
              {r.role.startsWith("refute") ? (r.proved ? "✗" : "·") : r.proved ? "✓" : "?"} {ROLE[r.role] ?? r.role}
              {r.option ? ` (${r.option})` : ""}
              {/* sorryAx on a failed attempt just means "not proved"; only flag other untrusted axioms */}
              {r.untrustedAxioms?.filter((a) => a !== "sorryAx").length ? ` — untrusted axioms rejected: ${r.untrustedAxioms.filter((a) => a !== "sorryAx").join(", ")}` : ""}
              {r.role.startsWith("refute") && !r.proved ? " — not refuted" : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {lean?.findings?.length ? (
        <ul className="space-y-0.5">
          {lean.findings.map((f, i) => (
            <li key={i} className={f.severity === "high" ? "text-red-700" : f.severity === "medium" ? "text-amber-700" : "text-neutral-600"}>
              [{f.source === "ai" ? "AI audit — advisory" : "deterministic"} · {f.category} · {f.severity}] {f.message}
            </li>
          ))}
        </ul>
      ) : null}
      {lean?.theorems && (
        <details>
          <summary className="cursor-pointer">Lean theorem statements</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 font-mono text-[11px] dark:bg-neutral-950">{lean.theorems}</pre>
        </details>
      )}
      {lean?.diagnostics && (
        <details>
          <summary className="cursor-pointer">Diagnostics</summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]">{lean.diagnostics}</pre>
        </details>
      )}
    </div>
  );
}
