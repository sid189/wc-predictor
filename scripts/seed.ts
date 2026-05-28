/**
 * Seeds the official FIFA World Cup 2026 schedule from scripts/wc2026-schedule.json
 * (scraped from FIFA's data API). Loads all 48 teams, the 72 group fixtures, and
 * the 32 knockout matches (teams TBD, with bracket placeholders like '2A'/'W101').
 *
 * Idempotent: teams upsert by name, matches upsert by fifa_match_number.
 *
 * Run with:  npm run db:seed
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local
 * Requires migrations 0001 and 0002 to have been applied.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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

interface FixtureRow {
  n: number;
  stage: string;
  group: string | null;
  date: string;
  team_a: string | null;
  team_b: string | null;
  placeholder_a: string | null;
  placeholder_b: string | null;
  stadium: string | null;
  city: string | null;
}

const here = dirname(fileURLToPath(import.meta.url));
const fixtures: FixtureRow[] = JSON.parse(
  readFileSync(join(here, "wc2026-schedule.json"), "utf8"),
);

// A handful of well-known Golden Boot candidates (edit/add in admin).
const PLAYERS: { name: string; team: string }[] = [
  { name: "Kylian Mbappé", team: "France" },
  { name: "Lionel Messi", team: "Argentina" },
  { name: "Harry Kane", team: "England" },
  { name: "Vinícius Júnior", team: "Brazil" },
  { name: "Lautaro Martínez", team: "Argentina" },
  { name: "Cristiano Ronaldo", team: "Portugal" },
  { name: "Lamine Yamal", team: "Spain" },
  { name: "Erling Haaland", team: "Norway" },
  { name: "Mohamed Salah", team: "Egypt" },
  { name: "Julián Álvarez", team: "Argentina" },
];

async function main() {
  // 1. Teams — collect every named team + its group, upsert by name.
  const teamGroups = new Map<string, string | null>();
  for (const f of fixtures) {
    if (f.team_a) teamGroups.set(f.team_a, f.group);
    if (f.team_b) teamGroups.set(f.team_b, f.group);
  }
  const teamRows = [...teamGroups].map(([name, group_label]) => ({ name, group_label }));
  const { error: teamErr } = await db.from("teams").upsert(teamRows, { onConflict: "name" });
  if (teamErr) throw teamErr;

  const { data: teams } = await db.from("teams").select("id, name");
  const teamId = new Map((teams ?? []).map((t) => [t.name, t.id]));
  console.log(`Teams: ${teams?.length}`);

  // 2. Players — skip any that already exist by name.
  const { data: existingPlayers } = await db.from("players").select("name");
  const existing = new Set((existingPlayers ?? []).map((p) => p.name));
  const playerRows = PLAYERS.filter((p) => !existing.has(p.name)).map((p) => ({
    name: p.name,
    team_id: teamId.get(p.team) ?? null,
  }));
  if (playerRows.length) {
    const { error } = await db.from("players").insert(playerRows);
    if (error) throw error;
  }
  console.log(`Players added: ${playerRows.length}`);

  // 3. Matches — all 104, upsert by fifa_match_number.
  const matchRows = fixtures.map((f) => ({
    fifa_match_number: f.n,
    stage: f.stage,
    group_label: f.group,
    team_a_id: f.team_a ? (teamId.get(f.team_a) ?? null) : null,
    team_b_id: f.team_b ? (teamId.get(f.team_b) ?? null) : null,
    placeholder_a: f.placeholder_a,
    placeholder_b: f.placeholder_b,
    kickoff_at: f.date,
    match_order: f.n,
    stadium: f.stadium,
    city: f.city,
  }));
  const { error: matchErr } = await db
    .from("matches")
    .upsert(matchRows, { onConflict: "fifa_match_number" });
  if (matchErr) throw matchErr;
  console.log(`Matches upserted: ${matchRows.length}`);

  // 4. Tournament config: tournament start = first match; group stage end = first KO match.
  const sorted = [...fixtures].sort((a, b) => a.date.localeCompare(b.date));
  const startsAt = sorted[0]?.date ?? null;
  const firstKo = sorted.find((f) => f.stage !== "group");
  const groupEndsAt = firstKo?.date ?? null;
  const { error: cfgErr } = await db
    .from("tournament_config")
    .update({
      name: "FIFA World Cup 2026",
      starts_at: startsAt,
      group_stage_ends_at: groupEndsAt,
    })
    .eq("id", 1);
  if (cfgErr) throw cfgErr;
  console.log(`Config: starts ${startsAt}, group stage ends ${groupEndsAt}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
