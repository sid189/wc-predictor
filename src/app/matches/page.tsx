import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, formatDate, hasKickedOff, predictionWindow } from "@/lib/format";
import { Flag } from "@/components/Flag";
import { LocalTime } from "@/components/LocalTime";
import type { Match, Prediction, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

type Filters = { stage?: string; status?: string };

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const { stage, status } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: allMatches }, { data: teams }, { data: myPreds }] = await Promise.all([
    // Exclude friendlies and UCL — they get their own pages.
    supabase.from("matches").select("*").not("stage", "in", "(friendly,ucl)").order("kickoff_at"),
    supabase.from("teams").select("*"),
    supabase.from("predictions").select("*").eq("user_id", user!.id),
  ]);

  const teamMap = new Map((teams ?? []).map((t: Team) => [t.id, t]));
  const predMap = new Map((myPreds ?? []).map((p: Prediction) => [p.match_id, p]));
  const sideName = (id: string | null, placeholder: string | null) =>
    (id ? teamMap.get(id)?.name : null) ?? placeholder ?? "TBD";

  // Apply filters.
  let matches = (allMatches ?? []) as Match[];
  if (stage === "group") matches = matches.filter((m) => !m.is_knockout);
  else if (stage === "knockout") matches = matches.filter((m) => m.is_knockout);
  // "Open" filter now means the 48h prediction window is actually open right now.
  if (status === "open")
    matches = matches.filter((m) => predictionWindow(m.kickoff_at).state === "open");
  else if (status === "todo")
    matches = matches.filter((m) => !hasKickedOff(m.kickoff_at) && !predMap.has(m.id));

  // Build filter-chip hrefs that preserve the other active filter.
  const href = (next: Filters) => {
    const sp = new URLSearchParams();
    const s = next.stage ?? stage;
    const st = "status" in next ? next.status : status;
    if (s) sp.set("stage", s);
    if (st) sp.set("status", st);
    const qs = sp.toString();
    return qs ? `/matches?${qs}` : "/matches";
  };

  const chip = (label: string, active: boolean, to: string) => (
    <Link
      key={label}
      href={to}
      className={`rounded-full border px-3 py-1 text-sm ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-black/[.12] hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
      }`}
    >
      {label}
    </Link>
  );

  // Group the filtered matches by calendar date.
  const groups: { date: string; items: Match[] }[] = [];
  for (const m of matches) {
    const d = formatDate(m.kickoff_at);
    const last = groups[groups.length - 1];
    if (last && last.date === d) last.items.push(m);
    else groups.push({ date: d, items: [m] });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Matches</h1>

      <div className="flex flex-wrap gap-2">
        {chip("All", !stage, href({ stage: undefined }))}
        {chip("Group", stage === "group", href({ stage: "group" }))}
        {chip("Knockout", stage === "knockout", href({ stage: "knockout" }))}
        <span className="w-px self-stretch bg-black/[.1] dark:bg-white/[.15]" />
        {chip("Any time", !status, href({ status: undefined }))}
        {chip("Open", status === "open", href({ status: "open" }))}
        {chip("To predict", status === "todo", href({ status: "todo" }))}
      </div>

      {groups.length === 0 ? (
        <div className="py-12 text-center text-zinc-500">No matches match this filter.</div>
      ) : (
        groups.map((g) => (
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
                      href={`/matches/${m.id}`}
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
        ))
      )}
    </div>
  );
}
