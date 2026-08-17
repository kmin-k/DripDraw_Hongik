import { describe, expect, it } from "vitest";

import { nextPourTarget, pourTargets } from "./pours";

/** 기준값 레시피의 목표 곡선 (20g / 핫 / 라이트 / 아프리카 / 워시드 / D50 950μm) */
const GOLDEN = [
  [0, 0],
  [10, 56],
  [35, 56],
  [51, 154],
  [70, 154],
  [84, 235],
  [105, 235],
  [116, 300],
  [165, 300],
] as const;

describe("pourTargets", () => {
  it("주수마다 '여기까지' 지점을 하나씩 찾는다", () => {
    const targets = pourTargets(GOLDEN);

    expect(targets).toEqual([
      { sec: 10, gram: 56, index: 1 },
      { sec: 51, gram: 154, index: 2 },
      { sec: 84, gram: 235, index: 3 },
      { sec: 116, gram: 300, index: 4 },
    ]);
  });

  it("오르막 도중의 점은 넣지 않는다", () => {
    // 계속 오르는 구간에서는 "여기까지"라고 말할 지점이 없습니다.
    const climbing = [
      [0, 0],
      [5, 30],
      [10, 60],
      [20, 60],
    ] as const;

    expect(pourTargets(climbing)).toEqual([{ sec: 10, gram: 60, index: 1 }]);
  });

  it("드립다운 없이 끝나는 곡선은 마지막 점을 쓴다", () => {
    const noDrawdown = [
      [0, 0],
      [10, 56],
      [35, 56],
      [51, 154],
    ] as const;

    const targets = pourTargets(noDrawdown);
    expect(targets.at(-1)).toEqual({ sec: 51, gram: 154, index: 2 });
  });

  it("목표가 없으면 빈 배열", () => {
    // 자유 모드입니다. 따라갈 지점이 없습니다.
    expect(pourTargets([])).toEqual([]);
  });

  it("한 번도 오르지 않는 곡선은 빈 배열", () => {
    expect(
      pourTargets([
        [0, 0],
        [10, 0],
      ]),
    ).toEqual([]);
  });
});

describe("nextPourTarget", () => {
  const targets = pourTargets(GOLDEN);

  it("아직 안 지난 첫 지점을 알려준다", () => {
    expect(nextPourTarget(targets, 0)?.sec).toBe(10);
    expect(nextPourTarget(targets, 30)?.sec).toBe(51);
    expect(nextPourTarget(targets, 90)?.sec).toBe(116);
  });

  it("지점에 정확히 도달하면 다음 지점으로 넘어간다", () => {
    expect(nextPourTarget(targets, 10)?.sec).toBe(51);
  });

  it("다 지났으면 null", () => {
    // 더 부을 것이 없다는 뜻입니다. 0초 남았다고 표시하면 안 됩니다.
    expect(nextPourTarget(targets, 200)).toBeNull();
  });

  it("목표가 없으면 null", () => {
    expect(nextPourTarget([], 0)).toBeNull();
  });
});
