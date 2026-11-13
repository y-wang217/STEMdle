/** Persistence helpers for questions, versions and options. */
import { sql, type Tx } from "@/lib/db";
import type { CandidateQuestionT, DiagramSpecT } from "@/lib/schemas/question";
import { Rng, seedFrom } from "./procedural/rng";
import { skeleton } from "./fingerprint";

export interface StoredOption {
  id: string;
  position: number;
  label: string;
  tex: string;
  value: string;
  is_correct: boolean;
  misconception: string;
  rationale: string;
  derivation: string | null;
}

export interface StoredQuestion {
  id: string;
  slot: number;
  status: string;
  source: string;
  template_id: string | null;
  batch_id: string | null;
  generator_version_id: string | null;
  math_verified_at: string | null;
  created_at: string;
  version_id: string;
  version: number;
  statement: string;
  solution: string;
  key_insight: string;
  tags: string[];
  techniques: string[];
  estimated_difficulty: number | null;
  estimated_solve_seconds: number | null;
  verification: CandidateQuestionT["verification"];
  diagram: DiagramSpecT | null;
  generation_meta: Record<string, unknown>;
  locked_at: string | null;
  options: StoredOption[];
}

/** Insert a question (version 1) with options shuffled deterministically. */
export async function insertQuestion(
  tx: Tx,
  args: {
    slot: number;
    batchId: string | null;
    generatorVersionId: string | null;
    source: "ai" | "procedural" | "seed" | "manual";
    candidate: CandidateQuestionT;
    meta: Record<string, unknown>;
  },
): Promise<{ questionId: string; versionId: string }> {
  const c = args.candidate;
  const [q] = await tx<{ id: string }[]>`
    insert into questions (slot, batch_id, generator_version_id, source, template_id, status, fingerprint)
    values (${args.slot}, ${args.batchId}, ${args.generatorVersionId}, ${args.source}, ${c.template_id}, 'validating', ${skeleton(c.statement)})
    returning id`;
  const [v] = await tx<{ id: string }[]>`
    insert into question_versions (question_id, version, statement, solution, key_insight, tags, techniques,
      estimated_difficulty, estimated_solve_seconds, verification, diagram, generation_meta)
    values (${q.id}, 1, ${c.statement}, ${c.solution}, ${c.key_insight}, ${c.tags}, ${c.techniques},
      ${Math.max(1, Math.min(10, c.estimated_difficulty))}, ${c.estimated_solve_seconds}, ${tx.json(c.verification as never)},
      ${c.diagram ? tx.json(c.diagram as never) : null}, ${tx.json(args.meta as never)})
    returning id`;
  const order = new Rng(seedFrom(q.id)).shuffle([0, 1, 2, 3]);
  for (let pos = 0; pos < 4; pos++) {
    const o = c.options[order[pos]];
    await tx`insert into question_options (question_version_id, position, label, tex, value, is_correct, misconception, rationale, derivation)
             values (${v.id}, ${pos}, ${"ABCD"[pos]}, ${o.tex}, ${o.value}, ${o.is_correct}, ${o.misconception}, ${o.rationale}, ${o.derivation})`;
  }
  await tx`update questions set current_version_id = ${v.id} where id = ${q.id}`;
  return { questionId: q.id, versionId: v.id };
}

const QUESTION_COLUMNS = sql`
  q.id, q.slot, q.status, q.source, q.template_id, q.batch_id, q.generator_version_id, q.math_verified_at, q.created_at,
  v.id as version_id, v.version, v.statement, v.solution, v.key_insight, v.tags, v.techniques,
  v.estimated_difficulty::float as estimated_difficulty, v.estimated_solve_seconds, v.verification, v.diagram,
  v.generation_meta, v.locked_at,
  coalesce((select json_agg(json_build_object('id', o.id, 'position', o.position, 'label', o.label, 'tex', o.tex,
      'value', o.value, 'is_correct', o.is_correct, 'misconception', o.misconception, 'rationale', o.rationale,
      'derivation', o.derivation) order by o.position)
    from question_options o where o.question_version_id = v.id), '[]') as options`;

/** Load questions by id at their current version (or a specific version). */
export async function loadQuestions(ids: string[]): Promise<StoredQuestion[]> {
  if (!ids.length) return [];
  const rows = await sql<StoredQuestion[]>`
    select ${QUESTION_COLUMNS}
    from questions q join question_versions v on v.id = q.current_version_id
    where q.id = any(${ids}::uuid[])`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as StoredQuestion[];
}

export async function loadVersions(versionIds: string[]): Promise<StoredQuestion[]> {
  if (!versionIds.length) return [];
  const rows = await sql<StoredQuestion[]>`
    select ${QUESTION_COLUMNS}
    from question_versions v join questions q on q.id = v.question_id
    where v.id = any(${versionIds}::uuid[])`;
  const byId = new Map(rows.map((r) => [r.version_id, r]));
  return versionIds.map((id) => byId.get(id)).filter(Boolean) as StoredQuestion[];
}

/** Reconstruct the candidate contract from stored rows (options in stored order). */
export function toCandidate(q: StoredQuestion): CandidateQuestionT {
  return {
    statement: q.statement,
    options: q.options.map((o) => ({
      tex: o.tex,
      value: o.value,
      is_correct: o.is_correct,
      misconception: o.misconception,
      rationale: o.rationale,
      derivation: o.derivation,
    })),
    solution: q.solution,
    key_insight: q.key_insight,
    tags: q.tags,
    techniques: q.techniques,
    estimated_difficulty: Number(q.estimated_difficulty ?? 5),
    estimated_solve_seconds: q.estimated_solve_seconds ?? 60,
    verification: q.verification,
    diagram: q.diagram,
    template_id: q.template_id,
  };
}
