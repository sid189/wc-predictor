/* eslint-disable @next/next/no-img-element */
import { Flag } from "@/components/Flag";

interface Winner {
  year: number;
  name: string;
  tournament: string;
  tournamentLogo: string;
  championTeam: string;
  note?: string;
}

// Wikipedia's Special:FilePath redirects to the canonical image URL — more
// stable than caching upload.wikimedia.org thumbnail paths.
const wiki = (file: string) =>
  `https://en.wikipedia.org/wiki/Special:FilePath/${file}`;

// Hardcoded — historical and rarely changes. Append a new row each cycle.
const WINNERS: Winner[] = [
  {
    year: 2018,
    name: "Soham Karkhanis",
    note: "*",
    tournament: "FIFA World Cup 2018",
    tournamentLogo: wiki("2018_FIFA_World_Cup.svg"),
    championTeam: "France",
  },
  {
    year: 2021,
    name: "Siddharth Deshpande",
    tournament: "UEFA EURO 2020",
    tournamentLogo: wiki("UEFA_Euro_2020_logo.svg"),
    championTeam: "Italy",
  },
  {
    year: 2022,
    name: "Varun Gajendragadkar",
    tournament: "FIFA World Cup 2022",
    tournamentLogo: wiki("2022_FIFA_World_Cup.svg"),
    championTeam: "Argentina",
  },
  {
    year: 2024,
    name: "Soham Karkhanis",
    tournament: "UEFA Euro 2024",
    tournamentLogo: wiki("UEFA_Euro_2024_Logo.svg"),
    championTeam: "Spain",
  },
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
              <td className="text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-2">
                  <img
                    src={w.tournamentLogo}
                    width={22}
                    height={22}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="inline-block h-[22px] w-[22px] object-contain"
                  />
                  {w.tournament}
                </span>
              </td>
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
