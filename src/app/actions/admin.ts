"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scorePrediction, scoreSpecial, type ScoreInput } from "@/lib/scoring";
import {
  computeGroupStandings,
  isGroupComplete,
  rankThirdPlaced,
  type GroupMatch,
  type StandingRow,
} from "@/lib/standings";
import { THIRD_PLACE_SLOTS } from "@/lib/thirdplace";
import type { ActionResult } from "./predictions";
import type { MatchResult, Prediction } from "@/lib/types";

const GROUP_LABELS = "ABCDEFGHIJKL".split("");

/** Throws unless the current user is a signed-in admin. */
async function getAdminId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) throw new Error("Admin access required.");
  return user.id;
}

const predToScoreInput = (p: Prediction): ScoreInput => ({
  ft_a: p.ft_a,
  ft_b: p.ft_b,
  et_a: p.et_a,
  et_b: p.et_b,
  pen_a: p.pen_a,
  pen_b: p.pen_b,
  winner_team_id: p.pen_winner_team_id,
});

const resultToScoreInput = (r: MatchResult): ScoreInput => ({
  ft_a: r.ft_a,
  ft_b: r.ft_b,
  et_a: r.et_a,
  et_b: r.et_b,
  pen_a: r.pen_a,
  pen_b: r.pen_b,
  winner_team_id: r.winner_team_id,
});

/** (Re)score every prediction for one match against its recorded result. */
async function scoreMatch(matchId: string) {
  const admin = createAdminClient();

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
    await admin
      .from("predictions")
      .update({ points, scored: true })
      .eq("id", p.id);
  }
}

type AdminDb = ReturnType<typeof createAdminClient>;

/** Fill the team slot of every match whose placeholder equals `token`. */
async function fillPlaceholder(admin: AdminDb, token: string, teamId: string | null) {
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
async function advanceBracket(
  admin: AdminDb,
  matchNumber: number,
  winnerId: string | null,
  loserId: string | null,
) {
  await fillPlaceholder(admin, `W${matchNumber}`, winnerId);
  await fillPlaceholder(admin, `RU${matchNumber}`, loserId);
}

/** Load a group's matches as GroupMatch[] (joined with their results). */
async function loadGroupMatches(admin: AdminDb, group: string): Promise<GroupMatch[]> {
  const { data: matches } = await admin
    .from("matches")
    .select("id, team_a_id, team_b_id")
    .eq("stage", "group")
    .eq("group_label", group);
  const ids = (matches ?? []).map((m) => m.id);
  if (ids.length === 0) return [];
  const { data: results } = await admin
    .from("match_results")
    .select("match_id, ft_a, ft_b")
    .in("match_id", ids);
  const resMap = new Map((results ?? []).map((r) => [r.match_id, r]));
  return (matches ?? []).map((m) => {
    const r = resMap.get(m.id);
    return {
      team_a_id: m.team_a_id,
      team_b_id: m.team_b_id,
      ft_a: r?.ft_a ?? null,
      ft_b: r?.ft_b ?? null,
    };
  });
}

type SeedOutcome = "seeded" | "incomplete" | "tied";

/**
 * If a group is complete and its top two are unambiguous, fill the "1{G}" and
 * "2{G}" Round-of-32 slots with the winner and runner-up. Returns why not.
 */
async function seedGroupCore(admin: AdminDb, group: string): Promise<SeedOutcome> {
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

export interface ResultInput {
  matchId: string;
  ft_a: number;
  ft_b: number;
  et_a?: number | null;
  et_b?: number | null;
  pen_a?: number | null;
  pen_b?: number | null;
  winner_team_id?: string | null;
}

/** Admin: record a result, rescore its predictions, and advance the bracket. */
export async function enterResult(input: ResultInput): Promise<ActionResult> {
  let adminId: string;
  try {
    adminId = await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select("id, is_knockout, fifa_match_number, team_a_id, team_b_id, group_label")
    .eq("id", input.matchId)
    .single();
  if (!match) return { ok: false, error: "Match not found." };

  // For knockouts, determine the advancing team: explicit pick, else derived
  // from penalties → aggregate (FT + ET) goals.
  let winner = input.winner_team_id ?? null;
  if (match.is_knockout && !winner) {
    const aggA = input.ft_a + (input.et_a ?? 0);
    const aggB = input.ft_b + (input.et_b ?? 0);
    if (input.pen_a != null && input.pen_b != null && input.pen_a !== input.pen_b) {
      winner = input.pen_a > input.pen_b ? match.team_a_id : match.team_b_id;
    } else if (aggA > aggB) {
      winner = match.team_a_id;
    } else if (aggB > aggA) {
      winner = match.team_b_id;
    }
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
      entered_by: adminId,
    },
    { onConflict: "match_id" },
  );
  if (error) return { ok: false, error: error.message };

  await scoreMatch(input.matchId);

  if (match.is_knockout && winner && match.fifa_match_number != null) {
    const loser = winner === match.team_a_id ? match.team_b_id : match.team_a_id;
    await advanceBracket(admin, match.fifa_match_number, winner, loser);
  }

  // A group result may complete the group — seed its R32 qualifiers (best-effort).
  if (!match.is_knockout && match.group_label) {
    await seedGroupCore(admin, match.group_label);
  }

  revalidatePath("/admin");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
  revalidatePath("/standings");
  return { ok: true };
}

/** Admin: recompute every group's standings and (re)seed the R32 group slots. */
export async function reseedAllGroups(): Promise<ActionResult & { seeded: number; pending: string[] }> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message, seeded: 0, pending: [] };
  }
  const admin = createAdminClient();
  let seeded = 0;
  const pending: string[] = [];
  for (const g of GROUP_LABELS) {
    const outcome = await seedGroupCore(admin, g);
    if (outcome === "seeded") seeded += 1;
    else if (outcome === "tied") pending.push(g);
  }
  revalidatePath("/admin");
  revalidatePath("/matches");
  revalidatePath("/standings");
  return { ok: true, seeded, pending };
}

