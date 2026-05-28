"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SpecialKind } from "@/lib/types";
import type { ActionResult } from "./predictions";

const NAME_MAX = 100;

/**
 * Save the signed-in user's tournament-winner (team id) or golden-boot (free
 * text player name) pick.
 *
 * Security:
 *  - Server-side trim + length validation rejects empty or oversized input.
 *  - Storage uses Supabase JS (PostgREST) which parameterises all values, so
 *    `selection` is never interpolated into SQL.
 *  - All rendering of the saved value is via React JSX, which contextually
 *    HTML-escapes by default — no innerHTML / dangerouslySetInnerHTML anywhere.
 *
 * A DB trigger gates edit windows (locked during group stage) and sets
 * is_initial (true before kickoff → +5, false after group stage → +2).
 */
export async function saveSpecialPick(
  kind: SpecialKind,
  selection: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const row: {
    user_id: string;
    kind: SpecialKind;
    team_id: string | null;
    player_id: string | null;
    golden_boot_name: string | null;
  } = {
    user_id: user.id,
    kind,
    team_id: null,
    player_id: null,
    golden_boot_name: null,
  };

  if (kind === "winner") {
    if (!selection) return { ok: false, error: "Pick a team." };
    row.team_id = selection;
  } else {
    const name = selection.trim();
    if (!name) return { ok: false, error: "Enter a player name." };
    if (name.length > NAME_MAX) {
      return { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` };
    }
    row.golden_boot_name = name;
  }

  const { error } = await supabase
    .from("special_predictions")
    .upsert(row, { onConflict: "user_id,kind" });

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
