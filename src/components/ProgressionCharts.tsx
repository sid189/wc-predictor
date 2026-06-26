// Server-rendered SVG line charts for the Progression tab.

const VW = 700, VH = 290;
const PL = 48, PR = 12, PT = 16, PB = 36;
const PW = VW - PL - PR;  // 640
const PH = VH - PT - PB;  // 238

export interface ProgLine {
  id: string;
  name: string;
  color: string;
  values: number[]; // one value per match slot
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

interface ChartProps {
  lines: ProgLine[];
  n: number;
  yMin: number;
  yMax: number;
  yTicks: number[];
  yLabel: string;
  yFmt?: (v: number) => string;
  /** When true, yMin sits at the top of the chart (for ranks where 1 = best). */
  yFlip?: boolean;
}

function LineChart({ lines, n, yMin, yMax, yTicks, yLabel, yFmt, yFlip }: ChartProps) {
  const span = yMax - yMin || 1;
  const xOf = (i: number) => PL + (n <= 1 ? PW / 2 : (i / (n - 1)) * PW);
  const yOf = (v: number) => {
    const ratio = (v - yMin) / span;
    return yFlip ? PT + ratio * PH : PT + (1 - ratio) * PH;
  };
  const fmt = yFmt ?? String;

  // Show x-tick labels at game 1, every 5th game, and the last game.
  const xTickIdxs: number[] = [];
  if (n > 0) {
    xTickIdxs.push(0);
    for (let i = 4; i < n - 1; i += 5) xTickIdxs.push(i);
    if (!xTickIdxs.includes(n - 1)) xTickIdxs.push(n - 1);
  }

  return (
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
          {i + 1}
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
          />
        ) : null
      )}

      {/* End-of-line dots */}
      {lines.map((line) => {
        const last = line.values.length - 1;
        return last >= 0 ? (
          <circle
            key={line.id}
            cx={xOf(last)} cy={yOf(line.values[last])}
            r={3} fill={line.color}
          />
        ) : null;
      })}
    </svg>
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

  // Points y-axis ticks
  const ptStep = maxPoints <= 20 ? 5 : maxPoints <= 60 ? 10 : 20;
  const ptTicks: number[] = [];
  for (let v = 0; v <= maxPoints; v += ptStep) ptTicks.push(v);

  // Rank y-axis ticks — every rank, but cap labels at 10 entries to avoid overlap
  const rankTicks = Array.from({ length: numPlayers }, (_, i) => i + 1);
  const showEvery = numPlayers > 10 ? 2 : 1;
  const rankTicksFiltered = rankTicks.filter((r) => r === 1 || r === numPlayers || r % showEvery === 0);

  return (
    <div className="space-y-10">
      {/* Cumulative points */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-500">Cumulative Points</h2>
        <LineChart
          lines={pointLines}
          n={matchCount}
          yMin={0}
          yMax={maxPoints || 1}
          yTicks={ptTicks}
          yLabel="Points"
        />
        <Legend lines={pointLines} />
      </div>

      {/* Leaderboard position */}
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
        />
        <Legend lines={rankLines} />
      </div>
    </div>
  );
}
