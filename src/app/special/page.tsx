import { createClient } from "@/lib/supabase/server";
import { SpecialPicks } from "@/components/SpecialPicks";
import type { SpecialPrediction, Team, TournamentConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SpecialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: config }, { data: teams }, { data: picks }] = await Promise.all([
    supabase.from("tournament_config").select("*").eq("id", 1).single(),
    // Only 2026 WC qualifiers — they're the ones with a group letter set.
    // Excludes club sides (PSG, Arsenal) and any extra national teams added
    // for past Hall-of-Fame entries or friendlies (e.g. Italy, Gambia).
    supabase
      .from("teams")
      .select("id, name")
      .not("group_label", "is", null)
      .order("name"),
    supabase.from("special_predictions").select("*").eq("user_id", user!.id),
  ]);

  const cfg = config as TournamentConfig | null;
  const now = Date.now();
  const start = cfg?.starts_at ? new Date(cfg.starts_at).getTime() : null;
  const groupEnd = cfg?.group_stage_ends_at
    ? new Date(cfg.group_stage_ends_at).getTime()
    : null;

  const preTournament = start == null || now <= start;
  const postGroup = start != null && now > start && groupEnd != null && now > groupEnd;
  const inGroupStage = !preTournament && !postGroup;

  let phaseNote = "Pick before the tournament starts — worth +5 if correct.";
  if (inGroupStage) phaseNote = "Picks are locked during the group stage.";
  else if (postGroup)
    phaseNote = "Group stage is over — you may change each pick once more (worth +2 if correct).";

  const winner = (picks ?? []).find((p: SpecialPrediction) => p.kind === "winner");
  const boot = (picks ?? []).find((p: SpecialPrediction) => p.kind === "golden_boot");

  const canEdit = (pick?: SpecialPrediction) =>
    preTournament || (postGroup && !(pick?.post_group_change_used ?? false));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Winner & Golden Boot</h1>
        <p className="mt-1 text-sm text-zinc-500">{phaseNote}</p>
      </div>
      <SpecialPicks
        winnerEditable={canEdit(winner)}
        bootEditable={canEdit(boot)}
        teams={(teams ?? []).map((t: Pick<Team, "id" | "name">) => ({ id: t.id, label: t.name }))}
        initialWinner={winner?.team_id ?? ""}
        initialBoot={boot?.golden_boot_name ?? ""}
      />
    </div>
  );
}
