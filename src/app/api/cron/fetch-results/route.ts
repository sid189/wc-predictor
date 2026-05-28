import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyMatchResult } from "@/server/match-engine";

// FIFA's public JSON API for the WC 2026 season (idSeason 285023 corresponds
// to "FIFA World Cup 2026™" on idCompetition 17). This is the same endpoint
// used to scrape the schedule; payload shape may change without notice.
const FIFA_URL =
  "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=200&language=en";

// 30-minute buffer after kickoff before we treat a match as "should be over".
const KICKOFF_BUFFER_MS = 30 * 60 * 1000;

interface FifaMatch {
  MatchNumber: number;
  Date: string;
  HomeTeamScore: number | null;
  AwayTeamScore: number | null;
  AggregateHomeTeamScore: number | null;
  AggregateAwayTeamScore: number | null;
  HomeTeamPenaltyScore: number | null;
  AwayTeamPenaltyScore: number | null;
  MatchStatus: number | null;
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
    admin.from("matches").select("id, fifa_match_number, is_knockout"),
    admin.from("match_results").select("match_id"),
  ]);
  const ourByNum = new Map(
    (matches ?? []).map((m: { id: string; fifa_match_number: number | null }) => [
      m.fifa_match_number,
      m,
    ]),
  );
  const alreadyEntered = new Set(
    (existing ?? []).map((r: { match_id: string }) => r.match_id),
  );

  const summary = {
    fifa_matches: fifa.length,
    applied: 0,
    skipped_existing: 0,
    skipped_unfinished: 0,
    errors: [] as { match: number; error: string }[],
  };

  for (const f of fifa) {
    const num = f.MatchNumber;
    const ourMatch = ourByNum.get(num);
    if (!ourMatch) continue;

    // Never overwrite an admin-entered result — the manual entry wins.
    if (alreadyEntered.has(ourMatch.id)) {
      summary.skipped_existing += 1;
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
    if (kickoffMs > Date.now() - KICKOFF_BUFFER_MS) {
      summary.skipped_unfinished += 1;
      continue;
    }

    // Best-effort interpretation of FIFA fields:
    //   HomeTeamScore / AwayTeamScore       = full-time score (90')
    //   AggregateHomeTeamScore / Aggregate… = full-time + extra-time goals (knockout only)
    //   HomeTeamPenaltyScore / Away…        = shootout score (knockout only)
    const ft_a = f.HomeTeamScore;
    const ft_b = f.AwayTeamScore;
    const aggA = f.AggregateHomeTeamScore ?? ft_a;
    const aggB = f.AggregateAwayTeamScore ?? ft_b;
    let et_a: number | null = null;
    let et_b: number | null = null;
    if (aggA !== ft_a || aggB !== ft_b) {
      et_a = aggA - ft_a;
      et_b = aggB - ft_b;
    }
    const pen_a = f.HomeTeamPenaltyScore ?? null;
    const pen_b = f.AwayTeamPenaltyScore ?? null;

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
    if (res.ok) summary.applied += 1;
    else summary.errors.push({ match: num, error: res.error });
  }

  return NextResponse.json(summary);
}
