import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isExactFullTime } from "@/lib/scoring";
import { ProgressionCharts } from "@/components/ProgressionCharts";
import type { ProgLine } from "@/components/ProgressionCharts";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

const FORM_COLORS: Record<number, string> = {
  0: "#EF4444", // red
  1: "#EAB308", // yellow
  2: "#D946EF", // magenta
  3: "#22C55E", // green
  4: "#06B6D4", // cyan
  5: "#FFD700", // gold
};

function formColor(pts: number): string {
  return FORM_COLORS[pts] ?? "#FFD700";
}

const LEGEND = [
  { label: "0 pts", color: "#EF4444" },
  { label: "1 pt",  color: "#EAB308" },
  { label: "2 pts", color: "#D946EF" },
  { label: "3 pts", color: "#22C55E" },
  { label: "4 pts", color: "#06B6D4" },
  { label: "5 pts", color: "#FFD700" },
];

// Distinct line colours for the progression charts (cycles if > 12 players).
const CHART_COLORS = [
  "#EF4444", "#3B82F6", "#22C55E", "#F59E0B",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
  "#06B6D4", "#84CC16", "#A855F7", "#6366F1",
];
const chartColor = (i: number) => CHART_COLORS[i % CHART_COLORS.length];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const isProgression = tab === "progression";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profiles }, { data: preds }, { data: specials }, { data: results }, { data: matches }] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name"),
      supabase.from("predictions").select("user_id, points, match_id, ft_a, ft_b, scored"),
      supabase.from("special_predictions").select("user_id, points"),
      supabase.from("match_results").select("match_id, ft_a, ft_b"),
      supabase.from("matches").select("id, kickoff_at, match_order"),
    ]);

  const resultMap = new Map((results ?? []).map((r) => [r.match_id, r]));
  const kickoffMap = new Map(
    (matches ?? []).map((m) => [m.id, { kickoff_at: m.kickoff_at, match_order: m.match_order as number }]),
  );

  // ── Leaderboard totals ────────────────────────────────────────────────────

  const stats = new Map<string, { match: number; special: number; exact: number }>();
  const bump = (uid: string, patch: Partial<{ match: number; special: number; exact: number }>) => {
    const s = stats.get(uid) ?? { match: 0, special: 0, exact: 0 };
    if (patch.match)   s.match   += patch.match;
    if (patch.special) s.special += patch.special;
    if (patch.exact)   s.exact   += patch.exact;
    stats.set(uid, s);
  };

  const formPreds = new Map<string, { kickoff_at: string; match_order: number; points: number }[]>();

  // Index scored predictions per player + match for progression computation.
  const playerMatchPts = new Map<string, Map<string, number>>();

  (preds ?? []).forEach((p) => {
    bump(p.user_id, { match: p.points ?? 0 });
    const res = resultMap.get(p.match_id);
    if (res && isExactFullTime(p, res)) bump(p.user_id, { exact: 1 });
    if (p.scored) {
      const km = kickoffMap.get(p.match_id);
      if (km) {
        const arr = formPreds.get(p.user_id) ?? [];
        arr.push({ kickoff_at: km.kickoff_at, match_order: km.match_order, points: p.points ?? 0 });
        formPreds.set(p.user_id, arr);
      }
      let m = playerMatchPts.get(p.user_id);
      if (!m) { m = new Map(); playerMatchPts.set(p.user_id, m); }
      m.set(p.match_id, p.points ?? 0);
    }
  });
  (specials ?? []).forEach((s) => bump(s.user_id, { special: s.points ?? 0 }));

  // Last 5 scored matches per player, oldest → newest.
  // Use match_order as a tiebreaker for simultaneous kickoffs (e.g. final
  // group-stage matchday where two games kick off at the same time).
  const formMap = new Map<string, number[]>();
  for (const [uid, arr] of formPreds) {
    const sorted = arr.sort(
      (a, b) =>
        a.kickoff_at.localeCompare(b.kickoff_at) || a.match_order - b.match_order,
    );
    formMap.set(uid, sorted.slice(-5).map((x) => x.points));
  }

  const rows = (profiles ?? [])
    .map((p: Pick<Profile, "id" | "display_name">) => {
      const s = stats.get(p.id) ?? { match: 0, special: 0, exact: 0 };
      return { id: p.id, name: p.display_name, ...s, total: s.match + s.special };
    })
    .sort((a, b) => b.total - a.total || b.exact - a.exact);

  let rank = 0;
  let prevTotal: number | null = null;
  const ranked = rows.map((r, i) => {
    if (r.total !== prevTotal) { rank = i + 1; prevTotal = r.total; }
    return { ...r, rank };
  });

  if (ranked.length === 0) {
    return <div className="py-12 text-center text-zinc-500">No players yet.</div>;
  }

  // ── Progression data ──────────────────────────────────────────────────────

  // Scored match slots in chronological order.
  const scoredMatchSet = new Set<string>();
  (preds ?? []).forEach((p) => { if (p.scored) scoredMatchSet.add(p.match_id); });
  const matchSlots = [...kickoffMap.entries()]
    .filter(([id]) => scoredMatchSet.has(id))
    .sort(([, a], [, b]) => a.kickoff_at.localeCompare(b.kickoff_at) || a.match_order - b.match_order)
    .map(([id]) => id);

  const N = matchSlots.length;
  const numPlayers = rows.length;

  // Cumulative points + rank at each slot, per player.
  const cumulByPlayer = new Map<string, number[]>();
  const rankByPlayer  = new Map<string, number[]>();
  const running       = new Map<string, number>();
  for (const r of rows) {
    cumulByPlayer.set(r.id, []);
    rankByPlayer.set(r.id, []);
    running.set(r.id, 0);
  }

  for (const matchId of matchSlots) {
    for (const r of rows) {
      const pts = playerMatchPts.get(r.id)?.get(matchId) ?? 0;
      const next = (running.get(r.id) ?? 0) + pts;
      running.set(r.id, next);
      cumulByPlayer.get(r.id)!.push(next);
    }
    // Rank at this point (ties share rank).
    const sorted = rows
      .map((r) => ({ id: r.id, pts: running.get(r.id) ?? 0 }))
      .sort((a, b) => b.pts - a.pts);
    let cur = 1, prevPts = -Infinity;
    sorted.forEach(({ id, pts }, idx) => {
      if (pts !== prevPts) { cur = idx + 1; prevPts = pts; }
      rankByPlayer.get(id)!.push(cur);
    });
  }

  const maxPoints = Math.max(
    1,
    ...rows.map((r) => cumulByPlayer.get(r.id)?.at(-1) ?? 0),
  );

  // Prepend a "before any games" origin so lines start from 0 / rank-1 and
  // progress continuously rightward as points are earned.
  const pointLines: ProgLine[] = rows.map((r, i) => ({
    id:     r.id,
    name:   r.name,
    color:  chartColor(i),
    values: N > 0 ? [0, ...(cumulByPlayer.get(r.id) ?? [])] : [],
  }));
  const rankLines: ProgLine[] = rows.map((r, i) => ({
    id:     r.id,
    name:   r.name,
    color:  chartColor(i),
    // Everyone is tied at rank 1 before any games are scored.
    values: N > 0 ? [1, ...(rankByPlayer.get(r.id) ?? [])] : [],
  }));

  // ── Tab navigation ────────────────────────────────────────────────────────

  const tabCls = (active: boolean) =>
    active
      ? "border-b-2 border-foreground pb-2 text-sm font-semibold"
      : "pb-2 text-sm text-zinc-500 hover:text-foreground";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Leaderboard</h1>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-black/[.08] dark:border-white/[.145]">
        <Link href="/leaderboard" className={tabCls(!isProgression)}>
          Leaderboard
        </Link>
        <Link href="/leaderboard?tab=progression" className={tabCls(isProgression)}>
          Progression
        </Link>
      </div>

      {isProgression ? (
        <ProgressionCharts
          matchCount={N > 0 ? N + 1 : 0}
          maxPoints={maxPoints}
          numPlayers={numPlayers}
          pointLines={pointLines}
          rankLines={rankLines}
        />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500">
              <tr className="border-b border-black/[.08] dark:border-white/[.145]">
                <th className="py-2">#</th>
                <th>Player</th>
                <th className="text-right">Matches</th>
                <th className="text-right">Exact</th>
                <th className="text-right">Total</th>
                <th className="py-2 pl-8 text-right">Recent Form</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const form = formMap.get(r.id) ?? [];
                const padded: (number | null)[] = Array.from({ length: 5 }, (_, i) => {
                  const offset = i - (5 - form.length);
                  return offset >= 0 ? form[offset] : null;
                });
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-black/[.05] dark:border-white/[.08] ${
                      r.id === user?.id ? "bg-foreground/[.04] font-medium" : ""
                    }`}
                  >
                    <td className="py-2 text-zinc-400">{r.rank}</td>
                    <td className="font-medium">
                      {r.name}
                      {r.id === user?.id && (
                        <span className="ml-2 text-xs text-zinc-400">you</span>
                      )}
                    </td>
                    <td className="text-right font-mono">{r.match}</td>
                    <td className="text-right font-mono text-zinc-500">{r.exact}</td>
                    <td className="text-right font-mono font-semibold">{r.total}</td>
                    <td className="py-2 pl-8 text-right">
                      <div className="flex justify-end gap-1">
                        {padded.map((pts, i) =>
                          pts == null ? (
                            <span
                              key={i}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-zinc-200 dark:bg-zinc-700"
                            />
                          ) : (
                            <span
                              key={i}
                              style={{ backgroundColor: formColor(pts) }}
                              className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold leading-none text-white"
                            >
                              {pts}
                            </span>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="text-xs text-zinc-400">
            Ties share a rank and are ordered by most exact full-time scores.
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span className="font-medium">Recent Form:</span>
            {LEGEND.map(({ label, color }, pts) => (
              <span key={label} className="flex items-center gap-1">
                <span
                  className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {pts}
                </span>
                {label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
