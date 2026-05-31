# World Cup Predictor

A private FIFA World Cup prediction app for a small group of friends. Built with
Next.js (App Router) + TypeScript + Tailwind + Supabase (Postgres / Auth).

## Features

- Google sign-in (Supabase Auth)
- Match list with kickoff times and lock status
- One prediction per user per match — full-time score; optional extra-time and
  penalty predictions for knockouts
- Predictions **lock at kickoff** (enforced by RLS, not just the UI)
- Admin enters results; points are calculated and stored automatically
- Tournament Winner & Golden Boot picks (lock at tournament start, one change
  allowed after the group stage)
- Leaderboard of total points

## Scoring rules

| Outcome | Points |
| --- | --- |
| Correct full-time outcome / draw | +1 |
| Exact full-time score | +3 *(replaces the +1; a perfect FT = 3)* |
| Exact extra-time goals (knockout) | +1 |
| Exact penalty shootout score (knockout) | +1 |
| Tournament winner — picked before tournament | +5 |
| Tournament winner — changed after group stage | +2 |
| Golden Boot — picked before tournament | +5 |
| Golden Boot — changed after group stage | +2 |

A perfect single match going through FT → ET → penalties caps at **+5**
(3 + 1 + 1). All logic lives in `src/lib/scoring.ts` (pure functions,
unit-tested in `scoring.test.ts`).

## Setup

1. **Create a Supabase project** and copy `.env.example` to `.env.local`, filling
   in the URL, anon key, and **service-role key** (server-only).

2. **Run the migrations** — paste `0001_init.sql` … `0004_access_control.sql`
   (in order) from `supabase/migrations/` into the Supabase SQL editor. They
   create the schema, RLS policies, triggers, and the guest-list gate.
   - Bootstraps `sid.s.deshpande@gmail.com` as admin and as the first invited
     email. Change that in `handle_new_user()` / the `allowed_emails` seed
     (migrations 0001 and 0004) for your own admin.
   - **Access is invite-only**: only emails in `allowed_emails` get a profile on
     sign-in; the admin invites the rest from `/admin/data`. Anyone else lands on
     a "not invited" screen.

3. **Enable Google auth** — Supabase dashboard → Authentication → Providers →
   Google. Add `http://localhost:3000/auth/callback` (and your production URL)
   to the allowed redirect URLs.

4. **Seed the schedule** — `npm run db:seed` loads the official FIFA WC 2026 data
   from `scripts/wc2026-schedule.json` (104 matches, 48 teams, 12 groups, dates,
   venues, knockout bracket) plus a Golden Boot shortlist, and sets the tournament
   start / group-stage-end dates. Idempotent (safe to re-run).

5. **Run it** — `npm run dev`, then sign in. Manage results, config, teams and
   players from `/admin`. Knockout winners auto-advance into the next round;
   group-position slots (`1A`, `2B`) are assigned from the admin results list.

6. **Smoke-test (optional)** — `npm run db:smoke` verifies the schema and the
   scoring round-trip against your project, cleaning up after itself. Run it on a
   dev project, not production.

## Scripts

- `npm run dev` — local dev server
- `npm run build` / `npm start` — production build
- `npm test` — run scoring unit tests (Vitest)
- `npm run db:seed` — load the official WC 2026 schedule
- `npm run db:smoke` — integration smoke test against your Supabase project

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel (framework auto-detected as Next.js).
2. Set the three env vars from `.env.example` in **Project → Settings → Environment
   Variables**. Keep `SUPABASE_SERVICE_ROLE_KEY` **without** the `NEXT_PUBLIC_`
   prefix so it stays server-only.
3. In Supabase → Authentication → URL Configuration, add your production
   `https://<your-app>.vercel.app/auth/callback` to the redirect allow-list, and
   set the Site URL.
4. Deploy. Run the migrations + `npm run db:seed` against the production database
   once (locally with prod env vars, or via the Supabase SQL editor + seed).

## Production checklist (your side)

The code is in place; these steps are operational and need your accounts/dashboards:

1. **Supabase project** created; migrations `0001`–`0004` run, `npm run db:seed` done.
2. **Admin email** set — `handle_new_user()` + the `allowed_emails` seed (migrations
   0001 / 0004). Invite the other players from `/admin/data`.
3. **Google OAuth** enabled with the consent screen published; production
   `/auth/callback` in the redirect allow-list and the Site URL set.
4. **Env vars in Vercel** — the three from `.env.example`; service-role key has no
   `NEXT_PUBLIC_` prefix.
5. **`npm run db:smoke`** passes against the production DB.
6. **Backups** — enable Supabase Point-in-Time Recovery / scheduled backups.
7. **Monitoring** (optional) — error boundaries already `console.error` to the
   Vercel/Supabase logs; add Sentry if you want alerting.
8. **CI** — the GitHub Action in `.github/workflows/ci.yml` runs typecheck, tests
   and build on every push/PR once the repo is on GitHub.

## Security notes

- The **service-role key** is used only in server code (`src/lib/supabase/admin.ts`,
  imported by server actions) and is never sent to the browser.
- **RLS** is enabled on every table. Predictions can only be written before
  kickoff and read by others only after kickoff. A trigger prevents clients from
  writing their own `points`/`scored` — only the service role (scoring) can.
- Special picks are locked during the group stage and allow exactly one change
  afterwards (DB trigger), so the +5/+2 rule can't be gamed from the client.
