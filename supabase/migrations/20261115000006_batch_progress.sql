-- Asynchronous generation: batches record their stage and a result summary so
-- the admin UI can show progress after the request has returned.
alter table generation_batches
  add column stage text not null default 'done'
    check (stage in ('queued', 'generating', 'validating', 'done', 'failed')),
  add column summary jsonb,
  add column updated_at timestamptz not null default now();
create index generation_batches_active on generation_batches (created_at) where status = 'running';
