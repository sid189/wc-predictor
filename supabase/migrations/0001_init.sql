-- ============================================================================
-- wc-predictor schema
--   - No home/away concept: every match has team_a / team_b.
--   - Predictions lock at kickoff (enforced by RLS, below).
--   - Scoring columns (points/scored) can only be written by the service role.
--   - Special picks (winner / golden boot) lock at tournament start and may be
--     changed once after the group stage; is_initial tracks the +5 vs +2 rule.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type match_stage as enum (
    'group', 'round_of_32', 'round_of_16', 'quarter_final', 'semi_final',
    'third_place', 'final'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

-- ===========================================================================
-- profiles  (one row per auth user)
-- ===========================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url  text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Helper: am I an admin? (SECURITY DEFINER avoids RLS recursion on profiles.)
-- Defined after the profiles table so this SQL function's body validates.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Create a profile automatically when a Google user signs up.
-- The configured admin email is bootstrapped as admin; change it as needed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    new.email = 'sid.s.deshpande@gmail.com'   -- bootstrap admin
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop non-admins from granting themselves admin via a profile UPDATE.
create or replace function public.guard_profile_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.is_admin is distinct from old.is_admin)
     and auth.role() <> 'service_role'
     and not public.is_admin() then
    raise exception 'not allowed to change admin flag';
  end if;
  return new;
end; $$;

drop trigger if exists guard_profile_admin on public.profiles;
create trigger guard_profile_admin
  before update on public.profiles
  for each row execute function public.guard_profile_admin();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- teams / players
-- ===========================================================================
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  code        text,                -- 3-letter code, optional
  group_label text,                -- 'A'..'L' for group stage, null otherwise
  created_at  timestamptz not null default now()
);

create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  team_id     uuid references public.teams(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ===========================================================================
-- matches
-- ===========================================================================
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  stage       match_stage not null,
  group_label text,                                   -- only for stage='group'
  team_a_id   uuid references public.teams(id) on delete set null,
  team_b_id   uuid references public.teams(id) on delete set null,
  kickoff_at  timestamptz not null,
  match_order int not null default 0,                 -- display / sort order
  is_knockout boolean generated always as (stage <> 'group') stored,
  created_at  timestamptz not null default now()
);
create index if not exists matches_kickoff_idx on public.matches(kickoff_at);

-- ===========================================================================
-- match_results  (written by admin server action via service role)
-- ===========================================================================
create table if not exists public.match_results (
  match_id       uuid primary key references public.matches(id) on delete cascade,
  ft_a           int not null check (ft_a >= 0),
  ft_b           int not null check (ft_b >= 0),
  et_a           int check (et_a >= 0),               -- goals scored in extra time
  et_b           int check (et_b >= 0),
  pen_a          int check (pen_a >= 0),              -- penalty shootout score
  pen_b          int check (pen_b >= 0),
  winner_team_id uuid references public.teams(id),    -- knockout advancer
  entered_by     uuid references public.profiles(id),
  entered_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
drop trigger if exists match_results_updated_at on public.match_results;
create trigger match_results_updated_at before update on public.match_results
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- predictions  (one per user per match)
-- ===========================================================================
create table if not exists public.predictions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  match_id            uuid not null references public.matches(id) on delete cascade,
  ft_a                int not null check (ft_a >= 0),
  ft_b                int not null check (ft_b >= 0),
  et_a                int check (et_a >= 0),
  et_b                int check (et_b >= 0),
  pen_a               int check (pen_a >= 0),
  pen_b               int check (pen_b >= 0),
  pen_winner_team_id  uuid references public.teams(id),
  points              int not null default 0,         -- written only by service role
  scored              boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, match_id)
);
create index if not exists predictions_match_idx on public.predictions(match_id);

drop trigger if exists predictions_updated_at on public.predictions;
create trigger predictions_updated_at before update on public.predictions
  for each row execute function public.set_updated_at();

-- Clients may never set points/scored; only the service role (scoring) can.
create or replace function public.guard_prediction_scoring()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    if tg_op = 'INSERT' then
      new.points := 0;
      new.scored := false;
    else
      new.points := old.points;
      new.scored := old.scored;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists guard_prediction_scoring on public.predictions;
create trigger guard_prediction_scoring
  before insert or update on public.predictions
  for each row execute function public.guard_prediction_scoring();

