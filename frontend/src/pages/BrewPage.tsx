import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ScaleStatus } from "../ble/types";
import { useScale } from "../ble/useScale";
import SaveAsRecipeForm from "../components/SaveAsRecipeForm";
import { api, type BrewResult, type Recipe } from "../lib/api";
import { formatClock, formatDuration, formatGram } from "../lib/format";
import { brewEnd, nextPourTarget, pourTargets, type PourTarget } from "../lib/pours";
import type { Curve } from "../lib/rmse";
import { DROP_ABORT_G, useBrewSession } from "../lib/useBrewSession";

/**
 * 데모 시나리오 3번 — 시연 성패를 가르는 화면.
 *
 * 두 가지 모드가 있습니다.
 * - **가이드**: 레시피 화면에서 목표 곡선을 넘겨받아 따라가고 정확도를 측정
 * - **자유**: 목표 없이 내 추출만 기록. 비교 대상이 없어 정확도가 나오지 않습니다.
 *
 * 둘 다 새로고침하면 넘겨받은 상태가 사라지므로 그때는 안내를 띄웁니다.
 */

interface BrewNavState {
  recipe?: Recipe;
  free?: boolean;
}

const STATUS_LABEL: Record<ScaleStatus, { text: string; className: string }> = {
  DISCONNECTED: { text: "연결 안 됨", className: "bg-slate-200 text-slate-600" },
  CONNECTING: { text: "연결 중…", className: "bg-amber-100 text-amber-700" },
  CONNECTED: { text: "연결됨", className: "bg-emerald-100 text-emerald-700" },
  RECONNECTING: { text: "재연결 중…", className: "bg-amber-100 text-amber-700" },
};

const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40";
const btnPrimary =
  "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";

const unitClass = "ml-0.5 text-sm text-slate-400 sm:text-base";

/** 지금 부어야 할 주수의 색. 그래프 세로선·가로선·시간표 칸이 모두 이 색으로 묶입니다. */
const AMBER = "#d97706";

/** 지난 주수는 흐리게, 지금 주수는 주황, 앞으로 올 주수는 보통. */
type PourState = "past" | "current" | "next";

const POUR_COLOR: Record<PourState, { line: string; dot: string; text: string }> = {
  past: { line: "#e2e8f0", dot: "#cbd5e1", text: "#94a3b8" },
  current: { line: AMBER, dot: AMBER, text: AMBER },
  next: { line: "#94a3b8", dot: "#0f172a", text: "#334155" },
};

const POUR_CHIP: Record<PourState, string> = {
  past: "border-slate-200 text-slate-400",
  current: "border-amber-600 bg-amber-600 text-white",
  next: "border-slate-300 text-slate-700",
};

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // 폰에서는 세 칸이 좁아 글자와 여백을 한 단계 줄입니다. "1분 10초"가 넘치지 않게.
    <div className="rounded border bg-white p-3 text-center sm:p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-mono text-2xl whitespace-nowrap tabular-nums sm:text-3xl">
        {children}
      </div>
    </div>
  );
}

/** 숫자는 크게, 단위는 작게. */
function Value({ value, unit }: { value: string; unit: string }) {
  return (
    <>
      {value}
      <span className={unitClass}>{unit}</span>
    </>
  );
}

/** 경과 시간. 1분이 넘으면 "1분 10초"로 — 70초보다 저울 타이머(1:10)와 맞춰 읽기 쉽습니다. */
function Elapsed({ sec }: { sec: number }) {
  const whole = Math.floor(sec);
  const minutes = Math.floor(whole / 60);
  const seconds = whole % 60;
  if (minutes === 0) return <Value value={String(seconds)} unit="초" />;
  return (
    <>
      <Value value={String(minutes)} unit="분" /> <Value value={String(seconds)} unit="초" />
    </>
  );
}

