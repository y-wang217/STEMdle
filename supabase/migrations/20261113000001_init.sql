-- Mathdle core schema.
-- Compatible with Supabase Postgres and plain Postgres 15+.
-- The application connects server-side with a privileged role; browsers never
-- talk to the database directly. RLS is enabled with no policies for the
-- public `anon` / `authenticated` roles (deny-all) — see 20261113000002_rls.sql.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- admins --
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  disabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references admin_users(id),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

-- --------------------------------------------------- buckets & generators --
create table bucket_profiles (
  slot smallint primary key check (slot between 1 and 8),
  name text not null,
  category text not null,
  character text not null,
  -- Slot definition (display name, difficulty band, calibration thresholds …).
  -- Kept as JSON so slot definitions change without migrations.
  config jsonb not null default '{}'::jsonb,
  active_generator_version_id uuid,
  updated_at timestamptz not null default now()
);

create table generator_versions (
  id uuid primary key default gen_random_uuid(),
  slot smallint not null references bucket_profiles(slot),
  version integer not null,
  parent_id uuid references generator_versions(id),
  status text not null default 'draft' check (status in ('draft', 'active', 'calibrated', 'retired')),
  -- topic, subtopics, target_difficulty, preferred/forbidden characteristics,
  -- target solve time, techniques, misconceptions, example question ids,
  -- editorial instructions, provider/model, procedural knobs.
  profile jsonb not null,
  -- Questions whose feedback was used to produce this version. Calibration
  -- must be demonstrated on questions NOT in this set.
  training_question_ids uuid[] not null default '{}',
  learning_summary jsonb,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  calibrated_at timestamptz,
  calibrated_by uuid references admin_users(id),
  unique (slot, version)
);

alter table bucket_profiles
  add constraint bucket_profiles_active_version_fk
  foreign key (active_generator_version_id) references generator_versions(id);

create table generation_batches (
  id uuid primary key default gen_random_uuid(),
  slot smallint not null references bucket_profiles(slot),
  generator_version_id uuid not null references generator_versions(id),
  provider text not null,
  model text,
  requested_count integer not null check (requested_count between 1 and 50),
  produced_count integer not null default 0,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  error text,
  seed bigint,
  usage jsonb,
  created_by uuid references admin_users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- -------------------------------------------------------------- questions --
create table questions (
  id uuid primary key default gen_random_uuid(),
  slot smallint not null references bucket_profiles(slot),
  batch_id uuid references generation_batches(id),
  generator_version_id uuid references generator_versions(id),
  source text not null check (source in ('ai', 'procedural', 'seed', 'manual')),
  template_id text,
  status text not null default 'validating' check (status in (
    'validating',        -- pipeline running
    'validation_failed', -- blocked from publication
    'needs_review',      -- could not be verified automatically: explicit math review required
    'ready',             -- validated, awaiting difficulty calibration
    'reviewed',          -- calibrated as too easy / too hard (kept as training signal)
    'approved',          -- in the bank: validated (or math-verified) and judged just right
    'rejected',          -- flagged invalid by an admin
    'retired'            -- withdrawn after publication (see invalidation)
  )),
  current_version_id uuid,
  fingerprint text,
  math_verified_by uuid references admin_users(id),
  math_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index questions_slot_status on questions (slot, status);
create index questions_batch on questions (batch_id);

create table question_versions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id),
  version integer not null,
  statement text not null,
  solution text not null,
  key_insight text not null,
  tags text[] not null default '{}',
  techniques text[] not null default '{}',
  estimated_difficulty numeric(4, 2),
  estimated_solve_seconds integer,
  verification jsonb not null,
  diagram jsonb,
  generation_meta jsonb not null default '{}'::jsonb,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (question_id, version)
);

alter table questions
  add constraint questions_current_version_fk
  foreign key (current_version_id) references question_versions(id);

create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references question_versions(id),
  position smallint not null check (position between 0 and 3),
  label char(1) not null check (label in ('A', 'B', 'C', 'D')),
  tex text not null,
  value text not null default '',
  is_correct boolean not null,
  misconception text not null default '',
  rationale text not null default '',
  derivation text,
  unique (question_version_id, position)
);
create unique index question_options_one_correct on question_options (question_version_id) where is_correct;

create table question_validations (
  id uuid primary key default gen_random_uuid(),
  question_version_id uuid not null references question_versions(id),
  status text not null check (status in ('passed', 'failed', 'needs_review')),
  engine text not null,
  checks jsonb not null,
  computed jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index question_validations_version on question_validations (question_version_id, created_at desc);

-- Immutable, append-only difficulty judgments. The effective judgment for a
-- question is its latest row; 'retracted' undoes the previous one.
create table question_feedback (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id),
  question_version_id uuid not null references question_versions(id),
  generator_version_id uuid references generator_versions(id),
  admin_id uuid not null references admin_users(id),
  judgment text not null check (judgment in ('too_easy', 'just_right', 'too_hard', 'invalid', 'retracted')),
  note text,
  created_at timestamptz not null default clock_timestamp()
);
create index question_feedback_question on question_feedback (question_id, created_at desc);

