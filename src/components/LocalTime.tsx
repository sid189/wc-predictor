"use client";

import { useEffect, useState } from "react";

interface Props {
  iso: string;
  preset?: "datetime" | "date" | "time";
  className?: string;
}

const PRESETS: Record<NonNullable<Props["preset"]>, Intl.DateTimeFormatOptions> = {
  datetime: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
  date: { weekday: "short", month: "short", day: "numeric" },
  time: { hour: "2-digit", minute: "2-digit" },
};

function fmt(iso: string, preset: NonNullable<Props["preset"]>, timeZone?: string) {
  return new Date(iso).toLocaleString(undefined, {
    ...PRESETS[preset],
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * Renders an ISO timestamp in the **browser's** timezone. Initial server-side
 * paint is in UTC for hydration stability; useEffect immediately swaps to the
 * user's local timezone after mount (the suppressHydrationWarning permits the
 * brief mismatch).
 */
export function LocalTime({ iso, preset = "datetime", className }: Props) {
  const [text, setText] = useState(() => fmt(iso, preset, "UTC"));
  useEffect(() => {
    setText(fmt(iso, preset));
  }, [iso, preset]);
  return (
    <span suppressHydrationWarning className={className}>
      {text}
    </span>
  );
}
