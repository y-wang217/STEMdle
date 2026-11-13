import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { calibrationVerdict, playerPerformance, versionMetrics } from "@/lib/factory/metrics";
import { availableProviders, defaultProviderId } from "@/lib/factory/providers";
import { Card, StatusChip, td, th } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/kit";
import { BucketControls, ProfileEditor } from "@/components/admin/BucketControls";
import { Tex } from "@/components/Tex";

export default async function BucketPage({ params }: { params: Promise<{ slot: string }> }) {
  const slot = Number((await params).slot);
  const [bucket] = await sql<{ slot: number; name: string; character: string; config: unknown; active: string; profile: unknown; version: number }[]>`
    select b.slot, b.name, b.character, b.config, b.active_generator_version_id as active, g.profile, g.version
    from bucket_profiles b join generator_versions g on g.id = b.active_generator_version_id where b.slot = ${slot}`;
  if (!bucket) notFound();
  const [versions, perf, batches, drafts] = await Promise.all([
    versionMetrics(slot),
    playerPerformance(slot),
    sql<{ id: string; created_at: Date; provider: string; status: string; produced_count: number; requested_count: number; error: string | null; version: number; ready: number }[]>`
      select b.id, b.created_at, b.provider, b.status, b.produced_count, b.requested_count, b.error, g.version,
        (select count(*) from questions q where q.batch_id = b.id and q.status in ('ready','needs_review'))::int as ready
      from generation_batches b join generator_versions g on g.id = b.generator_version_id
      where b.slot = ${slot} order by b.created_at desc limit 15`,
    sql<{ id: string; version: number; status: string; learning_summary: Record<string, unknown> | null; profile: unknown; parent_version: number | null }[]>`
      select g.id, g.version, g.status, g.learning_summary, g.profile, p.version as parent_version
      from generator_versions g left join generator_versions p on p.id = g.parent_id
      where g.slot = ${slot} and g.status = 'draft' order by g.version desc`,
  ]);
  const verdicts = Object.fromEntries(await Promise.all(versions.filter((v) => v.status === "active").map(async (v) => [v.id, await calibrationVerdict(v.id)] as const)));
  const providers = availableProviders();

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">
        Slot {slot}: {bucket.name}
      </h1>
      <p className="mb-3 text-neutral-500">{bucket.character} · active generator v{bucket.version}</p>

      <BucketControls slot={slot} providers={providers} defaultProvider={defaultProviderId()} hasAI={providers.some((p) => p.id === "anthropic" && p.available)} />

      {drafts.map((d) => {
        const s = (d.learning_summary ?? {}) as {
          patterns?: string[];
          template_changes?: string[];
          difficulty_change?: { from: number; to: number; procedural_from: number; procedural_to: number };
          stats?: Record<string, number>;
          new_instructions?: string[];
          ai_used?: boolean;
          ai_rationale?: string | null;
          ai_error?: string | null;
          manual_edit?: boolean;
          reason?: string;
        };
        return (
          <Card
            key={d.id}
            title={<>Draft v{d.version} (from v{d.parent_version}) — review before activating</>}
            actions={
              <ActionButton url={`/api/admin/versions/${d.id}/activate`} testId={`activate-${d.version}`}>
                Activate v{d.version}
              </ActionButton>
            }
          >
            {s.manual_edit ? (
              <p>Manual profile edit: {s.reason}</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2" data-testid="learning-summary">
                <div>
                  <b>Feedback used:</b> {JSON.stringify(s.stats)}
                  <ul className="ml-4 list-disc">
                    {s.patterns?.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                  {s.difficulty_change && (
                    <p>
                      Target difficulty {s.difficulty_change.from} → <b>{s.difficulty_change.to}</b>; procedural {s.difficulty_change.procedural_from} →{" "}
                      <b>{s.difficulty_change.procedural_to}</b>
                    </p>
                  )}
                  <p className="text-neutral-500">AI analysis: {s.ai_used ? "yes" : `no${s.ai_error ? ` (${s.ai_error})` : " (deterministic analysis only)"}`}</p>
                  {s.ai_rationale && <p className="italic">{s.ai_rationale}</p>}
                </div>
                <div>
                  <b>Template weight changes</b>
                  <ul className="ml-4 list-disc">{s.template_changes?.length ? s.template_changes.map((c, i) => <li key={i}>{c}</li>) : <li>none</li>}</ul>
                  <b>New editorial instructions</b>
                  <ul className="ml-4 list-disc">{s.new_instructions?.length ? s.new_instructions.map((c, i) => <li key={i}>{c}</li>) : <li>none</li>}</ul>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <Card title="Generator versions">
        <table className="w-full border-collapse" data-testid="versions">
          <thead>
            <tr>
              {["Version", "Status", "Generated", "Validation pass / fail / review", "Approved", "Reviewed", "Easy / Right / Hard / Invalid", "Fresh (not training) reviews", "Acceptance", ""].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => {
              const verdict = verdicts[v.id];
              return (
                <tr key={v.id}>
                  <td className={td}>v{v.version}</td>
                  <td className={td}>
                    <StatusChip status={v.status} />
                    {v.id === bucket.active && <span className="ml-1 text-xs">(active)</span>}
                  </td>
                  <td className={td}>{v.generated}</td>
                  <td className={td}>
                    {v.validation_passed} / {v.validation_failed} / {v.needs_review}
                  </td>
                  <td className={td}>{v.approved}</td>
                  <td className={td}>{v.reviewed}</td>
                  <td className={td}>
                    {v.too_easy} / {v.just_right} / {v.too_hard} / {v.invalid}
                  </td>
                  <td className={td}>
                    {v.fresh_reviewed} ({v.fresh_reviewed ? Math.round((100 * v.fresh_just_right) / v.fresh_reviewed) : 0}% just right)
                  </td>
                  <td className={td}>{v.generated ? `${Math.round((100 * v.approved) / v.generated)}%` : "—"}</td>
                  <td className={td}>
                    {verdict &&
                      (verdict.eligible ? (
                        <ActionButton url={`/api/admin/versions/${v.id}/calibrate`}>Mark calibrated</ActionButton>
                      ) : (
                        <span className="text-xs text-neutral-500">not yet calibratable: {verdict.reasons.join("; ")}</span>
                      ))}
                    {v.status === "calibrated" && v.id !== bucket.active && <ActionButton url={`/api/admin/versions/${v.id}/activate`}>Re-activate</ActionButton>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card title="Recent batches">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["When", "Gen", "Provider", "Status", "Produced", "Awaiting review", ""].map((h) => (
                <th key={h} className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className={td}>{b.created_at.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className={td}>v{b.version}</td>
                <td className={td}>
                  {b.provider}
                  {b.provider === "procedural" && <span className="ml-1 text-xs text-amber-700">dev adapter</span>}
                </td>
                <td className={td}>
                  <StatusChip status={b.status === "completed" ? "passed" : b.status} /> {b.error && <span className="text-xs text-red-600">{b.error}</span>}
                </td>
                <td className={td}>
                  {b.produced_count}/{b.requested_count}
                </td>
                <td className={td}>{b.ready}</td>
                <td className={td}>
                  <Link className="underline" href={`/admin/review?slot=${slot}&batch=${b.id}`}>
                    Review batch
                  </Link>{" "}
                  ·{" "}
                  <Link className="underline" href={`/admin/questions?batch=${b.id}`}>
                    all questions
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Live player performance (published questions)">
        {perf.length === 0 ? (
          <p className="text-neutral-500">No published questions from this slot yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Date", "Question", "Reached", "Answered", "Solve rate", "Median time", "Answer distribution", "Weak distractors"].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {perf.map((p) => (
                <tr key={p.question_id}>
                  <td className={td}>{p.challenge_date}</td>
                  <td className={td}>
                    <Tex>{p.statement.slice(0, 100)}</Tex>
                  </td>
                  <td className={td}>{p.reached}</td>
                  <td className={td}>{p.answered}</td>
                  <td className={td}>{p.solve_rate == null ? "—" : `${Math.round(p.solve_rate * 100)}%`}</td>
                  <td className={td}>{p.median_answer_ms == null ? "—" : `${Math.round(p.median_answer_ms / 1000)}s`}</td>
                  <td className={td}>
                    {Object.entries(p.option_counts)
                      .sort()
                      .map(([l, n]) => (
                        <span key={l} className={`mr-2 ${l === p.correct_label ? "font-bold text-green-700" : ""}`}>
                          {l}:{n}
                        </span>
                      ))}
                  </td>
                  <td className={td}>
                    {p.answered >= 20
                      ? ["A", "B", "C", "D"].filter((l) => l !== p.correct_label && (p.option_counts[l] ?? 0) / p.answered < 0.05).join(", ") || "none"
                      : "needs ≥20 answers"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`Active profile (v${bucket.version})`}>
        <ProfileEditor key={bucket.version} slot={slot} profile={bucket.profile} />
      </Card>
    </div>
  );
}
