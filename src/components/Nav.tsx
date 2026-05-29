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
    { href: "/matches", label: "Matches" },
    { href: "/friendlies", label: "Friendlies" },
    { href: "/ucl", label: "UCL" },
    { href: "/standings", label: "Standings" },
    { href: "/special", label: "Winner & Boot" },
    { href: "/leaderboard", label: "Leaderboard" },
  ];

  return (
    <header className="border-b border-black/[.08] dark:border-white/[.145]">
      <nav className="mx-auto flex w-full max-w-3xl items-center gap-4 px-4 py-3 text-sm">
        <Link href="/matches" className="font-semibold tracking-tight">
          🏆 Predictor
        </Link>
        <div className="flex flex-1 items-center gap-3">
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
        <span className="hidden text-zinc-500 sm:inline">{profile?.display_name}</span>
        <form action="/auth/signout" method="post">
          <button className="rounded-full border border-black/[.08] px-3 py-1 hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]">
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
