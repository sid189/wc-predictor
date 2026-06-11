/* eslint-disable @next/next/no-img-element */
// Wikipedia's Special:FilePath redirects to the canonical image URL.
const wiki = (file: string) =>
  `https://en.wikipedia.org/wiki/Special:FilePath/${file}`;

const WC_LOGO = wiki("2026_FIFA_World_Cup.svg");

const MASCOTS = [
  { name: "Maple", country: "Canada", file: "Maple_(2026_FIFA_World_Cup_mascot).png" },
  { name: "Zayu", country: "Mexico", file: "Zayu_(2026_FIFA_World_Cup_mascot).png" },
  { name: "Clutch", country: "United_States", file: "Clutch_(2026_FIFA_World_Cup_mascot).png" },
];

/** Festive header strip for the WC 2026 — official emblem flanked by the three
 *  host-nation mascots (Maple, Zayu, Clutch). */
export function TournamentBanner() {
  return (
    <div className="rounded-2xl border border-black/[.08] bg-gradient-to-b from-emerald-50/40 to-transparent p-4 dark:border-white/[.145] dark:from-emerald-900/10">
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
        <img
          src={wiki(MASCOTS[0].file)}
          alt={`${MASCOTS[0].name} (${MASCOTS[0].country})`}
          className="hidden h-24 w-auto sm:block"
        />
        <img
          src={WC_LOGO}
          alt="FIFA World Cup 2026"
          className="h-32 w-auto sm:h-40"
        />
        <div className="flex items-center gap-4">
          <img
            src={wiki(MASCOTS[1].file)}
            alt={`${MASCOTS[1].name} (${MASCOTS[1].country})`}
            className="h-24 w-auto"
          />
          <img
            src={wiki(MASCOTS[2].file)}
            alt={`${MASCOTS[2].name} (${MASCOTS[2].country})`}
            className="h-24 w-auto"
          />
        </div>
      </div>
      <p className="mt-3 text-center text-xs uppercase tracking-wider text-zinc-500">
        Canada · Mexico · United States · June 11 – July 19
      </p>
    </div>
  );
}
