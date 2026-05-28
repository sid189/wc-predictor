import { createClient } from "@/lib/supabase/server";
import {
  computeGroupStandings,
  isGroupComplete,
  rankThirdPlaced,
  type GroupMatch,
  type StandingRow,
} from "@/lib/standings";
import type { Match, MatchResult, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

const GROUPS = "ABCDEFGHIJKL".split("");

export default async function StandingsPage() {
  const supabase = await createClient();
  const [{ data: teams }, { data: matches }, { data: results }] = await Promise.all([
    supabase.from("teams").select("id, name, group_label"),
    supabase.from("matches").select("id, group_label, team_a_id, team_b_id").eq("stage", "group"),
    supabase.from("match_results").select("match_id, ft_a, ft_b"),
  ]);

  const teamName = new Map((teams ?? []).map((t: Pick<Team, "id" | "name">) => [t.id, t.name]));
  const resMap = new Map(
    (results ?? []).map((r: Pick<MatchResult, "match_id" | "ft_a" | "ft_b">) => [r.match_id, r]),
  );

  const groupData = GROUPS.map((g) => {
    const teamIds = (teams ?? [])
      .filter((t: Pick<Team, "group_label">) => t.group_label === g)
      .map((t: Pick<Team, "id">) => t.id);
    const gms: GroupMatch[] = (matches ?? [])
      .filter((m: Pick<Match, "group_label">) => m.group_label === g)
      .map((m: Pick<Match, "id" | "team_a_id" | "team_b_id">) => {
        const r = resMap.get(m.id);
        return {
          team_a_id: m.team_a_id,
          team_b_id: m.team_b_id,
          ft_a: r?.ft_a ?? null,
          ft_b: r?.ft_b ?? null,
        };
      });
    return {
      group: g,
      standings: computeGroupStandings(teamIds, gms),
      complete: isGroupComplete(gms),
    };
  }).filter((g) => g.standings.length > 0);

  const thirds = rankThirdPlaced(groupData);

  if (groupData.length === 0) {
    return <div className="py-12 text-center text-zinc-500">No groups to show yet.</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Group Standings</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        {groupData.map(({ group, standings, complete }) => (
          <div
            key={group}
            className="rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Group {group}</h2>
              {!complete && <span className="text-xs text-zinc-400">in progress</span>}
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-400">
                <tr>
                  <th className="py-1">Team</th>
                  <th className="text-right">P</th>
                  <th className="text-right">GD</th>
                  <th className="text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((r: StandingRow) => (
                  <tr
                    key={r.teamId}
                    className={r.rank <= 2 ? "font-medium" : "text-zinc-500"}
                  >
                    <td className="py-1">
                      <span className="mr-1 text-zinc-400">{r.rank}</span>
                      {teamName.get(r.teamId) ?? "—"}
                      {r.unresolved && <span className="ml-1 text-amber-600" title="tie-break needed">⚑</span>}
                    </td>
                    <td className="text-right font-mono">{r.played}</td>
                    <td className="text-right font-mono">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                    <td className="text-right font-mono">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Third-placed teams</h2>
        <p className="mb-2 text-xs text-zinc-400">
          The best 8 (highlighted) advance to the Round of 32.
        </p>
        <ol className="space-y-1 text-sm">
          {thirds.map((t, i) => (
            <li
              key={t.group}
              className={`flex justify-between rounded-lg border px-3 py-1 ${
                i < 8
                  ? "border-emerald-600/30 bg-emerald-600/5"
                  : "border-black/[.06] text-zinc-500 dark:border-white/[.08]"
              }`}
            >
              <span>
                <span className="mr-2 text-zinc-400">{i + 1}</span>
                {teamName.get(t.row.teamId) ?? "—"}{" "}
                <span className="text-zinc-400">(Group {t.group})</span>
              </span>
              <span className="font-mono">
                {t.row.points} pts · {t.row.gd > 0 ? `+${t.row.gd}` : t.row.gd}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <p className="text-xs text-zinc-400">
        ⚑ marks positions tied on all objective tie-breakers — an admin assigns those manually.
      </p>
    </div>
  );
}
