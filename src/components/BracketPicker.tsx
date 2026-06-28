"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { saveBracket } from "@/app/actions/bracket";
import { BracketTree } from "@/components/BracketTree";

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
  myPicks: Record<string, string>;
  locked: boolean;
  teamNames: Record<string, string>;
  actualWinners: Record<string, string>;
  leaderboard: BracketLeaderboardRow[];
  currentUserId: string;
  viewingName?: string;
}

const STAGE_ORDER = [
  "round_of_32", "round_of_16", "quarter_final",
  "semi_final", "third_place", "final",
] as const;

export function BracketPicker({
  koMatches, myPicks, locked, teamNames, actualWinners, leaderboard, currentUserId, viewingName,
}: Props) {
  const [picks, setPicks] = useState<Record<string, string>>(myPicks);
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState("");

  // Lookup from FIFA match number → match (for cascade resolution).
  const byNum = useMemo(
    () =>
      new Map(
        koMatches
          .filter((m) => m.match_number != null)
          .map((m) => [m.match_number!, m]),
      ),
    [koMatches],
  );

  // Resolve the effective team on each side of every match, following the W{n}
  // and RU{n} placeholder chain. Also computes validPicks — picks where the
  // chosen team is still reachable given all earlier-round picks.
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

      const wm = placeholder.match(/^W(\d+)$/);
      if (wm) {
        const parent = byNum.get(parseInt(wm[1]));
        if (!parent) return { id: null, name: placeholder };
        const parentEff = eff.get(parent.id);
        if (!parentEff) return { id: null, name: "?" };
        const pickedId = picks[parent.id];
        if (!pickedId || (pickedId !== parentEff.aId && pickedId !== parentEff.bId))
          return { id: null, name: "?" };
        return { id: pickedId, name: teamNames[pickedId] ?? "?" };
      }

      const rum = placeholder.match(/^RU(\d+)$/);
      if (rum) {
        const parent = byNum.get(parseInt(rum[1]));
        if (!parent) return { id: null, name: placeholder };
        const parentEff = eff.get(parent.id);
        if (!parentEff) return { id: null, name: "?" };
        const pickedWinner = picks[parent.id];
        if (!pickedWinner || (pickedWinner !== parentEff.aId && pickedWinner !== parentEff.bId))
          return { id: null, name: "?" };
        const loserId =
          pickedWinner === parentEff.aId ? parentEff.bId : parentEff.aId;
        return { id: loserId, name: loserId ? (teamNames[loserId] ?? "?") : "?" };
      }

      // Group qualifier placeholder e.g. "1A", "3BEFIJ"
      return { id: null, name: placeholder };
    };

    for (const stage of STAGE_ORDER) {
      for (const m of koMatches.filter((m) => m.stage === stage)) {
        const a = resolveSlot(m.team_a_id, m.placeholder_a);
        const b = resolveSlot(m.team_b_id, m.placeholder_b);
        eff.set(m.id, { aId: a.id, aName: a.name, bId: b.id, bName: b.name });
      }
    }

    const vp: Record<string, string> = {};
    for (const [matchId, e] of eff) {
      const p = picks[matchId];
      if (p && (p === e.aId || p === e.bId)) vp[matchId] = p;
    }
    return { effective: eff, validPicks: vp };
  }, [picks, koMatches, teamNames, byNum]);

  const total = koMatches.length;
  const done = Object.keys(validPicks).length;
  const allPicked = done === total;

  function onPick(matchId: string, teamId: string) {
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

  return (
    <div className="space-y-6">

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {viewingName ? (
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
            Viewing {viewingName}&apos;s bracket (read-only) ·{" "}
            <Link href="/bracket" className="underline">
              back to yours
            </Link>
          </p>
        ) : locked ? (
          <p className="text-sm font-medium text-amber-600">
            Bracket locked — R32 has kicked off.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            {done}/{total} picks made{allPicked ? " · ready to submit!" : ""}
          </p>
        )}
        {!locked && !viewingName && (
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

      {/* Visual bracket */}
      <BracketTree
        koMatches={koMatches}
        byNum={byNum}
        effective={effective}
        validPicks={validPicks}
        actualWinners={actualWinners}
        locked={locked}
        onPick={onPick}
      />

      {/* Bracket standings (post-lock only) */}
      {locked ? (
        <section className="space-y-3 pt-2">
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
                      row.userId === currentUserId ? "bg-foreground/[.04] font-medium" : ""
                    }`}
                  >
                    <td className="py-2 text-zinc-400">
                      {row.hasSubmitted ? row.rank : "–"}
                    </td>
                    <td>
                      {row.hasSubmitted ? (
                        <Link
                          href={`/bracket?view=${row.userId}`}
                          className="hover:underline"
                        >
                          {row.name}
                        </Link>
                      ) : (
                        <span className="text-zinc-400">{row.name}</span>
                      )}
                      {row.userId === currentUserId && (
                        <span className="ml-2 text-xs text-zinc-400">you</span>
                      )}
                      {!row.hasSubmitted && (
                        <span className="ml-2 text-xs text-zinc-400">no bracket</span>
                      )}
                    </td>
                    <td className="text-right font-mono text-zinc-400">
                      {row.hasSubmitted ? row.correct : "–"}
                    </td>
                    <td className="text-right font-mono font-semibold text-zinc-400">
                      {row.hasSubmitted ? row.pts : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-zinc-400">
            R32 = 1 · R16 = 2 · QF = 4 · SF = 8 · 3rd = 8 · Final = 16
          </p>
        </section>
      ) : (
        <p className="pt-2 text-sm text-zinc-400">
          Bracket standings and everyone&apos;s picks are revealed once R32 kicks off.
        </p>
      )}
    </div>
  );
}
