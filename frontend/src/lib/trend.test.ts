import { describe, expect, it } from "vitest";

import type { BrewListItem } from "./api";
import { buildTrend, improvementPercent, toChartRows } from "./trend";

function brew(over: Partial<BrewListItem>): BrewListItem {
  return {
    brewId: 1,
    brewedAt: "2026-08-01T09:00:00",
    rmse: 5,
    durationSec: 165,
    finalWeightG: 300,
    recipeId: 1,
    beanName: "에티오피아 무라고",
    doseG: 20,
    totalWaterG: 300,
    freeMode: false,
    hasFeedback: false,
    ...over,
  };
}

/** 목록 API는 최신순으로 옵니다. 추이는 오래된 회차부터 그려야 하므로 뒤집혀 있습니다. */
const NEWEST_FIRST = [
  brew({ brewId: 3, brewedAt: "2026-08-05T09:00:00", rmse: 2.3 }),
  brew({ brewId: 2, brewedAt: "2026-08-03T09:00:00", rmse: 5.1 }),
  brew({ brewId: 1, brewedAt: "2026-08-01T09:00:00", rmse: 12.4 }),
];

describe("buildTrend", () => {
  it("★ 오래된 회차부터 정렬한다", () => {
    // 목록이 최신순으로 와도 추이는 왼쪽이 1회차여야 읽힙니다.
    expect(buildTrend(NEWEST_FIRST)[0].rmses).toEqual([12.4, 5.1, 2.3]);
  });

  it("레시피별로 묶는다", () => {
    // 레시피가 다르면 조건이 달라 정확도를 나란히 놓을 수 없습니다.
    const mixed = [
      ...NEWEST_FIRST,
      brew({ brewId: 5, recipeId: 2, beanName: "코스타리카", rmse: 8 }),
      brew({ brewId: 6, recipeId: 2, beanName: "코스타리카", rmse: 4 }),
    ];

    const series = buildTrend(mixed);
    expect(series.map((s) => s.recipeId)).toEqual([1, 2]);
    expect(series[1].label).toBe("코스타리카");
  });

  it("자유 모드 추출은 뺀다", () => {
    // 비교할 목표가 없어 정확도가 존재하지 않습니다.
    const withFree = [
      ...NEWEST_FIRST,
      brew({ brewId: 9, recipeId: null, rmse: null, freeMode: true }),
    ];
    expect(buildTrend(withFree)).toHaveLength(1);
  });

  it("한 번만 내린 레시피는 뺀다", () => {
    // 점이 하나면 추이가 아닙니다.
    const once = [brew({ brewId: 7, recipeId: 3, rmse: 6 })];
    expect(buildTrend(once)).toEqual([]);
  });

  it("원두를 등록하지 않았으면 레시피 번호로 부른다", () => {
    const noBean = [
      brew({ brewId: 1, beanName: null, rmse: 9 }),
      brew({ brewId: 2, beanName: null, rmse: 4 }),
    ];
    expect(buildTrend(noBean)[0].label).toBe("레시피 #1");
  });

  it("기록이 없으면 빈 배열", () => {
    expect(buildTrend([])).toEqual([]);
  });
});

describe("toChartRows", () => {
  it("회차를 가로축으로 펼친다", () => {
    const series = [
      { recipeId: 1, label: "A", rmses: [10, 5, 2] },
      { recipeId: 2, label: "B", rmses: [8, 4] },
    ];

    expect(toChartRows(series)).toEqual([
      { attempt: 1, A: 10, B: 8 },
      { attempt: 2, A: 5, B: 4 },
      // 회차가 짧은 계열은 비워 둡니다. 0으로 채우면 정확도가 완벽해진 것처럼 보입니다.
      { attempt: 3, A: 2, B: null },
    ]);
  });

  it("계열이 없으면 빈 표", () => {
    expect(toChartRows([])).toEqual([]);
  });
});

describe("improvementPercent", () => {
  it("정확도가 줄어든 비율을 돌려준다", () => {
    // 12.4 → 2.3이면 약 81% 좋아진 것입니다.
    expect(improvementPercent([12.4, 5.1, 2.3])).toBeCloseTo(81.45, 1);
  });

  it("나빠졌으면 음수 — 감추지 않는다", () => {
    expect(improvementPercent([3, 6])).toBeCloseTo(-100, 1);
  });

  it("회차가 하나뿐이면 null", () => {
    expect(improvementPercent([5])).toBeNull();
  });

  it("첫 회차가 0이면 null", () => {
    // 처음부터 완벽했으면 개선율을 말할 수 없습니다.
    expect(improvementPercent([0, 0])).toBeNull();
  });
});
