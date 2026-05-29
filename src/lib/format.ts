import type { MatchStage } from "./types";

export const STAGE_LABELS: Record<MatchStage, string> = {
  group: "Group Stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_final: "Quarter-final",
  semi_final: "Semi-final",
  third_place: "Third place",
  final: "Final",
  friendly: "Friendly",
};

export function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function hasKickedOff(iso: string): boolean {
  return new Date(iso).getTime() <= Date.now();
}

/** "Thu, Jun 11" — used as a date group header. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "13:00" — time within a date group. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Prediction window: opens this many hours before kickoff, closes at kickoff.
 *  Mirrors the RLS rule in supabase/migrations/0006_prediction_window.sql — keep
 *  the two in sync if you ever change the window. */
export const PREDICTION_WINDOW_HOURS = 48;

export type WindowState = "pending" | "open" | "locked";

export function predictionWindow(kickoffIso: string): {
  state: WindowState;
  opensAt: Date;
  locksAt: Date;
} {
  const locksAt = new Date(kickoffIso);
  const opensAt = new Date(locksAt.getTime() - PREDICTION_WINDOW_HOURS * 3_600_000);
  const now = Date.now();
  if (now >= locksAt.getTime()) return { state: "locked", opensAt, locksAt };
  if (now < opensAt.getTime()) return { state: "pending", opensAt, locksAt };
  return { state: "open", opensAt, locksAt };
}
