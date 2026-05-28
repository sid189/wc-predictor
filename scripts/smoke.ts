/**
 * Integration smoke test against your Supabase project (run on a dev project,
 * not production). Verifies the schema is present and that a full-time exact
 * prediction scores correctly through a real insert → result → score round-trip,
 * then cleans up the temporary rows it created.
 *
 * Coverage: schema/migrations applied, column shapes, and scoring math against
 * the live DB. It does NOT exercise the RLS-as-user path (that needs a real
 * user session/JWT) — those rules are enforced by Postgres policies/triggers.
 *
 * Run with:  npm run db:smoke
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
 */
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { scorePrediction, type ScoreInput } from "../src/lib/scoring";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, {
  auth: { persistSession: false },
  realtime: { transport: ws as unknown as typeof WebSocket },
});

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean) {
  if (ok) {
    passed += 1;
    console.log("  ✓", name);
  } else {
    failed += 1;
    console.error("  ✗", name);
  }
}

const TABLES = [
  "profiles",
  "teams",
  "players",
  "matches",
  "match_results",
  "predictions",
  "special_predictions",
  "tournament_config",
];

async function main() {
  console.log("Schema:");
  for (const t of TABLES) {
    const { error } = await db.from(t).select("*", { count: "exact", head: true });
    check(`table ${t} queryable`, !error);
  }

  console.log("Scoring round-trip:");
  const { data: profiles } = await db.from("profiles").select("id").limit(1);
  const profileId = profiles?.[0]?.id;
  if (!profileId) {
    console.warn("  ! No profiles yet — sign in once, then re-run to test scoring.");
    return finish();
  }

  const tag = `smoke-${Date.now()}`;
  const { data: teamA } = await db.from("teams").insert({ name: `${tag}-A` }).select("id").single();
  const { data: teamB } = await db.from("teams").insert({ name: `${tag}-B` }).select("id").single();
  const { data: match } = await db
    .from("matches")
    .insert({
      stage: "group",
      team_a_id: teamA?.id ?? null,
      team_b_id: teamB?.id ?? null,
      kickoff_at: new Date(Date.now() - 3600_000).toISOString(),
    })
    .select("id")
    .single();

  if (!teamA || !teamB || !match) {
    console.error("  ! Failed to create temp rows.");
    return finish();
  }

  try {
    await db
      .from("predictions")
      .upsert(
        { user_id: profileId, match_id: match.id, ft_a: 2, ft_b: 1 },
        { onConflict: "user_id,match_id" },
      );
    await db
      .from("match_results")
      .upsert({ match_id: match.id, ft_a: 2, ft_b: 1 }, { onConflict: "match_id" });

    const { data: pred } = await db
      .from("predictions")
      .select("*")
      .eq("match_id", match.id)
      .eq("user_id", profileId)
      .single();
    const { data: res } = await db
      .from("match_results")
      .select("*")
      .eq("match_id", match.id)
      .single();

    check("prediction + result rows created", Boolean(pred && res));
    if (pred && res) {
      const predIn: ScoreInput = {
        ft_a: pred.ft_a,
        ft_b: pred.ft_b,
        et_a: pred.et_a,
        et_b: pred.et_b,
        pen_a: pred.pen_a,
        pen_b: pred.pen_b,
        winner_team_id: pred.pen_winner_team_id,
      };
      const resIn: ScoreInput = {
        ft_a: res.ft_a,
        ft_b: res.ft_b,
        et_a: res.et_a,
        et_b: res.et_b,
        pen_a: res.pen_a,
        pen_b: res.pen_b,
        winner_team_id: res.winner_team_id,
      };
      const points = scorePrediction(predIn, resIn);
      check("exact 2-1 prediction scores 2", points === 2);

      await db.from("predictions").update({ points, scored: true }).eq("id", pred.id);
      const { data: stored } = await db
        .from("predictions")
        .select("points, scored")
        .eq("id", pred.id)
        .single();
      check("points persisted via service role", stored?.points === 2 && stored?.scored === true);
    }
  } finally {
    await db.from("predictions").delete().eq("match_id", match.id);
    await db.from("match_results").delete().eq("match_id", match.id);
    await db.from("matches").delete().eq("id", match.id);
    await db.from("teams").delete().in("id", [teamA.id, teamB.id]);
    console.log("  (temp rows cleaned up)");
  }

  finish();
}

function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
