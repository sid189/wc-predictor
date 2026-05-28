"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rankThirdPlaced } from "@/lib/standings";
import { THIRD_PLACE_SLOTS } from "@/lib/thirdplace";
import {
  GROUP_LABELS,
  advanceBracket,
  applyMatchResult,
  fillPlaceholder,
  loadAllGroupStandings,
  scoreMatch,
  scoreSpecials,
  seedGroupCore,
} from "@/server/match-engine";
import type { ActionResult } from "./predictions";

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

/** Admin: record a result, rescore predictions, advance bracket/seed groups. */
export async function enterResult(input: ResultInput): Promise<ActionResult> {
  let adminId: string;
  try {
    adminId = await getAdminId();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const admin = createAdminClient();
  const res = await applyMatchResult(admin, { ...input, entered_by: adminId });
  if (!res.ok) return res;

  revalidatePath("/admin");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
  revalidatePath("/standings");
  return { ok: true };
}

/** Admin: recompute every group's standings and (re)seed the R32 group slots. */
export async function reseedAllGroups(): Promise<
  ActionResult & { seeded: number; pending: string[] }
> {
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
  const resMap = new Map(
    (results ?? []).map((r: { match_id: string; winner_team_id: string | null }) => [r.match_id, r]),
  );

  let scored = 0;
  for (const r of results ?? []) {
    await scoreMatch(admin, r.match_id);
    scored += 1;
  }

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

  for (const g of GROUP_LABELS) await seedGroupCore(admin, g);
  await scoreSpecials(admin);

  revalidatePath("/admin");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
  revalidatePath("/standings");
  return { ok: true, matches: scored };
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
  const { error } = await admin.from("tournament_config").update({ ...input }).eq("id", 1);
  if (error) return { ok: false, error: error.message };

  await scoreSpecials(admin);

  revalidatePath("/admin");
  revalidatePath("/special");
  revalidatePath("/leaderboard");
  return { ok: true };
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
  const { error } = await admin
    .from("allowed_emails")
    .upsert({ email: e }, { onConflict: "email" });
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
