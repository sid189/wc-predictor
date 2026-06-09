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

  const [{ data: matches }, { data: teams }, { data: results }, { data: config }] =
    await Promise.all([
      supabase.from("matches").select("*").order("kickoff_at"),
      supabase.from("teams").select("id, name, group_label").order("name"),
      supabase.from("match_results").select("*"),
      supabase.from("tournament_config").select("*").eq("id", 1).single(),
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
        <ThirdPlaceAssigner ready={allGroupsComplete} best8={best8} initial={suggestion} />
      </section>
    </div>
  );
}
