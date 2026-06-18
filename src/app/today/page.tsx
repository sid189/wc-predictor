import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Flag } from "@/components/Flag";
import { LocalTime } from "@/components/LocalTime";
import { STAGE_LABELS, predictionWindow } from "@/lib/format";
import type { Match, Prediction, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

// "Today" is anchored to Pacific time (PT) — the user's home timezone — so the
// slate is deterministic regardless of where Vercel runs this or who's viewing.
// en-CA gives YYYY-MM-DD which sorts and compares cleanly.
const PT_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const PT_LABEL_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  weekday: "long",
  month: "long",
  day: "numeric",
});

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: allMatches }, { data: teams }, { data: myPreds }] = await Promise.all([
    supabase.from("matches").select("*").neq("stage", "friendly").order("kickoff_at"),
    supabase.from("teams").select("id, name"),
    supabase.from("predictions").select("*").eq("user_id", user!.id),
  ]);

  const now = new Date();
  const todayPT = PT_DAY_FMT.format(now);
  const matches = ((allMatches ?? []) as Match[]).filter(
    (m) => PT_DAY_FMT.format(new Date(m.kickoff_at)) === todayPT,
  );
  const predMap = new Map(
    ((myPreds ?? []) as Prediction[]).map((p) => [p.match_id, p]),
  );
  const teamMap = new Map(
    ((teams ?? []) as Pick<Team, "id" | "name">[]).map((t) => [t.id, t]),
  );
  const sideName = (id: string | null, placeholder: string | null) =>
    (id ? teamMap.get(id)?.name : null) ?? placeholder ?? "TBD";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Today&apos;s Games</h1>
        <span className="text-xs text-zinc-400">
          {PT_LABEL_FMT.format(now)} (PT)
        </span>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border border-black/[.08] p-8 text-center text-sm text-zinc-500 dark:border-white/[.145]">
          <p>No matches scheduled for today.</p>
          <p className="mt-2">
            <Link href="/matches" className="text-zinc-700 underline dark:text-zinc-300">
              See the full schedule →
            </Link>
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => {
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
      )}
    </div>
  );
}
