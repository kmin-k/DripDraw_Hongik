import { describe, expect, it } from "vitest";

import {
  BEAN_BLOCK_SCRIPT,
  CONDITION_SCRIPT,
  CONDITIONS,
  PILOT_ASSIGNMENTS,
  doneKeys,
  nextTrialIndex,
  pilotPlan,
  scriptBefore,
  startsNewBlock,
  trialKey,
  type Condition,
} from "./experiment";

const P01 = PILOT_ASSIGNMENTS[0];
const P02 = PILOT_ASSIGNMENTS[1];

describe("화면 조건", () => {
  it("2×2 — 목표와 내 곡선을 각각 켜고 끕니다", () => {
    expect(CONDITIONS[1]).toEqual({ showTarget: false, showOwnCurve: false });
    expect(CONDITIONS[2]).toEqual({ showTarget: false, showOwnCurve: true });
    expect(CONDITIONS[3]).toEqual({ showTarget: true, showOwnCurve: false });
    expect(CONDITIONS[4]).toEqual({ showTarget: true, showOwnCurve: true });
  });
});

describe("배정표", () => {
  it("8명, 코드가 겹치지 않습니다", () => {
    const codes = PILOT_ASSIGNMENTS.map((a) => a.code);
    expect(codes).toEqual(["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08"]);
  });

  it("물 블록은 각 조건이 각 순서 위치에 두 번씩 나옵니다 (라틴 방격)", () => {
    for (let position = 0; position < 4; position++) {
      const counts = new Map<Condition, number>();
      for (const a of PILOT_ASSIGNMENTS) {
        const c = a.waterOrder[position];
        counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      expect([...counts.values()]).toEqual([2, 2, 2, 2]);
    }
  });

  it("블록 순서와 원두 블록 순서는 절반씩 나뉩니다", () => {
    const waterFirst = PILOT_ASSIGNMENTS.filter((a) => a.blockOrder[0] === "WATER").length;
    const beanOneFirst = PILOT_ASSIGNMENTS.filter((a) => a.beanOrder[0] === 1).length;
    expect(waterFirst).toBe(4);
    expect(beanOneFirst).toBe(4);
  });
});

describe("시행 순서", () => {
  it("연습 1회 + 물 8회 + 원두 2회 = 11회", () => {
    const plan = pilotPlan(P01);
    expect(plan).toHaveLength(11);
    expect(plan[0]).toEqual({ stage: "WARMUP", condition: 1, trialNo: 1 });
  });

  it("물 블록은 조건마다 2회 연속, 배정 순서대로", () => {
    const water = pilotPlan(P01).filter((t) => t.stage === "WATER");
    expect(water.map((t) => [t.condition, t.trialNo])).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
      [4, 1],
      [4, 2],
      [3, 1],
      [3, 2],
    ]);
  });

  it("원두 블록이 먼저인 참가자는 연습 다음이 원두입니다", () => {
    const plan = pilotPlan(P02);
    expect(plan.slice(1, 3).map((t) => [t.stage, t.condition])).toEqual([
      ["BEAN", 4],
      ["BEAN", 1],
    ]);
  });

  it("같은 시행 이름이 두 번 나오지 않습니다", () => {
    for (const a of PILOT_ASSIGNMENTS) {
      const keys = pilotPlan(a).map(trialKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("진행 상태", () => {
  const plan = pilotPlan(P01);

  it("기록이 없으면 처음부터", () => {
    expect(nextTrialIndex(plan, doneKeys([]))).toBe(0);
  });

  it("유효한 기록이 있는 시행은 건너뜁니다", () => {
    const done = doneKeys([
      { stage: "WARMUP", condition: 1, trialNo: 1, valid: true },
      { stage: "WATER", condition: 1, trialNo: 1, valid: true },
    ]);
    expect(nextTrialIndex(plan, done)).toBe(2);
  });

  it("무효만 있는 시행은 다시 합니다", () => {
    const done = doneKeys([
      { stage: "WARMUP", condition: 1, trialNo: 1, valid: true },
      { stage: "WATER", condition: 1, trialNo: 1, valid: false },
    ]);
    expect(nextTrialIndex(plan, done)).toBe(1);
  });

  it("무효 뒤에 다시 해서 유효가 있으면 끝난 것입니다", () => {
    const done = doneKeys([
      { stage: "WATER", condition: 1, trialNo: 1, valid: false },
      { stage: "WATER", condition: 1, trialNo: 1, valid: true },
    ]);
    expect(done.has("WATER-1-1")).toBe(true);
  });

  it("모두 했으면 null", () => {
    const done = doneKeys(plan.map((t) => ({ ...t, valid: true })));
    expect(nextTrialIndex(plan, done)).toBeNull();
  });
});

describe("블록 경계와 지시문", () => {
  const plan = pilotPlan(P01); // 연습 → 물 8회 → 원두 2회

  it("단계가 바뀌는 자리에서만 블록 시작입니다", () => {
    const starts = plan.map((_, i) => startsNewBlock(plan, i));
    expect(starts.map((s, i) => (s ? i : null)).filter((i) => i !== null)).toEqual([1, 9]);
  });

  it("같은 조건을 연속으로 하면 두 번째에는 다시 읽지 않습니다", () => {
    expect(scriptBefore(plan, 1)).toEqual([CONDITION_SCRIPT[1]]);
    expect(scriptBefore(plan, 2)).toEqual([]);
    expect(scriptBefore(plan, 3)).toEqual([CONDITION_SCRIPT[2]]);
  });

  it("원두 블록 첫 시행에는 원두 안내를 먼저 읽습니다", () => {
    expect(scriptBefore(plan, 9)).toEqual([BEAN_BLOCK_SCRIPT, CONDITION_SCRIPT[1]]);
    expect(scriptBefore(plan, 10)).toEqual([CONDITION_SCRIPT[4]]);
  });
});
