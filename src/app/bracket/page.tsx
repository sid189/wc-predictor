import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BracketPicker } from "@/components/BracketPicker";
import type { BracketMatch, BracketLeaderboardRow } from "@/components/BracketPicker";
import type { Match, MatchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

const KO_STAGES = [
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
];

const STAGE_POINTS: Record<string, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarter_final: 4,
  semi_final: 8,
  third_place: 8,
  final: 16,
};

export default async function BracketPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: matchesRaw }, { data: teamsRaw }, { data: myPicksRaw }] =
    await Promise.all([
      supabase
        .from("matches")
        .select("id, stage, kickoff_at, fifa_match_number, team_a_id, team_b_id, placeholder_a, placeholder_b")
        .in("stage", KO_STAGES)
        .order("kickoff_at"),
      supabase.from("teams").select("id, name"),
      supabase
        .from("bracket_picks")
        .select("match_id, predicted_winner_team_id")
        .eq("user_id", user.id),
    ]);

  const matches = (matchesRaw ?? []) as Match[];
  const teams = (teamsRaw ?? []) as { id: string; name: string }[];

  // Bracket locks once the first R32 match has kicked off.
  const locked = matches
    .filter((m) => m.stage === "round_of_32")
    .some((m) => new Date(m.kickoff_at) <= new Date());

  const koMatchIds = matches.map((m) => m.id);

  // Only fetch everyone's picks + results after lock — before that, picks are
  // hidden from other users (both here and in the RLS policy on bracket_picks).
  const [{ data: resultsRaw }, { data: allPicksRaw }, { data: profilesRaw }] =
    locked && koMatchIds.length
      ? await Promise.all([
          supabase
            .from("match_results")
            .select("match_id, winner_team_id")
            .in("match_id", koMatchIds),
          supabase
            .from("bracket_picks")
            .select("user_id, match_id, predicted_winner_team_id"),
          supabase.from("profiles").select("id, display_name"),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const results = (resultsRaw ?? []) as Pick<MatchResult, "match_id" | "winner_team_id">[];
  const allPicks = (allPicksRaw ?? []) as {
    user_id: string;
    match_id: string;
    predicted_winner_team_id: string;
  }[];
  const profiles = (profilesRaw ?? []) as { id: string; display_name: string }[];

  const teamNames: Record<string, string> = Object.fromEntries(
    teams.map((t) => [t.id, t.name]),
  );

  const koMatches: BracketMatch[] = matches.map((m) => ({
    id: m.id,
    stage: m.stage,
    kickoff_at: m.kickoff_at,
    match_number: m.fifa_match_number,
    team_a_id: m.team_a_id,
    team_b_id: m.team_b_id,
    placeholder_a: m.placeholder_a,
    placeholder_b: m.placeholder_b,
  }));

  const myPicks: Record<string, string> = Object.fromEntries(
    (myPicksRaw ?? []).map(
      (p: { match_id: string; predicted_winner_team_id: string }) => [
        p.match_id,
        p.predicted_winner_team_id,
      ],
    ),
  );

  const actualWinners: Record<string, string> = Object.fromEntries(
    results
      .filter((r) => r.winner_team_id)
      .map((r) => [r.match_id, r.winner_team_id!]),
  );

  // Build leaderboard (only meaningful once locked).
  let leaderboard: BracketLeaderboardRow[] = [];
  if (locked) {
    const matchStage = new Map(matches.map((m) => [m.id, m.stage]));
    const picksByUser = new Map<string, Map<string, string>>();
    for (const p of allPicks) {
      if (!picksByUser.has(p.user_id)) picksByUser.set(p.user_id, new Map());
      picksByUser.get(p.user_id)!.set(p.match_id, p.predicted_winner_team_id);
    }

    const userScores = [...picksByUser.entries()].map(([userId, userPickMap]) => {
      let pts = 0;
      let correct = 0;
      for (const [matchId, winner] of Object.entries(actualWinners)) {
        if (userPickMap.get(matchId) === winner) {
          correct += 1;
          pts += STAGE_POINTS[matchStage.get(matchId) ?? ""] ?? 0;
        }
      }
      return { userId, correct, pts };
    });

    userScores.sort((a, b) => b.pts - a.pts || b.correct - a.correct);

    const profileMap = new Map(profiles.map((p) => [p.id, p.display_name]));
    let rank = 1;
    leaderboard = userScores.map((s, i) => {
      if (i > 0 && (s.pts !== userScores[i - 1].pts || s.correct !== userScores[i - 1].correct)) {
        rank = i + 1;
      }
      return {
        userId: s.userId,
        name: profileMap.get(s.userId) ?? "?",
        rank,
        correct: s.correct,
        pts: s.pts,
        hasSubmitted: true,
      };
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Bracket</h1>
      <BracketPicker
        koMatches={koMatches}
        myPicks={myPicks}
        locked={locked}
        teamNames={teamNames}
        actualWinners={actualWinners}
        leaderboard={leaderboard}
        currentUserId={user.id}
      />
    </div>
  );
}
