"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Flag } from "@/components/Flag";
import { LocalTime } from "@/components/LocalTime";
import { STAGE_LABELS, hasKickedOff, predictionWindow } from "@/lib/format";
import type { Match, Prediction, Team } from "@/lib/types";

interface Props {
  matches: Match[];
  predictions: Pick<Prediction, "match_id" | "ft_a" | "ft_b" | "points" | "scored">[];
  teams: Pick<Team, "id" | "name">[];
  /** Active list filter, forwarded to each match link so it survives the round-trip. */
  query?: string;
}

interface DateGroup {
  date: string;
  items: Match[];
}

function groupByDate(matches: Match[], timeZone?: string): DateGroup[] {
  const out: DateGroup[] = [];
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  };
  for (const m of matches) {
    const d = new Date(m.kickoff_at).toLocaleDateString(undefined, {
      ...opts,
      ...(timeZone ? { timeZone } : {}),
    });
    const last = out[out.length - 1];
    if (last && last.date === d) last.items.push(m);
    else out.push({ date: d, items: [m] });
  }
  return out;
}

/** Groups matches by date and renders the list. Initial paint uses UTC so SSR
 *  hydrates cleanly; after mount we re-group by the browser's local timezone. */
export function MatchesList({ matches, predictions, teams, query }: Props) {
  const qs = query ? `?${query}` : "";
  // First paint (server + client first render): UTC. Avoids hydration mismatch.
  const [groups, setGroups] = useState<DateGroup[]>(() => groupByDate(matches, "UTC"));

  useEffect(() => {
    // After mount on the client, regroup using the browser's local timezone.
    setGroups(groupByDate(matches));
  }, [matches]);

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const predMap = new Map(predictions.map((p) => [p.match_id, p]));
  const sideName = (id: string | null, placeholder: string | null) =>
    (id ? teamMap.get(id)?.name : null) ?? placeholder ?? "TBD";

  if (groups.length === 0) {
    return (
      <div className="py-12 text-center text-zinc-500">No matches match this filter.</div>
    );
  }

  return (
    <>
      {groups.map((g) => (
        <div key={g.date} className="space-y-2">
          <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <LocalTime iso={g.items[0].kickoff_at} preset="date" />
          </h2>
          <ul className="space-y-2">
            {g.items.map((m) => {
              const win = predictionWindow(m.kickoff_at);
              const pred = predMap.get(m.id);
              return (
                <li key={m.id}>
                  <Link
                    href={`/matches/${m.id}${qs}`}
                    className="flex items-center gap-3 rounded-xl border border-black/[.08] p-3 transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.05]"
                  >
                    <div className="flex-1">
                      <div className="text-xs text-zinc-500">
                        <LocalTime iso={m.kickoff_at} preset="time" /> · {STAGE_LABELS[m.stage]}
                        {m.group_label ? ` · Group ${m.group_label}` : ""}
                        {m.city ? ` · ${m.city}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                        <span className="inline-flex items-center gap-1.5">
                          <Flag teamName={sideName(m.team_a_id, m.placeholder_a)} size={18} />
                          {sideName(m.team_a_id, m.placeholder_a)}
                        </span>
                        <span className="text-zinc-400">vs</span>
                        <span className="inline-flex items-center gap-1.5">
                          <Flag teamName={sideName(m.team_b_id, m.placeholder_b)} size={18} />
                          {sideName(m.team_b_id, m.placeholder_b)}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      {pred ? (
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
                          <span className="text-zinc-400">locked</span>
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
      ))}
    </>
  );
}
