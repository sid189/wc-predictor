"use client";

import { useState } from "react";

const FORM_COLORS: Record<number, string> = {
  0: "#EF4444", // red
  1: "#EAB308", // yellow
  2: "#D946EF", // magenta
  3: "#22C55E", // green
  4: "#06B6D4", // cyan
  5: "#FFD700", // gold
};

function formColor(pts: number): string {
  return FORM_COLORS[pts] ?? "#FFD700";
}

const LEGEND = [
  { label: "0 pts", color: "#EF4444" },
  { label: "1 pt",  color: "#EAB308" },
  { label: "2 pts", color: "#D946EF" },
  { label: "3 pts", color: "#22C55E" },
  { label: "4 pts", color: "#06B6D4" },
  { label: "5 pts", color: "#FFD700" },
];

const COLUMNS = [
  { key: "mps",      label: "MPS" },
  { key: "specials", label: "Specials" },
  { key: "exact",    label: "Exact" },
  { key: "total",    label: "Total" },
  { key: "form",     label: "Recent Form" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const DEFAULT_COLUMNS: ColumnKey[] = ["exact", "total", "form"];

export interface LeaderboardRow {
  id: string;
  rank: number;
  name: string;
  match: number;
  special: number;
  exact: number;
  total: number;
  form: number[];
}

export function LeaderboardTable({
  rows,
  currentUserId,
}: {
  rows: LeaderboardRow[];
  currentUserId?: string;
}) {
  const [visible, setVisible] = useState<Set<ColumnKey>>(new Set(DEFAULT_COLUMNS));

  const toggle = (key: ColumnKey) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showForm = visible.has("form");

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-zinc-500">Columns:</span>
        {COLUMNS.map(({ key, label }) => {
          const on = visible.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`rounded-full border px-2.5 py-1 transition-colors ${
                on
                  ? "border-foreground bg-foreground text-background"
                  : "border-black/[.12] text-zinc-500 hover:border-black/[.24] dark:border-white/[.18] dark:hover:border-white/[.32]"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr className="border-b border-black/[.08] dark:border-white/[.145]">
            <th className="py-2">#</th>
            <th>Player</th>
            {visible.has("mps") && <th className="text-right">MPS</th>}
            {visible.has("specials") && <th className="text-right">Specials</th>}
            {visible.has("exact") && <th className="text-right">Exact</th>}
            {visible.has("total") && <th className="text-right">Total</th>}
            {showForm && <th className="py-2 pl-8 text-right">Recent Form</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const padded: (number | null)[] = Array.from({ length: 5 }, (_, i) => {
              const offset = i - (5 - r.form.length);
              return offset >= 0 ? r.form[offset] : null;
            });
            return (
              <tr
                key={r.id}
                className={`border-b border-black/[.05] dark:border-white/[.08] ${
                  r.id === currentUserId ? "bg-foreground/[.04] font-medium" : ""
                }`}
              >
                <td className="py-2 text-zinc-400">{r.rank}</td>
                <td className="font-medium">
                  {r.name}
                  {r.id === currentUserId && (
                    <span className="ml-2 text-xs text-zinc-400">you</span>
                  )}
                </td>
                {visible.has("mps") && <td className="text-right font-mono">{r.match}</td>}
                {visible.has("specials") && <td className="text-right font-mono">{r.special}</td>}
                {visible.has("exact") && (
                  <td className="text-right font-mono text-zinc-500">{r.exact}</td>
                )}
                {visible.has("total") && (
                  <td className="text-right font-mono font-semibold">{r.total}</td>
                )}
                {showForm && (
                  <td className="py-2 pl-8 text-right">
                    <div className="flex justify-end gap-1">
                      {padded.map((pts, i) =>
                        pts == null ? (
                          <span
                            key={i}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-zinc-200 dark:bg-zinc-700"
                          />
                        ) : (
                          <span
                            key={i}
                            style={{ backgroundColor: formColor(pts) }}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold leading-none text-white"
                          >
                            {pts}
                          </span>
                        )
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-xs text-zinc-400">
        Ties share a rank and are ordered by most exact full-time scores.
      </p>

      {showForm && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
          <span className="font-medium">Recent Form:</span>
          {LEGEND.map(({ label, color }, pts) => (
            <span key={label} className="flex items-center gap-1">
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {pts}
              </span>
              {label}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