-- ------------------------------------------------------- daily challenges --
create table daily_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null unique,
  challenge_number integer not null unique,
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'withdrawn')),
  notes text,
  created_by uuid references admin_users(id),
  approved_by uuid references admin_users(id),
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table challenge_questions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references daily_challenges(id),
  slot smallint not null check (slot between 1 and 8),
  question_id uuid not null references questions(id),
  question_version_id uuid not null references question_versions(id),
  voided_at timestamptz,
  voided_reason text,
  voided_by uuid references admin_users(id),
  unique (challenge_id, slot)
);
create index challenge_questions_question on challenge_questions (question_id);

-- ------------------------------------------------------------------ players --
create table anonymous_players (
  id uuid primary key default gen_random_uuid(),   -- public, non-secret id
  token_hash text not null unique,                 -- sha256 of the secret cookie token
  nickname text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table game_runs (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references anonymous_players(id),
  challenge_id uuid not null references daily_challenges(id),
  status text not null default 'active' check (status in ('active', 'failed', 'skipped', 'cleared')),
  current_slot smallint not null default 1 check (current_slot between 1 and 9),
  score smallint not null default 0 check (score between 0 and 8),
  score_adjustment smallint not null default 0,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  elapsed_ms integer,
  speed_eligible boolean,
  shared_at timestamptz,
  unique (player_id, challenge_id)
);
create index game_runs_challenge on game_runs (challenge_id, status);

create table run_presentations (
  run_id uuid not null references game_runs(id),
  slot smallint not null check (slot between 1 and 8),
  presented_at timestamptz not null default clock_timestamp(),
  primary key (run_id, slot)
);

create table answer_submissions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references game_runs(id),
  slot smallint not null check (slot between 1 and 8),
  challenge_question_id uuid not null references challenge_questions(id),
  question_version_id uuid not null references question_versions(id),
  option_id uuid references question_options(id),
  is_correct boolean not null,
  skipped boolean not null default false,
  answered_at timestamptz not null default clock_timestamp(),
  answer_ms integer,
  unique (run_id, slot)
);
create index answer_submissions_cq on answer_submissions (challenge_question_id);

