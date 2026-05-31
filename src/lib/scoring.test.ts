import { describe, it, expect } from "vitest";
import {
  scoreFullTime,
  scoreExtraTime,
  scorePenalties,
  scorePrediction,
  scoreSpecial,
  isExactFullTime,
  type ScoreInput,
} from "./scoring";

const base: ScoreInput = {
  ft_a: 0,
  ft_b: 0,
  et_a: null,
  et_b: null,
  pen_a: null,
  pen_b: null,
  winner_team_id: null,
};
const mk = (o: Partial<ScoreInput>): ScoreInput => ({ ...base, ...o });

describe("scoreFullTime", () => {
  it("awards 3 for an exact score", () => {
    expect(scoreFullTime({ ft_a: 2, ft_b: 1 }, { ft_a: 2, ft_b: 1 })).toBe(3);
  });
  it("awards 1 for correct outcome but wrong score", () => {
    expect(scoreFullTime({ ft_a: 3, ft_b: 1 }, { ft_a: 2, ft_b: 1 })).toBe(1);
  });
  it("awards 1 for a correctly predicted draw", () => {
    expect(scoreFullTime({ ft_a: 1, ft_b: 1 }, { ft_a: 2, ft_b: 2 })).toBe(1);
  });
  it("awards 0 for the wrong outcome", () => {
    expect(scoreFullTime({ ft_a: 0, ft_b: 1 }, { ft_a: 2, ft_b: 1 })).toBe(0);
  });
});

describe("isExactFullTime (leaderboard tie-break)", () => {
  it("is true only for an exact scoreline", () => {
    expect(isExactFullTime({ ft_a: 2, ft_b: 1 }, { ft_a: 2, ft_b: 1 })).toBe(true);
    expect(isExactFullTime({ ft_a: 3, ft_b: 1 }, { ft_a: 2, ft_b: 1 })).toBe(false);
    expect(isExactFullTime({ ft_a: 1, ft_b: 2 }, { ft_a: 2, ft_b: 1 })).toBe(false);
  });
});

describe("scoreExtraTime", () => {
  const res = mk({ ft_a: 1, ft_b: 1, et_a: 1, et_b: 0 });
  it("awards 1 for exact ET goals", () => {
    expect(scoreExtraTime(mk({ et_a: 1, et_b: 0 }), res)).toBe(1);
  });
  it("awards 0 when ET goals differ", () => {
    expect(scoreExtraTime(mk({ et_a: 0, et_b: 0 }), res)).toBe(0);
  });
  it("awards 0 when the match never went to ET", () => {
    expect(scoreExtraTime(mk({ et_a: 1, et_b: 0 }), mk({ ft_a: 2, ft_b: 0 }))).toBe(0);
  });
});

describe("scorePenalties", () => {
  const res = mk({ ft_a: 1, ft_b: 1, pen_a: 4, pen_b: 3, winner_team_id: "A" });
  it("awards 1 for the exact shootout score", () => {
    expect(scorePenalties(mk({ pen_a: 4, pen_b: 3 }), res)).toBe(1);
  });
  it("awards 0 when the shootout score is wrong", () => {
    expect(scorePenalties(mk({ pen_a: 5, pen_b: 4 }), res)).toBe(0);
  });
  it("awards 0 when there was no shootout", () => {
    expect(scorePenalties(mk({ pen_a: 4, pen_b: 3 }), mk({ ft_a: 2, ft_b: 0 }))).toBe(0);
  });
});

describe("scorePrediction (combined)", () => {
  it("stacks ET and penalties on top of FT — perfect match = 5", () => {
    const res = mk({ ft_a: 1, ft_b: 1, et_a: 0, et_b: 0, pen_a: 5, pen_b: 4, winner_team_id: "A" });
    const pred = mk({ ft_a: 1, ft_b: 1, et_a: 0, et_b: 0, pen_a: 5, pen_b: 4 });
    expect(scorePrediction(pred, res)).toBe(3 + 1 + 1);
  });
});

describe("scoreSpecial", () => {
  it("awards 5 for a correct, unchanged pick", () => {
    expect(scoreSpecial(true, true)).toBe(5);
  });
  it("awards 2 for a correct pick changed after groups", () => {
    expect(scoreSpecial(true, false)).toBe(2);
  });
  it("awards 0 for an incorrect pick", () => {
    expect(scoreSpecial(false, true)).toBe(0);
  });
});
