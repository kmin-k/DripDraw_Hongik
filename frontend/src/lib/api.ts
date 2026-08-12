/**
 * 백엔드 호출 래퍼.
 *
 * 계산은 전부 서버가 합니다. 프론트는 받은 값을 그리기만 합니다.
 * 예외는 두 가지뿐입니다 — BLE 패킷 파싱과 실시간 RMSE 표시.
 * 둘 다 브라우저에서만 가능한 일이라 옮길 수 없습니다.
 */

import type { Curve } from "./rmse";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(formatError(body, res));
  }
  return res.json() as Promise<T>;
}

/** FastAPI는 규칙 위반(400)과 스키마 위반(422)의 detail 형태가 다릅니다. */
function formatError(body: unknown, res: Response): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e: { loc?: unknown[]; msg?: string }) => {
        const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "";
        return `${field}: ${e.msg ?? ""}`;
      })
      .join(", ");
  }
  return `${res.status} ${res.statusText}`;
}

// --- 원두 ---

export interface Bean {
  id: number;
  name: string;
  region: string;
  process: string;
  roastLevel: string;
}

// --- 레시피 ---

export type DrinkType = "HOT" | "ICE";
export type RoastLevel = "LIGHT" | "MEDIUM" | "DARK";
export type Region = "AFRICA" | "CENTRAL_AMERICA" | "SOUTH_AMERICA" | "ASIA_PACIFIC";
export type Process = "WASHED" | "NATURAL";

export interface RecipeRequest {
  doseG: number;
  drinkType: DrinkType;
  roastLevel: RoastLevel;
  region: Region;
  process: Process;
  d50Um: number;
}

export interface Pour {
  phase: "BLOOM" | "SECOND" | "THIRD" | "FOURTH";
  waterG: number;
  startSec: number;
  endSec: number;
}

export interface Recipe {
  recipeId: number;
  totalWaterG: number;
  /** [[시간(초), 누적 물량(g)], ...] 구간 선형 곡선 */
  targetCurve: [number, number][];

  /** 아래는 Rule Engine이 계산한 값. 기록(RECORDED) 레시피에는 없습니다. */
  waterTempC: number | null;
  ratio: number | null;
  flowRateGps: number | null;
  grindGuide: string | null;
  iceMessage: string | null;
  pours: Pour[];
}

// --- 추출 기록 ---

export interface BrewRequest {
  /** 자유 모드는 따라간 목표가 없어 생략합니다. */
  recipeId?: number;
  startedAt: string;
  endedAt: string;
  /** 다운샘플링하지 않은 원본 곡선 (docs/api.md) */
  actualCurve: Curve;
}

export interface BrewResult {
  brewId: number;
  /** 서버가 다시 계산한 값. 자유 모드는 null입니다. */
  rmse: number | null;
  durationSec: number;
  finalWeightG: number;
}

// --- 맛 평가와 보정 (Phase 4) ---

/** 가운데 값(OK)은 dead zone입니다. 만족스러우면 건드리지 않습니다. */
export type Acidity = "WEAK" | "OK" | "STRONG";
export type Bitterness = "WEAK" | "OK" | "STRONG";
export type Strength = "THIN" | "OK" | "THICK";

export interface TasteRating {
  acidity: Acidity;
  bitterness: Bitterness;
  strength: Strength;
}

/**
 * 무엇이 왜 바뀌었는지 한 줄. 이 배열이 화면의 변경 내역 표가 됩니다.
 *
 * 판단은 서버가 이미 끝냈습니다. 프론트는 배열을 표로 그리고 한글 라벨만 붙입니다.
 */
export interface Change {
  field: string;
  before: number | string;
  after: number | string;
  reason: string;
}

export interface AdjustResult {
  feedbackId: number;
  suggestedRecipeId: number;
  parentRecipeId: number;
  changes: Change[];
  /** 조정하지 못한 이유. 여러 건이 동시에 걸릴 수 있어 배열입니다. */
  notices: string[];
  /** generate와 같은 형식이라 그대로 추출 화면에 넘길 수 있습니다. */
  recipe: Recipe;
}

export const api = {
  health: () => request<{ status: string }>("/health"),
  listBeans: () => request<{ items: Bean[] }>("/api/beans"),
  generateRecipe: (body: RecipeRequest) =>
    request<Recipe>("/api/recipe/generate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  saveBrew: (body: BrewRequest) =>
    request<BrewResult>("/api/brews", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** 마음에 든 추출을 다음 목표로 저장합니다. 곡선 다듬기는 서버가 합니다. */
  saveBrewAsRecipe: (brewId: number, body: { doseG: number; drinkType: DrinkType }) =>
    request<Recipe>(`/api/brews/${brewId}/save-as-recipe`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** 맛 평가를 보내고 보정된 레시피를 받습니다. 조정 규칙은 전부 서버에 있습니다. */
  adjustRecipe: (brewId: number, taste: TasteRating) =>
    request<AdjustResult>("/api/recipe/adjust", {
      method: "POST",
      body: JSON.stringify({ brewId, ...taste }),
    }),
  /** 제안을 받아들였는지 기록합니다. 만드는 것과 받아들이는 것은 다른 사건입니다. */
  updateFeedback: (feedbackId: number, applied: boolean) =>
    request<{ feedbackId: number; applied: boolean | null }>(`/api/feedback/${feedbackId}`, {
      method: "PATCH",
      body: JSON.stringify({ applied }),
    }),
};
