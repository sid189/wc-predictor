import { createClient } from "@/lib/supabase/server";
import { SpecialPicks } from "@/components/SpecialPicks";
import type { Player, SpecialPrediction, Team, TournamentConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SpecialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: config }, { data: teams }, { data: players }, { data: picks }] =
    await Promise.all([
      supabase.from("tournament_config").select("*").eq("id", 1).single(),
      supabase.from("teams").select("id, name").order("name"),
      supabase.from("players").select("id, name, team_id").order("name"),
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

  // Editable pre-tournament (always) or post-group (until that pick's one change is used).
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
        players={(players ?? []).map((p: Pick<Player, "id" | "name">) => ({
          id: p.id,
          label: p.name,
        }))}
        initialWinner={winner?.team_id ?? ""}
        initialBoot={boot?.player_id ?? ""}
      />
    </div>
  );
}
