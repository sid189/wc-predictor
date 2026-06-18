// ESPN's "core" API for soccer stats. Leaders come keyed by category and use
// $ref URLs for athlete + team — we follow them in parallel and decorate.
// Sofascore would have richer data but blocks server-IP requests.

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const LEADERS_URL =
  "https://sports.core.api.espn.com/v2/sports/soccer/leagues/fifa.world/seasons/2026/types/1/leaders?lang=en&region=us";

// ESPN's team names vs ours (used by the Flag component's country lookup).
const ESPN_TO_OUR_TEAM: Record<string, string> = {
  "United States": "USA",
  "South Korea": "Korea Republic",
  Iran: "IR Iran",
  "Ivory Coast": "Côte d'Ivoire",
  Turkey: "Türkiye",
  "DR Congo": "Congo DR",
  "Cape Verde": "Cabo Verde",
};

export function normaliseTeamName(name: string): string {
  return ESPN_TO_OUR_TEAM[name] ?? name;
}

interface EspnLeader {
  value: number;
  athlete?: { $ref?: string };
  team?: { $ref?: string };
}
interface EspnCategory {
  name: string;
  leaders?: EspnLeader[];
}
interface EspnLeadersResponse {
  categories?: EspnCategory[];
}

export interface StatRow {
  playerName: string;
  teamName: string; // normalised
  value: number;
}
export interface StatsBundle {
  goals: StatRow[];
  assists: StatRow[];
  yellowCards: StatRow[];
  redCards: StatRow[];
  fetchedAt: string;
}

const TOP_N = 10;

async function fetchJson<T>(url: string, revalidate: number): Promise<T | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    next: { revalidate },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchTopPlayers(): Promise<StatsBundle | null> {
  try {
    const data = await fetchJson<EspnLeadersResponse>(LEADERS_URL, 600);
    if (!data) return null;

    const cats = data.categories ?? [];
    const find = (name: string) =>
      (cats.find((c) => c.name === name)?.leaders ?? []).slice(0, TOP_N);

    const rawGoals = find("goalsLeaders");
    const rawAssists = find("assistsLeaders");
    const rawYellow = find("yellowCards");
    const rawRed = find("redCards");

    // Collect every athlete + team $ref we need to follow, dedup.
    const refs = new Set<string>();
    for (const list of [rawGoals, rawAssists, rawYellow, rawRed]) {
      for (const l of list) {
        if (l.athlete?.$ref) refs.add(l.athlete.$ref);
        if (l.team?.$ref) refs.add(l.team.$ref);
      }
    }

    // Fetch all referenced entities in parallel (cached for 1 h — these don't
    // change during the tournament).
    const cache = new Map<string, { displayName?: string; name?: string }>();
    await Promise.all(
      [...refs].map(async (url) => {
        const r = await fetchJson<{ displayName?: string; name?: string }>(url, 3600);
        if (r) cache.set(url, r);
      }),
    );

    const decorate = (raws: EspnLeader[]): StatRow[] =>
      raws.map((l) => ({
        playerName:
          (l.athlete?.$ref && cache.get(l.athlete.$ref)?.displayName) ?? "Unknown",
        teamName: normaliseTeamName(
          (l.team?.$ref && cache.get(l.team.$ref)?.displayName) ?? "Unknown",
        ),
        value: l.value,
      }));

    return {
      goals: decorate(rawGoals),
      assists: decorate(rawAssists),
      yellowCards: decorate(rawYellow),
      redCards: decorate(rawRed),
      fetchedAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error("Stats fetch failed", e);
    return null;
  }
}
