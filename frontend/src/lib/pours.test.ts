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
  it("주수마다 시작과 끝을 함께 찾는다", () => {
    expect(pourTargets(GOLDEN)).toEqual([
      { startSec: 0, startGram: 0, sec: 10, gram: 56, index: 1 },
      { startSec: 35, startGram: 56, sec: 51, gram: 154, index: 2 },
      { startSec: 70, startGram: 154, sec: 84, gram: 235, index: 3 },
      { startSec: 105, startGram: 235, sec: 116, gram: 300, index: 4 },
    ]);
  });

  it("마지막 주수의 끝도 빠뜨리지 않는다", () => {
    // 드립다운으로 이어지는 마지막 주수가 누락되기 쉽습니다.
    expect(pourTargets(GOLDEN).at(-1)).toMatchObject({ sec: 116, gram: 300 });
  });

  it("오르막이 여러 점에 걸쳐도 한 번의 주수로 본다", () => {
    // 점이 더 있다고 주수 횟수가 늘어나는 것은 아닙니다.
    const stepped = [
      [0, 0],
      [5, 30],
      [10, 60],
      [30, 60],
    ] as const;

    expect(pourTargets(stepped)).toEqual([
      { startSec: 0, startGram: 0, sec: 10, gram: 60, index: 1 },
    ]);
  });

  it("드립다운 없이 끝나는 곡선도 마지막 주수를 잡는다", () => {
    const noDrawdown = [
      [0, 0],
      [10, 56],
      [35, 56],
      [51, 154],
    ] as const;

    expect(pourTargets(noDrawdown).at(-1)).toMatchObject({
      startSec: 35,
      sec: 51,
      gram: 154,
    });
  });

  it("붓기 시작 시점의 누적 물량은 직전 주수까지의 합이다", () => {
    const [, second] = pourTargets(GOLDEN);
    expect(second.startGram).toBe(56);
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

  it("아직 끝나지 않은 첫 주수를 알려준다", () => {
    expect(nextPourTarget(targets, 0)?.sec).toBe(10);
    expect(nextPourTarget(targets, 30)?.sec).toBe(51);
    expect(nextPourTarget(targets, 90)?.sec).toBe(116);
  });

  it("끝나는 시각에 도달하면 다음 주수로 넘어간다", () => {
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