/**
 * Admin: full recompute after data corrections — rescore every match, re-advance
 * knockout brackets, reseed group qualifiers, and rescore special picks.
 */
export async function recalcEverything(): Promise<ActionResult & { matches: number }> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message, matches: 0 };
  }
  const admin = createAdminClient();

  const { data: results } = await admin
    .from("match_results")
    .select("match_id, winner_team_id");
  const resMap = new Map((results ?? []).map((r) => [r.match_id, r]));

  let scored = 0;
  for (const r of results ?? []) {
    await scoreMatch(r.match_id);
    scored += 1;
  }

  // Re-advance knockout brackets from recorded winners.
  const { data: kos } = await admin
    .from("matches")
    .select("id, fifa_match_number, team_a_id, team_b_id")
    .eq("is_knockout", true);
  for (const m of kos ?? []) {
    const r = resMap.get(m.id);
    if (r?.winner_team_id && m.fifa_match_number != null) {
      const loser = r.winner_team_id === m.team_a_id ? m.team_b_id : m.team_a_id;
      await advanceBracket(admin, m.fifa_match_number, r.winner_team_id, loser);
    }
  }

  // Reseed group winners/runners-up and rescore special picks.
  for (const g of GROUP_LABELS) await seedGroupCore(admin, g);
  await scoreSpecials();

  revalidatePath("/admin");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
  revalidatePath("/standings");
  return { ok: true, matches: scored };
}

/** Standings for every group (used for third-place allocation). */
async function loadAllGroupStandings(
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

/**
 * Admin: assign the best-8 third-placed teams to their R32 slots.
 * `assignment` maps each slot token (e.g. "3ABCDF") to a group letter; the
 * server re-derives standings and validates the choice before filling slots.
 */
export async function saveThirdPlace(
  assignment: Record<string, string>,
): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const admin = createAdminClient();

  const groupData = await loadAllGroupStandings(admin);
  if (groupData.length === 0 || !groupData.every((g) => g.complete)) {
    return { ok: false, error: "All groups must be complete first." };
  }

  const thirds = rankThirdPlaced(groupData);
  const best8 = thirds.slice(0, 8);
  if (thirds.length > 8) {
    const a = best8[7].row;
    const b = thirds[8].row;
    if (a.points === b.points && a.gd === b.gd && a.gf === b.gf) {
      return { ok: false, error: "Third-place cut is tied (8th vs 9th) — resolve manually." };
    }
  }
  const thirdTeamOfGroup = new Map(best8.map((t) => [t.group, t.row.teamId]));
  const best8Groups = new Set(best8.map((t) => t.group));

  const values = Object.values(assignment);
  if (Object.keys(assignment).length !== 8 || new Set(values).size !== 8) {
    return { ok: false, error: "Assign all 8 slots to distinct groups." };
  }
  for (const slot of THIRD_PLACE_SLOTS) {
    const g = assignment[slot.token];
    if (!g) return { ok: false, error: `Missing assignment for ${slot.token}.` };
    if (!best8Groups.has(g)) return { ok: false, error: `Group ${g} is not among the best 8 thirds.` };
    if (!slot.groups.includes(g)) return { ok: false, error: `Group ${g} can't fill slot ${slot.token}.` };
  }

  for (const slot of THIRD_PLACE_SLOTS) {
    await fillPlaceholder(admin, slot.token, thirdTeamOfGroup.get(assignment[slot.token]) ?? null);
  }

  revalidatePath("/admin");
  revalidatePath("/matches");
  revalidatePath("/standings");
  return { ok: true };
}

