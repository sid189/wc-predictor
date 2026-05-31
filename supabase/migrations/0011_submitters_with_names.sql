-- Have match_submitters return display names alongside user_ids in a single
-- typed result. Avoids depending on the (inconsistent) PostgREST scalar-setof
-- response shape AND skips the separate profiles fetch from the client.
--
-- DROP first because the return type changes from `setof uuid` (in 0010) to
-- a typed table — Postgres rejects CREATE OR REPLACE when the return type
-- changes, so a plain CREATE OR REPLACE silently errors.

drop function if exists public.match_submitters(uuid);

create function public.match_submitters(p_match_id uuid)
returns table(user_id uuid, display_name text)
language sql
security definer
stable
set search_path = public
as $BODY$
  select p.user_id, pr.display_name
  from public.predictions p
  join public.profiles pr on pr.id = p.user_id
  where p.match_id = p_match_id;
$BODY$;

revoke all on function public.match_submitters(uuid) from public;
grant execute on function public.match_submitters(uuid) to authenticated;
