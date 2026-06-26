-- Bracket picks: one row per (user, KO match) storing the team they predict
-- will win that match. All 62 KO matches must be submitted at once, but the
-- table accepts partial upserts so the UI can save as the user fills in.
-- The application layer enforces the submission lock (first R32 kickoff).

create table if not exists public.bracket_picks (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  match_id                 uuid not null references public.matches(id) on delete cascade,
  predicted_winner_team_id uuid not null references public.teams(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique(user_id, match_id)
);

alter table public.bracket_picks enable row level security;

-- Own picks always readable (needed for the submission form).
-- Other users' picks only readable once the first R32 match has kicked off.
create policy "bracket_picks_select" on public.bracket_picks
  for select using (
    auth.uid() = user_id
    or exists (
      select 1 from public.matches
      where stage = 'round_of_32'
        and kickoff_at <= now()
      limit 1
    )
  );

-- Users can only insert/update their own rows.
create policy "bracket_picks_insert" on public.bracket_picks
  for insert with check (auth.uid() = user_id);

create policy "bracket_picks_update" on public.bracket_picks
  for update using (auth.uid() = user_id);

-- Keep updated_at in sync automatically.
create or replace function public.set_bracket_picks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bracket_picks_updated_at
  before update on public.bracket_picks
  for each row execute function public.set_bracket_picks_updated_at();
