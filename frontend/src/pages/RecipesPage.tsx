import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import DeleteButton from "../components/DeleteButton";
import { api, type RecipeListItem } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { DRINK, SOURCE } from "../lib/labels";

/**
 * 저장된 레시피 목록.
 *
 * 이 화면이 없을 때는 보정 레시피와 이름 붙인 레시피를 **만든 직후에만** 쓸 수 있었습니다.
 * 다음 날 앱을 켜면 어디에도 없었습니다. "추출 → 평가 → 보정 → 다시 내리기" 루프가
 * 세션을 넘어 이어지려면 레시피를 다시 찾는 곳이 있어야 합니다.
 */

const btnPrimary =
  "rounded bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40";

const SOURCE_STYLE: Record<RecipeListItem["source"], string> = {
  RULE_ENGINE: "bg-slate-100 text-slate-600",
  ADJUSTED: "bg-sky-100 text-sky-700",
  RECORDED: "bg-amber-100 text-amber-700",
};

/** 목록에 보이는 이름. 사용자가 붙인 이름 > 원두 이름 > 조건 요약. */
export function recipeTitle(item: RecipeListItem): string {
  if (item.name) return item.name;
  if (item.beanName) return item.beanName;
  return `${item.doseG} g · ${DRINK[item.drinkType]}`;
}

/**
 * 접어둘 레시피 — 규칙으로 만들기만 하고 이름도 없고 내린 적도 없는 것.
 *
 * 미리보기를 저장과 분리하기 전에 쌓인 것들이 여기 해당합니다. 지우진 않습니다.
 * 서버가 걸러 버리면 사용자는 자기가 만든 레시피가 어디 갔는지 모릅니다.
 */
function isUnused(item: RecipeListItem): boolean {
  return item.source === "RULE_ENGINE" && item.brewCount === 0 && !item.name;
}

export default function RecipesPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RecipeListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUnused, setShowUnused] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);

  useEffect(() => {
    api
      .listRecipes()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const { visible, unusedCount } = useMemo(() => {
    const all = items ?? [];
    const unused = all.filter(isUnused);
    return {
      visible: showUnused ? all : all.filter((item) => !isUnused(item)),
      unusedCount: unused.length,
    };
  }, [items, showUnused]);

  /** 목록에는 곡선이 없어 상세를 받아 추출 화면에 넘깁니다. */
  const brewWith = async (recipeId: number) => {
    setOpening(recipeId);
    try {
      const recipe = await api.getRecipe(recipeId);
      navigate("/brew", { state: { recipe } });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setOpening(null);
    }
  };

  if (error && items === null) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">레시피</h1>
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">레시피</h1>
        {items !== null && visible.length > 0 && (
          <span className="text-xs text-slate-500">{visible.length}개</span>
        )}
        <Link to="/recipe" className="ml-auto rounded border px-3 py-1.5 text-xs hover:bg-slate-50">
          새로 만들기
        </Link>
      </div>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {items === null ? (
        <p className="rounded border bg-white p-8 text-center text-sm text-slate-500">
          불러오는 중…
        </p>
      ) : visible.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-sm text-slate-600">
          아직 레시피가 없습니다.
          <div className="mt-1 text-xs text-slate-500">
            레시피를 만들어 내리거나, 자유 추출을 목표로 저장하면 여기에 모입니다.
          </div>
          <div className="mt-3">
            <Link to="/recipe" className={btnPrimary}>
              레시피 만들기
            </Link>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((item) => (
            <li
              key={item.recipeId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-white px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{recipeTitle(item)}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] ${SOURCE_STYLE[item.source]}`}
                  >
                    {SOURCE[item.source]}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {/* 이름을 제목으로 썼으면 원두를 여기에, 원두를 제목으로 썼으면 조건을 여기에. */}
                  {item.name && item.beanName ? `${item.beanName} · ` : ""}
                  {item.doseG} g · {DRINK[item.drinkType]} · 총 {item.totalWaterG} g
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {/* 0회면 정확도가 없습니다. "—"만 띄우면 고장처럼 보여 문장으로 씁니다. */}
                  {item.brewCount === 0
                    ? `아직 안 내림 · ${formatDateTime(item.createdAt)} 생성`
                    : `${item.brewCount}회 내림 · 최근 정확도 ${
                        item.lastRmse === null ? "—" : `${item.lastRmse.toFixed(1)} g`
                      }`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => brewWith(item.recipeId)}
                  disabled={opening !== null}
                  className={btnPrimary}
                >
                  {opening === item.recipeId ? "여는 중…" : "내리기"}
                </button>
                {/* 내린 기록이 있으면 서버가 거절합니다(409). 실패할 버튼은 띄우지 않습니다. */}
                {item.brewCount === 0 && (
                  <DeleteButton
                    warning="되돌릴 수 없습니다."
                    onConfirm={async () => {
                      await api.deleteRecipe(item.recipeId);
                      setItems((prev) => prev?.filter((r) => r.recipeId !== item.recipeId) ?? null);
                    }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 접어둔 것이 있으면 숨기지 않고 알립니다. 지운 게 아니라 접은 것입니다. */}
      {unusedCount > 0 && (
        <button
          onClick={() => setShowUnused((v) => !v)}
          className="text-xs text-slate-500 hover:underline"
        >
          {showUnused ? "안 내린 규칙 레시피 접기" : `안 내린 규칙 레시피 ${unusedCount}개 보기`}
        </button>
      )}
    </section>
  );
}
