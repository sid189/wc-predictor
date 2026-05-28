"use client";

import { useState, useTransition } from "react";
import { saveSpecialPick } from "@/app/actions/special";
import type { SpecialKind } from "@/lib/types";

interface Option {
  id: string;
  label: string;
}

interface Props {
  winnerEditable: boolean;
  bootEditable: boolean;
  teams: Option[];
  initialWinner: string;
  initialBoot: string;
}

const box =
  "rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]";

/** Tournament-winner picker (constrained <select>). */
function TeamPicker({
  initial,
  editable,
  teams,
}: {
  initial: string;
  editable: boolean;
  teams: Option[];
}) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!value) return;
    setMsg(null);
    start(async () => {
      const res = await saveSpecialPick("winner", value);
      setMsg(res.ok ? { ok: true, text: "Saved!" } : { ok: false, text: res.error });
    });
  }

  return (
    <div className={box}>
      <h2 className="font-medium">Tournament Winner</h2>
      <div className="mt-3 flex items-center gap-3">
        <select
          value={value}
          disabled={!editable}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-lg border border-black/[.12] bg-transparent px-2 py-2 disabled:opacity-60 dark:border-white/[.2]"
        >
          <option value="">— choose —</option>
          {teams.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {editable && (
          <button
            onClick={save}
            disabled={pending || !value}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

/** Golden-boot picker (free-text). Server validates length and trims. */
function GoldenBootPicker({
  initial,
  editable,
}: {
  initial: string;
  editable: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    const trimmed = value.trim();
    if (!trimmed) {
      setMsg({ ok: false, text: "Enter a player name." });
      return;
    }
    setMsg(null);
    start(async () => {
      const res = await saveSpecialPick("golden_boot", trimmed);
      setMsg(res.ok ? { ok: true, text: "Saved!" } : { ok: false, text: res.error });
    });
  }

  return (
    <div className={box}>
      <h2 className="font-medium">Golden Boot (top scorer)</h2>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="text"
          value={value}
          disabled={!editable}
          maxLength={100}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Kylian Mbappé"
          className="flex-1 rounded-lg border border-black/[.12] bg-transparent px-2 py-2 text-foreground disabled:opacity-60 dark:border-white/[.2]"
        />
        {editable && (
          <button
            onClick={save}
            disabled={pending}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </div>
      {msg && (
        <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function SpecialPicks({
  winnerEditable,
  bootEditable,
  teams,
  initialWinner,
  initialBoot,
}: Props) {
  return (
    <div className="space-y-4">
      <TeamPicker teams={teams} initial={initialWinner} editable={winnerEditable} />
      <GoldenBootPicker initial={initialBoot} editable={bootEditable} />
    </div>
  );
}

// `SpecialKind` only re-exported here to keep an import path for callers if needed.
export type { SpecialKind };
