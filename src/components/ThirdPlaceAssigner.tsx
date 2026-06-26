"use client";

import { useState, useTransition } from "react";
import { saveThirdPlace, triggerThirdPlaceAssignment } from "@/app/actions/admin";
import { THIRD_PLACE_SLOTS } from "@/lib/thirdplace";

interface Fixture {
  token: string;
  kickoff_at: string;
  city: string | null;
  opponent: string;
  assignedTeam: string | null;
}

interface Props {
  ready: boolean;
  best8: { group: string; teamName: string }[];
  initial: Record<string, string>;
  autoAssigned: boolean;
  fixtures: Fixture[];
}

export function ThirdPlaceAssigner({ ready, best8, initial, autoAssigned, fixtures }: Props) {
  const [map, setMap] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const best8Groups = new Set(best8.map((b) => b.group));
  const nameOf = (g: string) => best8.find((b) => b.group === g)?.teamName ?? g;

  function confirm() {
    setMsg("");
    const values = Object.values(map).filter(Boolean);
    if (values.length !== 8 || new Set(values).size !== 8) {
      setMsg("Pick 8 distinct groups.");
      return;
    }
    start(async () => {
      const res = await saveThirdPlace(map);
      setMsg(res.ok ? "Slots seeded." : res.error);
    });
  }

  function runAutoAssign() {
    setMsg("");
    start(async () => {
      const res = await triggerThirdPlaceAssignment();
      if (res.ok) {
        setMsg("Auto-assignment applied.");
      } else {
        setMsg(res.error);
      }
    });
  }

  const sel =
    "rounded border border-black/[.12] bg-transparent px-1 py-1 text-sm dark:border-white/[.2]";

  const statusNote = autoAssigned
    ? "Slots were auto-assigned by the cron. Verify below and re-seed if anything needs correcting."
    : 'The cron will auto-assign once all groups finish. Use "Run auto-assign" to trigger it now, or set slots manually.';

  return (
    <div className="space-y-5">

      {/* Status banner */}
      <p className={`text-xs ${autoAssigned ? "text-emerald-600" : "text-zinc-500"}`}>
        {statusNote}
      </p>

      {/* Current fixture state */}
      {fixtures.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-zinc-500">Current R32 third-place fixtures</p>
          <table className="w-full text-xs">
            <thead className="text-left text-zinc-400">
              <tr className="border-b border-black/[.06] dark:border-white/[.08]">
                <th className="py-1 pr-3">Slot</th>
                <th className="pr-3">vs</th>
                <th className="pr-3">City</th>
                <th className="pr-3">Kickoff (UTC)</th>
                <th>Assigned team</th>
              </tr>
            </thead>
            <tbody>
              {fixtures.map((f) => (
                <tr
                  key={f.token}
                  className="border-b border-black/[.04] dark:border-white/[.06]"
                >
                  <td className="py-1 pr-3 font-mono text-zinc-500">{f.token}</td>
                  <td className="pr-3">{f.opponent}</td>
                  <td className="pr-3 text-zinc-500">{f.city ?? "—"}</td>
                  <td className="pr-3 text-zinc-500">
                    {new Date(f.kickoff_at).toISOString().slice(0, 16).replace("T", " ")}
                  </td>
                  <td>
                    {f.assignedTeam ? (
                      <span className="font-medium text-emerald-600">{f.assignedTeam}</span>
                    ) : (
                      <span className="text-zinc-400">TBD</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Run auto-assign */}
      <div className="flex items-center gap-3">
        <button
          onClick={runAutoAssign}
          disabled={pending}
          className="rounded-full border border-black/[.12] px-4 py-2 text-sm font-medium hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-white/[.06]"
        >
          {pending ? "Running…" : "Run auto-assign"}
        </button>
        <span className="text-xs text-zinc-500">
          Works as soon as 8+ groups are complete. Always overwrites current slots.
        </span>
      </div>

      {/* Manual override — only available once all groups are done */}
      {ready ? (
        <details className="space-y-3">
          <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-foreground">
            Manual override
          </summary>
          <p className="text-xs text-zinc-500">
            Each slot&apos;s dropdown is limited to the valid groups per FIFA&apos;s bracket rules.
            Confirm the assignment matches the official bracket, then seed.
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
          </div>
        </details>
      ) : (
        <p className="text-xs text-zinc-400">
          Manual override available once all 12 groups are complete.
        </p>
      )}

      {msg && (
        <p className={`text-xs ${msg.includes("applied") || msg.includes("eeded") ? "text-emerald-600" : "text-red-600"}`}>
          {msg}
        </p>
      )}
    </div>
  );
}
