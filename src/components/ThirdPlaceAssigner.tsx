"use client";

import { useState, useTransition } from "react";
import { saveThirdPlace } from "@/app/actions/admin";
import { THIRD_PLACE_SLOTS } from "@/lib/thirdplace";

interface Props {
  ready: boolean; // all 12 groups complete
  best8: { group: string; teamName: string }[];
  initial: Record<string, string>; // slot token -> group letter (a valid suggestion)
}

export function ThirdPlaceAssigner({ ready, best8, initial }: Props) {
  const [map, setMap] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const best8Groups = new Set(best8.map((b) => b.group));
  const nameOf = (g: string) => best8.find((b) => b.group === g)?.teamName ?? g;

  if (!ready) {
    return (
      <p className="text-sm text-zinc-500">
        Available once all 12 groups are complete and the best-8 thirds are known.
      </p>
    );
  }

  function confirm() {
    setMsg("");
    const values = Object.values(map).filter(Boolean);
    if (values.length !== 8 || new Set(values).size !== 8) {
      setMsg("Pick 8 distinct groups.");
      return;
    }
    start(async () => {
      const res = await saveThirdPlace(map);
      setMsg(res.ok ? "Seeded third-place slots." : res.error);
    });
  }

  const sel =
    "rounded border border-black/[.12] bg-transparent px-1 py-1 text-sm dark:border-white/[.2]";

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Confirm which group&apos;s third-placed team fills each slot (options are limited to the
        valid groups). Match this to the official bracket, then seed.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {THIRD_PLACE_SLOTS.map((slot) => {
          const opts = slot.groups.filter((g) => best8Groups.has(g));
          return (
            <label key={slot.token} className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-zinc-500">{slot.token}</span>
              <select
                className={sel}
                value={map[slot.token] ?? ""}
                onChange={(e) => setMap((prev) => ({ ...prev, [slot.token]: e.target.value }))}
              >
                <option value="">—</option>
                {opts.map((g) => (
                  <option key={g} value={g}>
                    {g} · {nameOf(g)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={confirm}
          disabled={pending}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Seeding…" : "Confirm & seed"}
        </button>
        {msg && <span className="text-xs text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}
