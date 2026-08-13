import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ApiError, api, type BrewDetail, type DrinkType, type Recipe } from "../lib/api";
import { formatDateTime, formatDuration } from "../lib/format";
import { downsample } from "../lib/useBrewSession";
import { interpolateAt } from "../lib/rmse";

/**
 * 지난 추출 하나를 다시 펼쳐 보는 화면.
 *
 * **주소에 id가 들어갑니다** (`/history/12`). 화면 간 state로 넘기지 않으므로
 * 새로고침해도 살아남고, 링크를 그대로 열 수 있습니다.
 *
 * 여기서 두 갈래로 이어집니다 — "이 레시피로 다시 내리기" / "맛 평가".
 * 추출 직후를 놓쳐도 나중에 평가할 수 있어야 하기 때문입니다.
 *
 * 자유 모드 추출은 따라간 목표가 없어 둘 다 성립하지 않습니다.
 * 대신 "목표로 저장"을 둬서 막다른 길이 되지 않게 합니다.
 */

/** 실측 2,000점을 그대로 그리면 느립니다. 형태가 유지되는 선에서 줄입니다. */
const CHART_MAX_POINTS = 300;

const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50";
const btnPrimary = "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white";

const TASTE_LABEL: Record<string, string> = {
  STRONG: "강함",
  WEAK: "약함",
  THICK: "진함",
  THIN: "연함",
  OK: "적당",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-3 text-center">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-mono text-xl tabular-nums">{value}</div>
    </div>
  );
}

