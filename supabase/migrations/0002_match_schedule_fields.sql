-- Extra match fields populated from the official FIFA WC 2026 schedule.
--   * fifa_match_number — official match number (1..104); used as a stable key
--     so the seed can upsert idempotently.
--   * placeholder_a/b   — bracket slot labels for knockout matches before the
--     teams are known (e.g. '2A' = runner-up of Group A, 'W101' = winner of
--     match 101).
--   * stadium / city    — venue.

alter table public.matches
  add column if not exists fifa_match_number int unique,
  add column if not exists placeholder_a text,
  add column if not exists placeholder_b text,
  add column if not exists stadium text,
  add column if not exists city text;
