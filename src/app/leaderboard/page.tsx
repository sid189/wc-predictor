import { createClient } from "@/lib/supabase/server";
import { isExactFullTime } from "@/lib/scoring";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profiles }, { data: preds }, { data: specials }, { data: results }] =
    await Promise.all([
      supabase.from("profiles").select("id, display_name"),
      supabase.from("predictions").select("user_id, points, match_id, ft_a, ft_b"),
      supabase.from("special_predictions").select("user_id, points"),
      supabase.from("match_results").select("match_id, ft_a, ft_b"),
    ]);

  // Look up actual full-time scores to count each player's exact-score hits.
  const resultMap = new Map((results ?? []).map((r) => [r.match_id, r]));

  const stats = new Map<string, { match: number; special: number; exact: number }>();
  const bump = (uid: string, patch: Partial<{ match: number; special: number; exact: number }>) => {
    const s = stats.get(uid) ?? { match: 0, special: 0, exact: 0 };
    if (patch.match) s.match += patch.match;
    if (patch.special) s.special += patch.special;
    if (patch.exact) s.exact += patch.exact;
    stats.set(uid, s);
  };

  (preds ?? []).forEach((p) => {
    bump(p.user_id, { match: p.points ?? 0 });
    const res = resultMap.get(p.match_id);
    if (res && isExactFullTime(p, res)) bump(p.user_id, { exact: 1 });
  });
  (specials ?? []).forEach((s) => bump(s.user_id, { special: s.points ?? 0 }));

  // Sort by total points; break ties by most exact scores (decision #3).
  const rows = (profiles ?? [])
    .map((p: Pick<Profile, "id" | "display_name">) => {
      const s = stats.get(p.id) ?? { match: 0, special: 0, exact: 0 };
      return { id: p.id, name: p.display_name, ...s, total: s.match + s.special };
    })
    .sort((a, b) => b.total - a.total || b.exact - a.exact);

  // Competition ranking: equal totals share a rank ("ties stay tied").
  let rank = 0;
  let prevTotal: number | null = null;
  const ranked = rows.map((r, i) => {
    if (r.total !== prevTotal) {
      rank = i + 1;
      prevTotal = r.total;
    }
    return { ...r, rank };
  });

  if (ranked.length === 0) {
    return <div className="py-12 text-center text-zinc-500">No players yet.</div>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Leaderboard</h1>
      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-black/[.08] dark:border-white/[.145]">
            <th className="py-2">#</th>
            <th>Player</th>
            <th className="text-right">Matches</th>
            <th className="text-right">Specials</th>
            <th className="text-right">Exact</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr
              key={r.id}
              className={`border-b border-black/[.05] dark:border-white/[.08] ${
                r.id === user?.id ? "bg-foreground/[.04] font-medium" : ""
              }`}
            >
              <td className="py-2 text-zinc-400">{r.rank}</td>
              <td className="font-medium">
                {r.name}
                {r.id === user?.id && <span className="ml-2 text-xs text-zinc-400">you</span>}
              </td>
              <td className="text-right font-mono">{r.match}</td>
              <td className="text-right font-mono">{r.special}</td>
              <td className="text-right font-mono text-zinc-500">{r.exact}</td>
              <td className="text-right font-mono font-semibold">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-zinc-400">
        Ties share a rank and are ordered by most exact full-time scores.
      </p>
    </div>
  );
}
