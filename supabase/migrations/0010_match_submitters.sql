-- RPC that lists which users have submitted a prediction for a given match,
-- without exposing the prediction values themselves. Used by the match detail
-- page pre-kickoff so the UI can show "Alice predicted" without revealing
-- WHAT Alice predicted. RLS still hides the rows in `predictions`.
--
-- DROP first so this migration is safe to re-run even after 0011 has changed
-- the function's return type (CREATE OR REPLACE FUNCTION can't switch return
-- types). The final shape lives in 0011.

drop function if exists public.match_submitters(uuid);

create function public.match_submitters(p_match_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $BODY$
  select user_id from public.predictions where match_id = p_match_id;
$BODY$;

revoke all on function public.match_submitters(uuid) from public;
grant execute on function public.match_submitters(uuid) to authenticated;
