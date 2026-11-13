import postgres from "postgres";

export const db = postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/mathdle_e2e", { max: 2, onnotice: () => {} });

/** Correct option label (A–D) for a slot of today's published/approved challenge. */
export async function correctLabel(slot: number): Promise<string> {
  const [r] = await db<{ label: string }[]>`
    select o.label from daily_challenges d join challenge_questions cq on cq.challenge_id = d.id
    join question_options o on o.question_version_id = cq.question_version_id
    where d.status in ('approved','published') and cq.slot = ${slot} and o.is_correct
    order by d.challenge_date asc limit 1`;
  return r.label;
}

export async function wrongLabel(slot: number): Promise<string> {
  const c = await correctLabel(slot);
  return ["A", "B", "C", "D"].find((l) => l !== c)!;
}
