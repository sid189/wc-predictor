import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasKickedOff, predictionWindow } from "@/lib/format";
import { Flag } from "@/components/Flag";
import { LocalTime } from "@/components/LocalTime";
import type { Match, MatchResult, Prediction, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function UclPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: matches }, { data: teams }, { data: myPreds }, { data: results }] =
    await Promise.all([
      supabase.from("matches").select("*").eq("stage", "ucl").order("kickoff_at"),
      supabase.from("teams").select("id, name"),
      supabase.from("predictions").select("*").eq("user_id", user!.id),
      supabase.from("match_results").select("*"),
    ]);

  const teamMap = new Map(
    (teams ?? []).map((t: Pick<Team, "id" | "name">) => [t.id, t]),
  );
  const predMap = new Map((myPreds ?? []).map((p: Prediction) => [p.match_id, p]));
  const resMap = new Map((results ?? []).map((r: MatchResult) => [r.match_id, r]));
  const name = (id: string | null) => (id ? (teamMap.get(id)?.name ?? "TBD") : "TBD");

  if (!matches || matches.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">UCL</h1>
        <p className="text-sm text-zinc-500">No UCL matches scheduled yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold">UCL</h1>
        <p className="mt-1 text-xs text-zinc-500">
          UEFA Champions League matches. FT, ET and penalty predictions accepted.
        </p>
      </div>
      <ul className="space-y-2">
        {(matches as Match[]).map((m) => {
          const win = predictionWindow(m.kickoff_at);
          const pred = predMap.get(m.id);
          const res = resMap.get(m.id);
          return (
            <li key={m.id}>
              <Link
                href={`/matches/${m.id}`}
                className="flex items-center gap-3 rounded-xl border border-black/[.08] p-3 transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.05]"
              >
                <div className="flex-1">
                  <div className="text-xs text-zinc-500">
                    UCL · <LocalTime iso={m.kickoff_at} preset="datetime" />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Flag teamName={name(m.team_a_id)} size={20} />
                      {name(m.team_a_id)}
                    </span>
                    <span className="text-zinc-400">vs</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Flag teamName={name(m.team_b_id)} size={20} />
                      {name(m.team_b_id)}
                    </span>
                  </div>
                </div>
                <div className="text-right text-sm">
                  {res ? (
                    <span className="font-mono text-emerald-700">
                      {res.ft_a}–{res.ft_b}
                    </span>
                  ) : pred ? (
                    <span className="font-mono">
                      {pred.ft_a}–{pred.ft_b}
                      {pred.scored && (
                        <span className="ml-2 text-emerald-600">+{pred.points}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-zinc-400">no pick</span>
                  )}
                  <div className="text-xs">
                    {win.state === "locked" ? (
                      <span className="text-zinc-400">
                        {hasKickedOff(m.kickoff_at) ? "locked" : ""}
                      </span>
                    ) : win.state === "open" ? (
                      <span className="text-emerald-600">open</span>
                    ) : (
                      <span className="text-zinc-400">
                        opens <LocalTime iso={win.opensAt.toISOString()} preset="date" />
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
