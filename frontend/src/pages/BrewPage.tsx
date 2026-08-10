import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ScaleStatus } from "../ble/types";
import { useScale } from "../ble/useScale";
import { api, type BrewResult, type Recipe } from "../lib/api";
import type { Curve } from "../lib/rmse";
import { useBrewSession } from "../lib/useBrewSession";

/**
 * 데모 시나리오 3번 — 시연 성패를 가르는 화면.
 *
 * 목표 곡선은 레시피 화면에서 넘겨받습니다. 새로고침하면 사라지므로 그때는 안내를 띄웁니다.
 * 자유 모드(목표 없이 기록만)는 다음 단계에서 붙입니다.
 */

const STATUS_LABEL: Record<ScaleStatus, { text: string; className: string }> = {
  DISCONNECTED: { text: "연결 안 됨", className: "bg-slate-200 text-slate-600" },
  CONNECTING: { text: "연결 중…", className: "bg-amber-100 text-amber-700" },
  CONNECTED: { text: "연결됨", className: "bg-emerald-100 text-emerald-700" },
  RECONNECTING: { text: "재연결 중…", className: "bg-amber-100 text-amber-700" },
};

const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40";
const btnPrimary =
  "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded border bg-white p-4 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-mono text-3xl tabular-nums">
        {value}
        <span className="ml-1 text-base text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

export default function BrewPage() {
  const recipe = (useLocation().state as { recipe?: Recipe } | null)?.recipe ?? null;
  const target: Curve = recipe?.targetCurve ?? [];

  const scale = useScale();
  const brew = useBrewSession(scale.source, target);

  const [saved, setSaved] = useState<BrewResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** 종료와 동시에 저장합니다. 정확도는 서버가 다시 계산한 값을 씁니다. */
  const finishAndSave = async () => {
    brew.finish();
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
    brew.reset();
  };

  const label = STATUS_LABEL[scale.status];
  const connected = scale.status === "CONNECTED";
  const running = brew.phase === "RUNNING";
  const paused = brew.phase === "PAUSED";
  const finished = brew.phase === "FINISHED";

  if (!recipe) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">추출</h1>
        <div className="rounded border bg-white p-8 text-center text-sm text-slate-600">
          따라갈 목표 곡선이 없습니다.
          <div className="mt-3">
            <Link to="/recipe" className={btnPrimary}>
              레시피 만들러 가기
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
        <span className="text-xs text-slate-500">
          목표 {recipe.totalWaterG} g · {recipe.waterTempC} ℃
        </span>
        {brew.sampleCount > 0 && (
          <span className="text-xs text-slate-400">측정 {brew.sampleCount}점</span>
        )}
      </div>

      {!scale.isSupported && (
        <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          이 브라우저는 Web Bluetooth를 지원하지 않습니다. Chrome 또는 Edge를 쓰세요.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="부은 물" value={brew.weightG.toFixed(1)} unit="g" />
        <Stat label="경과" value={brew.elapsedSec.toFixed(0)} unit="초" />
        <Stat
          label="정확도 (RMSE)"
          value={brew.rmse === null ? "—" : brew.rmse.toFixed(1)}
          unit="g"
        />
      </div>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-400" />
            목표
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-5 border-t-2 border-emerald-600" />
            실제
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={brew.chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
            <CartesianGrid stroke="#e2e8f0" />
            <XAxis dataKey="sec" type="number" domain={[0, "dataMax"]} fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip
              formatter={(value, name) => [`${Number(value).toFixed(1)} g`, name]}
              labelFormatter={(v) => `${Number(v).toFixed(0)}초`}
            />
            {/* 목표는 구간 선형이므로 곡선 보간을 쓰면 실제 규칙과 다른 모양이 됩니다. */}
            <Line
              type="linear"
              dataKey="target"
              name="목표"
              stroke="#94a3b8"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="actual"
              name="실제"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-2">
        {!connected ? (
          <button
            onClick={scale.connect}
            disabled={!scale.isSupported || scale.status === "CONNECTING"}
            className={btnPrimary}
          >
            저울 연결
          </button>
        ) : brew.phase === "IDLE" ? (
          <button onClick={brew.start} className={btnPrimary}>
            추출 시작
          </button>
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
            {brew.sampleCount}개 측정 · {saved.durationSec}초 · 최종 {saved.finalWeightG.toFixed(1)}{" "}
            g · 정확도 {saved.rmse === null ? "—" : `${saved.rmse.toFixed(1)} g`}
          </div>
          {saved.rmse !== null && brew.rmse !== null && (
            <div className="mt-1 text-xs text-emerald-700">
              {Math.abs(saved.rmse - brew.rmse) < 0.05
                ? "서버 재계산 결과가 화면 표시값과 일치합니다."
                : `⚠ 화면 표시(${brew.rmse.toFixed(1)})와 서버 계산(${saved.rmse.toFixed(1)})이 다릅니다.`}
            </div>
          )}
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
