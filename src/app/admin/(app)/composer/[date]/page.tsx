import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getChallengeByDate, similarityReport } from "@/lib/composer";
import { loadVersions } from "@/lib/factory/store";
import { challengeNumber, isValidDate, torontoDate } from "@/lib/time";
import { Card, StatusChip } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/kit";
import { SlotPicker } from "@/components/admin/SlotPicker";
import { Tex } from "@/components/Tex";

export default async function ComposeDate({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidDate(date)) notFound();
  const c = await getChallengeByDate(date);
  const questions = c ? await loadVersions(c.slots.map((s) => s.version_id)) : [];
  const warnings = c ? await similarityReport(c.id) : [];
  const available = await sql<{ id: string; slot: number; statement: string }[]>`
    select q.id, q.slot, v.statement from questions q join question_versions v on v.id = q.current_version_id
    where q.status = 'approved' and not exists (select 1 from challenge_questions cq join daily_challenges d on d.id = cq.challenge_id
                                                 where cq.question_id = q.id and d.status <> 'withdrawn')
    order by q.slot, q.created_at`;
  const editable = !c || c.status === "draft";
  const past = date < torontoDate();
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">
          Challenge No. {challengeNumber(date)} · {date}
        </h1>
        {c ? <StatusChip status={c.status} /> : <span className="text-neutral-500">no set yet</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {!past && editable && (
            <ActionButton url={`/api/admin/composer/${date}`} body={{ action: "auto", keep: [] }} testId="auto-compose">
              {c ? "Re-assemble all slots" : "Assemble candidate set"}
            </ActionButton>
          )}
          {c && (
            <Link className="rounded border border-neutral-400 px-2.5 py-1 font-medium" href={`/admin/preview/${date}`} target="_blank">
              Preview as player
            </Link>
          )}
          {c?.status === "draft" && !past && (
            <ActionButton url={`/api/admin/composer/${date}`} body={{ action: "approve" }} confirm="Approve this set for publication at midnight Eastern?" testId="approve">
              Approve &amp; schedule
            </ActionButton>
          )}
          {c?.status === "approved" && (
            <ActionButton url={`/api/admin/composer/${date}`} body={{ action: "unapprove" }}>
              Revert to draft
            </ActionButton>
          )}
        </div>
      </div>
      {c?.status === "approved" && <p className="mb-3 rounded bg-green-50 p-2 text-green-900 dark:bg-green-950/40 dark:text-green-200">Approved — publishes automatically at midnight America/Toronto on {date}. Composition is frozen.</p>}
      {c?.status === "published" && <p className="mb-3 rounded bg-neutral-100 p-2 dark:bg-neutral-800">Published — question versions are locked. Use the Published page to void a question if needed.</p>}
      {warnings.length > 0 && (
        <Card title="Similarity warnings">
          <ul data-testid="similarity">
            {warnings.map((w, i) => (
              <li key={i} className="text-amber-700">
                Slot {w.slot}: {w.message} ({w.similarity.toFixed(2)})
              </li>
            ))}
          </ul>
        </Card>
      )}
      {Array.from({ length: 8 }, (_, i) => i + 1).map((slot) => {
        const entry = c?.slots.find((s) => s.slot === slot);
        const q = questions.find((x) => x.version_id === entry?.version_id);
        const correct = q?.options.find((o) => o.is_correct);
        return (
          <Card
            key={slot}
            title={
              <>
                Slot {slot}{" "}
                {q && (
                  <Link className="text-xs font-normal underline" href={`/admin/questions/${q.id}`}>
                    details
                  </Link>
                )}
              </>
            }
            actions={
              editable && !past ? (
                <SlotPicker date={date} slot={slot} options={available.filter((a) => a.slot === slot)} hasCurrent={Boolean(q)} />
              ) : null
            }
          >
            {q ? (
              <div data-testid={`compose-slot-${slot}`}>
                <Tex as="div">{q.statement}</Tex>
                <div className="mt-1 flex flex-wrap gap-3">
                  {q.options.map((o) => (
                    <span key={o.id} className={o.is_correct ? "font-semibold text-green-700" : "text-neutral-600"}>
                      {o.label}. <Tex>{o.tex}</Tex>
                    </span>
                  ))}
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-neutral-500">Solution (answer {correct?.label})</summary>
                  <Tex as="div">{q.solution}</Tex>
                </details>
              </div>
            ) : (
              <p className="text-red-600">Empty — no approved question available. Generate and review more for this slot.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
