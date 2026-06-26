"use client";

import { useState, useMemo, useTransition } from "react";
import { saveBracket } from "@/app/actions/bracket";

export interface BracketMatch {
  id: string;
  stage: string;
  kickoff_at: string;
  match_number: number | null;
  team_a_id: string | null;
  team_b_id: string | null;
  placeholder_a: string | null;
  placeholder_b: string | null;
}

export interface BracketLeaderboardRow {
  userId: string;
  name: string;
  rank: number;
  correct: number;
  pts: number;
  hasSubmitted: boolean;
}

interface Props {
  koMatches: BracketMatch[];
  myPicks: Record<string, string>;       // matchId → teamId (from DB)
  locked: boolean;
  teamNames: Record<string, string>;     // teamId → name
  actualWinners: Record<string, string>; // matchId → winner teamId
  leaderboard: BracketLeaderboardRow[];
  currentUserId: string;
}

const STAGE_ORDER = [
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
] as const;

const STAGE_LABEL: Record<string, string> = {
  round_of_32: "R32",
  round_of_16: "R16",
  quarter_final: "QF",
  semi_final: "SF",
  third_place: "3rd Place",
  final: "Final",
};

const STAGE_POINTS: Record<string, number> = {
  round_of_32: 1,
  round_of_16: 2,
  quarter_final: 4,
  semi_final: 8,
  third_place: 8,
  final: 16,
};

