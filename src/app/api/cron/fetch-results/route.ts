import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyMatchResult } from "@/server/match-engine";

// FIFA's public JSON API for the WC 2026 season (idSeason 285023 corresponds
// to "FIFA World Cup 2026™" on idCompetition 17). This is the same endpoint
// used to scrape the schedule; payload shape may change without notice.
const FIFA_URL =
  "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=200&language=en";

// Wait until FIFA's score fields are reliably "final" before applying them.
// FIFA reports HomeTeamScore live (incrementing during the match), so the
// cron has to outlast the match itself. Real durations:
//   • Group / regulation knockout: 90 + 15 (HT) + ~10 (stoppage) ≈ 115 min
//   • Knockout going to ET:        + 30 (ET) ≈ 145 min
//   • Knockout going to pens:      + ~10 (shootout) ≈ 155 min
// Group matches can't go to ET, so we use a tighter 2h buffer there for
// faster pickup. Knockouts stay at 3h to cover ET + pens.
const GROUP_BUFFER_MS = 2 * 60 * 60 * 1000;
const KNOCKOUT_BUFFER_MS = 3 * 60 * 60 * 1000;

interface FifaMatch {
  MatchNumber: number;
  Date: string;
  HomeTeamScore: number | null; // FT (90') score
  AwayTeamScore: number | null;
  AggregateHomeTeamScore: number | null; // FT + ET goals (knockout only)
  AggregateAwayTeamScore: number | null;
  HomeTeamPenaltyScore: number | null; // shootout score (knockout only)
  AwayTeamPenaltyScore: number | null;
}

export async function POST(request: Request) {
  // Shared-secret auth — set CRON_SECRET in .env.local and on Vercel.
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let fifaPayload;
  try {
    const fifaRes = await fetch(FIFA_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    if (!fifaRes.ok) {
      return NextResponse.json({ error: `FIFA ${fifaRes.status}` }, { status: 502 });
    }
    fifaPayload = await fifaRes.json();
  } catch (e) {
    return NextResponse.json({ error: `FIFA fetch failed: ${(e as Error).message}` }, { status: 502 });
  }
  const fifa: FifaMatch[] = fifaPayload?.Results ?? [];

  const admin = createAdminClient();
  const [{ data: matches }, { data: existing }] = await Promise.all([
    admin.from("matches").select("id, fifa_match_number, is_knockout").not("fifa_match_number", "is", null),
    // Pull existing scores + who entered so we can self-correct stale cron
    // entries (e.g. when FIFA reports a late 90+6' goal *after* our previous
    // run) while still leaving admin entries untouched.
    admin
      .from("match_results")
      .select("match_id, ft_a, ft_b, et_a, et_b, pen_a, pen_b, entered_by"),
  ]);
  const ourByNum = new Map(
    (matches ?? []).map(
      (m: { id: string; fifa_match_number: number | null; is_knockout: boolean }) => [
        m.fifa_match_number,
        m,
      ],
    ),
  );
  type ExistingRow = {
    match_id: string;
    ft_a: number;
    ft_b: number;
    et_a: number | null;
    et_b: number | null;
    pen_a: number | null;
    pen_b: number | null;
    entered_by: string | null;
  };
  const existingMap = new Map<string, ExistingRow>(
    ((existing ?? []) as ExistingRow[]).map((r) => [r.match_id, r]),
  );

  const summary = {
    fifa_matches: fifa.length,
    applied: 0,
    updated: 0,
    skipped_admin: 0,
    skipped_unchanged: 0,
    skipped_unfinished: 0,
    errors: [] as { match: number; error: string }[],
  };

  for (const f of fifa) {
    const num = f.MatchNumber;
    const ourMatch = ourByNum.get(num);
    if (!ourMatch) continue;

    // Admin entries are the source of truth — never overwritten.
    const prev = existingMap.get(ourMatch.id);
    if (prev && prev.entered_by !== null) {
      summary.skipped_admin += 1;
      continue;
    }

    // Only treat as finished when both scores are populated AND the scheduled
    // kickoff is well in the past. (FIFA's MatchStatus codes are
    // undocumented; this heuristic avoids depending on them.)
    if (f.HomeTeamScore == null || f.AwayTeamScore == null) {
      summary.skipped_unfinished += 1;
      continue;
    }
    const kickoffMs = new Date(f.Date).getTime();
    const bufferMs = ourMatch.is_knockout ? KNOCKOUT_BUFFER_MS : GROUP_BUFFER_MS;
    if (kickoffMs > Date.now() - bufferMs) {
      summary.skipped_unfinished += 1;
      continue;
    }

    // FT score is always populated from HomeTeamScore / AwayTeamScore (90').
    // For knockouts we also detect ET + penalties:
    //   ET goals  = (aggregate after ET) − (FT score) — i.e. goals scored
    //               DURING extra time only, per our schema convention.
    //               Example: 1-1 at FT, 2-2 at end of ET → et_a = et_b = 1.
    //   Pens      = HomeTeamPenaltyScore / AwayTeamPenaltyScore as-is.
    //   If pens happened but aggregate equals FT (no goals in ET),
    //   we set et = 0-0 explicitly since the match did go through ET.
    const ft_a = f.HomeTeamScore;
    const ft_b = f.AwayTeamScore;

    let et_a: number | null = null;
    let et_b: number | null = null;
    let pen_a: number | null = null;
    let pen_b: number | null = null;

    if (ourMatch.is_knockout) {
      const aggA = f.AggregateHomeTeamScore;
      const aggB = f.AggregateAwayTeamScore;
      if (aggA != null && aggB != null && (aggA !== ft_a || aggB !== ft_b)) {
        et_a = aggA - ft_a;
        et_b = aggB - ft_b;
      }
      if (f.HomeTeamPenaltyScore != null && f.AwayTeamPenaltyScore != null) {
        pen_a = f.HomeTeamPenaltyScore;
        pen_b = f.AwayTeamPenaltyScore;
        // Pens happened but ET aggregate wasn't reported (e.g. ET 0-0).
        if (et_a == null) {
          et_a = 0;
          et_b = 0;
        }
      }
    }

    // If this match already has a cron-applied result with identical scores,
    // skip — FIFA's payload hasn't changed since last run.
    if (
      prev &&
      prev.ft_a === ft_a &&
      prev.ft_b === ft_b &&
      prev.et_a === et_a &&
      prev.et_b === et_b &&
      prev.pen_a === pen_a &&
      prev.pen_b === pen_b
    ) {
      summary.skipped_unchanged += 1;
      continue;
    }

    const res = await applyMatchResult(admin, {
      matchId: ourMatch.id,
      ft_a,
      ft_b,
      et_a,
      et_b,
      pen_a,
      pen_b,
      // winner_team_id is derived inside applyMatchResult for knockouts.
    });
    if (res.ok) {
      if (prev) summary.updated += 1;
      else summary.applied += 1;
    } else {
      summary.errors.push({ match: num, error: res.error });
    }
  }

  return NextResponse.json(summary);
}