-- ===========================================================================
-- tournament_config  (single row, id = 1)
-- ===========================================================================
create table if not exists public.tournament_config (
  id                            int primary key default 1 check (id = 1),
  name                          text not null default 'FIFA World Cup',
  starts_at                     timestamptz,   -- special picks lock here (+5 window)
  group_stage_ends_at           timestamptz,   -- change window opens after this
  actual_winner_team_id         uuid references public.teams(id),
  actual_golden_boot_player_id  uuid references public.players(id),
  updated_at                    timestamptz not null default now()
);
insert into public.tournament_config (id) values (1) on conflict (id) do nothing;

drop trigger if exists tournament_config_updated_at on public.tournament_config;
create trigger tournament_config_updated_at before update on public.tournament_config
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- special_predictions  (tournament winner & golden boot, one per kind per user)
-- ===========================================================================
create table if not exists public.special_predictions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('winner', 'golden_boot')),
  team_id     uuid references public.teams(id),     -- for kind='winner'
  player_id   uuid references public.players(id),   -- for kind='golden_boot'
  is_initial  boolean not null default true,        -- true => pre-tournament pick (+5)
  points      int not null default 0,
  scored      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, kind)
);

drop trigger if exists special_predictions_updated_at on public.special_predictions;
create trigger special_predictions_updated_at before update on public.special_predictions
  for each row execute function public.set_updated_at();

-- Phase gate + is_initial bookkeeping + scoring guard for special picks.
create or replace function public.set_special_pick_phase()
returns trigger language plpgsql security definer set search_path = public as $$
declare cfg record;
begin
  if auth.role() = 'service_role' then
    return new;  -- admin / scoring writes pass through untouched
  end if;

  -- Clients may never set scoring columns.
  new.points := coalesce(old.points, 0);
  new.scored := coalesce(old.scored, false);

  select starts_at, group_stage_ends_at into cfg from public.tournament_config where id = 1;

  if cfg.starts_at is null or now() <= cfg.starts_at then
    new.is_initial := true;                 -- still pre-tournament
  elsif cfg.group_stage_ends_at is not null and now() > cfg.group_stage_ends_at then
    new.is_initial := false;                -- changed after group stage => +2 if correct
  else
    raise exception 'special picks are locked during the group stage';
  end if;
  return new;
end; $$;

drop trigger if exists set_special_pick_phase on public.special_predictions;
create trigger set_special_pick_phase
  before insert or update on public.special_predictions
  for each row execute function public.set_special_pick_phase();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles            enable row level security;
alter table public.teams               enable row level security;
alter table public.players             enable row level security;
alter table public.matches             enable row level security;
alter table public.match_results       enable row level security;
alter table public.predictions         enable row level security;
alter table public.tournament_config   enable row level security;
alter table public.special_predictions enable row level security;

-- profiles: everyone signed in can read; you can edit your own row.
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Reference data: readable by all signed-in users, writable by admins only.
-- (Admin server actions use the service role, which bypasses RLS; these
--  policies are defense-in-depth for anon/authenticated keys.)
create policy "teams_select" on public.teams for select to authenticated using (true);
create policy "teams_admin_write" on public.teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "players_select" on public.players for select to authenticated using (true);
create policy "players_admin_write" on public.players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "matches_select" on public.matches for select to authenticated using (true);
create policy "matches_admin_write" on public.matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "results_select" on public.match_results for select to authenticated using (true);
create policy "results_admin_write" on public.match_results for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "config_select" on public.tournament_config for select to authenticated using (true);
create policy "config_admin_write" on public.tournament_config for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- predictions:
--   * read your own anytime;
--   * read everyone else's ONLY after that match has kicked off (hidden-until-lock);
--   * insert/update your own ONLY before kickoff (lock-at-kickoff).
create policy "predictions_select" on public.predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.matches m
               where m.id = match_id and m.kickoff_at <= now())
  );
create policy "predictions_insert_self" on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.matches m
                where m.id = match_id and m.kickoff_at > now())
  );
create policy "predictions_update_self" on public.predictions
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.matches m
                where m.id = match_id and m.kickoff_at > now())
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.matches m
                where m.id = match_id and m.kickoff_at > now())
  );

-- special_predictions:
--   * read your own anytime; read others' once the tournament has started;
--   * insert/update your own (the trigger enforces phase windows + is_initial).
create policy "special_select" on public.special_predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.tournament_config c
               where c.id = 1 and c.starts_at is not null and c.starts_at <= now())
  );
create policy "special_insert_self" on public.special_predictions
  for insert to authenticated with check (user_id = auth.uid());
create policy "special_update_self" on public.special_predictions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