export function BracketPicker({
  koMatches,
  myPicks,
  locked,
  teamNames,
  actualWinners,
  leaderboard,
  currentUserId,
}: Props) {
  const [picks, setPicks] = useState<Record<string, string>>(myPicks);
  const [activeStage, setActiveStage] = useState<string>("round_of_32");
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState("");

  // Build a lookup from match number → match, for cascade resolution.
  const byNum = useMemo(
    () =>
      new Map(
        koMatches
          .filter((m) => m.match_number != null)
          .map((m) => [m.match_number!, m]),
      ),
    [koMatches],
  );

  // Compute effective teams for every match in topological (stage) order.
  // An effective team is the team_id the user's picks cascade to for that slot.
  // Also computes validPicks: only picks where the picked team is actually in
  // the effective participants (filters out stale downstream picks).
  const { effective, validPicks } = useMemo(() => {
    const eff = new Map<
      string,
      { aId: string | null; aName: string; bId: string | null; bName: string }
    >();

    const resolveSlot = (
      teamId: string | null,
      placeholder: string | null,
    ): { id: string | null; name: string } => {
      if (teamId) return { id: teamId, name: teamNames[teamId] ?? "?" };
      if (!placeholder) return { id: null, name: "TBD" };

      // Winner of a previous KO match (e.g. "W81")
      const wm = placeholder.match(/^W(\d+)$/);
      if (wm) {
        const parent = byNum.get(parseInt(wm[1]));
        if (!parent) return { id: null, name: placeholder };
        const parentEff = eff.get(parent.id);
        if (!parentEff) return { id: null, name: "?" };
        const pickedId = picks[parent.id];
        if (!pickedId || (pickedId !== parentEff.aId && pickedId !== parentEff.bId)) {
          return { id: null, name: "?" };
        }
        return { id: pickedId, name: teamNames[pickedId] ?? "?" };
      }

      // Runner-up (loser) of a SF match → 3rd place match (e.g. "RU101")
      const rum = placeholder.match(/^RU(\d+)$/);
      if (rum) {
        const parent = byNum.get(parseInt(rum[1]));
        if (!parent) return { id: null, name: placeholder };
        const parentEff = eff.get(parent.id);
        if (!parentEff) return { id: null, name: "?" };
        const pickedWinnerId = picks[parent.id];
        if (!pickedWinnerId || (pickedWinnerId !== parentEff.aId && pickedWinnerId !== parentEff.bId)) {
          return { id: null, name: "?" };
        }
        const loserId = pickedWinnerId === parentEff.aId ? parentEff.bId : parentEff.aId;
        return {
          id: loserId,
          name: loserId ? (teamNames[loserId] ?? "?") : "?",
        };
      }

      // Group qualifier placeholder e.g. "1A", "2B", "3BEFIJ" — team not yet known
      return { id: null, name: placeholder };
    };

    for (const stage of STAGE_ORDER) {
      for (const m of koMatches.filter((m) => m.stage === stage)) {
        const a = resolveSlot(m.team_a_id, m.placeholder_a);
        const b = resolveSlot(m.team_b_id, m.placeholder_b);
        eff.set(m.id, { aId: a.id, aName: a.name, bId: b.id, bName: b.name });
      }
    }

    // Only keep picks that are still reachable (cascade-consistent).
    const vp: Record<string, string> = {};
    for (const [matchId, e] of eff) {
      const p = picks[matchId];
      if (p && (p === e.aId || p === e.bId)) vp[matchId] = p;
    }

    return { effective: eff, validPicks: vp };
  }, [picks, koMatches, teamNames, byNum]);

  const totalMatches = koMatches.length;
  const pickedCount = Object.keys(validPicks).length;
  const allPicked = pickedCount === totalMatches;

  function pickTeam(matchId: string, teamId: string) {
    if (locked) return;
    setPicks((prev) => ({ ...prev, [matchId]: teamId }));
  }

  function submit() {
    setMsg("");
    startSave(async () => {
      const res = await saveBracket(validPicks);
      setMsg(res.ok ? "Bracket saved!" : res.error);
    });
  }

  const stagesWithCounts = STAGE_ORDER.map((stage) => {
    const all = koMatches.filter((m) => m.stage === stage);
    const done = all.filter((m) => validPicks[m.id]).length;
    return { stage, total: all.length, done };
  }).filter((s) => s.total > 0);

  const roundMatches = koMatches
    .filter((m) => m.stage === activeStage)
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));

  return (
    <div className="space-y-6">

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {locked ? (
          <p className="text-sm font-medium text-amber-600">
            Bracket is locked — R32 has kicked off.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            {pickedCount}/{totalMatches} picks made
            {allPicked && " · ready to submit!"}
          </p>
        )}
        {!locked && (
          <button
            onClick={submit}
            disabled={!allPicked || saving}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background disabled:opacity-40"
          >
            {saving ? "Saving…" : "Submit bracket"}
          </button>
        )}
      </div>
      {msg && (
        <p className={`-mt-4 text-xs ${msg.includes("saved") ? "text-emerald-600" : "text-red-600"}`}>
          {msg}
        </p>
      )}

      {/* Round tabs */}
      <div className="flex flex-wrap gap-1.5">
        {stagesWithCounts.map(({ stage, total, done }) => (
          <button
            key={stage}
            onClick={() => setActiveStage(stage)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activeStage === stage
                ? "bg-foreground text-background"
                : "border border-black/[.12] dark:border-white/[.2] hover:bg-black/[.04] dark:hover:bg-white/[.06]"
            }`}
          >
            {STAGE_LABEL[stage]}
            <span className={`ml-1.5 tabular-nums ${done === total ? "text-emerald-500" : "opacity-60"}`}>
              {done}/{total}
            </span>
          </button>
        ))}
      </div>

      {/* Match cards for active round */}
      <div className="grid gap-2 sm:grid-cols-2">
        {roundMatches.map((m) => {
          const eff = effective.get(m.id) ?? { aId: null, aName: "TBD", bId: null, bName: "TBD" };
          const validPick = validPicks[m.id];
          const actual = actualWinners[m.id];
          const pts = STAGE_POINTS[m.stage] ?? 0;

          const sides = [
            { id: eff.aId, name: eff.aName || m.placeholder_a || "TBD" },
            { id: eff.bId, name: eff.bName || m.placeholder_b || "TBD" },
          ] as const;

          return (
            <div
              key={m.id}
              className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.145]"
            >
              {sides.map((team, idx) => {
                const isA = idx === 0;
                const isPicked = validPick && validPick === team.id;
                const isActualWinner = actual && actual === team.id;
                const isCorrect = isPicked && isActualWinner;
                const isWrong = isPicked && actual && !isActualWinner;
                const canPick = !locked && !!team.id;

                return (
                  <button
                    key={idx}
                    onClick={() => canPick && pickTeam(m.id, team.id!)}
                    disabled={!canPick}
                    className={[
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      !isA ? "border-t border-black/[.06] dark:border-white/[.08]" : "",
                      isCorrect
                        ? "bg-emerald-50 dark:bg-emerald-950/30"
                        : isWrong
                          ? "bg-red-50 dark:bg-red-950/20"
                          : isPicked
                            ? "bg-blue-50 dark:bg-blue-950/30"
                            : isActualWinner
                              ? "bg-emerald-50/40 dark:bg-emerald-950/15"
                              : "",
                      canPick
                        ? "cursor-pointer hover:bg-black/[.03] dark:hover:bg-white/[.04]"
                        : "cursor-default",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span
                      className={[
                        "flex-1 truncate",
                        isPicked ? "font-medium" : "",
                        isWrong ? "text-zinc-400 line-through" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {team.name}
                    </span>
                    {isCorrect && (
                      <span className="shrink-0 text-xs font-semibold text-emerald-600">
                        +{pts}
                      </span>
                    )}
                    {isActualWinner && !isPicked && (
                      <span className="shrink-0 text-xs text-emerald-600">✓</span>
                    )}
                    {isPicked && !actual && (
                      <span className="shrink-0 text-xs text-blue-500">●</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Bracket standings — only visible once knockouts start */}
      {locked ? (
        <section className="space-y-3 pt-4">
          <h2 className="text-sm font-semibold text-zinc-500">Bracket Standings</h2>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-zinc-400">No brackets submitted.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/[.08] text-left text-xs text-zinc-500 dark:border-white/[.145]">
                  <th className="py-2">#</th>
                  <th>Player</th>
                  <th className="text-right">Correct</th>
                  <th className="text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr
                    key={row.userId}
                    className={`border-b border-black/[.05] dark:border-white/[.06] ${
                      row.userId === currentUserId
                        ? "bg-foreground/[.04] font-medium"
                        : ""
                    }`}
                  >
                    <td className="py-2 text-zinc-400">{row.rank}</td>
                    <td>
                      {row.name}
                      {row.userId === currentUserId && (
                        <span className="ml-2 text-xs text-zinc-400">you</span>
                      )}
                    </td>
                    <td className="text-right font-mono">{row.correct}</td>
                    <td className="text-right font-mono font-semibold">{row.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-zinc-400">
            Points: R32 = 1 · R16 = 2 · QF = 4 · SF = 8 · 3rd Place = 8 · Final = 16
          </p>
        </section>
      ) : (
        <p className="pt-4 text-sm text-zinc-400">
          Bracket standings and everyone&apos;s picks are revealed once R32 kicks off.
        </p>
      )}
    </div>
  );
}
