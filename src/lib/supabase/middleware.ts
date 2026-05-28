import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and forwards the
 * updated auth cookies. Also gates the app: unauthenticated users are sent to
 * /login (except for the login + auth callback routes themselves).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.redirect(url);
  };

  const isAuthRoute = pathname.startsWith("/auth");
  const isLogin = pathname.startsWith("/login");
  const isNotInvited = pathname.startsWith("/not-invited");

  // Signed out: only /login and the OAuth callback are reachable.
  if (!user) {
    return isLogin || isAuthRoute ? response : redirectTo("/login");
  }

  // Let the OAuth callback finish (it creates the profile).
  if (isAuthRoute) return response;

  // Signed in: access requires being on the guest list (i.e. having a profile).
  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  const invited = Boolean(profile);

  if (!invited) {
    return isNotInvited ? response : redirectTo("/not-invited");
  }

  // Invited: keep them out of the login / not-invited pages.
  if (isLogin || isNotInvited) return redirectTo("/matches");

  return response;
}