create table score_corrections (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references game_runs(id),
  challenge_question_id uuid references challenge_questions(id),
  delta smallint not null,
  reason text not null,
  admin_id uuid not null references admin_users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------- audit / ops / metrics --
create table audit_log (
  id bigserial primary key,
  admin_id uuid references admin_users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table admin_alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  dedupe_key text unique,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table analytics_events (
  id bigserial primary key,
  event text not null,
  player_id uuid,
  challenge_id uuid,
  slot smallint,
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index analytics_events_challenge on analytics_events (challenge_id, event);

create table rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------- question performance --
-- Live per-question statistics from real play (never written by clients).
create view question_performance as
select
  cq.id as challenge_question_id,
  cq.challenge_id,
  cq.slot,
  cq.question_id,
  cq.question_version_id,
  (select count(*) from run_presentations rp join game_runs r on r.id = rp.run_id
     where r.challenge_id = cq.challenge_id and rp.slot = cq.slot) as reached,
  count(s.id) filter (where not s.skipped) as answered,
  count(s.id) filter (where s.is_correct) as correct,
  count(s.id) filter (where s.skipped) as skipped,
  case when count(s.id) filter (where not s.skipped) > 0
       then round(count(s.id) filter (where s.is_correct)::numeric / count(s.id) filter (where not s.skipped), 4) end as solve_rate,
  percentile_cont(0.5) within group (order by s.answer_ms) filter (where not s.skipped) as median_answer_ms,
  coalesce((select jsonb_object_agg(o.label, c.n) from (
      select s2.option_id, count(*) as n from answer_submissions s2
      where s2.challenge_question_id = cq.id and s2.option_id is not null group by s2.option_id) c
    join question_options o on o.id = c.option_id), '{}'::jsonb) as option_counts
from challenge_questions cq
left join answer_submissions s on s.challenge_question_id = cq.id
group by cq.id;

-- ======================================================== integrity guards ==

-- Append-only tables.
create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only (% not allowed)', tg_table_name, tg_op using errcode = 'P0001';
end $$;

create trigger question_feedback_immutable before update or delete on question_feedback
  for each row execute function forbid_mutation();
create trigger question_validations_immutable before update or delete on question_validations
  for each row execute function forbid_mutation();
create trigger audit_log_immutable before update or delete on audit_log
  for each row execute function forbid_mutation();
create trigger answer_submissions_immutable before update or delete on answer_submissions
  for each row execute function forbid_mutation();
create trigger score_corrections_immutable before update or delete on score_corrections
  for each row execute function forbid_mutation();

-- Question versions: content is immutable once written; only locking is allowed.
create or replace function guard_question_version() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.locked_at is not null then
      raise exception 'question version % is published and cannot be deleted', old.id using errcode = 'P0001';
    end if;
    return old;
  end if;
  if (to_jsonb(new) - 'locked_at') is distinct from (to_jsonb(old) - 'locked_at') then
    raise exception 'question version % is immutable; create a new version instead', old.id using errcode = 'P0001';
  end if;
  if old.locked_at is not null and new.locked_at is distinct from old.locked_at then
    raise exception 'question version % is already locked', old.id using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger question_versions_guard before update or delete on question_versions
  for each row execute function guard_question_version();

create or replace function guard_question_option() returns trigger language plpgsql as $$
declare locked timestamptz;
begin
  if tg_op = 'UPDATE' then
    raise exception 'question options are immutable; create a new question version' using errcode = 'P0001';
  end if;
  select locked_at into locked from question_versions where id = coalesce(old.question_version_id, new.question_version_id);
  if locked is not null then
    raise exception 'question version is locked; options cannot change' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger question_options_guard before insert or update or delete on question_options
  for each row execute function guard_question_option();

-- A question version is publishable when: exactly one correct option among four,
-- latest validation passed (or the question was explicitly math-verified after
-- a needs_review result), and the question is approved.
create or replace function question_version_publishable(v_id uuid) returns text language plpgsql stable as $$
declare
  q questions%rowtype;
  n_opts int; n_correct int; last_status text;
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
  return null;
end $$;

create or replace function guard_daily_challenge() returns trigger language plpgsql as $$
declare
  n int; problem text; r record;
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then raise exception 'published challenges cannot be deleted' using errcode = 'P0001'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    if new.challenge_date <> old.challenge_date or new.challenge_number <> old.challenge_number
       or new.status not in ('published') then
      raise exception 'published challenge % is immutable', old.id using errcode = 'P0001';
    end if;
  end if;
  if new.status in ('approved', 'published') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select count(*) into n from challenge_questions where challenge_id = new.id;
    if n <> 8 then raise exception 'challenge % must have 8 questions to be %', new.id, new.status using errcode = 'P0001'; end if;
    for r in select question_version_id, slot from challenge_questions where challenge_id = new.id loop
      problem := question_version_publishable(r.question_version_id);
      if problem is not null then
        raise exception 'slot %: %', r.slot, problem using errcode = 'P0001';
      end if;
    end loop;
    if new.status = 'approved' and new.approved_at is null then
      raise exception 'approval requires approved_by/approved_at' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := coalesce(new.published_at, now());
    update question_versions set locked_at = now()
      where locked_at is null and id in (select question_version_id from challenge_questions where challenge_id = new.id);
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger daily_challenges_guard before insert or update or delete on daily_challenges
  for each row execute function guard_daily_challenge();

-- Challenge composition is frozen once approved/published (voiding is the only change allowed after publication).
create or replace function guard_challenge_question() returns trigger language plpgsql as $$
declare st text;
begin
  select status into st from daily_challenges where id = coalesce(new.challenge_id, old.challenge_id);
  if st = 'published' then
    if tg_op = 'UPDATE'
       and new.question_id = old.question_id and new.question_version_id = old.question_version_id
       and new.slot = old.slot and old.voided_at is null and new.voided_at is not null then
      return new;  -- audited invalidation
    end if;
    raise exception 'questions of a published challenge cannot change' using errcode = 'P0001';
  end if;
  if st = 'approved' then
    raise exception 'revert the challenge to draft before changing its questions' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger challenge_questions_guard before insert or update or delete on challenge_questions
  for each row execute function guard_challenge_question();

-- Finalized runs are immutable, except audited score adjustments.
create or replace function guard_game_run() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'game runs cannot be deleted' using errcode = 'P0001';
  end if;
  if old.status <> 'active' then
    if current_setting('mathdle.score_correction', true) = 'on'
       and (to_jsonb(new) - 'score_adjustment') = (to_jsonb(old) - 'score_adjustment') then
      return new;
    end if;
    if (to_jsonb(new) - 'shared_at') = (to_jsonb(old) - 'shared_at') then
      return new;  -- recording a share is harmless
    end if;
    raise exception 'run % is finalized', old.id using errcode = 'P0001';
  end if;
  if new.started_at <> old.started_at or new.player_id <> old.player_id or new.challenge_id <> old.challenge_id then
    raise exception 'run identity/timing fields are immutable' using errcode = 'P0001';
  end if;
  if new.score < old.score or new.current_slot < old.current_slot then
    raise exception 'run progress cannot move backwards' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger game_runs_guard before update or delete on game_runs
  for each row execute function guard_game_run();
