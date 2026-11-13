import { sql } from "@/lib/db";
import { dailyAnalytics } from "@/lib/game/analytics";
import { Card, td, th } from "@/components/admin/ui";
import { VoidForm, CorrectionForm } from "@/components/admin/RecoveryForms";
import { torontoDate } from "@/lib/time";

export default async function Published({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const list = await sql<{ id: string; challenge_date: string; challenge_number: number }[]>`
    select id, challenge_date::text, challenge_number from daily_challenges where status = 'published' order by challenge_date desc limit 30`;
  const selected = list.find((c) => c.challenge_date === sp.date) ?? list[0];
  const analytics = selected ? await dailyAnalytics(selected.id) : null;
  const voided = selected
    ? await sql<{ slot: number; voided_reason: string; voided_at: Date }[]>`
        select slot, voided_reason, voided_at from challenge_questions where challenge_id = ${selected.id} and voided_at is not null`
    : [];
  return (
    <div>
      <Card
        title="Published challenges"
        actions={
          <form className="flex gap-2">
            <select name="date" defaultValue={selected?.challenge_date} className="rounded border px-1 dark:bg-neutral-800">
              {list.map((c) => (
                <option key={c.id} value={c.challenge_date}>
                  No. {c.challenge_number} · {c.challenge_date}
                  {c.challenge_date === torontoDate() ? " (today)" : ""}
                </option>
              ))}
            </select>
            <button className="rounded border px-2">Show</button>
          </form>
        }
      >
        {!selected && <p className="text-neutral-500">Nothing published yet.</p>}
        {analytics && (
          <>
            <p className="mb-2" data-testid="analytics-summary">
              Players ≈ {analytics.summary.players} · runs started {analytics.summary.started} · finished {analytics.summary.finished} · full clears {analytics.summary.cleared} · skips{" "}
              {analytics.summary.skipped} · shares {analytics.summary.shares} · returning {analytics.summary.returning_players} · median clear time{" "}
              {analytics.summary.median_elapsed_ms ? `${Math.round(analytics.summary.median_elapsed_ms / 1000)}s` : "—"}
            </p>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {["Slot", "Reached", "Answered", "Correct", "Solve rate", "Drop-off", "Median answer time", "Answers"].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analytics.perSlot.map((s) => (
                  <tr key={s.slot}>
                    <td className={td}>{s.slot}</td>
                    <td className={td}>{s.reached}</td>
                    <td className={td}>{s.answered}</td>
                    <td className={td}>{s.correct}</td>
                    <td className={td}>{s.solve_rate == null ? "—" : `${Math.round(s.solve_rate * 100)}%`}</td>
                    <td className={td}>{s.reached ? `${Math.round((100 * (s.reached - s.correct)) / s.reached)}%` : "—"}</td>
                    <td className={td}>{s.median_answer_ms == null ? "—" : `${Math.round(s.median_answer_ms / 1000)}s`}</td>
                    <td className={td}>{JSON.stringify(s.option_counts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
      {selected && (
        <Card title="Recovery: void an incorrect published question">
          <p className="mb-2 text-neutral-600">
            Published versions are immutable. Voiding marks the slot as withdrawn, retires the question, credits +1 to every finished run that was eliminated on it (audited score corrections), and
            counts it as correct for runs still in progress.
          </p>
          {voided.map((v) => (
            <p key={v.slot} className="text-red-700">
              Slot {v.slot} voided {v.voided_at.toISOString().slice(0, 16)}: {v.voided_reason}
            </p>
          ))}
          <VoidForm date={selected.challenge_date} />
        </Card>
      )}
      <Card title="Manual score correction (audited)">
        <CorrectionForm />
      </Card>
    </div>
  );
}