export interface ConfigInput {
  starts_at?: string | null;
  group_stage_ends_at?: string | null;
  actual_winner_team_id?: string | null;
  actual_golden_boot_name?: string | null;
}

/** Admin: update tournament config; rescore special picks when actuals change. */
export async function saveTournamentConfig(input: ConfigInput): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("tournament_config")
    .update({ ...input })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };

  await scoreSpecials();

  revalidatePath("/admin");
  revalidatePath("/special");
  revalidatePath("/leaderboard");
  return { ok: true };
}

/** (Re)score all winner / golden-boot picks against the recorded actuals. */
export async function scoreSpecials() {
  const admin = createAdminClient();

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

/** Admin: create or update a match (used by the admin schedule editor). */
export interface MatchInput {
  id?: string;
  stage: string;
  group_label?: string | null;
  team_a_id?: string | null;
  team_b_id?: string | null;
  kickoff_at: string;
  match_order?: number;
}

export async function saveMatch(input: MatchInput): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const admin = createAdminClient();
  const row = {
    stage: input.stage,
    group_label: input.group_label ?? null,
    team_a_id: input.team_a_id ?? null,
    team_b_id: input.team_b_id ?? null,
    kickoff_at: input.kickoff_at,
    match_order: input.match_order ?? 0,
  };

  const { error } = input.id
    ? await admin.from("matches").update(row).eq("id", input.id)
    : await admin.from("matches").insert(row);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/matches");
  return { ok: true };
}

/** Admin: manually set a match's two teams (fill group-position knockout slots). */
export async function assignMatchTeams(
  matchId: string,
  teamAId: string | null,
  teamBId: string | null,
): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("matches")
    .update({ team_a_id: teamAId || null, team_b_id: teamBId || null })
    .eq("id", matchId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin");
  revalidatePath("/matches");
  return { ok: true };
}

/** Admin: create or rename a team. */
export async function saveTeam(input: {
  id?: string;
  name: string;
  group_label?: string | null;
  code?: string | null;
}): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!input.name?.trim()) return { ok: false, error: "Team name is required." };

  const admin = createAdminClient();
  const row = {
    name: input.name.trim(),
    group_label: input.group_label ?? null,
    code: input.code ?? null,
  };
  const { error } = input.id
    ? await admin.from("teams").update(row).eq("id", input.id)
    : await admin.from("teams").insert(row);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/data");
  revalidatePath("/matches");
  return { ok: true };
}

/** Admin: create or rename a player (Golden Boot candidate). */
export async function savePlayer(input: {
  id?: string;
  name: string;
  team_id?: string | null;
}): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  if (!input.name?.trim()) return { ok: false, error: "Player name is required." };

  const admin = createAdminClient();
  const row = { name: input.name.trim(), team_id: input.team_id || null };
  const { error } = input.id
    ? await admin.from("players").update(row).eq("id", input.id)
    : await admin.from("players").insert(row);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/data");
  revalidatePath("/special");
  return { ok: true };
}

/** Admin: add an email to the guest list (allows that person to sign in). */
export async function addAllowedEmail(email: string): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const e = email.trim().toLowerCase();
  if (!e || !e.includes("@")) return { ok: false, error: "Enter a valid email address." };

  const admin = createAdminClient();
  const { error } = await admin.from("allowed_emails").upsert({ email: e }, { onConflict: "email" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/data");
  return { ok: true };
}

/** Admin: remove an email from the guest list (existing profiles are kept). */
export async function removeAllowedEmail(email: string): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("allowed_emails").delete().eq("email", email);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/data");
  return { ok: true };
}

/** Admin: remove a player. */
export async function deletePlayer(id: string): Promise<ActionResult> {
  try {
    await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("players").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/data");
  revalidatePath("/special");
  return { ok: true };
}
