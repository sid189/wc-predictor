"use client";

import { useMemo } from "react";
import { Flag } from "@/components/Flag";
import type { BracketMatch } from "./BracketPicker";

// ─── Layout constants ───────────────────────────────────────────────────────
const CARD_W = 176;
const CARD_H = 58; // 2 rows × 29 px
const BASE_SLOT = 72; // R32 slot height; doubles each round
const COL_GAP = 36; // space between rounds for connector lines
const COL_TOTAL = CARD_W + COL_GAP;

const STAGE_PTS: Record<string, number> = {
  round_of_32: 1, round_of_16: 2, quarter_final: 4,
  semi_final: 8, third_place: 8, final: 16,
};

const ROUND_LABEL: Record<string, string> = {
  round_of_32: "R32", round_of_16: "R16",
  quarter_final: "QF", semi_final: "SF", final: "Final",
};

type Eff = { aId: string | null; aName: string; bId: string | null; bName: string };

interface Props {
  koMatches: BracketMatch[];
  byNum: Map<number, BracketMatch>;
  effective: Map<string, Eff>;
  validPicks: Record<string, string>;
  actualWinners: Record<string, string>;
  locked: boolean;
  onPick: (matchId: string, teamId: string) => void;
}

export function BracketTree({
  koMatches, byNum, effective, validPicks, actualWinners, locked, onPick,
}: Props) {
  // Build levels[0]=R32 … levels[n]=Final by expanding from the Final backwards.
  const levels = useMemo(() => {
    const final = koMatches.find((m) => m.stage === "final");
    if (!final) return [] as (BracketMatch | null)[][];

    function children(m: BracketMatch): (BracketMatch | null)[] {
      const wA = m.placeholder_a?.match(/^W(\d+)$/);
      const wB = m.placeholder_b?.match(/^W(\d+)$/);
      return [
        wA ? (byNum.get(parseInt(wA[1])) ?? null) : null,
        wB ? (byNum.get(parseInt(wB[1])) ?? null) : null,
      ];
    }

    const levs: (BracketMatch | null)[][] = [[final]];
    for (;;) {
      const next = levs[levs.length - 1].flatMap((m) =>
        m ? children(m) : [null, null],
      );
      if (next.every((m) => !m)) break;
      levs.push(next);
    }
    return levs.reverse(); // [0] = R32, [last] = Final
  }, [koMatches, byNum]);

  const thirdPlace = koMatches.find((m) => m.stage === "third_place");

  if (!levels.length) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400">
        Bracket not available yet — check back once KO fixtures are seeded.
      </p>
    );
  }

  const numRounds = levels.length;
  const numR32 = levels[0].length;
  const totalH = numR32 * BASE_SLOT;
  const totalW = numRounds * COL_TOTAL;

  const slotH = (r: number) => BASE_SLOT * 2 ** r;
  const cardTop = (r: number, p: number) =>
    p * slotH(r) + (slotH(r) - CARD_H) / 2;
  const centerY = (r: number, p: number) => cardTop(r, p) + CARD_H / 2;
  const colX = (r: number) => r * COL_TOTAL;

  // ── Connector SVG lines ────────────────────────────────────────────────────
  const connectors: React.ReactNode[] = [];
  for (let r = 1; r < numRounds; r++) {
    for (let p = 0; p < levels[r].length; p++) {
      if (!levels[r][p]) continue;
      const cA = levels[r - 1][p * 2];
      const cB = levels[r - 1][p * 2 + 1];
      const cX = colX(r - 1) + CARD_W; // child right edges
      const midX = cX + COL_GAP / 2;
      const pX = colX(r);
      const pY = centerY(r, p);
      const yA = cA ? centerY(r - 1, p * 2) : pY;
      const yB = cB ? centerY(r - 1, p * 2 + 1) : pY;
      const lp = { stroke: "currentColor", strokeOpacity: 0.18, strokeWidth: 1 };

      if (cA) connectors.push(<line key={`ha${r}${p}`} x1={cX} y1={yA} x2={midX} y2={yA} {...lp} />);
      if (cB) connectors.push(<line key={`hb${r}${p}`} x1={cX} y1={yB} x2={midX} y2={yB} {...lp} />);
      if (cA || cB) connectors.push(<line key={`v${r}${p}`} x1={midX} y1={yA} x2={midX} y2={yB} {...lp} />);
      connectors.push(<line key={`hp${r}${p}`} x1={midX} y1={pY} x2={pX} y2={pY} {...lp} />);
    }
  }

  return (
    <div className="overflow-auto rounded-xl border border-black/[.08] bg-zinc-50/60 p-4 dark:border-white/[.1] dark:bg-zinc-950/60">
      <div style={{ minWidth: totalW }}>
        {/* Round labels */}
        <div className="mb-3 flex" style={{ width: totalW }}>
          {levels.map((lev, r) => {
            const stage = lev.find((m) => m)?.stage ?? "";
            return (
              <div
                key={r}
                style={{ width: COL_TOTAL }}
                className="text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-400"
              >
                {ROUND_LABEL[stage] ?? stage}
              </div>
            );
          })}
        </div>

        {/* Bracket canvas */}
        <div style={{ position: "relative", width: totalW, height: totalH }}>
          <svg
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            width={totalW}
            height={totalH}
            className="text-black dark:text-white"
          >
            {connectors}
          </svg>

          {levels.flatMap((mArr, r) =>
            mArr.map((m, p) =>
              m ? (
                <MatchCard
                  key={m.id}
                  m={m}
                  top={cardTop(r, p)}
                  left={colX(r)}
                  eff={effective.get(m.id)}
                  pick={validPicks[m.id]}
                  actual={actualWinners[m.id]}
                  locked={locked}
                  onPick={onPick}
                />
              ) : null,
            ),
          )}
        </div>

        {/* 3rd-place match */}
        {thirdPlace && (
          <div className="mt-6 border-t border-black/[.06] pt-4 dark:border-white/[.08]">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              3rd Place
            </p>
            <MatchCardInline
              m={thirdPlace}
              eff={effective.get(thirdPlace.id)}
              pick={validPicks[thirdPlace.id]}
              actual={actualWinners[thirdPlace.id]}
              locked={locked}
              onPick={onPick}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Absolutely positioned match card (used inside the bracket canvas) ────────
function MatchCard({
  m, top, left, eff, pick, actual, locked, onPick,
}: {
  m: BracketMatch; top: number; left: number;
  eff?: Eff; pick?: string; actual?: string;
  locked: boolean; onPick: (id: string, teamId: string) => void;
}) {
  return (
    <div
      style={{ position: "absolute", top, left, width: CARD_W, height: CARD_H }}
      className="overflow-hidden rounded-lg border border-black/[.1] bg-white shadow-sm dark:border-white/[.12] dark:bg-zinc-900"
    >
      <TeamRow side="a" m={m} eff={eff} pick={pick} actual={actual} locked={locked} onPick={onPick} />
      <TeamRow side="b" m={m} eff={eff} pick={pick} actual={actual} locked={locked} onPick={onPick} />
    </div>
  );
}

// ── Inline match card (3rd place, not inside absolute canvas) ───────────────
function MatchCardInline({
  m, eff, pick, actual, locked, onPick,
}: {
  m: BracketMatch; eff?: Eff; pick?: string; actual?: string;
  locked: boolean; onPick: (id: string, teamId: string) => void;
}) {
  return (
    <div
      style={{ width: CARD_W, height: CARD_H }}
      className="overflow-hidden rounded-lg border border-black/[.1] bg-white shadow-sm dark:border-white/[.12] dark:bg-zinc-900"
    >
      <TeamRow side="a" m={m} eff={eff} pick={pick} actual={actual} locked={locked} onPick={onPick} />
      <TeamRow side="b" m={m} eff={eff} pick={pick} actual={actual} locked={locked} onPick={onPick} />
    </div>
  );
}

// ── One team row inside a match card ────────────────────────────────────────
function TeamRow({
  side, m, eff, pick, actual, locked, onPick,
}: {
  side: "a" | "b"; m: BracketMatch; eff?: Eff; pick?: string; actual?: string;
  locked: boolean; onPick: (id: string, teamId: string) => void;
}) {
  const isA = side === "a";
  const teamId = isA ? (eff?.aId ?? null) : (eff?.bId ?? null);
  const teamName = isA
    ? (eff?.aName ?? m.placeholder_a ?? "TBD")
    : (eff?.bName ?? m.placeholder_b ?? "TBD");

  const isPicked = !!pick && pick === teamId;
  const isActualW = !!actual && actual === teamId;
  const isCorrect = isPicked && isActualW;
  const isWrong = isPicked && !!actual && !isActualW;
  const canPick = !locked && !!teamId;
  const pts = STAGE_PTS[m.stage] ?? 0;

  return (
    <button
      onClick={() => canPick && onPick(m.id, teamId!)}
      disabled={!canPick}
      className={[
        "flex w-full items-center gap-1.5 px-2 text-left transition-colors",
        !isA ? "border-t border-black/[.06] dark:border-white/[.08]" : "",
        isCorrect ? "bg-emerald-50 dark:bg-emerald-950/40"
          : isWrong ? "bg-red-50 dark:bg-red-950/30"
          : isPicked ? "bg-blue-50 dark:bg-blue-950/40"
          : isActualW ? "bg-emerald-50/50 dark:bg-emerald-950/20"
          : "",
        canPick
          ? "cursor-pointer hover:bg-black/[.03] dark:hover:bg-white/[.04]"
          : "cursor-default",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{ height: CARD_H / 2 }}
    >
      <Flag teamName={teamName} size={13} />
      <span
        className={[
          "min-w-0 flex-1 truncate text-[11px]",
          isPicked ? "font-semibold" : "",
          isWrong ? "text-zinc-400 line-through" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {teamName}
      </span>
      {isCorrect && (
        <span className="shrink-0 text-[10px] font-bold text-emerald-600">+{pts}</span>
      )}
      {isActualW && !isPicked && (
        <span className="shrink-0 text-[10px] text-emerald-600">✓</span>
      )}
      {isPicked && !actual && (
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
      )}
    </button>
  );
}
