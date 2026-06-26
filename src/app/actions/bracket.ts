"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "./predictions";

const KO_STAGES = [
  "round_of_32",
  "round_of_16",
  "quarter_final",
  "semi_final",
  "third_place",
  "final",
];

export async function saveBracket(
  picks: Record<string, string>, // matchId → predicted_winner_team_id
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Lock check: first R32 kickoff in the past → bracket is locked.
  const { data: firstR32 } = await supabase
    .from("matches")
    .select("kickoff_at")
    .eq("stage", "round_of_32")
    .order("kickoff_at")
    .limit(1)
    .single();

  if (firstR32 && new Date(firstR32.kickoff_at) <= new Date()) {
    return { ok: false, error: "Bracket is locked — R32 has started." };
  }

  // Validate: we must receive exactly the set of KO match IDs.
  const { data: koMatches } = await supabase
    .from("matches")
    .select("id")
    .in("stage", KO_STAGES);

  const validMatchIds = new Set((koMatches ?? []).map((m: { id: string }) => m.id));
  const submittedIds = Object.keys(picks);

  if (submittedIds.length !== validMatchIds.size) {
    return {
      ok: false,
      error: `Expected ${validMatchIds.size} picks, received ${submittedIds.length}. Fill in every round.`,
    };
  }

  for (const id of submittedIds) {
    if (!validMatchIds.has(id)) {
      return { ok: false, error: "Invalid match ID in submission." };
    }
  }

  const rows = submittedIds.map((match_id) => ({
    user_id: user.id,
    match_id,
    predicted_winner_team_id: picks[match_id],
  }));

  const { error } = await supabase
    .from("bracket_picks")
    .upsert(rows, { onConflict: "user_id,match_id" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/bracket");
  return { ok: true };
}
