// Pure scoring logic. No I/O — easy to unit-test (see scoring.test.ts).
//
// Rules:
//   FT (tiered, not additive):
//     - exact FT score        => +3  (this already implies correct outcome)
//     - else correct outcome  => +1  (win / lose / draw)
//   ET (knockout, additive):
//     - exact ET goals (both teams) => +1
//   Penalties (knockout, additive):
//     - exact shootout score => +1   (winner is implicit in the score)
//   Special picks (additive, scored once at tournament end):
//     - correct + still the pre-tournament pick => +5
//     - correct but changed after group stage    => +2
//
// Per-match ceiling: a single match going through FT → ET → penalties caps
// at +5 (3 + 1 + 1) if every component is exact.

export const POINTS = {
  FT_OUTCOME: 1,
  FT_EXACT: 3,
  ET_EXACT: 1,
  PEN_EXACT: 1,
  SPECIAL_INITIAL: 5,
  SPECIAL_CHANGED: 2,
} as const;

type Sign = -1 | 0 | 1;
const outcome = (a: number, b: number): Sign => (a > b ? 1 : a < b ? -1 : 0);

export interface ScoreInput {
  ft_a: number;
  ft_b: number;
  et_a: number | null;
  et_b: number | null;
  pen_a: number | null;
  pen_b: number | null;
  // For predictions this is pen_winner_team_id; for results it's winner_team_id.
  winner_team_id: string | null;
}

type FtScore = Pick<ScoreInput, "ft_a" | "ft_b">;

/** True when the full-time scoreline was predicted exactly (used for the +2 and
 *  for the leaderboard tie-break — "most exact scores"). */
export function isExactFullTime(pred: FtScore, res: FtScore): boolean {
  return pred.ft_a === res.ft_a && pred.ft_b === res.ft_b;
}

/** Full-time component: exact score (2) takes priority over correct outcome (1). */
export function scoreFullTime(pred: FtScore, res: FtScore): number {
  if (isExactFullTime(pred, res)) return POINTS.FT_EXACT;
  if (outcome(pred.ft_a, pred.ft_b) === outcome(res.ft_a, res.ft_b))
    return POINTS.FT_OUTCOME;
  return 0;
}

/** Extra-time component: +1 only if both ET goal counts match exactly. */
export function scoreExtraTime(pred: ScoreInput, res: ScoreInput): number {
  if (res.et_a == null || res.et_b == null) return 0; // match didn't go to ET
  if (pred.et_a == null || pred.et_b == null) return 0; // user made no ET pick
  return pred.et_a === res.et_a && pred.et_b === res.et_b ? POINTS.ET_EXACT : 0;
}

/** Penalty component: +1 only if the exact shootout score is predicted.
 *  The winner is implicit in the score (whoever scored more wins). */
export function scorePenalties(pred: ScoreInput, res: ScoreInput): number {
  if (res.pen_a == null || res.pen_b == null) return 0; // no shootout
  if (pred.pen_a == null || pred.pen_b == null) return 0; // user made no penalty pick
  return pred.pen_a === res.pen_a && pred.pen_b === res.pen_b ? POINTS.PEN_EXACT : 0;
}

/** Total points for one match prediction against the recorded result. */
export function scorePrediction(pred: ScoreInput, res: ScoreInput): number {
  return (
    scoreFullTime(pred, res) +
    scoreExtraTime(pred, res) +
    scorePenalties(pred, res)
  );
}

/**
 * Points for a special pick (tournament winner or golden boot).
 * `correct` = the pick matches the actual result; `isInitial` = the pick is
 * still the original pre-tournament selection.
 */
export function scoreSpecial(correct: boolean, isInitial: boolean): number {
  if (!correct) return 0;
  return isInitial ? POINTS.SPECIAL_INITIAL : POINTS.SPECIAL_CHANGED;
}
