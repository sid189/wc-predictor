/* eslint-disable @next/next/no-img-element */

// Both images served from /public so they always render — no third-party
// hot-linking flakiness.
const WC_LOGO = "/wc2026-logo.png";
const MASCOTS = "/wc2026-mascots.png"; // Maple + Zayu + Clutch in one image

/** Festive header strip for the WC 2026 — official emblem alongside the three
 *  host-nation mascots (Maple, Zayu, Clutch) in a single image. */
export function TournamentBanner() {
  return (
    <div className="rounded-2xl border border-black/[.08] bg-gradient-to-b from-emerald-50/40 to-transparent p-4 dark:border-white/[.145] dark:from-emerald-900/10">
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
        <img
          src={WC_LOGO}
          alt="FIFA World Cup 2026"
          className="h-32 w-auto sm:h-40"
        />
        <img
          src={MASCOTS}
          alt="Maple, Zayu and Clutch — the 2026 FIFA World Cup mascots"
          className="h-24 w-auto sm:h-32"
        />
      </div>
      <p className="mt-3 text-center text-xs uppercase tracking-wider text-zinc-500">
        Canada · Mexico · United States · June 11 – July 19
      </p>
    </div>
  );
}