export default function BrewDetailPage() {
  const { brewId } = useParams();
  const [brew, setBrew] = useState<BrewDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 자유 모드 추출을 다음 목표로 저장하는 흐름.
  // 자유 모드는 원두량·음용 방식을 받지 않았으므로 저장 시점에 물어봅니다.
  const [asRecipe, setAsRecipe] = useState({
    open: false,
    doseG: 20,
    drinkType: "HOT" as DrinkType,
  });
  const [savedRecipe, setSavedRecipe] = useState<Recipe | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);

  const saveAsRecipe = async () => {
    if (!brew) return;
    setRecipeError(null);
    try {
      setSavedRecipe(
        await api.saveBrewAsRecipe(brew.brewId, {
          doseG: asRecipe.doseG,
          drinkType: asRecipe.drinkType,
        }),
      );
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : String(err));
    }
  };

  // 주소가 숫자인지는 렌더 중에 알 수 있습니다. 상태로 두면 불필요한 재렌더가 생깁니다.
  const id = Number(brewId);
  const validId = Number.isInteger(id) && id > 0;

  useEffect(() => {
    if (!validId) return;
    api
      .getBrew(id)
      .then(setBrew)
      .catch((err) => {
        // 404 메시지는 개발자용이라 그대로 띄우지 않습니다.
        if (err instanceof ApiError && err.status === 404) {
          setError("이 기록을 찾을 수 없습니다. 삭제되었거나 주소가 잘못됐습니다.");
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [id, validId]);

  // 훅은 조기 반환보다 위에 있어야 합니다. 렌더마다 같은 순서로 불려야 하기 때문입니다.
  const chartData = useMemo(() => {
    if (!brew) return [];
    const target = brew.recipe?.targetCurve ?? [];
    return downsample(brew.actualCurve, CHART_MAX_POINTS).map(([sec, actual]) => ({
      sec,
      actual,
      // 목표는 시간 좌표가 달라 실측 시각마다 보간합니다 — RMSE와 같은 방식입니다.
      target: target.length > 0 ? interpolateAt(target, sec) : null,
    }));
  }, [brew]);

  if (!validId) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">추출 기록</h1>
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          잘못된 주소입니다.
        </p>
        <Link to="/history" className={btn}>
          목록으로
        </Link>
      </section>
    );
  }

  if (error) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">추출 기록</h1>
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        <Link to="/history" className={btn}>
          목록으로
        </Link>
      </section>
    );
  }

  if (!brew) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">추출 기록</h1>
        <p className="rounded border bg-white p-8 text-center text-sm text-slate-500">
          불러오는 중…
        </p>
      </section>
    );
  }

  const recipe = brew.recipe;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/history" className="text-sm text-sky-700 hover:underline">
          ← 목록
        </Link>
        <h1 className="text-lg font-semibold">{formatDateTime(brew.brewedAt)}</h1>
        {brew.beanName && <span className="text-sm text-slate-600">{brew.beanName}</span>}
        {!recipe && (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">자유 모드</span>
        )}
      </div>

      <div className={`grid gap-3 ${recipe ? "grid-cols-3" : "grid-cols-2"}`}>
        <Stat label="최종 물량" value={`${brew.finalWeightG.toFixed(1)} g`} />
        <Stat label="소요 시간" value={formatDuration(brew.durationSec)} />
        {/* 자유 모드는 비교할 목표가 없어 정확도 칸을 아예 두지 않습니다. */}
        {recipe && (
          <Stat
            label="정확도 (RMSE)"
            value={brew.rmse === null ? "—" : `${brew.rmse.toFixed(1)} g`}
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
          <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
            <CartesianGrid stroke="#e2e8f0" />
            {/* 실측 마지막 시각이 그대로 눈금이 되면 7.2910999…처럼 찍힙니다. */}
            <XAxis
              dataKey="sec"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={(v) => Number(v).toFixed(0)}
              fontSize={12}
            />
            <YAxis fontSize={12} />
            <Tooltip
              formatter={(value, name) => [`${Number(value).toFixed(1)} g`, name]}
              labelFormatter={(v) => `${Number(v).toFixed(0)}초`}
            />
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
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {recipe && (
        <div className="rounded border bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">이때의 레시피</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
            <span>
              총 물량 <b className="text-slate-900">{recipe.totalWaterG} g</b>
            </span>
            {/* 직접 부은 곡선을 목표로 저장한 경우 규칙 값이 존재하지 않습니다. */}
            {recipe.waterTempC !== null && (
              <span>
                물 온도 <b className="text-slate-900">{recipe.waterTempC} ℃</b>
              </span>
            )}
            {recipe.ratio !== null && (
              <span>
                물 비율 <b className="text-slate-900">1:{recipe.ratio}</b>
              </span>
            )}
            {recipe.flowRateGps !== null && (
              <span>
                유량 <b className="text-slate-900">{recipe.flowRateGps.toFixed(1)} g/s</b>
              </span>
            )}
          </div>
          {recipe.pours.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">
              직접 부은 추출을 목표로 저장한 레시피라 주수 계획이 없습니다.
            </p>
          )}
        </div>
      )}

      {brew.feedback && (
        <div className="rounded border bg-white p-4 text-sm">
          <h2 className="mb-2 font-semibold">맛 평가</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
            <span>신맛 {TASTE_LABEL[brew.feedback.acidity]}</span>
            <span>쓴맛 {TASTE_LABEL[brew.feedback.bitterness]}</span>
            <span>농도 {TASTE_LABEL[brew.feedback.strength]}</span>
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {brew.feedback.applied === true
              ? `보정 레시피 #${brew.feedback.suggestedRecipeId}를 적용했습니다.`
              : brew.feedback.applied === false
                ? "보정을 적용하지 않고 기존 레시피를 유지했습니다."
                : "보정을 제안받았지만 적용 여부를 고르지 않았습니다."}
          </div>
        </div>
      )}

      {/* 자유 모드는 따라간 목표가 없어 "다시 내리기"도 "맛 평가"도 성립하지 않습니다.
          대신 목표로 저장해 두면 다음부터는 같은 곡선을 따라 내릴 수 있습니다. */}
      {!recipe && !savedRecipe && (
        <div className="rounded border bg-white p-4">
          {!asRecipe.open ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">이 추출이 마음에 드셨나요?</div>
                <div className="text-slate-600">
                  목표로 저장해두면 다음에 같은 곡선을 따라 내릴 수 있습니다.
                </div>
              </div>
              <button
                onClick={() => setAsRecipe((p) => ({ ...p, open: true }))}
                className={btnPrimary}
              >
                목표로 저장
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">원두량 (g)</span>
                <input
                  type="number"
                  min={10}
                  max={30}
                  value={asRecipe.doseG}
                  onChange={(e) => setAsRecipe((p) => ({ ...p, doseG: Number(e.target.value) }))}
                  className="w-24 rounded border border-slate-300 px-2 py-1.5 text-sm"
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
          )}
          <p className="mt-2 text-xs text-slate-500">
            실측 그대로가 아니라 <b>주수 구간만 뽑아 따라 하기 쉬운 곡선</b>으로 다듬어 저장합니다.
          </p>
          {recipeError && <p className="mt-2 text-sm text-red-700">{recipeError}</p>}
        </div>
      )}

      {savedRecipe && (
        <div className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <div className="font-medium">목표로 저장했습니다 (레시피 #{savedRecipe.recipeId})</div>
          <div className="mt-1">
            {savedRecipe.targetCurve.length}점으로 다듬었습니다 · 총 {savedRecipe.totalWaterG} g
          </div>
          <Link
            to="/brew"
            state={{ recipe: savedRecipe }}
            className="mt-2 inline-block rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white"
          >
            이 목표로 내리기
          </Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {recipe && (
          <Link to="/brew" state={{ recipe }} className={btnPrimary}>
            이 레시피로 다시 내리기
          </Link>
        )}
        {/* 평가는 추출당 하나뿐입니다. 이미 했으면 누를 수 없는 버튼을 띄우지 않습니다. */}
        {recipe && !brew.feedback && (
          <Link to="/feedback" state={{ brewId: brew.brewId, recipe }} className={btn}>
            맛 평가하기
          </Link>
        )}
      </div>
    </section>
  );
}
