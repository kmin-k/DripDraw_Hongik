/**
 * 사용자 실험 — 화면 조건, 참가자 배정, 시행 순서.
 *
 * 실험 설계의 기준은 "DripDraw 예비 실험 의뢰서"입니다. 이 파일의 배정표와 지시문은 그 문서와
 * 같아야 합니다. 한쪽을 바꾸면 다른 쪽도 함께 고칩니다.
 *
 * 화면 조건은 두 요인의 조합(2×2)입니다.
 * - 목표 곡선(가이드)을 보여 주는가
 * - 참가자가 부은 실측 곡선을 보여 주는가
 *
 * 목표 대비 편차·RMSE·점수는 **어느 조건에서도 보여 주지 않습니다.** 편차를 4번에만 보여 주면
 * 3번과 4번이 두 가지에서 달라져 결과를 해석할 수 없습니다. RMSE는 서버가 똑같이 기록합니다.
 */

import type { RecipeRequest } from "./api";

export type Condition = 1 | 2 | 3 | 4;
export type Study = "PILOT" | "MAIN";
export type Stage = "WARMUP" | "WATER" | "BEAN" | "PRE" | "TRAIN" | "POST";

export interface DisplayFlags {
  /** 목표 곡선, 현재 시각 표시선, 지금 시점의 목표량, "여기까지 부으세요" */
  showTarget: boolean;
  /** 참가자가 부은 실측 곡선 */
  showOwnCurve: boolean;
}

export const CONDITIONS: Record<Condition, DisplayFlags> = {
  1: { showTarget: false, showOwnCurve: false },
  2: { showTarget: false, showOwnCurve: true },
  3: { showTarget: true, showOwnCurve: false },
  4: { showTarget: true, showOwnCurve: true },
};

export const CONDITION_MARK: Record<Condition, string> = { 1: "①", 2: "②", 3: "③", 4: "④" };

export const STAGE_LABEL: Record<Stage, string> = {
  WARMUP: "연습",
  WATER: "물",
  BEAN: "원두",
  PRE: "사전 평가",
  TRAIN: "연습",
  POST: "사후 평가",
};

/**
 * 실험 레시피. 모든 시행이 같은 목표를 따릅니다 (의뢰서 3절).
 * 원두 20 g · 핫 · 라이트 → 총 300 g, 4회 주수, 165초.
 */
export const EXPERIMENT_RECIPE: RecipeRequest = {
  region: "AFRICA",
  process: "WASHED",
  roastLevel: "LIGHT",
  doseG: 20,
  drinkType: "HOT",
  d50Um: 950,
};

/** 실험 레시피는 한 번 만들어 모든 시행이 같은 것을 씁니다. 기기마다 기억합니다. */
const RECIPE_KEY = "dripdraw.experiment.recipeId";

