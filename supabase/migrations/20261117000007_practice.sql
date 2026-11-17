-- Practice mode: unlimited, unranked practice from the approved pool.
-- Recorded per anonymous player, entirely separate from daily runs, scoring
-- and the leaderboard. The server picks questions; clients never choose one.

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references anonymous_players(id),
  slot smallint references bucket_profiles(slot),   -- null = any topic
  created_at timestamptz not null default clock_timestamp(),
  last_active_at timestamptz not null default clock_timestamp()
);
create index practice_sessions_player on practice_sessions (player_id, created_at desc);

create table practice_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id),
  question_id uuid not null references questions(id),
  question_version_id uuid not null references question_versions(id),
  presented_at timestamptz not null default clock_timestamp(),
  option_id uuid references question_options(id),
  is_correct boolean,
  answered_at timestamptz,
  answer_ms integer,
  -- No question is served twice in one session.
  unique (session_id, question_id),
  check ((answered_at is null) = (option_id is null) and (answered_at is null) = (is_correct is null))
);
-- At most one open (unanswered) question per session.
create unique index practice_attempts_one_open on practice_attempts (session_id) where answered_at is null;
create index practice_attempts_question on practice_attempts (question_id);

-- An attempt may be answered exactly once; answered attempts are immutable and
-- attempts are never deleted.
create or replace function guard_practice_attempt() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'practice attempts cannot be deleted' using errcode = 'P0001';
  end if;
  if old.answered_at is not null then
    raise exception 'practice attempt % is answered and immutable', old.id using errcode = 'P0001';
  end if;
  if new.session_id <> old.session_id or new.question_id <> old.question_id
     or new.question_version_id <> old.question_version_id or new.presented_at <> old.presented_at then
    raise exception 'practice attempt identity fields are immutable' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger practice_attempts_guard before update or delete on practice_attempts
  for each row execute function guard_practice_attempt();

-- Deny-all for the public API roles, as for every other table (see 20261113000002_rls.sql).
alter table practice_sessions enable row level security;
alter table practice_attempts enable row level security;
revoke all on practice_sessions, practice_attempts from anon, authenticated;
revoke execute on function guard_practice_attempt() from anon, authenticated, public;
