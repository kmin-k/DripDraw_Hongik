/**
 * 정확도 추이 — 같은 레시피를 반복했을 때 목표에 얼마나 가까워지는가.
 *
 * 이 프로젝트가 주장하는 것이 **추출 재현성**이라, 그 주장을 눈으로 확인할 수 있는
 * 유일한 화면입니다. 개별 추출의 정확도만으로는 "나아지고 있다"를 말할 수 없습니다.
 *
 * **레시피별로 묶습니다.** 레시피가 다르면 원두·물량·온도가 달라 정확도를 나란히
 * 놓을 수 없습니다. 같은 조건을 반복한 것만이 비교 대상입니다.
 */

import type { BrewListItem } from "./api";

/** 점이 하나뿐이면 추이가 아닙니다. 최소 두 번은 내려야 비교가 됩니다. */
const MIN_ATTEMPTS = 2;

export interface TrendSeries {
  recipeId: number;
  label: string;
  /** 오래된 회차부터. 배열 index가 곧 회차 - 1입니다. */
  rmses: number[];
}

export function buildTrend(items: BrewListItem[]): TrendSeries[] {
  const groups = new Map<number, { label: string; entries: { at: string; rmse: number }[] }>();

  for (const item of items) {
    // 자유 모드는 비교할 목표가 없어 정확도가 존재하지 않습니다.
    if (item.recipeId === null || item.rmse === null) continue;

    const group = groups.get(item.recipeId) ?? {
      label: item.beanName ?? `레시피 #${item.recipeId}`,
      entries: [],
    };
    group.entries.push({ at: item.brewedAt, rmse: item.rmse });
    groups.set(item.recipeId, group);
  }

  return [...groups.entries()]
    .map(([recipeId, group]) => ({
      recipeId,
      label: group.label,
      // 목록은 최신순으로 오지만, 추이는 **오래된 회차부터** 그려야 읽힙니다.
      rmses: group.entries
        .slice()
        .sort((a, b) => a.at.localeCompare(b.at))
        .map((entry) => entry.rmse),
    }))
    .filter((series) => series.rmses.length >= MIN_ATTEMPTS)
    .sort((a, b) => b.rmses.length - a.rmses.length || a.recipeId - b.recipeId);
}

/** 회차 수가 가장 많은 계열에 맞춘 표 행. Recharts에 그대로 넘깁니다. */
export function toChartRows(series: TrendSeries[]): Record<string, number | null>[] {
  const longest = Math.max(0, ...series.map((s) => s.rmses.length));

  return Array.from({ length: longest }, (_, index) => {
    const row: Record<string, number | null> = { attempt: index + 1 };
    for (const one of series) {
      // 회차가 짧은 계열은 뒤쪽이 비어야 합니다. 0으로 채우면 정확도가 완벽해진 것처럼 보입니다.
      row[one.label] = one.rmses[index] ?? null;
    }
    return row;
  });
}

/**
 * 첫 회차 대비 마지막 회차가 얼마나 좋아졌는지 (%).
 *
 * 정확도는 **작을수록 좋으므로** 값이 줄어든 비율이 개선입니다.
 * 나빠졌으면 음수입니다 — 좋아진 것처럼 보이게 감추지 않습니다.
 */
export function improvementPercent(rmses: number[]): number | null {
  if (rmses.length < MIN_ATTEMPTS) return null;

  const first = rmses[0];
  const last = rmses[rmses.length - 1];
  if (first === 0) return null; // 처음부터 완벽했으면 개선율을 말할 수 없습니다.

  return ((first - last) / first) * 100;
}
