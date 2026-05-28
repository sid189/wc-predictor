// Allocation of the 8 best third-placed teams to their Round-of-32 slots.
//
// Each R32 third-place slot encodes the groups whose third-placed team may fill
// it (token from FIFA's official WC 2026 fixture data, e.g. "3ABCDF" = a third
// from group A, B, C, D or F). Given which 8 of the 12 groups' thirds qualify,
// the assignment is the unique perfect matching between those groups and the
// slots — see thirdplace.test.ts, which proves uniqueness for all 495
// combinations, so this matches FIFA's published allocation table exactly.

export const THIRD_PLACE_SLOTS: { token: string; groups: string[] }[] = [
  { token: "3ABCDF", groups: ["A", "B", "C", "D", "F"] },
  { token: "3BEFIJ", groups: ["B", "E", "F", "I", "J"] },
  { token: "3CDFGH", groups: ["C", "D", "F", "G", "H"] },
  { token: "3CEFHI", groups: ["C", "E", "F", "H", "I"] },
  { token: "3DEIJL", groups: ["D", "E", "I", "J", "L"] },
  { token: "3AEHIJ", groups: ["A", "E", "H", "I", "J"] },
  { token: "3EFGIJ", groups: ["E", "F", "G", "I", "J"] },
  { token: "3EHIJK", groups: ["E", "H", "I", "J", "K"] },
];

/** Find up to `cap` perfect matchings of qualifying groups onto the slots. */
export function findThirdPlaceMatchings(
  qualifyingGroups: string[],
  cap = 2,
): Record<string, string>[] {
  const available = new Set(qualifyingGroups);
  const solutions: Record<string, string>[] = [];
  const used = new Set<string>();
  const current: Record<string, string> = {};

  function backtrack(i: number) {
    if (solutions.length >= cap) return;
    if (i === THIRD_PLACE_SLOTS.length) {
      solutions.push({ ...current });
      return;
    }
    const slot = THIRD_PLACE_SLOTS[i];
    for (const g of slot.groups) {
      if (!available.has(g) || used.has(g)) continue;
      used.add(g);
      current[slot.token] = g;
      backtrack(i + 1);
      used.delete(g);
      delete current[slot.token];
      if (solutions.length >= cap) return;
    }
  }

  backtrack(0);
  return solutions;
}

export interface ThirdPlaceAssignment {
  ok: boolean; // a single, unambiguous matching was found
  ambiguous: boolean; // more than one valid matching exists
  assignment: Record<string, string>; // slot token -> group letter
}

/** Assign exactly 8 qualifying groups to the 8 third-place R32 slots. */
export function assignThirdPlaceSlots(qualifyingGroups: string[]): ThirdPlaceAssignment {
  const sols = findThirdPlaceMatchings(qualifyingGroups, 2);
  return {
    ok: sols.length === 1,
    ambiguous: sols.length > 1,
    assignment: sols[0] ?? {},
  };
}
