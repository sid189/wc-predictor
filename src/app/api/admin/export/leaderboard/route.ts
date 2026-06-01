import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isExactFullTime } from "@/lib/scoring";
import { toCsv } from "@/lib/csv";

/** GET — returns a CSV of the current leaderboard (rank, name, match pts,
 *  special pts, exact-score count, total). Same calculation as /leaderboard. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return new NextResponse("Forbidden", { status: 403 });

  const admin = createAdminClient();
  const [{ data: profiles }, { data: preds }, { data: specials }, { data: results }] =
    await Promise.all([
      admin.from("profiles").select("id, display_name"),
      admin.from("predictions").select("user_id, points, match_id, ft_a, ft_b"),
      admin.from("special_predictions").select("user_id, points"),
      admin.from("match_results").select("match_id, ft_a, ft_b"),
    ]);

  const resultMap = new Map(
    ((results ?? []) as { match_id: string; ft_a: number; ft_b: number }[]).map((r) => [
      r.match_id,
      r,
    ]),
  );

  const stats = new Map<string, { match: number; special: number; exact: number }>();
  const bump = (
    uid: string,
    patch: Partial<{ match: number; special: number; exact: number }>,
  ) => {
    const s = stats.get(uid) ?? { match: 0, special: 0, exact: 0 };
    if (patch.match) s.match += patch.match;
    if (patch.special) s.special += patch.special;
    if (patch.exact) s.exact += patch.exact;
    stats.set(uid, s);
  };

  type P = { user_id: string; points: number; match_id: string; ft_a: number; ft_b: number };
  ((preds ?? []) as P[]).forEach((p) => {
    bump(p.user_id, { match: p.points ?? 0 });
    const res = resultMap.get(p.match_id);
    if (res && isExactFullTime(p, res)) bump(p.user_id, { exact: 1 });
  });
  ((specials ?? []) as { user_id: string; points: number }[]).forEach((s) =>
    bump(s.user_id, { special: s.points ?? 0 }),
  );

  const ranked = ((profiles ?? []) as { id: string; display_name: string }[])
    .map((p) => {
      const s = stats.get(p.id) ?? { match: 0, special: 0, exact: 0 };
      return { name: p.display_name, ...s, total: s.match + s.special };
    })
    .sort((a, b) => b.total - a.total || b.exact - a.exact);

  // Tied-rank numbering (shared rank for equal totals).
  let rank = 0;
  let prevTotal: number | null = null;
  const rows = ranked.map((r, i) => {
    if (r.total !== prevTotal) {
      rank = i + 1;
      prevTotal = r.total;
    }
    return [rank, r.name, r.match, r.special, r.exact, r.total] as (string | number)[];
  });

  const csv = toCsv(
    ["Rank", "Player", "Match points", "Special points", "Exact scores", "Total"],
    rows,
  );

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leaderboard_${date}.csv"`,
    },
  });
}
