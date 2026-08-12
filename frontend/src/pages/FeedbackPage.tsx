import { useMemo, useState } from "react";
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

import { api, type AdjustResult, type Recipe, type TasteRating } from "../lib/api";
import { toRows } from "../lib/changes";
import { interpolateAt, type Curve } from "../lib/rmse";

/**
 * 데모 시나리오 4번 — 맛 평가와 보정 결과.
 *
 * **이 화면에는 조정 규칙이 없습니다.** 맛 평가를 보내고, 서버가 돌려준
 * 변경 내역과 곡선을 그리기만 합니다. 규칙을 여기에 복제하면 백엔드와 어긋납니다.
 *
 * 추출 화면에서 넘어올 때만 동작합니다. 어느 추출에 대한 평가인지 알아야 하기 때문입니다.
 */

interface FeedbackNavState {
  brewId?: number;
  recipe?: Recipe;
}

/** 가운데가 기본값(OK)입니다. 만족스러우면 아무것도 건드리지 않습니다 (dead zone). */
const QUESTIONS = [
  {
    key: "acidity",
    label: "신맛",
    options: [
      { value: "WEAK", text: "약하다" },
      { value: "OK", text: "적당" },
      { value: "STRONG", text: "강하다" },
    ],
  },
  {
    key: "bitterness",
    label: "쓴맛",
    options: [
      { value: "WEAK", text: "약하다" },
      { value: "OK", text: "적당" },
      { value: "STRONG", text: "강하다" },
    ],
  },
  {
    key: "strength",
    label: "농도",
    options: [
      { value: "THIN", text: "연하다" },
      { value: "OK", text: "적당" },
      { value: "THICK", text: "진하다" },
    ],
  },
] as const;

const NEUTRAL: TasteRating = { acidity: "OK", bitterness: "OK", strength: "OK" };

const btn = "rounded border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-40";
const btnPrimary =
  "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";

/**
 * 두 곡선을 한 데이터셋으로 합칩니다.
 *
 * 시간 좌표가 서로 달라 그대로 겹치면 한쪽에 구멍이 생깁니다.
 * 두 곡선의 모든 시각을 모아 각각 보간합니다 — RMSE와 같은 방식입니다.
 */
function overlay(before: Curve, after: Curve) {
  const times = [...new Set([...before, ...after].map(([sec]) => sec))].sort((a, b) => a - b);
  return times.map((sec) => ({
    sec,
    before: interpolateAt(before, sec),
    after: interpolateAt(after, sec),
  }));
}

