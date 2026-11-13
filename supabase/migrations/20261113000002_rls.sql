-- Row Level Security: deny-all for the public API roles.
--
-- Every read and write goes through the Next.js server, which connects with a
-- privileged database role (DATABASE_URL). Supabase exposes `anon` and
-- `authenticated` through PostgREST; they must never see answers, unpublished
-- questions or other players' records, so they get no grants and no policies.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- Supabase grants schema usage to the API roles; mirror that locally so the
-- deny-all behaviour below is tested at the table level.
grant usage on schema public to anon, authenticated;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on public.question_performance from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated, public;
