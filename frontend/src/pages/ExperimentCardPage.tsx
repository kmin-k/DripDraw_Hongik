import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type Recipe } from "../lib/api";
import { loadExperimentRecipeId } from "../lib/experiment";
import { formatDuration } from "../lib/format";
import { brewEnd, pourTargets } from "../lib/pours";

/**
 * 실험 레시피 카드 (인쇄용).
 *
 * 모든 조건의 참가자 앞에 같은 카드를 둡니다. 화면에 목표가 없는 조건(1·2)도 레시피는 알아야
 * "가이드의 효과"와 "레시피를 아느냐"가 섞이지 않습니다 (lib/experiment.ts).
 * 숫자는 목표 곡선에서 직접 뽑아 화면의 목표와 어긋나지 않게 합니다.
 */

export default function ExperimentCardPage() {
  // 저장해 둔 레시피가 없으면 불러올 것도 없습니다. 처음부터 안내 문구로 시작합니다.
  const [recipeId] = useState(loadExperimentRecipeId);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(
    recipeId === null ? "실험 레시피가 없습니다. 실험 화면에서 먼저 만들어 주세요." : null,
  );

  useEffect(() => {
    if (recipeId === null) return;
    api
      .getRecipe(recipeId)
      .then(setRecipe)
      .catch(() => setError("실험 레시피를 찾지 못했습니다."));
  }, [recipeId]);

  if (error) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-red-700">{error}</p>
        <Link to="/experiment" className="underline">
          실험 화면으로
        </Link>
      </div>
    );
  }
  if (!recipe) return <p className="text-sm text-slate-500">불러오는 중…</p>;

  const pours = pourTargets(recipe.targetCurve);
  const end = brewEnd(recipe.targetCurve);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/experiment" className="text-sm underline">
          ← 실험 화면
        </Link>
        <button
          onClick={() => window.print()}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white"
        >
          인쇄
        </button>
      </div>

      <div className="rounded-xl border-2 border-slate-900 bg-white p-6">
        <h1 className="text-2xl font-bold">레시피 카드</h1>
        <p className="mt-1 text-slate-600">
          총 {recipe.totalWaterG} g을 {pours.length}번에 나눠 붓습니다.
        </p>
        <table className="mt-4 w-full text-left text-xl tabular-nums">
          <thead className="border-b-2 border-slate-900 text-base text-slate-600">
            <tr>
              <th className="py-2">주수</th>
              <th className="text-right">붓기 시작</th>
              <th className="text-right">붓기 끝</th>
              <th className="text-right">목표 누적량</th>
            </tr>
          </thead>
          <tbody>
            {pours.map((p) => (
              <tr key={p.index} className="border-b">
                <td className="py-3">{p.index}차</td>
                <td className="text-right">{formatDuration(p.startSec)}</td>
                <td className="text-right">{formatDuration(p.sec)}</td>
                <td className="text-right font-bold">{p.gram} g</td>
              </tr>
            ))}
            {end && (
              <tr>
                <td className="py-3">종료</td>
                <td className="text-right">{formatDuration(end.sec)}</td>
                <td className="text-right">—</td>
                <td className="text-right font-bold">{end.gram} g</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
