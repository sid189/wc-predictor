import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/** Top navigation. Hidden when signed out (e.g. on /login). */
export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();
  // No profile = not on the guest list; the /not-invited page handles them.
  if (!profile) return null;

  const links = [
    { href: "/matches?day=today", label: "Matches" },
    { href: "/standings", label: "Standings" },
    { href: "/stats", label: "Stats" },
    { href: "/special", label: "Winner & Boot" },
    { href: "/leaderboard", label: "Leaderboard" },
    { href: "/hall-of-fame", label: "Hall of Fame" },
  ];

  return (
    <header className="border-b border-black/[.08] dark:border-white/[.145]">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 text-sm">
        <Link
          href="/matches?day=today"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/predictions-logo.png"
            alt="Predictions Tournament"
            className="h-8 w-auto"
          />
          <span className="hidden lg:inline">Predictor</span>
        </Link>
        {/* min-w-0 + overflow-x-auto lets the link strip scroll horizontally on
            narrow viewports instead of wrapping the labels onto two lines. */}
        <div className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto whitespace-nowrap">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-zinc-500 hover:text-foreground">
              {l.label}
            </Link>
          ))}
          {profile?.is_admin && (
            <Link href="/admin" className="text-zinc-500 hover:text-foreground">
              Admin
            </Link>
          )}
        </div>
        <span className="hidden max-w-[14ch] shrink-0 truncate text-zinc-500 md:inline">
          {profile?.display_name}
        </span>
        <form action="/auth/signout" method="post" className="shrink-0">
          <button className="whitespace-nowrap rounded-full border border-black/[.08] px-3 py-1 hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]">
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
