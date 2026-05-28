import { describe, it, expect } from "vitest";
import {
  THIRD_PLACE_SLOTS,
  findThirdPlaceMatchings,
  assignThirdPlaceSlots,
} from "./thirdplace";

const GROUPS = "ABCDEFGHIJKL".split("");

function* combinations(arr: string[], k: number, start = 0, acc: string[] = []): Generator<string[]> {
  if (acc.length === k) {
    yield [...acc];
    return;
  }
  for (let i = start; i < arr.length; i++) yield* combinations(arr, k, i + 1, [...acc, arr[i]]);
}

describe("third-place slot data", () => {
  it("has the 8 R32 third-place slots, each with 5 candidate groups", () => {
    expect(THIRD_PLACE_SLOTS).toHaveLength(8);
    for (const s of THIRD_PLACE_SLOTS) expect(s.groups).toHaveLength(5);
  });
});

describe("findThirdPlaceMatchings", () => {
  it("every 8-of-12 qualifying combination has at least one valid matching", () => {
    let infeasible = 0;
    for (const combo of combinations(GROUPS, 8)) {
      if (findThirdPlaceMatchings(combo, 1).length === 0) infeasible++;
    }
    expect(infeasible).toBe(0); // a valid suggestion always exists
  });

  it("returns a valid bijection respecting each slot's candidate groups", () => {
    const combo = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const { assignment, ok, ambiguous } = assignThirdPlaceSlots(combo);
    const tokens = Object.keys(assignment);
    const groups = Object.values(assignment);
    expect(tokens.sort()).toEqual(THIRD_PLACE_SLOTS.map((s) => s.token).sort());
    expect(new Set(groups).size).toBe(8); // distinct
    for (const [token, group] of Object.entries(assignment)) {
      const slot = THIRD_PLACE_SLOTS.find((s) => s.token === token)!;
      expect(slot.groups).toContain(group);
    }
    // The candidate sets are intentionally ambiguous (multiple valid matchings),
    // so a single suggestion is offered but the admin confirms the official one.
    expect(ok || ambiguous).toBe(true);
  });
});
