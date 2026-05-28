"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  savePlayer,
  deletePlayer,
  saveTeam,
  addAllowedEmail,
  removeAllowedEmail,
} from "@/app/actions/admin";
import type { Player, Team } from "@/lib/types";

interface Props {
  teams: Pick<Team, "id" | "name" | "group_label">[];
  players: Pick<Player, "id" | "name" | "team_id">[];
  allowedEmails: string[];
}

const input =
  "rounded-lg border border-black/[.12] bg-transparent px-2 py-1 text-sm dark:border-white/[.2]";
const btn =
  "rounded-full bg-foreground px-3 py-1 text-sm font-medium text-background disabled:opacity-50";

function AddPlayer({ teams }: { teams: Props["teams"] }) {
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!name.trim()) return;
    setMsg("");
    start(async () => {
      const res = await savePlayer({ name, team_id: teamId || null });
      if (res.ok) {
        setName("");
        setTeamId("");
      } else {
        setMsg(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={input}
        placeholder="Player name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select className={input} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
        <option value="">— team (optional) —</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button className={btn} onClick={add} disabled={pending}>
        {pending ? "…" : "Add player"}
      </button>
      {msg && <span className="text-sm text-red-600">{msg}</span>}
    </div>
  );
}

function PlayerRow({ player, teamName }: { player: Props["players"][number]; teamName: string }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between p-2 text-sm">
      <span>
        {player.name} <span className="text-zinc-400">· {teamName}</span>
      </span>
      <button
        onClick={() => start(async () => void (await deletePlayer(player.id)))}
        disabled={pending}
        className="text-xs text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "remove"}
      </button>
    </li>
  );
}

function AddTeam() {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!name.trim()) return;
    setMsg("");
    start(async () => {
      const res = await saveTeam({ name, group_label: group || null });
      if (res.ok) {
        setName("");
        setGroup("");
      } else {
        setMsg(res.error);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        className={input}
        placeholder="Team name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className={`${input} w-20`}
        placeholder="Group"
        value={group}
        onChange={(e) => setGroup(e.target.value.toUpperCase())}
      />
      <button className={btn} onClick={add} disabled={pending}>
        {pending ? "…" : "Add team"}
      </button>
      {msg && <span className="text-sm text-red-600">{msg}</span>}
    </div>
  );
}

function GuestList({ emails }: { emails: string[] }) {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function add() {
    if (!email.trim()) return;
    setMsg("");
    start(async () => {
      const res = await addAllowedEmail(email);
      if (res.ok) setEmail("");
      else setMsg(res.error);
    });
  }

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Guest list ({emails.length})</h2>
      <p className="text-xs text-zinc-400">
        Only these emails can sign in. Removing one keeps any existing data but blocks future logins.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={input}
          type="email"
          placeholder="friend@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className={btn} onClick={add} disabled={pending}>
          {pending ? "…" : "Invite"}
        </button>
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
      <ul className="divide-y divide-black/[.06] rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
        {emails.length === 0 && <li className="p-2 text-sm text-zinc-400">No one invited yet.</li>}
        {emails.map((e) => (
          <EmailRow key={e} email={e} />
        ))}
      </ul>
    </section>
  );
}

function EmailRow({ email }: { email: string }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between p-2 text-sm">
      <span>{email}</span>
      <button
        onClick={() => start(async () => void (await removeAllowedEmail(email)))}
        disabled={pending}
        className="text-xs text-red-600 hover:underline disabled:opacity-50"
      >
        {pending ? "…" : "remove"}
      </button>
    </li>
  );
}

export function DataManager({ teams, players, allowedEmails }: Props) {
  const teamName = (id: string | null) =>
    id ? (teams.find((t) => t.id === id)?.name ?? "—") : "—";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Teams &amp; players</h1>
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-foreground">
          ← Admin
        </Link>
      </div>

      <GuestList emails={allowedEmails} />

      <section className="space-y-3">
        <h2 className="font-semibold">Players ({players.length})</h2>
        <AddPlayer teams={teams} />
        <ul className="divide-y divide-black/[.06] rounded-xl border border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
          {players.length === 0 && <li className="p-2 text-sm text-zinc-400">No players yet.</li>}
          {players.map((p) => (
            <PlayerRow key={p.id} player={p} teamName={teamName(p.team_id)} />
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Teams ({teams.length})</h2>
        <AddTeam />
        <ul className="grid grid-cols-2 gap-x-6 rounded-xl border border-black/[.08] p-3 text-sm dark:border-white/[.145] sm:grid-cols-3">
          {teams.map((t) => (
            <li key={t.id} className="py-1">
              {t.group_label && <span className="mr-1 text-zinc-400">{t.group_label}</span>}
              {t.name}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
