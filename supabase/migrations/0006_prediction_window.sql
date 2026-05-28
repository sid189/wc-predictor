-- Prediction window: opens 48 hours before kickoff, closes AT kickoff.
-- (If you change the 48h here, also update PREDICTION_WINDOW_HOURS in
--  src/lib/format.ts so the UI's "opens at" labels match the DB rule.)

drop policy if exists "predictions_insert_self" on public.predictions;
create policy "predictions_insert_self" on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.kickoff_at > now()
        and m.kickoff_at - interval '48 hours' <= now()
    )
  );

drop policy if exists "predictions_update_self" on public.predictions;
create policy "predictions_update_self" on public.predictions
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.kickoff_at > now()
        and m.kickoff_at - interval '48 hours' <= now()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.kickoff_at > now()
        and m.kickoff_at - interval '48 hours' <= now()
    )
  );
