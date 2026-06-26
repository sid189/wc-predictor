import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "@/components/AdminClient";
import { ThirdPlaceAssigner } from "@/components/ThirdPlaceAssigner";
import {
  computeGroupStandings,
  isGroupComplete,
  rankThirdPlaced,
  type GroupMatch,
} from "@/lib/standings";
import { assignThirdPlaceSlots } from "@/lib/thirdplace";
import type { Match, MatchResult, Team, TournamentConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

const GROUPS = "ABCDEFGHIJKL".split("");

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user!.id)
    .single();
  if (!profile?.is_admin) redirect("/matches");

  const [{ data: matches }, { data: teams }, { data: results }, { data: config }, { data: thirdMatches }] =
    await Promise.all([
      supabase.from("matches").select("*").order("kickoff_at"),
      supabase.from("teams").select("id, name, group_label").order("name"),
      supabase.from("match_results").select("*"),
      supabase.from("tournament_config").select("*").eq("id", 1).single(),
      supabase
        .from("matches")
        .select("placeholder_a, placeholder_b, team_a_id, team_b_id")
        .or("placeholder_a.like.3%,placeholder_b.like.3%"),
    ]);

  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  const resMap = new Map((results ?? []).map((r: MatchResult) => [r.match_id, r]));

  // Group standings → best-8 third-placed teams + a suggested slot assignment.
  const groupData = GROUPS.map((g) => {
    const teamIds = (teams ?? []).filter((t) => t.group_label === g).map((t) => t.id);
    const gms: GroupMatch[] = (matches ?? [])
      .filter((m: Match) => m.stage === "group" && m.group_label === g)
      .map((m: Match) => {
        const r = resMap.get(m.id);
        return {
          team_a_id: m.team_a_id,
          team_b_id: m.team_b_id,
          ft_a: r?.ft_a ?? null,
          ft_b: r?.ft_b ?? null,
        };
      });
    return { group: g, standings: computeGroupStandings(teamIds, gms), complete: isGroupComplete(gms) };
  }).filter((g) => g.standings.length > 0);

  const allGroupsComplete = groupData.length === 12 && groupData.every((g) => g.complete);
  const best8 = rankThirdPlaced(groupData)
    .slice(0, 8)
    .map((t) => ({ group: t.group, teamName: teamName.get(t.row.teamId) ?? t.group }));
  const suggestion = allGroupsComplete
    ? assignThirdPlaceSlots(best8.map((b) => b.group)).assignment
    : {};

  type TM = {
    placeholder_a: string | null; placeholder_b: string | null;
    team_a_id: string | null; team_b_id: string | null;
  };
  const thirdPlaceAutoAssigned = ((thirdMatches ?? []) as TM[]).some(
    (m) =>
      (m.placeholder_a?.startsWith("3") && m.team_a_id != null) ||
      (m.placeholder_b?.startsWith("3") && m.team_b_id != null),
  );

  // Build a fixture table for each of the 8 third-place R32 slots.
  const thirdFixtures = ((matches ?? []) as Match[])
    .filter(
      (m) =>
        m.stage === "round_of_32" &&
        (m.placeholder_a?.startsWith("3") || m.placeholder_b?.startsWith("3")),
    )
    .map((m) => {
      const thirdIsA = !!m.placeholder_a?.startsWith("3");
      const token        = thirdIsA ? m.placeholder_a! : m.placeholder_b!;
      const assignedId   = thirdIsA ? m.team_a_id : m.team_b_id;
      const opponentId   = thirdIsA ? m.team_b_id : m.team_a_id;
      const opponentSlot = thirdIsA ? (m.placeholder_b ?? "?") : (m.placeholder_a ?? "?");
      return {
        token,
        kickoff_at: m.kickoff_at,
        city: m.city,
        opponent: opponentId ? (teamName.get(opponentId) ?? opponentSlot) : opponentSlot,
        assignedTeam: assignedId ? (teamName.get(assignedId) ?? null) : null,
      };
    })
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));

  return (
    <div className="space-y-8">
      <AdminClient
        matches={(matches ?? []) as Match[]}
        teams={(teams ?? []) as Pick<Team, "id" | "name" | "group_label">[]}
        results={(results ?? []) as MatchResult[]}
        config={config as TournamentConfig}
      />
      <section>
        <h2 className="mb-2 font-semibold">Third-place slots (Round of 32)</h2>
        <ThirdPlaceAssigner
          ready={allGroupsComplete}
          best8={best8}
          initial={suggestion}
          autoAssigned={thirdPlaceAutoAssigned}
          fixtures={thirdFixtures}
        />
      </section>
    </div>
  );
}
