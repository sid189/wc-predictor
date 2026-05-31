-- RPC that lists which users have submitted a prediction for a given match,
-- without exposing the prediction values themselves. Used by the match detail
-- page pre-kickoff so the UI can show "Alice predicted" without revealing
-- WHAT Alice predicted. RLS still hides the rows in `predictions`.

create or replace function public.match_submitters(p_match_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select user_id from public.predictions where match_id = p_match_id;
$$;

revoke all on function public.match_submitters(uuid) from public;
grant execute on function public.match_submitters(uuid) to authenticated;
