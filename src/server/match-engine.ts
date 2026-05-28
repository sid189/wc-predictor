import "server-only";
import { scorePrediction, scoreSpecial, type ScoreInput } from "@/lib/scoring";
import {
  computeGroupStandings,
  isGroupComplete,
  type GroupMatch,
  type StandingRow,
} from "@/lib/standings";
import type { MatchResult, Prediction } from "@/lib/types";

// The engine takes the admin (service-role) client as an argument so both
// server actions and route handlers can drive it without re-importing
// auth-bound clients.
//
// `unknown` for the supabase type keeps this file standalone — the caller
// provides a real supabase-js v2 client; we only use chainable from()/select()/
// upsert()/etc., which TS will validate at the call sites.
type AdminDb = {
  from: (table: string) => any;
};

export const GROUP_LABELS = "ABCDEFGHIJKL".split("");

export const predToScoreInput = (p: Prediction): ScoreInput => ({
  ft_a: p.ft_a,
  ft_b: p.ft_b,
  et_a: p.et_a,
  et_b: p.et_b,
  pen_a: p.pen_a,
  pen_b: p.pen_b,
  winner_team_id: p.pen_winner_team_id,
});

export const resultToScoreInput = (r: MatchResult): ScoreInput => ({
  ft_a: r.ft_a,
  ft_b: r.ft_b,
  et_a: r.et_a,
  et_b: r.et_b,
  pen_a: r.pen_a,
  pen_b: r.pen_b,
  winner_team_id: r.winner_team_id,
});

/** (Re)score every prediction for one match against its recorded result. */
export async function scoreMatch(admin: AdminDb, matchId: string) {
  const { data: result } = await admin
    .from("match_results")
    .select("*")
    .eq("match_id", matchId)
    .single();
  if (!result) return;

  const { data: predictions } = await admin
    .from("predictions")
    .select("*")
    .eq("match_id", matchId);
  if (!predictions) return;

  const res = resultToScoreInput(result as MatchResult);
  for (const p of predictions as Prediction[]) {
    const points = scorePrediction(predToScoreInput(p), res);
    await admin.from("predictions").update({ points, scored: true }).eq("id", p.id);
  }
}

/** Fill the team slot of every match whose placeholder equals `token`. */
export async function fillPlaceholder(admin: AdminDb, token: string, teamId: string | null) {
  if (!teamId) return;
  const { data: deps } = await admin
    .from("matches")
    .select("id, placeholder_a, placeholder_b")
    .or(`placeholder_a.eq.${token},placeholder_b.eq.${token}`);
  for (const d of deps ?? []) {
    const patch: { team_a_id?: string | null; team_b_id?: string | null } = {};
    if (d.placeholder_a === token) patch.team_a_id = teamId;
    if (d.placeholder_b === token) patch.team_b_id = teamId;
    if (Object.keys(patch).length > 0) {
      await admin.from("matches").update(patch).eq("id", d.id);
    }
  }
}

/**
 * Advance the bracket: fill matches referencing this match's winner ("W{n}")
 * or loser ("RU{n}", used by the third-place match).
 */
export async function advanceBracket(
  admin: AdminDb,
  matchNumber: number,
  winnerId: string | null,
  loserId: string | null,
) {
  await fillPlaceholder(admin, `W${matchNumber}`, winnerId);
  await fillPlaceholder(admin, `RU${matchNumber}`, loserId);
}

export async function loadGroupMatches(admin: AdminDb, group: string): Promise<GroupMatch[]> {
  const { data: matches } = await admin
    .from("matches")
    .select("id, team_a_id, team_b_id")
    .eq("stage", "group")
    .eq("group_label", group);
  const ids = (matches ?? []).map((m: { id: string }) => m.id);
  if (ids.length === 0) return [];
  const { data: results } = await admin
    .from("match_results")
    .select("match_id, ft_a, ft_b")
    .in("match_id", ids);
  type GroupRes = { match_id: string; ft_a: number; ft_b: number };
  const resMap = new Map<string, GroupRes>(
    (results ?? []).map((r: GroupRes) => [r.match_id, r]),
  );
  return (matches ?? []).map(
    (m: { id: string; team_a_id: string | null; team_b_id: string | null }) => {
      const r = resMap.get(m.id);
      return {
        team_a_id: m.team_a_id,
        team_b_id: m.team_b_id,
        ft_a: r?.ft_a ?? null,
        ft_b: r?.ft_b ?? null,
      };
    },
  );
}

export type SeedOutcome = "seeded" | "incomplete" | "tied";

