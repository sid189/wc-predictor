"use client";

import { useRealtimeRefresh } from "@/lib/realtime-refresh";

/** Drop-in component that keeps every page live-updated against the DB. */
export function RealtimeBridge() {
  useRealtimeRefresh(["match_results", "predictions", "special_predictions"]);
  return null;
}
