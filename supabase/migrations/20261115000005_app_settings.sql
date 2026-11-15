-- Small operational settings that change without a redeploy (e.g. the active
-- Lean sandbox snapshot id). Server-only; deny-all for public API roles.
create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references admin_users(id),
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
revoke all on app_settings from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'mathdle_app') then
    grant select, insert, update on app_settings to mathdle_app;
  end if;
end $$;
