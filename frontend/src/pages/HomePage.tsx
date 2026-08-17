import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api, type BrewListItem } from "../lib/api";
import { formatDateTime } from "../lib/format";

/**
 * 첫 화면.
 *
 * 이전에는 `/`로 들어오면 레시피 입력 폼이 바로 나왔습니다. 그러면 "무엇을 하는 서비스인지"
 * 보여줄 자리가 없고, 사용자는 지금 뭘 해야 하는지 스스로 판단해야 합니다.
 *
 * 여기서는 **할 일 하나(커피 내리기)**를 크게 두고, 나머지는 최근 기록으로 보여줍니다.
 */

const RECENT_COUNT = 3;

/** 평균을 낼 때 자유 모드는 뺍니다. 비교할 목표가 없어 정확도가 존재하지 않습니다. */
function averageRmse(items: BrewListItem[]): number | null {
  const measured = items.filter((item) => item.rmse !== null);
  if (measured.length === 0) return null;
  return measured.reduce((sum, item) => sum + (item.rmse ?? 0), 0) / measured.length;
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-2xl tabular-nums">{value}</div>
    </div>
  );
}

export default function HomePage() {
  const [items, setItems] = useState<BrewListItem[] | null>(null);

  useEffect(() => {
    api
      .listBrews()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);

  const recent = items?.slice(0, RECENT_COUNT) ?? [];
  const average = items ? averageRmse(items) : null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">오늘도 한 잔 ☕</h1>
        <p className="mt-1 text-sm text-slate-600">
          목표 곡선을 따라 내리고, 얼마나 가깝게 내렸는지 확인하세요.
        </p>
      </div>

      <Link
        to="/recipe"
        className="block rounded-xl bg-slate-900 px-5 py-4 text-center text-base font-medium text-white"
      >
        커피 내리기
      </Link>

      {items !== null && items.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Summary label="총 추출" value={`${items.length}회`} />
          <Summary label="평균 정확도" value={average === null ? "—" : `${average.toFixed(1)} g`} />
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">최근 추출</h2>
          {items !== null && items.length > RECENT_COUNT && (
            <Link to="/history" className="text-xs text-sky-700 hover:underline">
              전체 보기
            </Link>
          )}
        </div>

        {items === null ? (
          <p className="rounded-xl border bg-white p-6 text-center text-sm text-slate-500">
            불러오는 중…
          </p>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border bg-white p-6 text-center text-sm text-slate-600">
            아직 내린 커피가 없습니다.
            <div className="mt-1 text-xs text-slate-500">
              원두를 등록해두면 조건을 매번 입력하지 않아도 됩니다.
            </div>
            <Link
              to="/beans"
              className="mt-3 inline-block rounded border px-3 py-1.5 text-xs hover:bg-slate-50"
            >
              원두 등록하기
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((item) => (
              <li key={item.brewId}>
                <Link
                  to={`/history/${item.brewId}`}
                  className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {item.beanName ?? (item.freeMode ? "자유 모드" : "이름 없는 원두")}
                    </div>
                    <div className="text-xs text-slate-500">{formatDateTime(item.brewedAt)}</div>
                  </div>
                  {/* 자유 모드는 비교할 목표가 없습니다. 0점이 아니라 "측정하지 않음"입니다. */}
                  <div className="ml-3 shrink-0 text-right">
                    {item.rmse === null ? (
                      <span className="text-xs text-slate-400">정확도 —</span>
                    ) : (
                      <span className="font-mono text-sm tabular-nums">
                        {item.rmse.toFixed(1)} g
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
