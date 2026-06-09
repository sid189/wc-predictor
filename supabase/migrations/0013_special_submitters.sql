-- Lists which users have submitted a Tournament Winner pick and which have
-- submitted a Golden Boot pick — without exposing the picks themselves. Used
-- by /special so everyone can see "submitted by: Sid, Soham, …" alongside
-- their own picker, before the tournament reveal.

drop function if exists public.special_submitters();

create function public.special_submitters()
returns table(kind text, user_id uuid, display_name text)
language sql
security definer
stable
set search_path = public
as $BODY$
  select s.kind, s.user_id, pr.display_name
  from public.special_predictions s
  join public.profiles pr on pr.id = s.user_id;
$BODY$;

revoke all on function public.special_submitters() from public;
grant execute on function public.special_submitters() to authenticated;
