import { Flag } from "@/components/Flag";

interface Winner {
  year: number;
  name: string;
  tournament: string;
  championTeam: string;
  note?: string;
}

// Hardcoded — historical and rarely changes. Append a new row each cycle.
const WINNERS: Winner[] = [
  { year: 2018, name: "Soham Karkhanis", note: "*", tournament: "FIFA World Cup 2018", championTeam: "France" },
  { year: 2021, name: "Siddharth Deshpande", tournament: "UEFA EURO 2020", championTeam: "Italy" },
  { year: 2022, name: "Varun Gajendragadkar", tournament: "FIFA World Cup 2022", championTeam: "Argentina" },
  { year: 2024, name: "Soham Karkhanis", tournament: "UEFA Euro 2024", championTeam: "Spain" },
];

export default function HallOfFamePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Hall of Fame</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Past winners of the Predictions Tournament.
        </p>
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-black/[.08] dark:border-white/[.145]">
            <th className="py-2">Year</th>
            <th>Champion</th>
            <th>Tournament</th>
            <th>Winning team</th>
          </tr>
        </thead>
        <tbody>
          {WINNERS.map((w) => (
            <tr
              key={`${w.year}-${w.name}`}
              className="border-b border-black/[.05] dark:border-white/[.08]"
            >
              <td className="py-2 font-mono text-zinc-500">{w.year}</td>
              <td className="font-medium">
                {w.name}
                {w.note && <span className="text-zinc-400">{w.note}</span>}
              </td>
              <td className="text-zinc-600 dark:text-zinc-400">{w.tournament}</td>
              <td>
                <span className="inline-flex items-center gap-1.5">
                  <Flag teamName={w.championTeam} size={18} />
                  {w.championTeam}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
