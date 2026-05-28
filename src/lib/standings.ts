// Pure group-standings logic. No I/O — unit-tested in standings.test.ts.
//
// FIFA tie-break order for the group stage:
//   1. points  2. goal difference  3. goals for
//   then, among teams still level: head-to-head points / GD / GF
//   then fair play / drawing of lots (no data here) -> flagged `unresolved`.

export const POINTS_WIN = 3;
export const POINTS_DRAW = 1;

export interface GroupMatch {
  team_a_id: string | null;
  team_b_id: string | null;
  ft_a: number | null; // null when no result yet
  ft_b: number | null;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  rank: number; // 1-based final position
  unresolved: boolean; // tied with a neighbour on every available criterion
}

interface Stat {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

const emptyStat = (): Stat => ({ played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 });

/** Accumulate stats over the matches played between the given set of teams. */
function accumulate(ids: Set<string>, matches: GroupMatch[]): Map<string, Stat> {
  const table = new Map<string, Stat>();
  for (const id of ids) table.set(id, emptyStat());

  for (const m of matches) {
    if (m.team_a_id == null || m.team_b_id == null || m.ft_a == null || m.ft_b == null) continue;
    if (!ids.has(m.team_a_id) || !ids.has(m.team_b_id)) continue;
    const a = table.get(m.team_a_id)!;
    const b = table.get(m.team_b_id)!;
    a.played++;
    b.played++;
    a.gf += m.ft_a;
    a.ga += m.ft_b;
    b.gf += m.ft_b;
    b.ga += m.ft_a;
    if (m.ft_a > m.ft_b) {
      a.won++;
      b.lost++;
      a.points += POINTS_WIN;
    } else if (m.ft_a < m.ft_b) {
      b.won++;
      a.lost++;
      b.points += POINTS_WIN;
    } else {
      a.drawn++;
      b.drawn++;
      a.points += POINTS_DRAW;
      b.points += POINTS_DRAW;
    }
  }
  return table;
}

const gd = (s: { gf: number; ga: number }) => s.gf - s.ga;
const sameOverall = (a: StandingRow, b: StandingRow) =>
  a.points === b.points && a.gd === b.gd && a.gf === b.gf;

/** Order a cluster of teams level on overall pts/GD/GF by their head-to-head
 *  mini-table, flagging any that remain tied. Mutates the cluster in place. */
function resolveCluster(cluster: StandingRow[], matches: GroupMatch[]) {
  const ids = new Set(cluster.map((r) => r.teamId));
  const mini = accumulate(ids, matches);
  const key = (id: string) => mini.get(id)!;

  cluster.sort((a, b) => {
    const A = key(a.teamId);
    const B = key(b.teamId);
    return B.points - A.points || gd(B) - gd(A) || B.gf - A.gf;
  });

  let i = 0;
  while (i < cluster.length) {
    const A = key(cluster[i].teamId);
    let j = i + 1;
    while (j < cluster.length) {
      const B = key(cluster[j].teamId);
      if (A.points === B.points && gd(A) === gd(B) && A.gf === B.gf) j++;
      else break;
    }
    if (j - i > 1) for (let k = i; k < j; k++) cluster[k].unresolved = true;
    i = j;
  }
}

/** Compute the ranked standings for one group. */
export function computeGroupStandings(teamIds: string[], matches: GroupMatch[]): StandingRow[] {
  const stats = accumulate(new Set(teamIds), matches);
  const rows: StandingRow[] = teamIds.map((id) => {
    const s = stats.get(id) ?? emptyStat();
    return { teamId: id, ...s, gd: gd(s), rank: 0, unresolved: false };
  });

  rows.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf);

  // Break ties within each overall-equal cluster via head-to-head.
  const out: StandingRow[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && sameOverall(rows[i], rows[j])) j++;
    const cluster = rows.slice(i, j);
    if (cluster.length > 1) resolveCluster(cluster, matches);
    out.push(...cluster);
    i = j;
  }

  out.forEach((r, idx) => (r.rank = idx + 1));
  return out;
}

/** True when every match in the group has a recorded result. */
export function isGroupComplete(matches: GroupMatch[]): boolean {
  return matches.length > 0 && matches.every((m) => m.ft_a != null && m.ft_b != null);
}

/** Rank the third-placed teams across groups (best first) for R32 qualification. */
export function rankThirdPlaced(
  groups: { group: string; standings: StandingRow[] }[],
): { group: string; row: StandingRow }[] {
  return groups
    .filter((g) => g.standings.length >= 3)
    .map((g) => ({ group: g.group, row: g.standings[2] }))
    .sort(
      (a, b) =>
        b.row.points - a.row.points || b.row.gd - a.row.gd || b.row.gf - a.row.gf,
    );
}
