-- Golden Boot prediction switches from a curated player_id reference to a
-- free-text field, so users can type any player without the admin pre-seeding
-- them. The actual top scorer on tournament_config also moves to text.
-- (Existing player_id columns are kept nullable for backward compatibility.)

alter table public.special_predictions
  add column if not exists golden_boot_name text;

alter table public.tournament_config
  add column if not exists actual_golden_boot_name text;
