import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PredictionForm } from "@/components/PredictionForm";
import { Flag } from "@/components/Flag";
import { LocalTime } from "@/components/LocalTime";
import { STAGE_LABELS, hasKickedOff, predictionWindow } from "@/lib/format";
import type { Match, MatchResult, Prediction, Profile, Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: match } = await supabase.from("matches").select("*").eq("id", id).single();
  if (!match) notFound();
  const m = match as Match;

  const [{ data: teams }, { data: myPred }, { data: result }] = await Promise.all([
    supabase.from("teams").select("*"),
    supabase.from("predictions").select("*").eq("match_id", id).eq("user_id", user!.id).maybeSingle(),
    supabase.from("match_results").select("*").eq("match_id", id).maybeSingle(),
  ]);

  const teamMap = new Map((teams ?? []).map((t: Team) => [t.id, t]));
  const teamA = {
    id: m.team_a_id ?? "",
    name: (m.team_a_id ? teamMap.get(m.team_a_id)?.name : null) ?? m.placeholder_a ?? "TBD",
  };
  const teamB = {
    id: m.team_b_id ?? "",
    name: (m.team_b_id ? teamMap.get(m.team_b_id)?.name : null) ?? m.placeholder_b ?? "TBD",
  };
  const locked = hasKickedOff(m.kickoff_at);
  const res = result as MatchResult | null;

  // After kickoff, RLS lets us read everyone's predictions for this match.
  let allPreds: (Prediction & { name: string })[] = [];
  if (locked) {
    const [{ data: preds }, { data: profiles }] = await Promise.all([
      supabase.from("predictions").select("*").eq("match_id", id),
      supabase.from("profiles").select("id, display_name"),
    ]);
    const nameMap = new Map((profiles ?? []).map((p: Pick<Profile, "id" | "display_name">) => [p.id, p.display_name]));
    allPreds = (preds ?? []).map((p: Prediction) => ({ ...p, name: nameMap.get(p.user_id) ?? "?" }));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/matches" className="text-sm text-zinc-500 hover:text-foreground">
          ← Matches
        </Link>
        <div className="mt-1 text-xs text-zinc-500">
          {STAGE_LABELS[m.stage]}
          {m.group_label ? ` · Group ${m.group_label}` : ""} ·{" "}
          <LocalTime iso={m.kickoff_at} preset="datetime" />
          {m.stadium ? ` · ${m.stadium}` : ""}
          {m.city ? `, ${m.city}` : ""}
        </div>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">
          <span className="inline-flex items-center gap-2">
            <Flag teamName={teamA.name} size={28} />
            {teamA.name}
          </span>
          <span className="text-zinc-400">vs</span>
          <span className="inline-flex items-center gap-2">
            <Flag teamName={teamB.name} size={28} />
            {teamB.name}
          </span>
        </h1>
      </div>

      {res && (
        <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/5 p-4">
          <div className="text-xs uppercase tracking-wide text-emerald-700">Result</div>
          <div className="font-mono text-lg">
            {res.ft_a}–{res.ft_b}
            {res.et_a != null && ` (ET ${res.et_a}–${res.et_b})`}
            {res.pen_a != null && ` (pens ${res.pen_a}–${res.pen_b})`}
          </div>
        </div>
      )}

      <section className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
        {(() => {
          const win = predictionWindow(m.kickoff_at);
          if (win.state === "locked") {
            return (
              <p className="text-sm text-zinc-500">
                This match is locked — predictions closed at kickoff.
              </p>
            );
          }
          if (win.state === "pending") {
            return (
              <p className="text-sm text-zinc-500">
                Predictions open <LocalTime iso={win.opensAt.toISOString()} preset="datetime" /> (48 hours before kickoff).
              </p>
            );
          }
          return (
            <PredictionForm
            matchId={m.id}
            isKnockout={m.is_knockout}
            teamsKnown={Boolean(m.team_a_id && m.team_b_id)}
            teamA={teamA}
            teamB={teamB}
            initial={
              myPred
                ? {
                    ft_a: myPred.ft_a,
                    ft_b: myPred.ft_b,
                    et_a: myPred.et_a,
                    et_b: myPred.et_b,
                    pen_a: myPred.pen_a,
                    pen_b: myPred.pen_b,
                    pen_winner_team_id: myPred.pen_winner_team_id,
                  }
                : undefined
            }
          />
          );
        })()}
      </section>

      {locked && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-500">Everyone&apos;s picks</h2>
          <ul className="divide-y divide-black/[.06] rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
            {allPreds.length === 0 && (
              <li className="p-3 text-sm text-zinc-400">No predictions were made.</li>
            )}
            {allPreds.map((p) => (
              <li key={p.id} className="flex items-center justify-between p-3 text-sm">
                <span>{p.name}</span>
                <span className="font-mono">
                  {p.ft_a}–{p.ft_b}
                  {p.scored && <span className="ml-2 text-emerald-600">+{p.points}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
