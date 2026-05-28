"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  assignMatchTeams,
  enterResult,
  recalcEverything,
  reseedAllGroups,
  saveTournamentConfig,
} from "@/app/actions/admin";
import { STAGE_LABELS, formatKickoff } from "@/lib/format";
import type { Match, MatchResult, Player, Team, TournamentConfig } from "@/lib/types";

interface Props {
  matches: Match[];
  teams: Pick<Team, "id" | "name">[];
  players: Pick<Player, "id" | "name">[];
  results: MatchResult[];
  config: TournamentConfig;
}

// ISO <-> <input type="datetime-local"> helpers (local time).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

function ConfigEditor({
  config,
  teams,
  players,
}: {
  config: TournamentConfig;
  teams: Pick<Team, "id" | "name">[];
  players: Pick<Player, "id" | "name">[];
}) {
  const [startsAt, setStartsAt] = useState(toLocalInput(config?.starts_at ?? null));
  const [groupEnd, setGroupEnd] = useState(toLocalInput(config?.group_stage_ends_at ?? null));
  const [winner, setWinner] = useState(config?.actual_winner_team_id ?? "");
  const [boot, setBoot] = useState(config?.actual_golden_boot_player_id ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function save() {
    setMsg("");
    start(async () => {
      const res = await saveTournamentConfig({
        starts_at: fromLocalInput(startsAt),
        group_stage_ends_at: fromLocalInput(groupEnd),
        actual_winner_team_id: winner || null,
        actual_golden_boot_player_id: boot || null,
      });
      setMsg(res.ok ? "Saved (special picks rescored)." : res.error);
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <h2 className="font-semibold">Tournament config</h2>
      <label className="block text-sm">
        Tournament start (special picks lock here)
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-black/[.12] bg-transparent px-2 py-1 dark:border-white/[.2]"
        />
      </label>
      <label className="block text-sm">
        Group stage ends (change window opens)
        <input
          type="datetime-local"
          value={groupEnd}
          onChange={(e) => setGroupEnd(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-black/[.12] bg-transparent px-2 py-1 dark:border-white/[.2]"
        />
      </label>
      <label className="block text-sm">
        Actual winner
        <select
          value={winner}
          onChange={(e) => setWinner(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-black/[.12] bg-transparent px-2 py-1 dark:border-white/[.2]"
        >
          <option value="">— not decided —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Actual golden boot
        <select
          value={boot}
          onChange={(e) => setBoot(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-black/[.12] bg-transparent px-2 py-1 dark:border-white/[.2]"
        >
          <option value="">— not decided —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save config"}
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
    </section>
  );
}

function AssignTeams({
  match,
  teams,
  labelA,
  labelB,
}: {
  match: Match;
  teams: Pick<Team, "id" | "name">[];
  labelA: string;
  labelB: string;
}) {
  const [a, setA] = useState(match.team_a_id ?? "");
  const [b, setB] = useState(match.team_b_id ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function save() {
    setMsg("");
    start(async () => {
      const res = await assignMatchTeams(match.id, a || null, b || null);
      setMsg(res.ok ? "Teams set" : res.error);
    });
  }

  const sel =
    "rounded border border-black/[.12] bg-transparent px-1 py-1 text-xs dark:border-white/[.2]";

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-black/[.03] p-2 text-xs dark:bg-white/[.05]">
      <span className="text-zinc-500">
        Assign teams ({labelA} v {labelB}):
      </span>
      <select className={sel} value={a} onChange={(e) => setA(e.target.value)}>
        <option value="">— team A —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select className={sel} value={b} onChange={(e) => setB(e.target.value)}>
        <option value="">— team B —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        onClick={save}
        disabled={pending}
        className="rounded-full border border-black/[.12] px-2 py-1 disabled:opacity-50 dark:border-white/[.2]"
      >
        {pending ? "…" : "Assign"}
      </button>
      {msg && <span className="text-zinc-500">{msg}</span>}
    </div>
  );
}

function ResultRow({
  match,
  teams,
  result,
}: {
  match: Match;
  teams: Pick<Team, "id" | "name">[];
  result?: MatchResult;
}) {
  const name = (id: string | null) =>
    id ? (teams.find((t) => t.id === id)?.name ?? "TBD") : "TBD";
  const [ftA, setFtA] = useState(result ? String(result.ft_a) : "");
  const [ftB, setFtB] = useState(result ? String(result.ft_b) : "");
  const [etA, setEtA] = useState(result?.et_a != null ? String(result.et_a) : "");
  const [etB, setEtB] = useState(result?.et_b != null ? String(result.et_b) : "");
  const [penA, setPenA] = useState(result?.pen_a != null ? String(result.pen_a) : "");
  const [penB, setPenB] = useState(result?.pen_b != null ? String(result.pen_b) : "");
  const [winner, setWinner] = useState(result?.winner_team_id ?? "");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const parse = (v: string) => (v === "" ? null : Number(v));

  function save() {
    setMsg("");
    const ft_a = parse(ftA);
    const ft_b = parse(ftB);
    if (ft_a == null || ft_b == null) {
      setMsg("FT score required");
      return;
    }
    start(async () => {
      const res = await enterResult({
        matchId: match.id,
        ft_a,
        ft_b,
        et_a: match.is_knockout ? parse(etA) : null,
        et_b: match.is_knockout ? parse(etB) : null,
        pen_a: match.is_knockout ? parse(penA) : null,
        pen_b: match.is_knockout ? parse(penB) : null,
        winner_team_id: match.is_knockout && winner ? winner : null,
      });
      setMsg(res.ok ? "Saved & scored" : res.error);
    });
  }

  const box =
    "w-12 rounded border border-black/[.12] bg-transparent px-1 py-1 text-center dark:border-white/[.2]";

  const labelA = match.team_a_id ? name(match.team_a_id) : (match.placeholder_a ?? "TBD");
  const labelB = match.team_b_id ? name(match.team_b_id) : (match.placeholder_b ?? "TBD");
  const needsTeams = match.is_knockout && (!match.team_a_id || !match.team_b_id);

  return (
    <li className="space-y-2 p-3">
      <div className="text-xs text-zinc-500">
        {STAGE_LABELS[match.stage]} · {formatKickoff(match.kickoff_at)}
      </div>

      {needsTeams && <AssignTeams match={match} teams={teams} labelA={labelA} labelB={labelB} />}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-40 truncate">
          {labelA} v {labelB}
        </span>
        <span className="text-zinc-400">FT</span>
        <input className={box} type="number" min={0} value={ftA} onChange={(e) => setFtA(e.target.value)} />
        <input className={box} type="number" min={0} value={ftB} onChange={(e) => setFtB(e.target.value)} />
        {match.is_knockout && (
          <>
            <span className="text-zinc-400">ET</span>
            <input className={box} type="number" min={0} value={etA} onChange={(e) => setEtA(e.target.value)} />
            <input className={box} type="number" min={0} value={etB} onChange={(e) => setEtB(e.target.value)} />
            <span className="text-zinc-400">Pen</span>
            <input className={box} type="number" min={0} value={penA} onChange={(e) => setPenA(e.target.value)} />
            <input className={box} type="number" min={0} value={penB} onChange={(e) => setPenB(e.target.value)} />
            <select
              value={winner}
              onChange={(e) => setWinner(e.target.value)}
              className="rounded border border-black/[.12] bg-transparent px-1 py-1 text-xs dark:border-white/[.2]"
            >
              <option value="">winner?</option>
              {match.team_a_id && <option value={match.team_a_id}>{name(match.team_a_id)}</option>}
              {match.team_b_id && <option value={match.team_b_id}>{name(match.team_b_id)}</option>}
            </select>
          </>
        )}
        <button
          onClick={save}
          disabled={pending}
          className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
        {msg && <span className="text-xs text-zinc-500">{msg}</span>}
      </div>
    </li>
  );
}

function ReseedButton() {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  function run() {
    setMsg("");
    start(async () => {
      const res = await reseedAllGroups();
      if (!res.ok) setMsg(res.error);
      else
        setMsg(
          `Seeded ${res.seeded} group${res.seeded === 1 ? "" : "s"}` +
            (res.pending.length ? ` · tied (assign manually): ${res.pending.join(", ")}` : ""),
        );
    });
  }
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-full border border-black/[.12] px-3 py-1 text-sm hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-white/[.06]"
      >
        {pending ? "Recomputing…" : "Recompute standings & seed R32"}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}

function RecalcButton() {
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  function run() {
    setMsg("");
    start(async () => {
      const res = await recalcEverything();
      setMsg(res.ok ? `Recalculated ${res.matches} matches` : res.error);
    });
  }
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={pending}
        className="rounded-full border border-black/[.12] px-3 py-1 text-sm hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-white/[.06]"
      >
        {pending ? "Recalculating…" : "Recalculate everything"}
      </button>
      {msg && <span className="text-xs text-zinc-500">{msg}</span>}
    </div>
  );
}

export function AdminClient({ matches, teams, players, results, config }: Props) {
  const resultMap = new Map(results.map((r) => [r.match_id, r]));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <Link
          href="/admin/data"
          className="rounded-full border border-black/[.12] px-3 py-1 text-sm hover:bg-black/[.04] dark:border-white/[.2] dark:hover:bg-white/[.06]"
        >
          Teams & players →
        </Link>
      </div>
      <ConfigEditor config={config} teams={teams} players={players} />
      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Results</h2>
          <div className="flex flex-wrap items-center gap-2">
            <ReseedButton />
            <RecalcButton />
          </div>
        </div>
        <ul className="divide-y divide-black/[.06] rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
          {matches.map((m) => (
            <ResultRow key={m.id} match={m} teams={teams} result={resultMap.get(m.id)} />
          ))}
        </ul>
      </section>
    </div>
  );
}