export function loadExperimentRecipeId(): number | null {
  try {
    const raw = localStorage.getItem(RECIPE_KEY);
    const id = raw ? Number(raw) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function saveExperimentRecipeId(id: number): void {
  try {
    localStorage.setItem(RECIPE_KEY, String(id));
  } catch {
    // 저장이 막힌 브라우저면 다음에 다시 만들면 됩니다.
  }
}

// --- 예비 실험 배정표 (의뢰서 4절) ---

export interface PilotAssignment {
  code: string;
  /** 물 블록과 원두 블록 중 무엇을 먼저 하는지 */
  blockOrder: readonly ["WATER", "BEAN"] | readonly ["BEAN", "WATER"];
  /** 물 블록의 화면 조건 순서. 조건마다 2회 연속 */
  waterOrder: readonly Condition[];
  /** 원두 블록의 화면 조건 순서. 조건마다 1회 */
  beanOrder: readonly Condition[];
}

const WATER_FIRST = ["WATER", "BEAN"] as const;
const BEAN_FIRST = ["BEAN", "WATER"] as const;

/**
 * 균형 라틴 방격. 각 조건이 각 순서 위치에 두 번씩, 각 조건 바로 뒤에 다른 조건이 고르게 옵니다.
 * 블록 순서와 원두 블록 순서도 절반씩 나눴습니다.
 */
export const PILOT_ASSIGNMENTS: readonly PilotAssignment[] = [
  { code: "P01", blockOrder: WATER_FIRST, waterOrder: [1, 2, 4, 3], beanOrder: [1, 4] },
  { code: "P02", blockOrder: BEAN_FIRST, waterOrder: [2, 3, 1, 4], beanOrder: [4, 1] },
  { code: "P03", blockOrder: WATER_FIRST, waterOrder: [3, 4, 2, 1], beanOrder: [4, 1] },
  { code: "P04", blockOrder: BEAN_FIRST, waterOrder: [4, 1, 3, 2], beanOrder: [1, 4] },
  { code: "P05", blockOrder: BEAN_FIRST, waterOrder: [1, 2, 4, 3], beanOrder: [4, 1] },
  { code: "P06", blockOrder: WATER_FIRST, waterOrder: [2, 3, 1, 4], beanOrder: [1, 4] },
  { code: "P07", blockOrder: BEAN_FIRST, waterOrder: [3, 4, 2, 1], beanOrder: [1, 4] },
  { code: "P08", blockOrder: WATER_FIRST, waterOrder: [4, 1, 3, 2], beanOrder: [4, 1] },
];

/** 물 블록에서 한 조건을 몇 번 연속으로 하는지 */
export const WATER_REPEATS = 2;

export interface PlannedTrial {
  stage: Stage;
  condition: Condition;
  /** 같은 단계·조건 안에서 몇 번째인지. 1부터 셉니다. */
  trialNo: number;
}

/** 시행의 이름. 서버 기록과 계획을 맞춰 보는 데 씁니다. */
export function trialKey(t: { stage: string; condition: number; trialNo: number }): string {
  return `${t.stage}-${t.condition}-${t.trialNo}`;
}

/**
 * 참가자 한 명의 시행 순서 (의뢰서 4절 "1인 진행 순서").
 *
 * 연습 1회(물·조건 ①, 분석 제외) → 첫 블록 → 두 번째 블록.
 * 휴식은 시행이 아니라 계획에 넣지 않고 화면이 블록 사이에 안내합니다.
 */
export function pilotPlan(a: PilotAssignment): PlannedTrial[] {
  const plan: PlannedTrial[] = [{ stage: "WARMUP", condition: 1, trialNo: 1 }];
  for (const block of a.blockOrder) {
    if (block === "WATER") {
      for (const condition of a.waterOrder) {
        for (let n = 1; n <= WATER_REPEATS; n++)
          plan.push({ stage: "WATER", condition, trialNo: n });
      }
    } else {
      for (const condition of a.beanOrder) plan.push({ stage: "BEAN", condition, trialNo: 1 });
    }
  }
  return plan;
}

export interface TrialRecord {
  stage: string;
  condition: number;
  trialNo: number;
  valid: boolean;
}

/** 유효한 기록이 하나라도 있으면 끝난 시행입니다. 무효만 있으면 다시 해야 합니다. */
export function doneKeys(records: readonly TrialRecord[]): Set<string> {
  return new Set(records.filter((r) => r.valid).map(trialKey));
}

/** 아직 하지 않은 첫 시행의 순번. 다 했으면 null. */
export function nextTrialIndex(plan: readonly PlannedTrial[], done: Set<string>): number | null {
  const index = plan.findIndex((t) => !done.has(trialKey(t)));
  return index === -1 ? null : index;
}

/** 블록이 바뀌는 자리인지. 화면이 휴식과 준비(원두 넣기·필터 교체)를 안내합니다. */
export function startsNewBlock(plan: readonly PlannedTrial[], index: number): boolean {
  if (index <= 0) return false;
  return plan[index].stage !== plan[index - 1].stage;
}

// --- 표준 지시문 (의뢰서 5절) ---

/** 화면 조건이 바뀔 때 진행자가 읽어 주는 문장. */
export const CONDITION_SCRIPT: Record<Condition, string> = {
  1: "이번에는 화면에 현재 무게와 시간만 보입니다. 레시피 카드를 보며 부어 주세요.",
  2: "이번에는 화면에 현재 무게와 시간, 그리고 지금까지 부은 양이 그래프로 보입니다. 레시피 카드를 보며 부어 주세요.",
  3: "이번에는 화면에 현재 무게와 시간, 레시피의 목표 곡선과 지금 시각 표시, 그리고 지금 시점의 목표량이 보입니다. 레시피 카드도 함께 참고하셔도 됩니다.",
  4: "이번에는 화면에 현재 무게와 시간, 레시피의 목표 곡선과 지금 시점의 목표량, 그리고 지금까지 부은 양의 그래프가 함께 보입니다. 레시피 카드도 함께 참고하셔도 됩니다.",
};

export const BEAN_BLOCK_SCRIPT =
  "이번 두 번은 실제로 커피를 내립니다. 붓는 방법은 지금까지와 같습니다.";

/**
 * 이 시행 전에 읽어 줄 문장. 조건이나 단계가 바뀔 때만 읽습니다.
 * 같은 조건을 연속으로 할 때 같은 문장을 반복하면 참가자가 다른 화면이라고 오해할 수 있습니다.
 */
export function scriptBefore(plan: readonly PlannedTrial[], index: number): string[] {
  const current = plan[index];
  const previous = index > 0 ? plan[index - 1] : null;
  const lines: string[] = [];
  if (current.stage === "BEAN" && previous?.stage !== "BEAN") lines.push(BEAN_BLOCK_SCRIPT);
  if (!previous || previous.condition !== current.condition || previous.stage !== current.stage) {
    lines.push(CONDITION_SCRIPT[current.condition]);
  }
  return lines;
}
