"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SpecialKind } from "@/lib/types";
import type { ActionResult } from "./predictions";

/**
 * Save the signed-in user's tournament-winner or golden-boot pick.
 * A DB trigger gates the edit windows (locked during the group stage) and sets
 * is_initial (true before kickoff => +5, false after group stage => +2).
 */
export async function saveSpecialPick(
  kind: SpecialKind,
  selectionId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase.from("special_predictions").upsert(
    {
      user_id: user.id,
      kind,
      team_id: kind === "winner" ? selectionId : null,
      player_id: kind === "golden_boot" ? selectionId : null,
    },
    { onConflict: "user_id,kind" },
  );

  if (error) {
    console.error("saveSpecialPick failed", { kind, error });
    const m = error.message ?? "";
    if (m.includes("already used your one change")) {
      return { ok: false, error: "You've already used your one change after the group stage." };
    }
    if (m.includes("locked during the group stage")) {
      return { ok: false, error: "Picks are locked during the group stage." };
    }
    return { ok: false, error: "Could not save your pick." };
  }

  revalidatePath("/special");
  return { ok: true };
}
