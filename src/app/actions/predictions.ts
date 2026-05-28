"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface PredictionInput {
  matchId: string;
  ft_a: number;
  ft_b: number;
  et_a?: number | null;
  et_b?: number | null;
  pen_a?: number | null;
  pen_b?: number | null;
  pen_winner_team_id?: string | null;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_GOALS = 99;
/** A valid goal/penalty count: a whole number within a sane range. */
const inRange = (v: number) => Number.isInteger(v) && v >= 0 && v <= MAX_GOALS;

/**
 * Create or update the signed-in user's prediction for a match.
 * RLS enforces ownership AND that kickoff hasn't passed (lock-at-kickoff);
 * a DB trigger prevents the client from setting points/scored.
 */
export async function savePrediction(input: PredictionInput): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Validate every numeric field (the DB columns are ints; reject decimals,
  // negatives and absurd values before they round/persist silently).
  if (!inRange(input.ft_a) || !inRange(input.ft_b)) {
    return { ok: false, error: "Full-time scores must be whole numbers from 0 to 99." };
  }
  for (const v of [input.et_a, input.et_b, input.pen_a, input.pen_b]) {
    if (v != null && !inRange(v)) {
      return { ok: false, error: "Scores must be whole numbers from 0 to 99." };
    }
  }

  const { error } = await supabase.from("predictions").upsert(
    {
      user_id: user.id,
      match_id: input.matchId,
      ft_a: input.ft_a,
      ft_b: input.ft_b,
      et_a: input.et_a ?? null,
      et_b: input.et_b ?? null,
      pen_a: input.pen_a ?? null,
      pen_b: input.pen_b ?? null,
      pen_winner_team_id: input.pen_winner_team_id ?? null,
    },
    { onConflict: "user_id,match_id" },
  );

  if (error) {
    // RLS denial here usually means the match has already kicked off. Log the
    // real cause server-side; show the user a friendly message.
    console.error("savePrediction failed", { matchId: input.matchId, error });
    return { ok: false, error: "Could not save — the match may have already started." };
  }

  revalidatePath("/matches");
  revalidatePath(`/matches/${input.matchId}`);
  return { ok: true };
}