export default function FeedbackPage() {
  const navState = useLocation().state as FeedbackNavState | null;
  const brewId = navState?.brewId ?? null;
  const recipe = navState?.recipe ?? null;

  const [taste, setTaste] = useState<TasteRating>(NEUTRAL);
  const [result, setResult] = useState<AdjustResult | null>(null);
  const [applied, setApplied] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => (result ? toRows(result.changes) : []), [result]);
  const chartData = useMemo(
    () => (result && recipe ? overlay(recipe.targetCurve, result.recipe.targetCurve) : []),
    [result, recipe],
  );

  const submit = async () => {
    if (brewId === null) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.adjustRecipe(brewId, taste));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const record = async (accepted: boolean) => {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateFeedback(result.feedbackId, accepted);
      setApplied(accepted);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // 새로고침이나 직접 진입이면 어느 추출에 대한 평가인지 알 수 없습니다.
  if (brewId === null || !recipe) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">맛 평가</h1>
        <div className="rounded border bg-white p-8 text-center text-sm text-slate-600">
          추출을 마친 뒤 <b>맛 평가하기</b>를 눌러 들어와 주세요.
          <div className="mt-1 text-xs text-slate-500">
            어느 추출에 대한 평가인지 알아야 레시피를 보정할 수 있습니다.
          </div>
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
        <h1 className="text-lg font-semibold">맛 평가</h1>
        <span className="text-xs text-slate-500">
          추출 #{brewId} · 레시피 #{recipe.recipeId}
        </span>
      </div>

      <div className="space-y-3 rounded border bg-white p-4">
        {QUESTIONS.map((question) => (
          <div key={question.key} className="flex items-center gap-3">
            <span className="w-12 text-sm text-slate-600">{question.label}</span>
            <div className="flex gap-2">
              {question.options.map((option) => {
                const selected = taste[question.key] === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setTaste((prev) => ({ ...prev, [question.key]: option.value }))}
                    disabled={result !== null}
                    className={`rounded border px-3 py-1.5 text-sm disabled:opacity-60 ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {option.text}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <p className="text-xs text-slate-500">
          <b>적당</b>을 고른 항목은 조정하지 않습니다. 만족스러운 값을 괜히 흔들면 다음 추출이 더
          나빠집니다.
        </p>

        {result === null && (
          <button onClick={submit} disabled={busy} className={btnPrimary}>
            {busy ? "계산하는 중…" : "보정 레시피 받기"}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {result && (
        <>
          {/* 변경 내역 — 무엇이 왜 바뀌었는지. 이 표가 발표의 핵심입니다. */}
          <div className="rounded border bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold">변경 내역</h2>
            {rows.length === 0 ? (
              <p className="text-sm text-slate-600">
                바뀐 값이 없습니다. 지금 레시피를 그대로 쓰셔도 좋습니다.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1.5 font-medium">항목</th>
                    <th className="py-1.5 font-medium">이전</th>
                    <th className="py-1.5 font-medium">이후</th>
                    <th className="py-1.5 font-medium">이유</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.field} className="border-b last:border-0">
                      <td className="py-1.5">{row.label}</td>
                      <td className="py-1.5 text-slate-500">{row.before}</td>
                      <td className="py-1.5 font-medium">{row.after}</td>
                      <td className="py-1.5 text-slate-600">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="mt-3 text-sm">
              총 물량 <span className="text-slate-500">{recipe.totalWaterG} g</span> →{" "}
              <b>{result.recipe.totalWaterG} g</b>
            </div>
          </div>

          {/* 적용하지 못한 조정의 이유. 조용히 빼면 사용자는 규칙이 고장난 줄 압니다. */}
          {result.notices.length > 0 && (
            <ul className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {result.notices.map((notice) => (
                <li key={notice}>· {notice}</li>
              ))}
            </ul>
          )}

          <div className="rounded border bg-white p-4">
            <div className="mb-2 flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <span className="inline-block h-0 w-5 border-t-2 border-dashed border-slate-400" />
                이전 목표
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-0 w-5 border-t-2 border-sky-600" />
                보정 목표
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                <CartesianGrid stroke="#e2e8f0" />
                <XAxis dataKey="sec" type="number" domain={[0, "dataMax"]} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  formatter={(value, name) => [`${Number(value).toFixed(0)} g`, name]}
                  labelFormatter={(v) => `${Number(v).toFixed(0)}초`}
                />
                {/* 목표 곡선은 구간 선형입니다. 곡선 보간을 쓰면 실제 규칙과 다른 모양이 됩니다. */}
                <Line
                  type="linear"
                  dataKey="before"
                  name="이전 목표"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="linear"
                  dataKey="after"
                  name="보정 목표"
                  stroke="#0284c7"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded border bg-white p-4">
            {applied === null ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => record(true)} disabled={busy} className={btnPrimary}>
                    이 보정을 적용
                  </button>
                  <button onClick={() => record(false)} disabled={busy} className={btn}>
                    지금 레시피 유지
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  고른 결과를 기록합니다. <b>쓰지 않은 제안도 남겨야</b> 나중에 취향을 학습시킬 때
                  쓸 수 있습니다.
                </p>
              </>
            ) : (
              <div className="space-y-2 text-sm">
                <div className={applied ? "text-sky-900" : "text-slate-700"}>
                  {applied
                    ? `보정 레시피 #${result.suggestedRecipeId}를 적용했습니다.`
                    : "지금 레시피를 유지하기로 기록했습니다."}
                </div>
                <Link
                  to="/brew"
                  state={{ recipe: applied ? result.recipe : recipe }}
                  className="inline-block rounded bg-sky-700 px-3 py-1.5 text-xs font-medium text-white"
                >
                  {applied ? "보정 레시피로 내리기" : "지금 레시피로 다시 내리기"}
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
