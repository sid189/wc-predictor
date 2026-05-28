-- Enforce the "one change after the group stage" rule for special picks.
-- Before the tournament: unlimited edits (the pick stays the +5 "initial" pick).
-- During the group stage: locked.
-- After the group stage: exactly ONE change allowed (then +2 if correct).

alter table public.special_predictions
  add column if not exists post_group_change_used boolean not null default false;

create or replace function public.set_special_pick_phase()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg record;
  selection_changed boolean;
begin
  if auth.role() = 'service_role' then
    return new;  -- admin / scoring writes pass through untouched
  end if;

  -- Clients may never set scoring columns.
  new.points := coalesce(old.points, 0);
  new.scored := coalesce(old.scored, false);

  select starts_at, group_stage_ends_at into cfg from public.tournament_config where id = 1;

  if cfg.starts_at is null or now() <= cfg.starts_at then
    -- Pre-tournament: free to change; remains the original pick.
    new.is_initial := true;
    new.post_group_change_used := false;

  elsif cfg.group_stage_ends_at is not null and now() > cfg.group_stage_ends_at then
    -- After the group stage: a single change is permitted.
    if tg_op = 'INSERT' then
      new.is_initial := false;
      new.post_group_change_used := true;
    else
      selection_changed := (new.team_id is distinct from old.team_id)
                        or (new.player_id is distinct from old.player_id);
      if selection_changed then
        if old.post_group_change_used then
          raise exception 'you have already used your one change after the group stage';
        end if;
        new.is_initial := false;
        new.post_group_change_used := true;
      else
        new.is_initial := old.is_initial;
        new.post_group_change_used := old.post_group_change_used;
      end if;
    end if;

  else
    raise exception 'special picks are locked during the group stage';
  end if;

  return new;
end; $$;
