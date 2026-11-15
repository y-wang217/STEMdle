import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { loadQuestions } from "@/lib/factory/store";
import { feedbackHistory } from "@/lib/factory/feedback";
import { Card, StatusChip, td, th } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/kit";
import { VerifyForm } from "@/components/admin/VerifyForm";
import { LeanDetails } from "@/components/admin/LeanPanel";
import { leanViews } from "@/lib/lean/view";
import { Tex } from "@/components/Tex";
import { Diagram } from "@/components/Diagram";

export default async function QuestionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [q] = await loadQuestions([id]);
  if (!q) notFound();
  const [validations, feedback, usage] = await Promise.all([
    sql<{ status: string; engine: string; checks: { name: string; status: string; detail: string }[]; created_at: Date }[]>`
      select status, engine, checks, created_at from question_validations where question_version_id = ${q.version_id} order by created_at desc`,
    feedbackHistory(id),
    sql<{ challenge_date: string; slot: number; status: string; voided_at: Date | null }[]>`
      select d.challenge_date::text, cq.slot, d.status, cq.voided_at from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id where cq.question_id = ${id}`,
  ]);
  const latest = validations[0];
  const lean = (await leanViews([q.version_id])).get(q.version_id) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <Card
          title={
            <>
              Slot {q.slot} question · v{q.version} <StatusChip status={q.status} /> {q.locked_at && <span className="text-xs">🔒 published version (immutable)</span>}
            </>
          }
          actions={<ActionButton url={`/api/admin/questions/${id}/revalidate`}>Re-run validation</ActionButton>}
        >
          <Tex as="div" className="text-base leading-relaxed">{q.statement}</Tex>
          {q.diagram && (
            <div className="mt-2">
              <Diagram spec={q.diagram} admin className="max-w-md rounded border" />
              <p className="text-xs text-neutral-500">
                to_scale: {String(q.diagram.to_scale)} · essential: {String(q.diagram.essential)} · alt: {q.diagram.alt_text}
              </p>
            </div>
          )}
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr>
                {["", "Display", "SymPy value", "Trap / rationale", "Derivation"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.options.map((o) => (
                <tr key={o.id} className={o.is_correct ? "bg-green-50 dark:bg-green-950/40" : ""}>
                  <td className={td}>
                    <b>{o.label}</b>
                    {o.is_correct && " ✓"}
                  </td>
                  <td className={td}>
                    <Tex>{o.tex}</Tex>
                  </td>
                  <td className={`${td} font-mono text-[11px]`}>{o.value}</td>
                  <td className={td}>
                    {o.misconception && <b>{o.misconception}. </b>}
                    <Tex>{o.rationale}</Tex>
                  </td>
                  <td className={`${td} font-mono text-[11px]`}>{o.derivation}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="mt-3 font-semibold">Key insight</h3>
          <Tex as="div">{q.key_insight}</Tex>
          <h3 className="mt-2 font-semibold">Solution</h3>
          <Tex as="div" className="leading-relaxed">{q.solution}</Tex>
          <h3 className="mt-2 font-semibold">Verification</h3>
          <pre className="whitespace-pre-wrap rounded bg-neutral-50 p-2 text-[11px] dark:bg-neutral-950">{JSON.stringify(q.verification, null, 2)}</pre>
          <p className="mt-2 text-xs text-neutral-500">
            tags: {q.tags.join(", ")} · techniques: {q.techniques.join(", ")} · est. difficulty {q.estimated_difficulty} · est. {q.estimated_solve_seconds}s · source {q.source}{" "}
            {q.template_id} · meta {JSON.stringify(q.generation_meta)}
          </p>
        </Card>
      </div>
      <div>
        <Card title={<>Validation {latest && <StatusChip status={latest.status} />}</>}>
          {latest ? (
            <>
              <p className="mb-1 text-xs text-neutral-500">
                {latest.engine} · {latest.created_at.toISOString()}
              </p>
              <table className="w-full border-collapse" data-testid="checks">
                <tbody>
                  {latest.checks.map((c, i) => (
                    <tr key={i}>
                      <td className={td}>
                        <span className={c.status === "fail" ? "text-red-600" : c.status === "warn" ? "text-amber-600" : c.status === "pass" ? "text-green-700" : "text-neutral-500"}>
                          {c.status}
                        </span>
                      </td>
                      <td className={`${td} font-mono text-[11px]`}>{c.name}</td>
                      <td className={td}>{c.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p>Not validated.</p>
          )}
          {validations.length > 1 && <p className="mt-1 text-xs text-neutral-500">{validations.length - 1} earlier validation run(s) kept immutably.</p>}
        </Card>
        <Card title="Formal verification (Lean 4 + Mathlib) — separate from SymPy">
          <LeanDetails lean={lean} questionId={id} />
        </Card>
        {(q.status === "needs_review" || (latest?.status === "needs_review" && !q.math_verified_at)) && (
          <Card title="Explicit mathematical review">
            <p className="mb-2">Automated checks could not fully verify this question. Confirm you have checked the mathematics yourself; your note is audited.</p>
            <VerifyForm questionId={id} />
          </Card>
        )}
        {q.math_verified_at && <Card title="Math review">Manually verified at {String(q.math_verified_at)}</Card>}
        <Card title="Judgments (immutable history)">
          <ul>
            {feedback.map((f) => (
              <li key={f.id}>
                <b>{f.judgment}</b> by {f.email} at {new Date(f.created_at).toISOString().slice(0, 16)} {f.note && <i>— {f.note}</i>}
              </li>
            ))}
            {!feedback.length && <li className="text-neutral-500">none</li>}
          </ul>
        </Card>
        <Card title="Used in challenges">
          {usage.length ? (
            usage.map((u) => (
              <div key={u.challenge_date}>
                {u.challenge_date} slot {u.slot} <StatusChip status={u.status} /> {u.voided_at && <b className="text-red-600">voided</b>}
              </div>
            ))
          ) : (
            <span className="text-neutral-500">not scheduled</span>
          )}
        </Card>
      </div>
    </div>
  );
}
