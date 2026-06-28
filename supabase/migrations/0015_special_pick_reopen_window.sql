-- Adds an admin-controlled temporary change window for special picks.
-- When special_reopen_until is set to a future timestamp, the window is open
-- and users can update their picks (worth +2, is_initial = false). Unlike the
-- post-group change, this does NOT consume post_group_change_used, so players
-- retain their one post-group-stage change after groups finish.

alter table public.tournament_config
  add column if not exists special_reopen_until timestamptz default null;

-- Set the first window: closes 2026-06-28 19:00 UTC (3 PM ET).
update public.tournament_config
  set special_reopen_until = '2026-06-28 19:00:00+00'
  where id = 1;

-- Update the trigger to honour the new column.
create or replace function public.set_special_pick_phase()
returns trigger language plpgsql security definer set search_path = public as $BODY$
declare
  cfg             record;
  selection_changed boolean;
begin
  if auth.role() = 'service_role' then
    return new;  -- admin / scoring writes pass through untouched
  end if;

  -- Clients may never set scoring columns.
  new.points := coalesce(old.points, 0);
  new.scored := coalesce(old.scored, false);

  select starts_at, group_stage_ends_at, special_reopen_until
    into cfg from public.tournament_config where id = 1;

  if cfg.starts_at is null or now() <= cfg.starts_at then
    -- ── Pre-tournament: unlimited edits, full +5 value ──────────────────────
    new.is_initial            := true;
    new.post_group_change_used := false;

  elsif cfg.group_stage_ends_at is not null and now() > cfg.group_stage_ends_at then
    -- ── Post-group stage: exactly ONE change permitted per pick (+2) ─────────
    if tg_op = 'INSERT' then
      new.is_initial            := false;
      new.post_group_change_used := true;
    else
      selection_changed :=
            (new.team_id          is distinct from old.team_id)
         or (new.player_id        is distinct from old.player_id)
         or (new.golden_boot_name is distinct from old.golden_boot_name);
      if selection_changed then
        if old.post_group_change_used then
          raise exception 'you have already used your one change after the group stage';
        end if;
        new.is_initial            := false;
        new.post_group_change_used := true;
      else
        new.is_initial            := old.is_initial;
        new.post_group_change_used := old.post_group_change_used;
      end if;
    end if;

  elsif cfg.special_reopen_until is not null and now() <= cfg.special_reopen_until then
    -- ── Admin-opened temporary window (mid-group stage) ──────────────────────
    -- Changes are worth +2 (is_initial = false) but do NOT consume the
    -- post-group-stage change slot, so users keep that option after groups end.
    if tg_op = 'INSERT' then
      new.is_initial            := false;
      new.post_group_change_used := false;
    else
      selection_changed :=
            (new.team_id          is distinct from old.team_id)
         or (new.player_id        is distinct from old.player_id)
         or (new.golden_boot_name is distinct from old.golden_boot_name);
      if selection_changed then
        new.is_initial := false;
      else
        new.is_initial := old.is_initial;
      end if;
      -- Preserve whatever post_group_change_used already was.
      new.post_group_change_used := old.post_group_change_used;
    end if;

  else
    raise exception 'special picks are locked during the group stage';
  end if;

  return new;
end; $BODY$;
