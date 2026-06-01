-- Push row changes on the live-data tables to subscribed clients so the UI
-- updates without manual refresh. RLS is enforced on Realtime channels too:
-- a user only receives change events for rows they could SELECT.
--
-- Each ALTER PUBLICATION is wrapped in a DO block that swallows the
-- "already in publication" error (SQLSTATE 42710 / duplicate_object) so this
-- migration is safe to re-run.

do $$ begin
  alter publication supabase_realtime add table public.match_results;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.predictions;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.special_predictions;
exception when duplicate_object then null;
end $$;
