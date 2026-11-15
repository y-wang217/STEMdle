-- Lean 4 + Mathlib formal verification (asynchronous, separate from SymPy validation).
--
-- One row per verification attempt of an immutable question version. A row is
-- created as `pending` (the job), claimed by a worker, and finalized once; after
-- that it is immutable. History is kept so a version can be rechecked after a
-- Lean/Mathlib/pipeline upgrade.

create table lean_verifications (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references question_versions(id),
  status text not null default 'pending' check (status in (
    'pending',            -- queued or running
    'verified',           -- Lean proofs passed AND consistency audit passed
    'proof_failed',       -- Lean rejected the submitted proofs, or refuted the claim
    'inconclusive',       -- formalization/proof search could not be completed
    'unsupported',        -- not suitable for the current Lean pipeline
    'consistency_failed'  -- proofs passed, but the theorem does not faithfully represent the question
  )),
  -- true only when Lean PROVED that the answer key is wrong (negation of the key's
  -- claim, or a distractor also satisfies the question). Blocks publication.
  refuted boolean not null default false,
  eligibility jsonb,              -- {eligible, category, reason, method}
  formalization_method text,      -- 'expression' | 'ai' | null
  claim text,                     -- natural-language statement of what is proved
  assumptions jsonb not null default '[]'::jsonb,
  spec jsonb,                     -- structured spec: answer type, predicate, option terms
  theorem_source text,            -- theorem statements only (no proofs)
  proof_source text,              -- complete checked Lean file
  theorem_hash text,
  results jsonb,                  -- per-theorem outcome (proved / failed / refuted / axioms)
  axioms jsonb,
  diagnostics text,
  consistency_status text check (consistency_status in ('consistent', 'inconsistent', 'uncertain', 'not_run')),
  consistency_method text,        -- 'deterministic' | 'deterministic+ai'
  consistency_findings jsonb not null default '[]'::jsonb,
  lean_version text,
  mathlib_version text,
  env_version text,
  pipeline_version text not null,
  runner text,                    -- 'local' | 'vercel-sandbox'
  duration_ms integer,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  last_error text,
  requested_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index lean_verifications_version on lean_verifications (question_version_id, created_at desc);
create index lean_verifications_pending on lean_verifications (created_at) where status = 'pending';
-- Idempotency: at most one open job per version and pipeline version.
create unique index lean_verifications_one_pending on lean_verifications (question_version_id, pipeline_version) where status = 'pending';

-- Deterministic cache: the same Lean source in the same environment always
-- produces the same kernel result.
create table lean_check_cache (
  source_hash text not null,
  env_version text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (source_hash, env_version)
);

create or replace function guard_lean_verification() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'lean verification history is append-only' using errcode = 'P0001';
  end if;
  if old.status <> 'pending' then
    raise exception 'lean verification % is final', old.id using errcode = 'P0001';
  end if;
  if new.question_version_id <> old.question_version_id or new.pipeline_version <> old.pipeline_version then
    raise exception 'lean verification identity is immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger lean_verifications_guard before update or delete on lean_verifications
  for each row execute function guard_lean_verification();

-- Publication policy: a Lean refutation of the answer key blocks publication.
-- (Lean failures/inconclusive results do NOT block: SymPy validation + founder approval still govern.)
create or replace function question_version_publishable(v_id uuid) returns text language plpgsql stable
set search_path = public, pg_temp as $$
declare
  q questions%rowtype;
  n_opts int; n_correct int; last_status text; lean_refuted boolean;
begin
  select q2.* into q from questions q2 join question_versions v on v.question_id = q2.id where v.id = v_id;
  if not found then return 'question version not found'; end if;
  if q.status not in ('approved') then return format('question %s is %s, not approved', q.id, q.status); end if;
  select count(*), count(*) filter (where is_correct) into n_opts, n_correct from question_options where question_version_id = v_id;
  if n_opts <> 4 or n_correct <> 1 then return format('question %s needs 4 options with exactly 1 correct (has %s/%s)', q.id, n_opts, n_correct); end if;
  select status into last_status from question_validations where question_version_id = v_id order by created_at desc limit 1;
  if last_status is null then return format('question %s has never been validated', q.id); end if;
  if last_status = 'failed' then return format('question %s failed validation', q.id); end if;
  if last_status = 'needs_review' and q.math_verified_at is null then return format('question %s requires explicit mathematical review', q.id); end if;
  select refuted into lean_refuted from lean_verifications
    where question_version_id = v_id and status <> 'pending' order by completed_at desc nulls last limit 1;
  if coalesce(lean_refuted, false) then return format('question %s: Lean refuted the answer key', q.id); end if;
  return null;
end $$;

-- Deny-all for public API roles, same as every other table.
alter table lean_verifications enable row level security;
alter table lean_check_cache enable row level security;
revoke all on lean_verifications, lean_check_cache from anon, authenticated;
