import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCsv } from "@/lib/csv";

/** GET — returns a CSV of every prediction joined with its match's actual
 *  result and the points earned. Admin only. */
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
  const [
    { data: predictions },
    { data: matches },
    { data: teams },
    { data: results },
    { data: profiles },
  ] = await Promise.all([
    admin.from("predictions").select("*"),
    admin.from("matches").select("*"),
    admin.from("teams").select("id, name"),
    admin.from("match_results").select("*"),
    admin.from("profiles").select("id, display_name"),
  ]);

  type M = {
    id: string;
    fifa_match_number: number | null;
    stage: string;
    kickoff_at: string;
    team_a_id: string | null;
    team_b_id: string | null;
  };
  type R = {
    match_id: string;
    ft_a: number;
    ft_b: number;
    et_a: number | null;
    et_b: number | null;
    pen_a: number | null;
    pen_b: number | null;
  };
  type P = {
    user_id: string;
    match_id: string;
    ft_a: number;
    ft_b: number;
    et_a: number | null;
    et_b: number | null;
    pen_a: number | null;
    pen_b: number | null;
    points: number;
    scored: boolean;
  };

  const matchMap = new Map(((matches ?? []) as M[]).map((m) => [m.id, m]));
  const teamMap = new Map(
    ((teams ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]),
  );
  const resMap = new Map(((results ?? []) as R[]).map((r) => [r.match_id, r]));
  const profMap = new Map(
    ((profiles ?? []) as { id: string; display_name: string }[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  const score = (a: number | null, b: number | null) =>
    a != null && b != null ? `${a}-${b}` : "";

  // Sort by match number, then by predictor name within a match.
  const rows = ((predictions ?? []) as P[])
    .map((p) => {
      const m = matchMap.get(p.match_id);
      const r = resMap.get(p.match_id);
      return {
        matchNum: m?.fifa_match_number ?? 0,
        predictor: profMap.get(p.user_id) ?? "?",
        row: [
          m?.fifa_match_number ?? "",
          m?.stage ?? "",
          m?.kickoff_at ?? "",
          (m?.team_a_id && teamMap.get(m.team_a_id)) ?? "",
          (m?.team_b_id && teamMap.get(m.team_b_id)) ?? "",
          profMap.get(p.user_id) ?? "?",
          score(p.ft_a, p.ft_b),
          score(p.et_a, p.et_b),
          score(p.pen_a, p.pen_b),
          r ? score(r.ft_a, r.ft_b) : "",
          r ? score(r.et_a, r.et_b) : "",
          r ? score(r.pen_a, r.pen_b) : "",
          p.scored ? p.points : "",
        ] as (string | number | null)[],
      };
    })
    .sort(
      (a, b) =>
        a.matchNum - b.matchNum || a.predictor.localeCompare(b.predictor),
    )
    .map((x) => x.row);

  const csv = toCsv(
    [
      "Match #",
      "Stage",
      "Kickoff (UTC)",
      "Team A",
      "Team B",
      "Predictor",
      "Predicted FT",
      "Predicted ET",
      "Predicted Pens",
      "Actual FT",
      "Actual ET",
      "Actual Pens",
      "Points",
    ],
    rows,
  );

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="predictions_${date}.csv"`,
    },
  });
}
