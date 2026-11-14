-- Pin search_path on trigger/helper functions (Supabase lint 0011) so they
-- cannot be hijacked by objects in another schema on the caller's path.
alter function public.forbid_mutation() set search_path = public, pg_temp;
alter function public.guard_question_version() set search_path = public, pg_temp;
alter function public.guard_question_option() set search_path = public, pg_temp;
alter function public.question_version_publishable(uuid) set search_path = public, pg_temp;
alter function public.guard_daily_challenge() set search_path = public, pg_temp;
alter function public.guard_challenge_question() set search_path = public, pg_temp;
alter function public.guard_game_run() set search_path = public, pg_temp;
