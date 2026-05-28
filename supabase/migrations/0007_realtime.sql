-- Push row changes on the live-data tables to subscribed clients so the UI
-- updates without manual refresh. RLS is enforced on Realtime channels too:
-- a user only receives change events for rows they could SELECT.
--
-- Re-running this script will error with "table already in publication" —
-- that's harmless; it just means it's already enabled.

alter publication supabase_realtime add table public.match_results;
alter publication supabase_realtime add table public.predictions;
alter publication supabase_realtime add table public.special_predictions;
