import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasKickedOff, predictionWindow } from "@/lib/format";
import { TournamentBanner } from "@/components/TournamentBanner";
import { MatchesList } from "@/components/MatchesList";
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
    // Exclude friendlies — they get their own page at /friendlies.
    supabase.from("matches").select("*").neq("stage", "friendly").order("kickoff_at"),
    supabase.from("teams").select("id, name"),
    supabase.from("predictions").select("*").eq("user_id", user!.id),
  ]);

  const predMap = new Map(((myPreds ?? []) as Prediction[]).map((p) => [p.match_id, p]));

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
  // Use `"x" in next` so explicit `undefined` clears the filter — `??` falls
  // back to the current value and ends up rebuilding the same URL.
  const href = (next: Filters) => {
    const sp = new URLSearchParams();
    const s = "stage" in next ? next.stage : stage;
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

  return (
    <div className="space-y-4">
      <TournamentBanner />
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

      <MatchesList
        matches={matches}
        teams={(teams ?? []) as Pick<Team, "id" | "name">[]}
        predictions={(myPreds ?? []) as Pick<Prediction, "match_id" | "ft_a" | "ft_b" | "points" | "scored">[]}
      />
    </div>
  );
}
