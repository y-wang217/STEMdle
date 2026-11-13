import Link from "next/link";
import { sql } from "@/lib/db";
import { Card, StatusChip, td, th } from "@/components/admin/ui";
import { Tex } from "@/components/Tex";

const STATUSES = ["", "approved", "ready", "needs_review", "reviewed", "validation_failed", "rejected", "retired"];

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const slot = sp.slot ? Number(sp.slot) : null;
  const status = sp.status || null;
  const batch = sp.batch || null;
  const rows = await sql<
    { id: string; slot: number; status: string; source: string; template_id: string | null; statement: string; created_at: Date; v_status: string | null; judgment: string | null; correct: string }[]
  >`
    select q.id, q.slot, q.status, q.source, q.template_id, v.statement, q.created_at, val.status as v_status, f.judgment,
      (select tex from question_options o where o.question_version_id = v.id and o.is_correct) as correct
    from questions q join question_versions v on v.id = q.current_version_id
    left join lateral (select status from question_validations where question_version_id = v.id order by created_at desc limit 1) val on true
    left join lateral (select judgment from question_feedback where question_id = q.id order by created_at desc, id desc limit 1) f on true
    where (${slot}::int is null or q.slot = ${slot}::int) and (${status}::text is null or q.status = ${status}::text)
      and (${batch}::uuid is null or q.batch_id = ${batch}::uuid)
    order by q.created_at desc limit 300`;
  return (
    <Card
      title={`Questions (${rows.length})`}
      actions={
        <form className="flex gap-2">
          <select name="slot" defaultValue={slot ?? ""} className="rounded border px-1 dark:bg-neutral-800">
            <option value="">all slots</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                slot {s}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status ?? ""} className="rounded border px-1 dark:bg-neutral-800">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s || "any status"}
              </option>
            ))}
          </select>
          <button className="rounded border px-2">Filter</button>
        </form>
      }
    >
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Created", "Slot", "Status", "Validation", "Judgment", "Source", "Statement", "Answer"].map((h) => (
              <th key={h} className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={td}>{r.created_at.toISOString().slice(5, 16).replace("T", " ")}</td>
              <td className={td}>{r.slot}</td>
              <td className={td}>
                <StatusChip status={r.status} />
              </td>
              <td className={td}>{r.v_status && <StatusChip status={r.v_status} />}</td>
              <td className={td}>{r.judgment ?? "—"}</td>
              <td className={td}>
                {r.source}
                <div className="text-[11px] text-neutral-500">{r.template_id}</div>
              </td>
              <td className={`${td} max-w-xl`}>
                <Link href={`/admin/questions/${r.id}`} className="hover:underline">
                  <Tex>{r.statement.length > 160 ? r.statement.slice(0, 160).replace(/\$[^$]*$/, "") + "…" : r.statement}</Tex>
                </Link>
              </td>
              <td className={td}>
                <Tex>{r.correct}</Tex>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
