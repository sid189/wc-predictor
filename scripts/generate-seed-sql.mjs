// Generates supabase/seed.sql from scripts/wc2026-schedule.json — a no-network
// alternative to `npm run db:seed`. Run with: node scripts/generate-seed-sql.mjs
import fs from "node:fs";

const fixtures = JSON.parse(fs.readFileSync("scripts/wc2026-schedule.json", "utf8"));

const PLAYERS = [
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

const q = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);

const teamGroups = new Map();
for (const f of fixtures) {
  if (f.team_a) teamGroups.set(f.team_a, f.group);
  if (f.team_b) teamGroups.set(f.team_b, f.group);
}

let sql = "-- Generated from scripts/wc2026-schedule.json. Paste into Supabase SQL editor.\n";
sql += "-- Idempotent: re-running is safe.\n\nbegin;\n\n";

sql += "-- Teams (48)\n";
sql += "insert into public.teams (name, group_label) values\n";
sql += [...teamGroups]
  .map(([name, g]) => `  (${q(name)}, ${q(g)})`)
  .join(",\n");
sql += "\non conflict (name) do update set group_label = excluded.group_label;\n\n";

sql += "-- Players (Golden Boot shortlist)\n";
for (const p of PLAYERS) {
  sql +=
    `insert into public.players (name, team_id) select ${q(p.name)}, ` +
    `(select id from public.teams where name = ${q(p.team)}) ` +
    `where not exists (select 1 from public.players where name = ${q(p.name)});\n`;
}
sql += "\n";

sql += "-- Matches (104) — upsert by fifa_match_number\n";
sql +=
  "insert into public.matches " +
  "(fifa_match_number, stage, group_label, team_a_id, team_b_id, placeholder_a, placeholder_b, kickoff_at, match_order, stadium, city) values\n";
sql += fixtures
  .map((f) => {
    const ta = f.team_a ? `(select id from public.teams where name = ${q(f.team_a)})` : "null";
    const tb = f.team_b ? `(select id from public.teams where name = ${q(f.team_b)})` : "null";
    return `  (${f.n}, ${q(f.stage)}, ${q(f.group)}, ${ta}, ${tb}, ${q(f.placeholder_a)}, ${q(f.placeholder_b)}, ${q(f.date)}, ${f.n}, ${q(f.stadium)}, ${q(f.city)})`;
  })
  .join(",\n");
sql +=
  "\non conflict (fifa_match_number) do update set\n" +
  "  stage = excluded.stage, group_label = excluded.group_label,\n" +
  "  team_a_id = excluded.team_a_id, team_b_id = excluded.team_b_id,\n" +
  "  placeholder_a = excluded.placeholder_a, placeholder_b = excluded.placeholder_b,\n" +
  "  kickoff_at = excluded.kickoff_at, match_order = excluded.match_order,\n" +
  "  stadium = excluded.stadium, city = excluded.city;\n\n";

const sorted = [...fixtures].sort((a, b) => a.date.localeCompare(b.date));
const startsAt = sorted[0].date;
const groupEnd = sorted.find((f) => f.stage !== "group")?.date ?? null;
sql += "-- Tournament config (dates derived from the schedule)\n";
sql +=
  `update public.tournament_config set name = 'FIFA World Cup 2026', ` +
  `starts_at = ${q(startsAt)}, group_stage_ends_at = ${q(groupEnd)} where id = 1;\n\n`;

sql += "commit;\n";

fs.mkdirSync("supabase", { recursive: true });
fs.writeFileSync("supabase/seed.sql", sql);
console.log(`Wrote supabase/seed.sql (${sql.length} bytes, ${fixtures.length} matches)`);