export default function BrewPage() {
  const navState = useLocation().state as BrewNavState | null;
  const recipe = navState?.recipe ?? null;
  const freeMode = navState?.free === true;
  // 렌더마다 새 배열이 되면 이 값을 쓰는 훅이 매번 다시 계산합니다.
  const target: Curve = useMemo(() => recipe?.targetCurve ?? [], [recipe]);

  const scale = useScale();
  const brew = useBrewSession(scale.source, target);

  const [saved, setSaved] = useState<BrewResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 마음에 든 추출을 다음 목표로 저장하는 흐름. 폼 자체는 SaveAsRecipeForm에 있습니다.
  const [saveFormOpen, setSaveFormOpen] = useState(false);
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);

  /**
   * 추출 시작 — 저울 타이머도 함께 켭니다.
   *
   * 브루잉은 보통 저울 타이머를 누르며 시작합니다. 화면만 시작하면 저울에는 0초가 떠 있어
   * **손은 저울을 보는데 시간이 안 가는** 상황이 됩니다. 두 시계를 하나로 맞춥니다.
   *
   * 타이머 명령이 실패해도 추출은 진행합니다. 곡선의 시간은 저울 타이머가 아니라
   * 패킷 도착 시각으로 계산하므로, 표시가 안 맞을 뿐 기록은 정확합니다.
   */
  const startBrew = () => {
    brew.start();
    void scale.resetTimer().then(() => scale.startTimer());
  };

  // 측정이 끊기면(저울 영점 등) 저울 타이머도 멈춥니다. 화면은 멈췄는데 저울만 돌면 헷갈립니다.
  const registerAbort = brew.onAbort;
  const stopTimer = scale.stopTimer;
  useEffect(() => {
    registerAbort(() => void stopTimer());
    return () => registerAbort(null);
  }, [registerAbort, stopTimer]);

  // 아래 자동 시작 effect가 쓰는 값들. 훅 목록에 넣기 좋게 따로 꺼내 둡니다.
  const phaseNow = brew.phase;
  const startSession = brew.start;

  /**
   * 저울에서 타이머를 켜면 추출도 시작합니다.
   *
   * 브루잉은 보통 저울 버튼을 누르며 시작합니다. 화면 버튼을 따로 눌러야 하면
   * 손이 두 군데로 나뉘고, 두 시작 시각이 어긋나 곡선이 밀립니다.
   *
   * **상태가 아니라 전환을 봅니다.** "RUNNING이면 시작"으로 두면, 추출을 끝내고
   * 다시 하기를 눌렀을 때 저울이 아직 RUNNING을 보내고 있어 곧바로 다시 시작해 버립니다.
   *
   * 앱에서 시작한 경우에도 저울이 `R`을 되돌려주지만, 그때는 이미 RUNNING이라 아무 일도 없습니다.
   */
  const lastTimerStateRef = useRef(scale.timerState);
  useEffect(() => {
    const previous = lastTimerStateRef.current;
    lastTimerStateRef.current = scale.timerState;

    if (scale.timerState === "RUNNING" && previous !== "RUNNING" && phaseNow === "IDLE") {
      startSession();
    }
  }, [scale.timerState, phaseNow, startSession]);

  /** 종료와 동시에 저장합니다. 정확도는 서버가 다시 계산한 값을 씁니다. */
  const finishAndSave = async () => {
    brew.finish();
    void scale.stopTimer();
    const record = brew.getRecord();
    if (!record) return;

    setSaving(true);
    setSaveError(null);
    try {
      setSaved(await api.saveBrew({ recipeId: recipe?.recipeId, ...record }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const restart = () => {
    setSaved(null);
    setSaveError(null);
    setSavedRecipe(null);
    setSaveFormOpen(false);
    brew.reset();
    void scale.resetTimer();
  };

  // "몇 초에 몇 g까지" — 곡선에서 직접 뽑습니다. 기록으로 만든 레시피에도 통합니다.
  const targets = useMemo(() => pourTargets(target), [target]);
  const finishPoint = useMemo(() => brewEnd(target), [target]);
  const upcoming = nextPourTarget(targets, brew.elapsedSec);
  // 마지막 주수까지 끝났고 물이 다 빠질 시간도 지났는데 아직 기록 중인 상태.
  const overtime = !upcoming && finishPoint !== null && brew.elapsedSec >= finishPoint.sec;

  const label = STATUS_LABEL[scale.status];
  const connected = scale.status === "CONNECTED";
  const running = brew.phase === "RUNNING";
  const paused = brew.phase === "PAUSED";
  const finished = brew.phase === "FINISHED";
  const aborted = brew.phase === "ABORTED";

  // 그래프와 시간표가 같은 기준으로 칠하도록 주수의 상태를 한 곳에서 정합니다.
  // 추출 전·후에는 "지금"이 없으므로 강조하지 않습니다.
  const currentPour = (running || paused) && upcoming ? upcoming : null;
  const pourState = (pour: PourTarget): PourState =>
    pour.index === currentPour?.index ? "current" : brew.elapsedSec >= pour.sec ? "past" : "next";

  // 새로고침이나 직접 진입이면 넘겨받은 상태가 없습니다. 어느 모드인지 알 수 없으니 되돌립니다.
  if (!recipe && !freeMode) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">추출</h1>
        <div className="rounded border bg-white p-8 text-center text-sm text-slate-600">
          추출을 시작하려면 레시피 화면에서 방식을 골라 주세요.
          <div className="mt-3">
            <Link to="/recipe" className={btnPrimary}>
              레시피 화면으로
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">추출</h1>
        <span className={`rounded px-2 py-0.5 text-xs ${label.className}`}>{label.text}</span>
        {recipe ? (
          <span className="text-xs text-slate-500">
            목표 {recipe.totalWaterG} g · {recipe.waterTempC} ℃
          </span>
        ) : (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">자유 모드</span>
        )}
        {brew.sampleCount > 1 && (
          <span className="text-xs text-slate-400">측정 {brew.sampleCount}점</span>
        )}
      </div>

      {!scale.isSupported && (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 Edge를 쓰세요.
        </p>
      )}

      <div className={`grid gap-3 ${recipe ? "grid-cols-3" : "grid-cols-2"}`}>
        <Stat label="부은 물">
          <Value value={formatGram(brew.weightG, 1)} unit="g" />
        </Stat>
        <Stat label="경과">
          <Elapsed sec={brew.elapsedSec} />
        </Stat>
        {/* 자유 모드는 비교할 목표가 없어 정확도 칸을 아예 두지 않습니다. "—"만 띄우면 고장처럼 보입니다. */}
        {recipe && (
          <Stat label="정확도 (RMSE)">
            <Value value={brew.rmse === null ? "—" : brew.rmse.toFixed(1)} unit="g" />
          </Stat>
        )}
      </div>

      {/* 경과 시간은 저울 패킷이 도착할 때 갱신됩니다. 연결이 끊기면 숫자가 멈춰 고장처럼 보여
          이유를 알립니다. 다시 연결되면 실제 흐른 시간으로 이어집니다. */}
      {(running || paused) && !connected && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-medium">
            {scale.status === "RECONNECTING" ? "저울 다시 연결하는 중…" : "저울 연결이 끊겼습니다"}
          </div>
          <div className="mt-0.5 text-amber-800">
            무게가 들어오지 않아 시간과 그래프가 멈춰 있습니다. 다시 연결되면 이어서 기록합니다.
            {scale.status === "DISCONNECTED" && " 아래 '저울 다시 연결'을 누르세요."}
          </div>
        </div>
      )}

      {/* 추출 중에는 그래프를 읽을 여유가 없습니다. 다음에 맞출 값을 글자로 크게 둡니다. */}
      {recipe && (running || paused) && (
        <div
          className={`rounded border p-4 ${
            overtime
              ? "border-amber-500 bg-amber-500 text-white"
              : "border-slate-900 bg-slate-900 text-white"
          }`}
        >
          {upcoming ? (
            <>
              <div className="text-xs text-slate-300">
                {upcoming.index}번째 주수 —{" "}
                {brew.elapsedSec < upcoming.startSec ? "곧 시작합니다" : "여기까지 부으세요"}
              </div>
              <div className="mt-1 flex items-baseline gap-4">
                <span className="font-mono text-3xl tabular-nums">{upcoming.gram} g</span>
                {/* 아직 시작 전이면 "언제 붓기 시작하는지", 붓는 중이면 "언제까지"가 궁금합니다. */}
                <span className="text-sm text-slate-300">
                  {brew.elapsedSec < upcoming.startSec
                    ? `${formatDuration(upcoming.startSec)}에 시작 · ${formatDuration(Math.ceil(upcoming.startSec - brew.elapsedSec))} 뒤`
                    : `${formatDuration(upcoming.sec)}까지 · ${formatDuration(Math.max(0, Math.ceil(upcoming.sec - brew.elapsedSec)))} 남음`}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                지금 {formatGram(brew.weightG)} g ·{" "}
                {Math.max(0, upcoming.gram - brew.weightG).toFixed(0)} g 더
              </div>
            </>
          ) : overtime && finishPoint ? (
            // 목표 시간을 넘겨도 기록은 계속됩니다. 종료를 잊으면 빈 시간이 길게 붙어
            // 정확도 계산에 그대로 들어가므로, 넘겼다는 것을 눈에 띄게 알립니다.
            <>
              <div className="text-xs text-amber-50">목표 시간이 지났습니다</div>
              <div className="mt-1 text-lg font-medium">
                물이 다 빠졌으면 <b>추출 종료</b>를 누르세요
              </div>
              <div className="mt-1 text-sm text-amber-50">
                목표 {formatDuration(finishPoint.sec)} ·{" "}
                {formatDuration(Math.floor(brew.elapsedSec - finishPoint.sec))} 초과
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-300">모두 부었습니다</div>
              <div className="mt-1 text-lg">물이 다 빠질 때까지 기다리세요</div>
              {/* 남은 시간이 없으면 언제까지 기다려야 하는지 알 수 없습니다. */}
              {finishPoint && (
                <div className="mt-1 text-sm text-slate-300">
                  {formatDuration(finishPoint.sec)}까지 ·{" "}
                  {formatDuration(Math.ceil(finishPoint.sec - brew.elapsedSec))} 남음
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 추출 중에는 저울과 드리퍼를 보다가 **힐끗** 보는 화면입니다.
          읽는 시간이 0.5초라고 가정하고, 실제선은 굵게·목표선은 배경으로 물러나게 두고
          "지금 어디"만 튀게 합니다. */}
      <div className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
          {recipe && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-500" />
              목표
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-5 border-t-4 border-emerald-600" />
            실제
          </span>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          {/* 위 여백은 주수 시각 줄, 오른쪽 여백은 목표 물량("240 g")과 "완성 300 g" 자리입니다. */}
          <LineChart data={brew.chartData} margin={{ top: 28, right: 48, bottom: 5, left: -20 }}>
            {/* 격자 세로선은 뺍니다. 주수 시작 세로선과 섞여 어느 게 의미 있는 선인지 흐려집니다. */}
            <CartesianGrid stroke="#eef2f7" vertical={false} />
            {/* 목표가 없는 자유 모드에서는 실측 마지막 시각이 그대로 눈금이 됩니다. */}
            <XAxis
              dataKey="sec"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={(v) => formatClock(Number(v))}
              fontSize={13}
            />
            {/* 위쪽에 여유를 둡니다. 맨 위 주수의 물량 라벨이 그래프 위 시각 줄과 겹치지 않게. */}
            <YAxis fontSize={13} domain={[0, (max: number) => Math.ceil((max * 1.12) / 10) * 10]} />
            <Tooltip
              formatter={(value, name) => [`${Number(value).toFixed(1)} g`, name]}
              labelFormatter={(v) => formatDuration(Math.round(Number(v)))}
            />

            {/* 목표는 구간 선형이므로 곡선 보간을 쓰면 실제 규칙과 다른 모양이 됩니다. */}
            {recipe && (
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
            <Line
              type="linear"
              dataKey="actual"
              name="실제"
              stroke="#059669"
              strokeWidth={4}
              strokeLinecap="round"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />

            {/* 실제선의 끝 — 지금 위치. 붓는 동안 계속 움직여 눈이 따라갑니다.
                선 끝을 찾는 대신 이 점만 보면 목표보다 위인지 아래인지 바로 읽힙니다. */}
            {(running || paused) && (
              <ReferenceDot
                x={brew.elapsedSec}
                y={brew.weightG}
                r={7}
                fill="#059669"
                stroke="#fff"
                strokeWidth={3}
              />
            )}

            {/* **언제는 세로선, 얼마나는 가로선.**
                주수 시작마다 세로선을 긋고 시각을 그래프 맨 위 한 줄에 둡니다 — 시간표처럼 가로로 읽힙니다.
                점 옆에 시각을 붙이면 어느 점의 시각인지 헷갈리고, 위아래로 흩어져 한 줄로 안 읽혔습니다. */}
            {targets.map((pour) => {
              const state = pourState(pour);
              return (
                <ReferenceLine
                  key={`start-${pour.index}`}
                  x={pour.startSec}
                  stroke={POUR_COLOR[state].line}
                  strokeWidth={state === "current" ? 2.5 : 1}
                  strokeDasharray={state === "current" ? undefined : "3 4"}
                  label={{
                    value: formatClock(pour.startSec),
                    position: "top",
                    offset: 8,
                    fontSize: 13,
                    fill: POUR_COLOR[state].text,
                    fontWeight: state === "current" ? 700 : 500,
                  }}
                />
              );
            })}

            {/* 지금 부을 주수의 목표 물량까지 가로선. 초록 실선이 이 선에 닿으면 멈추면 됩니다. */}
            {currentPour && (
              <ReferenceLine
                y={currentPour.gram}
                stroke={AMBER}
                strokeWidth={2}
                strokeDasharray="6 4"
                label={{
                  value: `${currentPour.gram} g`,
                  position: "right",
                  offset: 4,
                  fontSize: 14,
                  fill: AMBER,
                  fontWeight: 700,
                }}
              />
            )}

            {/* 주수 끝점과 물량. 지금 주수는 위 가로선이 물량을 보여줘서 라벨을 겹쳐 달지 않습니다. */}
            {targets.map((pour) => {
              const state = pourState(pour);
              return (
                <ReferenceDot
                  key={`end-${pour.index}`}
                  x={pour.sec}
                  y={pour.gram}
                  r={state === "current" ? 6 : 4}
                  fill={POUR_COLOR[state].dot}
                  stroke="#fff"
                  strokeWidth={1.5}
                  label={
                    state === "current"
                      ? undefined
                      : {
                          value: `${pour.gram} g`,
                          position: "top",
                          offset: 8,
                          fontSize: 14,
                          fill: POUR_COLOR[state].text,
                          fontWeight: state === "past" ? 400 : 700,
                        }
                  }
                />
              );
            })}

            {/* 물이 다 빠지는 지점 — 추출이 끝나는 시각과 최종 물량.
                주수 끝점과 같은 물량이라도, 여기까지가 한 잔이라는 것을 보여줍니다. */}
            {finishPoint && (
              <ReferenceDot
                x={finishPoint.sec}
                y={finishPoint.gram}
                r={4}
                fill={brew.elapsedSec >= finishPoint.sec ? "#cbd5e1" : "#0f172a"}
                stroke="#fff"
                strokeWidth={1.5}
                label={{
                  value: `완성 ${finishPoint.gram} g`,
                  // 완성점은 늘 그래프 오른쪽 끝이라 위·오른쪽에 두면 잘립니다.
                  // 드립다운 구간은 수평선이라 그 아래가 비어 있습니다.
                  position: "bottom",
                  offset: 10,
                  fontSize: 14,
                  fill: brew.elapsedSec >= finishPoint.sec ? "#94a3b8" : "#0f172a",
                  fontWeight: brew.elapsedSec >= finishPoint.sec ? 400 : 700,
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>

        {/* 주수 시간표. 그래프 선은 모양을, 이 줄은 정확한 숫자를 맡습니다.
            그래프에서 지금 주수를 주황으로 칠한 것과 같은 칸을 같은 색으로 맞춰 두 곳이 한 쌍으로 읽힙니다. */}
        {recipe && targets.length > 0 && (
          <ol className="mt-3 flex flex-wrap gap-1.5 text-sm">
            {targets.map((pour) => {
              const state = pourState(pour);
              return (
                <li
                  key={pour.index}
                  className={`rounded-md border px-2 py-1 tabular-nums ${POUR_CHIP[state]}`}
                >
                  <span className="mr-1 text-xs opacity-80">
                    {state === "past" ? "✓ " : ""}
                    {pour.index === 1 ? "뜸" : `${pour.index}차`}
                  </span>
                  {formatClock(pour.startSec)} → <b>{pour.gram} g</b>
                </li>
              );
            })}
            {finishPoint && (
              <li className="rounded-md border border-slate-200 px-2 py-1 text-slate-500 tabular-nums">
                <span className="mr-1 text-xs">완성</span>
                {formatClock(finishPoint.sec)}
              </li>
            )}
          </ol>
        )}
      </div>

      {/* 측정이 끊긴 뒤의 값은 어느 것도 믿을 수 없어 저장 버튼 자체를 두지 않습니다.
          "고쳐서 이어가는" 척하면 기록이 오염되는데 화면은 멀쩡해 보여 더 위험합니다. */}
      {aborted && (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-medium">저울 영점이 눌려 측정이 끊겼습니다</div>
          <div className="mt-1 text-red-700">
            무게가 갑자기 {DROP_ABORT_G} g 넘게 떨어졌습니다. 추출 중에는 저울의 영점 버튼을
            누르거나 드리퍼를 들어올리면 안 됩니다. 이 추출은 저장할 수 없습니다.
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* 추출 단계를 먼저 봅니다. 연결 여부를 먼저 보면 추출 중에 저울이 끊겼을 때
            종료 버튼이 사라져, 그때까지 기록한 것을 저장할 방법이 없어집니다. */}
        {brew.phase === "IDLE" ? (
          !connected ? (
            <button
              onClick={scale.connect}
              disabled={!scale.isSupported || scale.status === "CONNECTING"}
              className={btnPrimary}
            >
              저울 연결
            </button>
          ) : (
            <button onClick={startBrew} className={btnPrimary}>
              추출 시작
            </button>
          )
        ) : running ? (
          <>
            <button onClick={brew.pause} className={btn}>
              일시정지
            </button>
            <button onClick={finishAndSave} className={btnPrimary}>
              추출 종료
            </button>
          </>
        ) : paused ? (
          <>
            <button onClick={brew.resume} className={btnPrimary}>
              재개
            </button>
            <button onClick={finishAndSave} className={btn}>
              추출 종료
            </button>
          </>
        ) : (
          <button onClick={restart} className={btn}>
            다시 하기
          </button>
        )}

        {/* 자동 재연결이 끝내 실패한 경우. 다시 붙으면 같은 추출에 이어서 기록합니다 —
            시간은 패킷 도착 시각으로 계산해 끊긴 동안도 흐른 것으로 잡힙니다. */}
        {(running || paused) && scale.status === "DISCONNECTED" && (
          <button onClick={scale.connect} disabled={!scale.isSupported} className={btn}>
            저울 다시 연결
          </button>
        )}

        <button onClick={scale.tare} disabled={!connected || running} className={btn}>
          영점
        </button>
      </div>

      {connected && brew.phase === "IDLE" && (
        <p className="text-sm text-slate-500">
          드리퍼를 저울에 올린 뒤 <b>추출 시작</b>을 누르세요. 시작 시점의 무게를 기준으로 삼아 부은
          물의 양만 기록합니다.
        </p>
      )}
      {finished && saving && (
        <p className="rounded border bg-white p-3 text-sm text-slate-600">기록을 저장하는 중…</p>
      )}

      {finished && saved && (
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <div className="font-medium">기록 저장 완료 (#{saved.brewId})</div>
          <div className="mt-1">
            {brew.sampleCount}개 측정 · {formatDuration(saved.durationSec)} · 최종{" "}
            {formatGram(saved.finalWeightG, 1)} g
            {saved.rmse !== null && ` · 정확도 ${saved.rmse.toFixed(1)} g`}
          </div>
          {saved.rmse !== null && brew.rmse !== null && (
            <div className="mt-1 text-xs text-emerald-700">
              {Math.abs(saved.rmse - brew.rmse) < 0.05
                ? "서버 재계산 결과가 화면 표시값과 일치합니다."
                : `⚠ 화면 표시(${brew.rmse.toFixed(1)})와 서버 계산(${saved.rmse.toFixed(1)})이 다릅니다.`}
            </div>
          )}
          {!recipe && (
            <div className="mt-1 text-xs text-emerald-700">
              따라간 목표가 없어 정확도는 기록되지 않습니다.
            </div>
          )}
          {/* 맛 평가는 조정할 규칙 값(온도·유량·Ratio)이 있어야 합니다. 자유 모드는 목표가 없고,
              기록으로 만든 레시피는 규칙 값이 없어 서버가 거절합니다. 둘 다 띄우지 않습니다. */}
          {recipe && recipe.ratio !== null && (
            <Link
              to="/feedback"
              state={{ brewId: saved.brewId, recipe }}
              className="mt-2 inline-block rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white"
            >
              맛 평가하기
            </Link>
          )}
        </div>
      )}

      {/* 마음에 든 추출을 다음 목표로 저장 — Rule Engine 없이 재현 루프를 닫는 경로 */}
      {finished && saved && !savedRecipe && (
        <div className="rounded border bg-white p-4">
          {!saveFormOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">이 추출이 마음에 드셨나요?</div>
                <div className="mt-0.5 text-slate-500">
                  목표로 저장해두면 다음에 같은 곡선을 따라 내릴 수 있습니다.
                </div>
              </div>
              <button onClick={() => setSaveFormOpen(true)} className={btn}>
                목표로 저장
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 text-sm font-medium">이 추출을 목표로 저장</div>
              <SaveAsRecipeForm
                brewId={saved.brewId}
                onSaved={setSavedRecipe}
                onCancel={() => setSaveFormOpen(false)}
              />
            </>
          )}
        </div>
      )}

      {savedRecipe && (
        <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="font-medium">
            목표로 저장했습니다
            {savedRecipe.name ? ` — ${savedRecipe.name}` : ` (레시피 #${savedRecipe.recipeId})`}
          </div>
          {savedRecipe.beanName && (
            <div className="mt-0.5 text-xs text-sky-800">원두: {savedRecipe.beanName}</div>
          )}
          <div className="mt-1">
            측정 {brew.sampleCount}점을 {savedRecipe.targetCurve.length}점으로 다듬었습니다 · 총{" "}
            {savedRecipe.totalWaterG} g
          </div>
          <Link
            to="/brew"
            state={{ recipe: savedRecipe }}
            onClick={restart}
            className="mt-2 inline-block rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            이 목표로 다시 내리기
          </Link>
        </div>
      )}

      {finished && saveError && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          기록 저장 실패 — {saveError}
        </p>
      )}

      {scale.error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {scale.error}
        </p>
      )}
    </section>
  );
}
