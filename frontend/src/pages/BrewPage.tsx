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
import { api, type BrewResult, type DrinkType, type Recipe } from "../lib/api";
import type { Curve } from "../lib/rmse";
import { useBrewSession } from "../lib/useBrewSession";

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
  const navState = useLocation().state as BrewNavState | null;
  const recipe = navState?.recipe ?? null;
  const freeMode = navState?.free === true;
  const target: Curve = recipe?.targetCurve ?? [];

  const scale = useScale();
  const brew = useBrewSession(scale.source, target);

  const [saved, setSaved] = useState<BrewResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 마음에 든 추출을 다음 목표로 저장하는 흐름.
  // 자유 모드는 원두량·음용 방식을 받지 않았으므로 여기서 물어봅니다.
  const [asRecipe, setAsRecipe] = useState({
    open: false,
    doseG: 20,
    drinkType: "HOT" as DrinkType,
  });
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  const saveAsRecipe = async () => {
    if (!saved) return;
    setRecipeError(null);
    try {
      setSavedRecipe(
        await api.saveBrewAsRecipe(saved.brewId, {
          doseG: asRecipe.doseG,
          drinkType: asRecipe.drinkType,
        }),
      );
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : String(err));
    }
  };

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
    setSavedRecipe(null);
    setRecipeError(null);
    setAsRecipe((prev) => ({ ...prev, open: false }));
    brew.reset();
  };

  const label = STATUS_LABEL[scale.status];
  const connected = scale.status === "CONNECTED";
  const running = brew.phase === "RUNNING";
  const paused = brew.phase === "PAUSED";
  const finished = brew.phase === "FINISHED";

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
        <Stat label="부은 물" value={brew.weightG.toFixed(1)} unit="g" />
        <Stat label="경과" value={brew.elapsedSec.toFixed(0)} unit="초" />
        {/* 자유 모드는 비교할 목표가 없어 정확도 칸을 아예 두지 않습니다. "—"만 띄우면 고장처럼 보입니다. */}
        {recipe && (
          <Stat
            label="정확도 (RMSE)"
            value={brew.rmse === null ? "—" : brew.rmse.toFixed(1)}
            unit="g"
          />
        )}
      </div>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
          {recipe && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-400" />
              목표
            </span>
          )}
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
            {recipe && (
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
            )}
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
            g{saved.rmse !== null && ` · 정확도 ${saved.rmse.toFixed(1)} g`}
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
          {/* 맛 평가는 따라간 목표가 있어야 보정할 대상이 생깁니다. 자유 모드에는 띄우지 않습니다. */}
          {recipe && (
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
          {!asRecipe.open ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">이 추출이 마음에 드셨나요?</div>
                <div className="mt-0.5 text-slate-500">
                  목표로 저장해두면 다음에 같은 곡선을 따라 내릴 수 있습니다.
                </div>
              </div>
              <button onClick={() => setAsRecipe((p) => ({ ...p, open: true }))} className={btn}>
                목표로 저장
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium">이 추출을 목표로 저장</div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">원두량 {asRecipe.doseG} g</span>
                  <input
                    type="range"
                    min={10}
                    max={30}
                    value={asRecipe.doseG}
                    onChange={(e) => setAsRecipe((p) => ({ ...p, doseG: Number(e.target.value) }))}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-600">음용 방식</span>
                  <select
                    value={asRecipe.drinkType}
                    onChange={(e) =>
                      setAsRecipe((p) => ({ ...p, drinkType: e.target.value as DrinkType }))
                    }
                    className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="HOT">핫</option>
                    <option value="ICE">아이스</option>
                  </select>
                </label>
                <button onClick={saveAsRecipe} className={btnPrimary}>
                  저장
                </button>
                <button onClick={() => setAsRecipe((p) => ({ ...p, open: false }))} className={btn}>
                  취소
                </button>
              </div>
              <p className="text-xs text-slate-500">
                실측 그대로가 아니라 <b>주수 구간만 뽑아 따라 하기 쉬운 곡선</b>으로 다듬어
                저장합니다. 손떨림까지 따라 할 필요는 없으니까요.
              </p>
            </div>
          )}
          {recipeError && <p className="mt-2 text-sm text-red-700">{recipeError}</p>}
        </div>
      )}

      {savedRecipe && (
        <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="font-medium">목표로 저장했습니다 (레시피 #{savedRecipe.recipeId})</div>
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
