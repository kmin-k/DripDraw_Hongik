import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type BrewListItem } from "../lib/api";
import { formatDateTime, formatDuration } from "../lib/format";

/**
 * 데모 시나리오 5번 — 추출 기록 목록.
 *
 * 기록이 남아야 "재현성"이 말이 됩니다. 한 번 내리고 끝나면 비교할 대상이 없습니다.
 *
 * 목록에는 곡선이 없습니다(응답에 담지 않습니다). 곡선은 상세에서 가져옵니다.
 */

const btnPrimary =
  "rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40";

export default function HistoryPage() {
  const [items, setItems] = useState<BrewListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listBrews()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">추출 기록</h1>
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      </section>
    );
  }

  if (items === null) {
    return (
      <section className="space-y-4">
        <h1 className="text-lg font-semibold">추출 기록</h1>
        <p className="rounded border bg-white p-8 text-center text-sm text-slate-500">
          불러오는 중…
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">추출 기록</h1>
        {items.length > 0 && <span className="text-xs text-slate-500">{items.length}건</span>}
      </div>

      {items.length === 0 ? (
        <div className="rounded border bg-white p-8 text-center text-sm text-slate-600">
          아직 기록이 없습니다.
          <div className="mt-3">
            <Link to="/recipe" className={btnPrimary}>
              첫 추출 시작하기
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-slate-500">
                <th className="px-3 py-2 font-medium">시각</th>
                <th className="px-3 py-2 font-medium">원두</th>
                <th className="px-3 py-2 font-medium">물량</th>
                <th className="px-3 py-2 font-medium">시간</th>
                <th className="px-3 py-2 font-medium">정확도</th>
                <th className="px-3 py-2 font-medium">평가</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.brewId} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link to={`/history/${item.brewId}`} className="text-sky-700 hover:underline">
                      {formatDateTime(item.brewedAt)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {item.beanName ?? <span className="text-slate-400">—</span>}
                    {item.freeMode && (
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        자유
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{item.finalWeightG.toFixed(0)} g</td>
                  <td className="px-3 py-2 tabular-nums text-slate-600">
                    {formatDuration(item.durationSec)}
                  </td>
                  {/* 자유 모드는 비교할 목표가 없습니다. 0점이 아니라 "측정하지 않음"입니다. */}
                  <td className="px-3 py-2 tabular-nums">
                    {item.rmse === null ? (
                      <span className="text-slate-400">—</span>
                    ) : (
                      `${item.rmse.toFixed(1)} g`
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {item.hasFeedback ? "완료" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500">
        정확도(RMSE)는 목표 곡선과 실제 곡선의 차이입니다. <b>작을수록 목표에 가깝게</b> 내린
        것입니다.
      </p>
    </section>
  );
}
