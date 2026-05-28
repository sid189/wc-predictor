import { describe, it, expect } from "vitest";
import {
  computeGroupStandings,
  isGroupComplete,
  rankThirdPlaced,
  type GroupMatch,
} from "./standings";

// Helper: build a match between team indices with a score.
const m = (a: string, b: string, fa: number | null, fb: number | null): GroupMatch => ({
  team_a_id: a,
  team_b_id: b,
  ft_a: fa,
  ft_b: fb,
});

describe("computeGroupStandings", () => {
  it("orders by points, then goal difference, then goals for", () => {
    // A beats D, B beats D big, A draws B. C loses everything.
    const matches = [
      m("A", "B", 1, 1),
      m("A", "C", 2, 0),
      m("A", "D", 1, 0),
      m("B", "C", 3, 0),
      m("B", "D", 4, 0),
      m("C", "D", 0, 1),
    ];
    const s = computeGroupStandings(["A", "B", "C", "D"], matches);
    expect(s.map((r) => r.teamId)).toEqual(["B", "A", "D", "C"]);
    // B: W2 D1 = 7pts; A: W2 D1 = 7pts; B ahead on GD (+6 vs +2).
    expect(s[0].points).toBe(7);
    expect(s[1].points).toBe(7);
    expect(s[0].gd).toBeGreaterThan(s[1].gd);
    expect(s.every((r) => !r.unresolved)).toBe(true);
  });

  it("breaks a points/GD/GF tie by head-to-head", () => {
    // A and B identical overall (each beats C and D the same way) but A beat B.
    const matches = [
      m("A", "B", 1, 0), // head-to-head: A over B
      m("A", "C", 2, 0),
      m("A", "D", 2, 0),
      m("B", "C", 2, 0),
      m("B", "D", 2, 0),
      m("C", "D", 0, 0),
    ];
    const s = computeGroupStandings(["A", "B", "C", "D"], matches);
    expect(s[0].teamId).toBe("A");
    expect(s[1].teamId).toBe("B");
    expect(s[0].unresolved).toBe(false);
    expect(s[1].unresolved).toBe(false);
  });

  it("flags an unbreakable tie as unresolved", () => {
    // A and B identical overall AND drew head-to-head -> cannot separate.
    const matches = [
      m("A", "B", 1, 1),
      m("A", "C", 2, 0),
      m("A", "D", 2, 0),
      m("B", "C", 2, 0),
      m("B", "D", 2, 0),
      m("C", "D", 0, 0),
    ];
    const s = computeGroupStandings(["A", "B", "C", "D"], matches);
    const top2 = s.slice(0, 2).map((r) => r.teamId).sort();
    expect(top2).toEqual(["A", "B"]);
    expect(s[0].unresolved).toBe(true);
    expect(s[1].unresolved).toBe(true);
  });

  it("counts wins/draws/losses and goals correctly", () => {
    const s = computeGroupStandings(["A", "B"], [m("A", "B", 3, 1)]);
    const a = s.find((r) => r.teamId === "A")!;
    expect(a).toMatchObject({ played: 1, won: 1, drawn: 0, lost: 0, gf: 3, ga: 1, gd: 2, points: 3 });
  });
});

describe("isGroupComplete", () => {
  it("is false while results are missing", () => {
    expect(isGroupComplete([m("A", "B", 1, 0), m("A", "C", null, null)])).toBe(false);
  });
  it("is true once every match has a result", () => {
    expect(isGroupComplete([m("A", "B", 1, 0), m("A", "C", 2, 2)])).toBe(true);
  });
});

describe("rankThirdPlaced", () => {
  it("ranks third-placed teams across groups, best first", () => {
    const mkStand = (third: { points: number; gd: number; gf: number }) => [
      { teamId: "1", rank: 1 } as never,
      { teamId: "2", rank: 2 } as never,
      { teamId: "3rd", rank: 3, points: third.points, gd: third.gd, gf: third.gf } as never,
    ];
    const ranked = rankThirdPlaced([
      { group: "A", standings: mkStand({ points: 3, gd: 0, gf: 2 }) },
      { group: "B", standings: mkStand({ points: 4, gd: 1, gf: 3 }) },
      { group: "C", standings: mkStand({ points: 3, gd: 1, gf: 2 }) },
    ]);
    expect(ranked.map((r) => r.group)).toEqual(["B", "C", "A"]);
  });
});
