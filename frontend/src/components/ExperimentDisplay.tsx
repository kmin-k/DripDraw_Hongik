import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import type { DisplayFlags } from "../lib/experiment";
import { formatClock, formatDuration, formatGram } from "../lib/format";
import { nextPourTarget, pourTargets } from "../lib/pours";
import { interpolateAt, type Curve } from "../lib/rmse";
import type { ChartRow } from "../lib/useBrewSession";

/**
 * 실험 참가자가 보는 화면. 조건마다 **보여 주는 것만** 다르고 나머지는 모두 같습니다.
 *
 * - 모든 조건: 부은 물(저울 숫자)과 경과 시간
 * - 목표(3·4): 목표 곡선, 현재 시각 표시선, 지금 시점의 목표량, "여기까지 부으세요"
 * - 내 곡선(2·4): 부은 양의 곡선과 현재 위치 점
 *
 * 목표 대비 편차("몇 g 더")·RMSE·점수는 어느 조건에서도 그리지 않습니다 (lib/experiment.ts).
 * 그래프의 축은 2·3·4가 똑같습니다. 축이 조건마다 다르면 같은 곡선도 다르게 보입니다.
 */

const AMBER = "#d97706";
/** 시간축 눈금 간격(초). 주수 시각에 눈금을 두면 목표가 없는 조건에도 목표가 드러납니다. */
const TICK_STEP_SEC = 30;

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded border bg-white p-3 text-center sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-mono text-3xl whitespace-nowrap tabular-nums sm:text-4xl">
        {value}
        <span className="ml-0.5 text-sm text-slate-400 sm:text-base">{unit}</span>
      </div>
    </div>
  );
}

interface Props {
  flags: DisplayFlags;
  target: Curve;
  elapsedSec: number;
  weightG: number;
  chartData: ChartRow[];
  /** 추출 중(일시정지 포함)인지. 현재 위치 표시는 이때만 그립니다. */
  active: boolean;
}

export default function ExperimentDisplay({
  flags,
  target,
  elapsedSec,
  weightG,
  chartData,
  active,
}: Props) {
  const { showTarget, showOwnCurve } = flags;
  const targets = pourTargets(target);
  const upcoming = active ? nextPourTarget(targets, elapsedSec) : null;
  const endSec = target.length ? target[target.length - 1][0] : 0;
  const totalG = target.length ? Math.max(...target.map(([, g]) => g)) : 0;
  const nowTargetG = target.length ? interpolateAt(target, elapsedSec) : 0;

  // 축은 실측이 아니라 목표에 맞춰 고정합니다. 실측에 맞추면 붓는 동안 축이 늘어나 곡선이 흔들립니다.
  const xMax = Math.max(endSec, Math.ceil(elapsedSec / TICK_STEP_SEC) * TICK_STEP_SEC);
  const yMax = Math.ceil((totalG * 1.12) / 10) * 10;
  const ticks = Array.from(
    { length: Math.floor(xMax / TICK_STEP_SEC) + 1 },
    (_, i) => i * TICK_STEP_SEC,
  );

  return (
    <div className="space-y-3">
      <div className={`grid gap-3 ${showTarget ? "grid-cols-3" : "grid-cols-2"}`}>
        <Stat label="부은 물" value={formatGram(weightG, 1)} unit="g" />
        <Stat label="경과" value={formatClock(Math.floor(elapsedSec))} unit="" />
        {showTarget && (
          <Stat label="지금 목표" value={active ? formatGram(nowTargetG) : "—"} unit="g" />
        )}
      </div>

      {showTarget && active && (
        <div className="rounded border border-slate-900 bg-slate-900 p-4 text-white">
          {upcoming ? (
            <>
              <div className="text-xs text-slate-300">
                {upcoming.index}번째 주수 —{" "}
                {elapsedSec < upcoming.startSec ? "곧 시작합니다" : "여기까지 부으세요"}
              </div>
              <div className="mt-1 flex items-baseline gap-4">
                <span className="font-mono text-3xl tabular-nums">{upcoming.gram} g</span>
                <span className="text-sm text-slate-300">
                  {elapsedSec < upcoming.startSec
                    ? `${formatDuration(upcoming.startSec)}에 시작`
                    : `${formatDuration(upcoming.sec)}까지`}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-300">모두 부었습니다</div>
              <div className="mt-1 text-lg">종료 안내가 있을 때까지 기다려 주세요</div>
            </>
          )}
        </div>
      )}

      {(showTarget || showOwnCurve) && (
        <div className="rounded border bg-white p-4">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 16, right: 48, bottom: 5, left: -20 }}>
              <CartesianGrid stroke="#eef2f7" vertical={false} />
              <XAxis
                dataKey="sec"
                type="number"
                domain={[0, xMax]}
                ticks={ticks}
                tickFormatter={(v) => formatClock(Number(v))}
                fontSize={13}
              />
              <YAxis fontSize={13} domain={[0, yMax]} allowDataOverflow />

              {showTarget && (
                <Line
                  type="linear"
                  dataKey="target"
                  name="목표"
                  stroke="#64748b"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {showOwnCurve && (
                <Line
                  type="linear"
                  dataKey="actual"
                  name="부은 양"
                  stroke="#059669"
                  strokeWidth={4}
                  strokeLinecap="round"
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}

              {/* 현재 시각 표시선. 목표 곡선의 어디쯤인지 읽는 기준입니다. */}
              {showTarget && active && (
                <ReferenceLine x={elapsedSec} stroke={AMBER} strokeWidth={2} />
              )}
              {showTarget && upcoming && elapsedSec >= upcoming.startSec && (
                <ReferenceLine
                  y={upcoming.gram}
                  stroke={AMBER}
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  label={{
                    value: `${upcoming.gram} g`,
                    position: "right",
                    offset: 4,
                    fontSize: 14,
                    fill: AMBER,
                    fontWeight: 700,
                  }}
                />
              )}
              {showOwnCurve && active && (
                <ReferenceDot
                  x={elapsedSec}
                  y={weightG}
                  r={7}
                  fill="#059669"
                  stroke="#fff"
                  strokeWidth={3}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
            {showTarget && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-500" />
                목표
              </span>
            )}
            {showOwnCurve && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-0 w-5 border-t-4 border-emerald-600" />
                부은 양
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
