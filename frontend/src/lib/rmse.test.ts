import { describe, expect, it } from "vitest";

import { calculateRmse, createRmseAccumulator, interpolateAt, type Curve } from "./rmse";

/**
 * ⚠️ backend/tests/test_rmse.py에 **같은 케이스가 같은 값으로** 존재합니다.
 * 프론트와 서버가 다른 값을 내면 사용자는 어느 쪽을 믿어야 할지 모릅니다.
 * 한쪽을 고치면 반드시 양쪽을 함께 고치세요.
 */

/** rule-table.md 7절 검증 예시의 목표 곡선 */
const GOLDEN_TARGET: Curve = [
  [0, 0],
  [10, 60],
  [45, 60],
  [77, 156],
  [117, 156],
  [143, 235],
  [183, 235],
  [205, 300],
];

describe("interpolateAt", () => {
  it("점 위에서는 그 값을 그대로 돌려준다", () => {
    expect(
      interpolateAt(
        [
          [0, 0],
          [10, 100],
        ],
        10,
      ),
    ).toBe(100);
  });

  it("점 사이는 선형 보간한다", () => {
    expect(
      interpolateAt(
        [
          [0, 0],
          [10, 100],
        ],
        5,
      ),
    ).toBe(50);
  });

  it("대기 구간은 수평으로 유지된다", () => {
    expect(interpolateAt(GOLDEN_TARGET, 20)).toBe(60);
    expect(interpolateAt(GOLDEN_TARGET, 44)).toBe(60);
  });

  it("곡선 끝을 넘기면 마지막 값을 유지한다", () => {
    expect(interpolateAt(GOLDEN_TARGET, 300)).toBe(300);
  });

  it("곡선 시작 전이면 첫 값을 유지한다", () => {
    expect(interpolateAt(GOLDEN_TARGET, -5)).toBe(0);
  });

  it("빈 곡선은 거부한다", () => {
    expect(() => interpolateAt([], 0)).toThrow();
  });
});

describe("calculateRmse", () => {
  it("완벽히 따라가면 0", () => {
    const actual: Curve = [
      [0, 0],
      [5, 50],
      [10, 100],
    ];
    expect(
      calculateRmse(
        [
          [0, 0],
          [10, 100],
        ],
        actual,
      ),
    ).toBe(0);
  });

  it("일정하게 벗어나면 그 값이 RMSE가 된다", () => {
    const actual: Curve = [
      [0, 10],
      [5, 60],
      [10, 110],
    ];
    expect(
      calculateRmse(
        [
          [0, 0],
          [10, 100],
        ],
        actual,
      ),
    ).toBe(10);
  });

  it("오차가 섞이면 단순 평균이 아니라 제곱평균제곱근", () => {
    const actual: Curve = [
      [0, 0],
      [10, 110],
    ];
    expect(
      calculateRmse(
        [
          [0, 0],
          [10, 100],
        ],
        actual,
      ),
    ).toBeCloseTo(Math.sqrt(50), 10);
  });

  it("큰 오차 한 번이 작은 오차 여러 번보다 크게 반영된다", () => {
    const target: Curve = [
      [0, 0],
      [10, 100],
    ];
    const oneBig = calculateRmse(target, [
      [0, 0],
      [5, 50],
      [10, 130],
    ])!;
    const manySmall = calculateRmse(target, [
      [0, 10],
      [5, 60],
      [10, 110],
    ])!;
    expect(oneBig).toBeGreaterThan(manySmall);
  });

  it("일찍 끝내도 남은 구간에 페널티가 없다", () => {
    const actual: Curve = [
      [0, 0],
      [5, 50],
    ];
    expect(
      calculateRmse(
        [
          [0, 0],
          [100, 1000],
        ],
        actual,
      ),
    ).toBe(0);
  });

  it("목표 시간을 넘기면 마지막 목표값과 비교한다", () => {
    const actual: Curve = [
      [220, 300],
      [240, 300],
    ];
    expect(calculateRmse(GOLDEN_TARGET, actual)).toBe(0);
  });

  it("검증 예시 곡선을 그대로 따라가면 0", () => {
    expect(calculateRmse(GOLDEN_TARGET, GOLDEN_TARGET)).toBe(0);
  });

  it("측정이 없으면 0이 아니라 null", () => {
    expect(calculateRmse(GOLDEN_TARGET, [])).toBeNull();
    expect(calculateRmse([], [[0, 0]])).toBeNull();
  });
});

describe("createRmseAccumulator", () => {
  it("한 점씩 넣어도 전체 계산과 같은 값이 나온다", () => {
    // 실시간 표시는 누적기로, 저장은 전체 계산으로 하므로 둘이 같아야 합니다.
    const actual: Curve = [
      [0, 0],
      [10, 55],
      [45, 62],
      [77, 150],
      [120, 158],
      [143, 240],
      [190, 236],
      [210, 297],
    ];

    const acc = createRmseAccumulator(GOLDEN_TARGET);
    for (const [t, g] of actual) acc.add(t, g);

    expect(acc.value).toBe(calculateRmse(GOLDEN_TARGET, actual));
  });

  it("측정 전에는 null", () => {
    expect(createRmseAccumulator(GOLDEN_TARGET).value).toBeNull();
  });

  it("목표가 없으면(자유 모드) 계산하지 않고 null을 유지한다", () => {
    // 빈 곡선에 보간을 시도하면 예외가 납니다. 자유 모드에서 패킷마다 터지면 안 됩니다.
    const acc = createRmseAccumulator([]);
    expect(() => acc.add(10, 55)).not.toThrow();
    expect(acc.value).toBeNull();
  });

  it("리셋하면 처음 상태로 돌아간다", () => {
    const acc = createRmseAccumulator(GOLDEN_TARGET);
    acc.add(10, 999);
    acc.reset();
    expect(acc.value).toBeNull();
  });
});

/**
 * ⚠️ 아래 입력과 기대값은 backend/tests/test_rmse.py와 **완전히 동일**합니다.
 * 두 구현이 갈라지는 순간 양쪽 중 하나가 깨지도록 고정해 둔 것입니다.
 */
const SHARED_ACTUAL: Curve = [
  [0, 0],
  [7.3, 41.9],
  [10, 55],
  [45, 62],
  [77, 150],
  [99.5, 157.2],
  [117, 158],
  [143, 240],
  [183, 236],
  [205, 297],
  [212.4, 300.1],
];
const SHARED_EXPECTED_RMSE = 3.1487371205842911;

describe("프론트·서버 일치", () => {
  it("서버 구현과 같은 값을 낸다", () => {
    // 실시간 표시는 여기가, 저장은 서버가 계산합니다.
    // 두 숫자가 다르면 사용자는 어느 쪽을 믿어야 할지 알 수 없습니다.
    expect(calculateRmse(GOLDEN_TARGET, SHARED_ACTUAL)).toBe(SHARED_EXPECTED_RMSE);
  });

  it("누적기도 같은 값을 낸다", () => {
    const acc = createRmseAccumulator(GOLDEN_TARGET);
    for (const [t, g] of SHARED_ACTUAL) acc.add(t, g);
    expect(acc.value).toBe(SHARED_EXPECTED_RMSE);
  });
});
