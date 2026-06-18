import { Flag } from "@/components/Flag";
import { LocalTime } from "@/components/LocalTime";
import { fetchTopPlayers, type StatRow } from "@/lib/stats";

// 10-min ISR cache so we're not hammering ESPN on every page view.
export const revalidate = 600;

export default async function StatsPage() {
  const stats = await fetchTopPlayers();

  if (!stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Tournament Stats</h1>
        <p className="text-sm text-zinc-500">
          Couldn&apos;t fetch stats right now. Try again in a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">Tournament Stats</h1>
        <span className="text-xs text-zinc-400">
          updated <LocalTime iso={stats.fetchedAt} preset="time" />
        </span>
      </div>

      <Leaderboard title="🏆 Top Scorers" entries={stats.goals} unit="goals" />
      <Leaderboard title="🅰️ Top Assists" entries={stats.assists} unit="assists" />
      <Leaderboard title="🟨 Yellow Cards" entries={stats.yellowCards} unit="" />
      <Leaderboard title="🟥 Red Cards" entries={stats.redCards} unit="" />

      <p className="text-xs text-zinc-400">
        Source: ESPN. Refreshes every ~10 minutes.
      </p>
    </div>
  );
}

function Leaderboard({
  title,
  entries,
  unit,
}: {
  title: string;
  entries: StatRow[];
  unit: string;
}) {
  if (entries.length === 0) {
    return (
      <section>
        <h2 className="mb-2 font-semibold">{title}</h2>
        <p className="text-sm text-zinc-500">No data yet.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <ol className="divide-y divide-black/[.06] rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
        {entries.map((e, i) => (
          <li
            key={`${e.playerName}-${i}`}
            className="flex items-center justify-between gap-3 p-3 text-sm"
          >
            <span className="inline-flex items-center gap-2">
              <span className="w-5 text-right text-zinc-400">{i + 1}</span>
              <Flag teamName={e.teamName} size={18} />
              <span className="font-medium">{e.playerName}</span>
              <span className="text-xs text-zinc-500">{e.teamName}</span>
            </span>
            <span className="font-mono text-zinc-700 dark:text-zinc-300">
              {e.value}
              {unit && <span className="ml-1 text-xs text-zinc-500">{unit}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
