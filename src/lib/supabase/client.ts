import { createBrowserClient } from "@supabase/ssr";
import { requireEnv } from "./env";

/** Supabase client for use in Client Components (browser). Uses the anon key. */
export function createClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
