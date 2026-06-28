import { createClient } from "@/lib/supabase/server";
import { SpecialPicks } from "@/components/SpecialPicks";
import { Flag } from "@/components/Flag";
import type { Profile, SpecialPrediction, Team, TournamentConfig } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SpecialPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: config },
    { data: allTeams },
    { data: picks },
    { data: submitters },
    { data: allPicks },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("tournament_config").select("*").eq("id", 1).single(),
    // Need all teams here so we can resolve any team_id (including
    // historical / non-WC teams) for the reveal display.
    supabase.from("teams").select("id, name, group_label").order("name"),
    supabase.from("special_predictions").select("*").eq("user_id", user!.id),
    // RPC returns just kind + name per submitter — no team/boot values leak.
    supabase.rpc("special_submitters"),
    // After tournament start, RLS lets everyone read every row. Before, it
    // returns just the caller's own row.
    supabase.from("special_predictions").select("*"),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const submitterRows = (submitters ?? []) as {
    kind: SpecialPrediction["kind"];
    user_id: string;
    display_name: string;
  }[];
  const winnerSubmitters = submitterRows
    .filter((s) => s.kind === "winner")
    .map((s) => s.display_name)
    .sort();
  const bootSubmitters = submitterRows
    .filter((s) => s.kind === "golden_boot")
    .map((s) => s.display_name)
    .sort();

  const cfg = config as TournamentConfig | null;
  const now = Date.now();
  const start = cfg?.starts_at ? new Date(cfg.starts_at).getTime() : null;
  const groupEnd = cfg?.group_stage_ends_at
    ? new Date(cfg.group_stage_ends_at).getTime()
    : null;
  const reopenUntil = cfg?.special_reopen_until
    ? new Date(cfg.special_reopen_until).getTime()
    : null;

  const preTournament = start == null || now <= start;
  const postGroup = start != null && now > start && groupEnd != null && now > groupEnd;
  const inReopenWindow = !preTournament && !postGroup && reopenUntil != null && now <= reopenUntil;
  const inGroupStage = !preTournament && !postGroup && !inReopenWindow;

  let phaseNote = "Pick before the tournament starts — worth +5 if correct.";
  if (inGroupStage) {
    phaseNote = "Picks are locked during the group stage.";
  } else if (inReopenWindow) {
    const deadline = new Date(reopenUntil!).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      timeZone: "America/New_York", timeZoneName: "short",
    });
    phaseNote = `Change window open until ${deadline} — worth +2 if correct. You still keep one more change after the group stage ends.`;
  } else if (postGroup) {
    phaseNote = "Group stage is over — you may change each pick once more (worth +2 if correct).";
  }

  const winner = (picks ?? []).find((p: SpecialPrediction) => p.kind === "winner");
  const boot = (picks ?? []).find((p: SpecialPrediction) => p.kind === "golden_boot");

  const canEdit = (pick?: SpecialPrediction) =>
    preTournament || inReopenWindow || (postGroup && !(pick?.post_group_change_used ?? false));

  // Build lookup maps for the reveal section.
  const teamMap = new Map(
    ((allTeams ?? []) as Pick<Team, "id" | "name" | "group_label">[]).map((t) => [
      t.id,
      t.name,
    ]),
  );
  const nameMap = new Map(
    ((profiles ?? []) as Pick<Profile, "id" | "display_name">[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  );
  const allPicksRows = (allPicks ?? []) as SpecialPrediction[];
  const revealedWinners = allPicksRows
    .filter((p) => p.kind === "winner")
    .map((p) => ({
      name: nameMap.get(p.user_id) ?? "?",
      teamId: p.team_id,
      teamName: p.team_id ? (teamMap.get(p.team_id) ?? "—") : "—",
      isInitial: p.is_initial,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const revealedBoots = allPicksRows
    .filter((p) => p.kind === "golden_boot")
    .map((p) => ({
      name: nameMap.get(p.user_id) ?? "?",
      bootName: p.golden_boot_name ?? "—",
      isInitial: p.is_initial,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Show the reveal section once the tournament has actually started AND we
  // can see picks for someone other than the current viewer (i.e. RLS is
  // letting them through). If preTournament, the query returns just self —
  // skip the section to avoid pretending it's a reveal.
  const showReveal =
    !preTournament &&
    allPicksRows.some((p) => p.user_id !== user!.id);

  // For the picker dropdown, only 2026 WC qualifiers.
  const wcTeamOptions = ((allTeams ?? []) as Pick<Team, "id" | "name" | "group_label">[])
    .filter((t) => t.group_label != null)
    .map((t) => ({ id: t.id, label: t.name }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Winner & Golden Boot</h1>
        <p className="mt-1 text-sm text-zinc-500">{phaseNote}</p>
      </div>

      <SpecialPicks
        winnerEditable={canEdit(winner)}
        bootEditable={canEdit(boot)}
        teams={wcTeamOptions}
        initialWinner={winner?.team_id ?? ""}
        initialBoot={boot?.golden_boot_name ?? ""}
      />

      <section className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
        <h2 className="text-sm font-semibold text-zinc-500">
          Tournament Winner submitted by ({winnerSubmitters.length})
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {winnerSubmitters.length > 0 ? winnerSubmitters.join(", ") : "—"}
        </p>
        <h2 className="mt-4 text-sm font-semibold text-zinc-500">
          Golden Boot submitted by ({bootSubmitters.length})
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {bootSubmitters.length > 0 ? bootSubmitters.join(", ") : "—"}
        </p>
        {!showReveal && (
          <p className="mt-3 text-xs text-zinc-400">
            Actual picks stay hidden until the tournament kicks off.
          </p>
        )}
      </section>

      {showReveal && (
        <section className="space-y-4 rounded-2xl border border-emerald-600/30 bg-emerald-600/5 p-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              🏆 Tournament Winner — revealed
            </h2>
            <ul className="mt-2 divide-y divide-emerald-600/15">
              {revealedWinners.map((r) => (
                <li
                  key={r.name + r.teamId}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="inline-flex items-center gap-2">
                    <Flag teamName={r.teamName} size={18} />
                    <span>{r.teamName}</span>
                    <span
                      className={`text-xs ${r.isInitial ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}`}
                    >
                      {r.isInitial ? "original (+5)" : "changed (+2)"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              ⚽ Golden Boot — revealed
            </h2>
            <ul className="mt-2 divide-y divide-emerald-600/15">
              {revealedBoots.map((r) => (
                <li
                  key={r.name + r.bootName}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-medium">{r.name}</span>
                  <span className="inline-flex items-center gap-2">
                    <span>{r.bootName}</span>
                    <span
                      className={`text-xs ${r.isInitial ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}`}
                    >
                      {r.isInitial ? "original (+5)" : "changed (+2)"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