export async function seedGroupCore(admin: AdminDb, group: string): Promise<SeedOutcome> {
  const matches = await loadGroupMatches(admin, group);
  if (!isGroupComplete(matches)) return "incomplete";

  const teamIds = [
    ...new Set(
      matches.flatMap((m) => [m.team_a_id, m.team_b_id]).filter((id): id is string => !!id),
    ),
  ];
  const standings = computeGroupStandings(teamIds, matches);
  const [winner, runnerUp] = standings;
  if (!winner || !runnerUp || winner.unresolved || runnerUp.unresolved) return "tied";

  await fillPlaceholder(admin, `1${group}`, winner.teamId);
  await fillPlaceholder(admin, `2${group}`, runnerUp.teamId);
  return "seeded";
}

export async function loadAllGroupStandings(
  admin: AdminDb,
): Promise<{ group: string; standings: StandingRow[]; complete: boolean }[]> {
  const out: { group: string; standings: StandingRow[]; complete: boolean }[] = [];
  for (const g of GROUP_LABELS) {
    const matches = await loadGroupMatches(admin, g);
    if (matches.length === 0) continue;
    const teamIds = [
      ...new Set(
        matches.flatMap((m) => [m.team_a_id, m.team_b_id]).filter((id): id is string => !!id),
      ),
    ];
    out.push({
      group: g,
      standings: computeGroupStandings(teamIds, matches),
      complete: isGroupComplete(matches),
    });
  }
  return out;
}

/** Rescore every winner / golden-boot pick against the recorded actuals. */
export async function scoreSpecials(admin: AdminDb) {
  const { data: config } = await admin
    .from("tournament_config")
    .select("actual_winner_team_id, actual_golden_boot_name")
    .eq("id", 1)
    .single();
  if (!config) return;

  const { data: picks } = await admin.from("special_predictions").select("*");
  if (!picks) return;

  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  const actualBoot = norm(config.actual_golden_boot_name);

  for (const pick of picks) {
    let correct = false;
    if (pick.kind === "winner") {
      correct =
        config.actual_winner_team_id != null &&
        pick.team_id === config.actual_winner_team_id;
    } else if (pick.kind === "golden_boot") {
      const picked = norm(pick.golden_boot_name);
      correct = actualBoot !== "" && picked === actualBoot;
    }
    const points = scoreSpecial(correct, pick.is_initial);
    await admin
      .from("special_predictions")
      .update({ points, scored: true })
      .eq("id", pick.id);
  }
}

export interface ApplyResultInput {
  matchId: string;
  ft_a: number;
  ft_b: number;
  et_a?: number | null;
  et_b?: number | null;
  pen_a?: number | null;
  pen_b?: number | null;
  winner_team_id?: string | null;
  entered_by?: string | null;
}

/**
 * The full "record a result" pipeline used by both the admin server action
 * and the cron route: upsert the result, score that match's predictions,
 * and (for knockouts) advance the bracket / (for groups) seed qualifiers.
 */
export async function applyMatchResult(
  admin: AdminDb,
  input: ApplyResultInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: match } = await admin
    .from("matches")
    .select("id, is_knockout, fifa_match_number, team_a_id, team_b_id, group_label")
    .eq("id", input.matchId)
    .single();
  if (!match) return { ok: false, error: "Match not found." };

  let winner = input.winner_team_id ?? null;
  if (match.is_knockout && !winner) {
    const aggA = input.ft_a + (input.et_a ?? 0);
    const aggB = input.ft_b + (input.et_b ?? 0);
    if (input.pen_a != null && input.pen_b != null && input.pen_a !== input.pen_b) {
      winner = input.pen_a > input.pen_b ? match.team_a_id : match.team_b_id;
    } else if (aggA > aggB) winner = match.team_a_id;
    else if (aggB > aggA) winner = match.team_b_id;
  }

  const { error } = await admin.from("match_results").upsert(
    {
      match_id: input.matchId,
      ft_a: input.ft_a,
      ft_b: input.ft_b,
      et_a: input.et_a ?? null,
      et_b: input.et_b ?? null,
      pen_a: input.pen_a ?? null,
      pen_b: input.pen_b ?? null,
      winner_team_id: winner,
      entered_by: input.entered_by ?? null,
    },
    { onConflict: "match_id" },
  );
  if (error) return { ok: false, error: error.message };

  await scoreMatch(admin, input.matchId);

  if (match.is_knockout && winner && match.fifa_match_number != null) {
    const loser = winner === match.team_a_id ? match.team_b_id : match.team_a_id;
    await advanceBracket(admin, match.fifa_match_number, winner, loser);
  }
  if (!match.is_knockout && match.group_label) {
    await seedGroupCore(admin, match.group_label);
  }

  return { ok: true };
}
