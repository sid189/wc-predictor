"use client";

import { useState } from "react";

const VW = 700, VH = 290;
const PL = 48, PR = 12, PT = 16, PB = 36;
const PW = VW - PL - PR; // 640
const PH = VH - PT - PB; // 238

export interface ProgLine {
  id: string;
  name: string;
  color: string;
  values: number[];
}

function pathD(
  values: number[],
  xOf: (i: number) => number,
  yOf: (v: number) => number,
): string {
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`)
    .join(" ");
}

interface HovState {
  idx: number;
  ex: number; // CSS px from left of container
  ey: number; // CSS px from top of container
  cw: number; // container width in CSS px
}

interface ChartProps {
  lines: ProgLine[];
  n: number;
  yMin: number;
  yMax: number;
  yTicks: number[];
  yLabel: string;
  yFmt?: (v: number) => string;
  yFlip?: boolean;
  tooltipSort?: "asc" | "desc";
}

function LineChart({ lines, n, yMin, yMax, yTicks, yLabel, yFmt, yFlip, tooltipSort = "desc" }: ChartProps) {
  const [hov, setHov] = useState<HovState | null>(null);

  const span = yMax - yMin || 1;
  const xOf = (i: number) => PL + (n <= 1 ? PW / 2 : (i / (n - 1)) * PW);
  const yOf = (v: number) => {
    const ratio = (v - yMin) / span;
    return yFlip ? PT + ratio * PH : PT + (1 - ratio) * PH;
  };
  const fmt = yFmt ?? String;

  const xTickIdxs: number[] = [];
  if (n > 0) {
    xTickIdxs.push(0);
    for (let i = 5; i < n - 1; i += 5) xTickIdxs.push(i);
    if (!xTickIdxs.includes(n - 1)) xTickIdxs.push(n - 1);
  }

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ex = e.clientX - rect.left;
    const ey = e.clientY - rect.top;
    const svgX = (ex / rect.width) * VW;
    const plotX = Math.max(0, Math.min(svgX - PL, PW));
    const idx = n <= 1 ? 0 : Math.max(0, Math.min(Math.round((plotX / PW) * (n - 1)), n - 1));
    setHov({ idx, ex, ey, cw: rect.width });
  };

  const tooltipEntries = hov
    ? [...lines]
        .filter((l) => l.values.length > hov.idx)
        .sort((a, b) =>
          tooltipSort === "asc"
            ? a.values[hov.idx] - b.values[hov.idx]
            : b.values[hov.idx] - a.values[hov.idx],
        )
    : [];

  const flipTooltip = hov ? hov.ex > hov.cw * 0.55 : false;

  return (
    <div
      className="relative cursor-crosshair select-none"
      onMouseMove={onMouseMove}
      onMouseLeave={() => setHov(null)}
    >
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" className="overflow-visible">
        {/* Y grid + labels */}
        {yTicks.map((v) => {
          const y = yOf(v);
          return (
            <g key={v}>
              <line
                x1={PL} y1={y} x2={PL + PW} y2={y}
                stroke="currentColor" strokeOpacity={0.08} strokeWidth={1}
              />
              <text
                x={PL - 6} y={y + 4}
                textAnchor="end" fontSize={9}
                fill="currentColor" fillOpacity={0.4}
              >
                {fmt(v)}
              </text>
            </g>
          );
        })}

        {/* X baseline */}
        <line
          x1={PL} y1={PT + PH} x2={PL + PW} y2={PT + PH}
          stroke="currentColor" strokeOpacity={0.15} strokeWidth={1}
        />

        {/* X tick labels */}
        {xTickIdxs.map((i) => (
          <text
            key={i} x={xOf(i)} y={PT + PH + 14}
            textAnchor="middle" fontSize={9}
            fill="currentColor" fillOpacity={0.4}
          >
            {i === 0 ? "Start" : i}
          </text>
        ))}

        {/* Axis labels */}
        <text
          x={PL + PW / 2} y={VH - 4}
          textAnchor="middle" fontSize={9}
          fill="currentColor" fillOpacity={0.4}
        >
          Game
        </text>
        <text
          x={11} y={PT + PH / 2}
          textAnchor="middle" fontSize={9}
          fill="currentColor" fillOpacity={0.4}
          transform={`rotate(-90,11,${PT + PH / 2})`}
        >
          {yLabel}
        </text>

        {/* Player lines */}
        {lines.map((line) =>
          line.values.length >= 2 ? (
            <path
              key={line.id}
              d={pathD(line.values, xOf, yOf)}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={hov ? 0.35 : 1}
            />
          ) : null
        )}

        {/* Hover overlay */}
        {hov ? (
          <>
            {/* Highlighted lines at full opacity */}
            {lines.map((line) =>
              line.values.length >= 2 ? (
                <path
                  key={line.id}
                  d={pathD(line.values, xOf, yOf)}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null
            )}

            {/* Vertical crosshair */}
            <line
              x1={xOf(hov.idx)} y1={PT}
              x2={xOf(hov.idx)} y2={PT + PH}
              stroke="currentColor" strokeOpacity={0.3} strokeWidth={1}
              strokeDasharray="4 3"
            />

            {/* Dots on each line at hovered index */}
            {lines.map((line) =>
              line.values[hov.idx] != null ? (
                <circle
                  key={line.id}
                  cx={xOf(hov.idx)} cy={yOf(line.values[hov.idx])}
                  r={4.5} fill={line.color}
                  stroke="white" strokeWidth={1.5}
                />
              ) : null
            )}
          </>
        ) : (
          /* Static end-of-line dots when not hovering */
          lines.map((line) => {
            const last = line.values.length - 1;
            return last >= 0 ? (
              <circle
                key={line.id}
                cx={xOf(last)} cy={yOf(line.values[last])}
                r={3} fill={line.color}
              />
            ) : null;
          })
        )}
      </svg>

      {/* Floating tooltip */}
      {hov && tooltipEntries.length > 0 && (
        <div
          className="pointer-events-none absolute z-20 min-w-[140px] rounded-lg border border-black/[.1] bg-white/95 p-2.5 text-xs shadow-lg backdrop-blur-sm dark:border-white/[.12] dark:bg-zinc-900/95"
          style={{
            top: Math.max(4, hov.ey - 20),
            left: flipTooltip ? hov.ex - 12 : hov.ex + 12,
            transform: flipTooltip ? "translateX(-100%)" : "none",
          }}
        >
          <p className="mb-1.5 font-semibold text-zinc-500">
            {hov.idx === 0 ? "Start" : `Game ${hov.idx}`}
          </p>
          <div className="space-y-1">
            {tooltipEntries.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: line.color }}
                  />
                  <span className="text-zinc-700 dark:text-zinc-300">{line.name}</span>
                </span>
                <span className="font-mono font-medium tabular-nums">
                  {fmt(line.values[hov.idx])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Legend({ lines }: { lines: ProgLine[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
      {lines.map((l) => (
        <span key={l.id} className="flex items-center gap-1.5">
          <span
            className="inline-block h-0.5 w-5 rounded-full"
            style={{ backgroundColor: l.color }}
          />
          {l.name}
        </span>
      ))}
    </div>
  );
}

interface Props {
  matchCount: number;
  maxPoints: number;
  numPlayers: number;
  pointLines: ProgLine[];
  rankLines: ProgLine[];
}

export function ProgressionCharts({ matchCount, maxPoints, numPlayers, pointLines, rankLines }: Props) {
  if (matchCount === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">
        No scored games yet — check back after the first match.
      </p>
    );
  }

  const ptStep = maxPoints <= 20 ? 5 : maxPoints <= 60 ? 10 : 20;
  const ptTicks: number[] = [];
  for (let v = 0; v <= maxPoints; v += ptStep) ptTicks.push(v);

  const rankTicks = Array.from({ length: numPlayers }, (_, i) => i + 1);
  const showEvery = numPlayers > 10 ? 2 : 1;
  const rankTicksFiltered = rankTicks.filter(
    (r) => r === 1 || r === numPlayers || r % showEvery === 0,
  );

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-500">Cumulative Points</h2>
        <LineChart
          lines={pointLines}
          n={matchCount}
          yMin={0}
          yMax={maxPoints || 1}
          yTicks={ptTicks}
          yLabel="Points"
          tooltipSort="desc"
        />
        <Legend lines={pointLines} />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-500">Leaderboard Position</h2>
        <LineChart
          lines={rankLines}
          n={matchCount}
          yMin={1}
          yMax={numPlayers}
          yTicks={rankTicksFiltered}
          yLabel="Position"
          yFmt={(v) => `#${v}`}
          yFlip
          tooltipSort="asc"
        />
        <Legend lines={rankLines} />
      </div>
    </div>
  );
}
