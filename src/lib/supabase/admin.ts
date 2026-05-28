import "server-only";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEnv } from "./env";

/**
 * Service-role Supabase client. BYPASSES RLS — use only in trusted server code
 * (scoring, admin writes) and ONLY after verifying the caller is an admin.
 *
 * The service-role key must never be sent to the browser; it is read from a
 * server-only env var (no NEXT_PUBLIC_ prefix).
 */
export function createAdminClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Node < 22 has no native WebSocket; supply one for @supabase/realtime-js
    // (we don't use realtime, but the client constructs it anyway).
    realtime: { transport: ws as unknown as typeof WebSocket },
  });
}
