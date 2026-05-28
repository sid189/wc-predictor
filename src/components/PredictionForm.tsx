"use client";

import { useState, useTransition } from "react";
import { savePrediction } from "@/app/actions/predictions";

interface TeamLite {
  id: string;
  name: string;
}

interface Props {
  matchId: string;
  isKnockout: boolean;
  /** False for knockout matches whose teams aren't decided yet (TBD slots). */
  teamsKnown: boolean;
  teamA: TeamLite;
  teamB: TeamLite;
  initial?: {
    ft_a: number;
    ft_b: number;
    et_a: number | null;
    et_b: number | null;
    pen_a: number | null;
    pen_b: number | null;
    pen_winner_team_id: string | null;
  };
}

function numOrEmpty(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

export function PredictionForm({
  matchId,
  isKnockout,
  teamsKnown,
  teamA,
  teamB,
  initial,
}: Props) {
  // Extra-time / penalty inputs only make sense for a decided knockout tie.
  const showKnockoutExtras = isKnockout && teamsKnown;
  const [ftA, setFtA] = useState(numOrEmpty(initial?.ft_a));
  const [ftB, setFtB] = useState(numOrEmpty(initial?.ft_b));
  const [etA, setEtA] = useState(numOrEmpty(initial?.et_a));
  const [etB, setEtB] = useState(numOrEmpty(initial?.et_b));
  const [penA, setPenA] = useState(numOrEmpty(initial?.pen_a));
  const [penB, setPenB] = useState(numOrEmpty(initial?.pen_b));
  const [penWinner, setPenWinner] = useState(initial?.pen_winner_team_id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const parse = (v: string): number | null => (v === "" ? null : Number(v));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const ft_a = parse(ftA);
    const ft_b = parse(ftB);
    if (ft_a == null || ft_b == null) {
      setMsg({ ok: false, text: "Enter a full-time score for both teams." });
      return;
    }

    const et_a = showKnockoutExtras ? parse(etA) : null;
    const et_b = showKnockoutExtras ? parse(etB) : null;
    const pen_a = showKnockoutExtras ? parse(penA) : null;
    const pen_b = showKnockoutExtras ? parse(penB) : null;
    const winner = showKnockoutExtras && penWinner ? penWinner : null;

    // Extra-time goals are all-or-nothing (both teams or neither).
    if ((et_a == null) !== (et_b == null)) {
      setMsg({ ok: false, text: "Enter extra-time goals for both teams, or leave both blank." });
      return;
    }
    // A shootout needs both scores and a winner, or none of them.
    const penAny = pen_a != null || pen_b != null || winner != null;
    const penAll = pen_a != null && pen_b != null && winner != null;
    if (penAny && !penAll) {
      setMsg({ ok: false, text: "For a shootout, enter both penalty scores and pick the winner." });
      return;
    }

    startTransition(async () => {
      const res = await savePrediction({
        matchId,
        ft_a,
        ft_b,
        et_a,
        et_b,
        pen_a,
        pen_b,
        pen_winner_team_id: winner,
      });
      setMsg(
        res.ok
          ? { ok: true, text: "Saved!" }
          : { ok: false, text: res.error },
      );
    });
  }

  const scoreRow = (
    label: string,
    aVal: string,
    setA: (v: string) => void,
    bVal: string,
    setB: (v: string) => void,
  ) => (
    <div className="flex items-center gap-3">
      <span className="w-28 text-sm text-zinc-500">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        step={1}
        min={0}
        max={99}
        value={aVal}
        onChange={(e) => setA(e.target.value)}
        className="w-16 rounded-lg border border-black/[.12] bg-transparent px-2 py-1 text-center dark:border-white/[.2]"
        aria-label={`${label} ${teamA.name}`}
      />
      <span className="text-zinc-400">–</span>
      <input
        type="number"
        inputMode="numeric"
        step={1}
        min={0}
        max={99}
        value={bVal}
        onChange={(e) => setB(e.target.value)}
        className="w-16 rounded-lg border border-black/[.12] bg-transparent px-2 py-1 text-center dark:border-white/[.2]"
        aria-label={`${label} ${teamB.name}`}
      />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 text-sm font-medium">
        <span>{teamA.name}</span>
        <span className="text-right">{teamB.name}</span>
      </div>

      {scoreRow("Full time", ftA, setFtA, ftB, setFtB)}

      {isKnockout && !teamsKnown && (
        <p className="pt-2 text-xs text-zinc-500">
          Extra-time and penalty predictions unlock once both teams are confirmed.
        </p>
      )}

      {showKnockoutExtras && (
        <>
          <p className="pt-2 text-xs text-zinc-500">
            Optional — only if the match goes beyond 90 minutes.
          </p>
          {scoreRow("Extra-time goals", etA, setEtA, etB, setEtB)}
          {scoreRow("Penalties", penA, setPenA, penB, setPenB)}
          <div className="flex items-center gap-3">
            <span className="w-28 text-sm text-zinc-500">Shootout winner</span>
            <select
              value={penWinner}
              onChange={(e) => setPenWinner(e.target.value)}
              className="rounded-lg border border-black/[.12] bg-transparent px-2 py-1 dark:border-white/[.2]"
            >
              <option value="">—</option>
              <option value={teamA.id}>{teamA.name}</option>
              <option value={teamB.id}>{teamB.name}</option>
            </select>
          </div>
        </>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-foreground px-5 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save prediction"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-emerald-600" : "text-red-600"}>{msg.text}</span>
        )}
      </div>
    </form>
  );
}
