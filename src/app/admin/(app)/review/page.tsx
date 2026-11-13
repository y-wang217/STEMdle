import { sql } from "@/lib/db";
import { loadQuestions } from "@/lib/factory/store";
import { ReviewApp, type ReviewItem } from "@/components/admin/ReviewApp";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const slot = sp.slot ? Number(sp.slot) : null;
  const batch = sp.batch ?? null;
  const includeReviewed = sp.all === "1";
  const statuses = includeReviewed ? ["ready", "needs_review", "reviewed", "approved", "rejected"] : ["ready", "needs_review"];
  const ids = await sql<{ id: string }[]>`
    select q.id from questions q
    where (${slot}::int is null or q.slot = ${slot}::int)
      and (${batch}::uuid is null or q.batch_id = ${batch}::uuid)
      and q.status = any(${statuses}::text[])
    order by q.slot, q.created_at asc limit 200`;
  const qs = await loadQuestions(ids.map((r) => r.id));
  const extra = qs.length
    ? await sql<{ id: string; judgment: string | null; v_status: string | null; failed: string[] | null; warnings: string[] | null; bucket: string }[]>`
        select q.id, f.judgment, v.status as v_status, b.name as bucket,
          (select array_agg(c->>'name' || ': ' || (c->>'detail')) from jsonb_array_elements(v.checks) c where c->>'status' = 'fail') as failed,
          (select array_agg(c->>'name' || ': ' || (c->>'detail')) from jsonb_array_elements(v.checks) c where c->>'status' = 'warn') as warnings
        from questions q join bucket_profiles b on b.slot = q.slot
        left join lateral (select judgment from question_feedback where question_id = q.id order by created_at desc, id desc limit 1) f on true
        left join lateral (select status, checks from question_validations where question_version_id = q.current_version_id order by created_at desc limit 1) v on true
        where q.id = any(${qs.map((q) => q.id)}::uuid[])`
    : [];
  const items: ReviewItem[] = qs.map((q) => {
    const e = extra.find((x) => x.id === q.id)!;
    return {
      id: q.id,
      slot: q.slot,
      bucket: e.bucket,
      status: q.status,
      source: q.source,
      template_id: q.template_id,
      statement: q.statement,
      solution: q.solution,
      key_insight: q.key_insight,
      diagram: q.diagram,
      options: q.options,
      estimated_difficulty: q.estimated_difficulty,
      validation: e.v_status,
      warnings: e.warnings ?? [],
      judgment: e.judgment === "retracted" ? null : (e.judgment as ReviewItem["judgment"]),
      math_verified: Boolean(q.math_verified_at),
    };
  });
  return <ReviewApp items={items} filter={{ slot, batch, all: includeReviewed }} />;
}
