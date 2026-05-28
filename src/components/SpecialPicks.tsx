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
  players: Option[];
  initialWinner: string;
  initialBoot: string;
}

function Picker({
  kind,
  label,
  options,
  initial,
  editable,
}: {
  kind: SpecialKind;
  label: string;
  options: Option[];
  initial: string;
  editable: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!value) return;
    setMsg(null);
    startTransition(async () => {
      const res = await saveSpecialPick(kind, value);
      setMsg(res.ok ? { ok: true, text: "Saved!" } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <h2 className="font-medium">{label}</h2>
      <div className="mt-3 flex items-center gap-3">
        <select
          value={value}
          disabled={!editable}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-lg border border-black/[.12] bg-transparent px-2 py-2 disabled:opacity-60 dark:border-white/[.2]"
        >
          <option value="">— choose —</option>
          {options.map((o) => (
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

export function SpecialPicks({
  winnerEditable,
  bootEditable,
  teams,
  players,
  initialWinner,
  initialBoot,
}: Props) {
  return (
    <div className="space-y-4">
      <Picker
        kind="winner"
        label="Tournament Winner"
        options={teams}
        initial={initialWinner}
        editable={winnerEditable}
      />
      <Picker
        kind="golden_boot"
        label="Golden Boot (top scorer)"
        options={players}
        initial={initialBoot}
        editable={bootEditable}
      />
    </div>
  );
}
